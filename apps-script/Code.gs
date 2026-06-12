// ============================================================
// 中央廚房管理系統 — Google Apps Script 後端
// 版本：1.2.0（後端角色權限驗證）
// ============================================================

// ── 工作表名稱（分頁標籤）────────────────────────────────────
const SHEETS = {
  SETTINGS:          '系統設定',
  STALL_CONFIG:      '攤位設定',
  INGREDIENT_CONFIG: '配料設定',
  DISPATCH_RECORDS:  '配發記錄',
  STALL_REPORTS:     '攤位回報',
  INVENTORY:         '庫存基準',
  INVENTORY_LOG:     '庫存異動',
  KITCHEN_COSTS:     '廚房成本',
  STALL_COSTS:       '攤位成本',
  WASTE:             '耗損記錄',
  PROFIT_SUMMARY:    '損益彙總'
};

// ── 角色定義（PIN 驗證暫時停用，全部設為 PUBLIC）────────────
const ROUTE_ROLES = {
  verifyPin:        'PUBLIC',
  getSettings:      'PUBLIC',
  getStalls:        'PUBLIC',
  getIngredients:   'PUBLIC',
  getDispatches:    'PUBLIC',
  saveDispatch:     'PUBLIC',
  getReports:       'PUBLIC',
  saveReport:       'PUBLIC',
  saveInventoryLog: 'PUBLIC',
  getInventory:     'PUBLIC',
  getKitchenCosts:  'PUBLIC',
  saveKitchenCost:  'PUBLIC',
  getStallCosts:    'PUBLIC',
  saveStallCost:    'PUBLIC',
  getProfitSummary: 'PUBLIC',
};

// ── CORS / 入口點 ────────────────────────────────────────────
function doGet(e)  { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);
  try {
    const params = e.parameter || {};

    // POST body 可能是 text/plain 或 application/json，都嘗試解析
    let postData = {};
    if (e.postData && e.postData.contents) {
      try { postData = JSON.parse(e.postData.contents); } catch (_) {}
    }

    // action：優先從 body 取（避免 redirect 丟失 URL query），再從 URL 參數取
    const action = postData.action || params.action;

    if (!action) {
      output.setContent(JSON.stringify({ success: false, error: '未指定 action' }));
      return output;
    }

    // ── 角色權限檢查 ─────────────────────────────────────────
    const requiredRole = ROUTE_ROLES[action] || 'OWNER_ONLY';
    const token = postData.owner_token || params.owner_token || '';

    if (requiredRole === 'OWNER_ONLY') {
      const check = checkOwnerToken(token);
      if (!check.valid) {
        output.setContent(JSON.stringify({
          success: false,
          error:   '權限不足：此功能僅老闆可使用',
          code:    'UNAUTHORIZED'
        }));
        return output;
      }
    }

    output.setContent(JSON.stringify(routeAction(action, params, postData)));
  } catch (err) {
    output.setContent(JSON.stringify({ success: false, error: err.message }));
  }
  return output;
}

// ── Token 驗證 ────────────────────────────────────────────────
// owner_token 的值 = SHA-256(PIN + 當天日期)
// 前端在 auth.js 的 loginOwner 成功後，計算並儲存 token
// 每天自動失效，即使 token 洩漏也只在當天有效
function checkOwnerToken(token) {
  if (!token) return { valid: false };
  try {
    const settings   = getSettings().data;
    const correctPin = String(settings['老闆PIN'] || '').trim();
    const todayDate  = today(); // yyyy-MM-dd
    const expected   = computeToken(correctPin, todayDate);
    return { valid: token === expected };
  } catch (e) {
    return { valid: false };
  }
}

// SHA-256(pin + ":" + date) → hex string
function computeToken(pin, date) {
  const raw     = pin + ':' + date;
  const bytes   = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    raw,
    Utilities.Charset.UTF_8
  );
  return bytes.map(b => ('0' + (b & 0xff).toString(16)).slice(-2)).join('');
}

// verifyPin：驗證成功時同時回傳當日 token 給前端儲存
function verifyPin(body) {
  const inputPin = String(body.pin || '').trim();
  if (!inputPin) return { success: true, verified: false };
  const settings   = getSettings().data;
  const correctPin = String(settings['老闆PIN'] || '').trim();
  if (inputPin !== correctPin) return { success: true, verified: false };

  // PIN 正確 → 產生當日 token 回傳
  const token = computeToken(correctPin, today());
  return { success: true, verified: true, owner_token: token };
}

// ── 路由 ─────────────────────────────────────────────────────
function routeAction(action, params, body) {
  switch (action) {
    case 'verifyPin':        return verifyPin(body);
    case 'getSettings':      return getSettings();
    case 'getStalls':        return getStalls();
    case 'getIngredients':   return getIngredients();
    case 'getDispatches':    return getDispatches(params);
    case 'saveDispatch':     return saveDispatch(body);
    case 'getReports':       return getReports(params);
    case 'saveReport':       return saveReport(body);
    case 'getInventory':     return getInventory();
    case 'saveInventoryLog': return saveInventoryLog(body);
    case 'getKitchenCosts':  return getKitchenCosts(params);
    case 'saveKitchenCost':  return saveKitchenCost(body);
    case 'getStallCosts':    return getStallCosts(params);
    case 'saveStallCost':    return saveStallCost(body);
    case 'getProfitSummary': return getProfitSummary(params);
    default: return { success: false, error: '未知 action：' + action };
  }
}

// ── 工具函式 ─────────────────────────────────────────────────
function getSheet(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) throw new Error('找不到工作表：' + name);
  return sheet;
}

// 將工作表讀成物件陣列，以第一列為 key
function sheetToObjects(sheetName) {
  const sheet = getSheet(sheetName);
  const data  = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0].map(h => String(h).trim());
  return data.slice(1)
    .filter(row => row[0] !== '')
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => {
        const val = row[i];
        obj[h] = val instanceof Date
          ? Utilities.formatDate(val, 'Asia/Taipei', 'yyyy-MM-dd')
          : val;
      });
      return obj;
    });
}

function appendRow(sheetName, obj, headers) {
  const sheet = getSheet(sheetName);
  sheet.appendRow(headers.map(h => (obj[h] !== undefined ? obj[h] : '')));
}

function generateId(prefix) {
  return prefix + '_' + new Date().getTime();
}

function today() {
  return Utilities.formatDate(new Date(), 'Asia/Taipei', 'yyyy-MM-dd');
}

// ── 設定讀取 ─────────────────────────────────────────────────
function getSettings() {
  const rows = sheetToObjects(SHEETS.SETTINGS);
  const settings = {};
  rows.forEach(r => { settings[r['設定項目']] = r['設定值']; });
  return { success: true, data: settings };
}

function getStalls() {
  const rows = sheetToObjects(SHEETS.STALL_CONFIG);
  // 正規化：把中文欄位對應成程式內部使用的英文 key
  return {
    success: true,
    data: rows
      .filter(r => String(r['啟用']).toUpperCase() === 'TRUE' || r['啟用'] === true)
      .map(normalizeStall)
  };
}

function normalizeStall(r) {
  return {
    stall_id:   r['攤位編號'],
    stall_name: r['攤位名稱'],
    active:     r['啟用'],
    rent:       r['月租金'],
    fixed_cost: r['月固定成本'],
    note:       r['備註'] || ''
  };
}

function getIngredients() {
  const rows = sheetToObjects(SHEETS.INGREDIENT_CONFIG);
  return {
    success: true,
    data: rows
      .filter(r => String(r['啟用']).toUpperCase() === 'TRUE' || r['啟用'] === true)
      .map(normalizeIngredient)
  };
}

function normalizeIngredient(r) {
  return {
    ingredient_id:   r['配料編號'],
    ingredient_name: r['配料名稱'],
    unit:            r['單位'],
    cost:            r['成本'],
    active:          r['啟用'],
    in_inventory:    r['納入庫存'],
    note:            r['備註'] || ''
  };
}

// ── 配發記錄 ─────────────────────────────────────────────────
// 內部欄位 key（寫入 Sheets 的中文欄位標題）
const DISPATCH_HEADERS = [
  '記錄編號','日期','攤位編號','攤位名稱','配發人',
  '底料大','底料中','底料小',
  '米大','米中','米小',
  '芋頭大','芋頭中','芋頭小',
  '芋泥包','碎皮蛋碗','完整皮蛋碗',
  '芹菜碗','菜脯碗','備註','建立時間'
];

// JS 物件 key → 中文欄位 key 的對應
const DISPATCH_KEY_MAP = {
  id:             '記錄編號',
  date:           '日期',
  stall_id:       '攤位編號',
  stall_name:     '攤位名稱',
  dispatcher:     '配發人',
  base_L:         '底料大',
  base_M:         '底料中',
  base_S:         '底料小',
  rice_L:         '米大',
  rice_M:         '米中',
  rice_S:         '米小',
  taro_L:         '芋頭大',
  taro_M:         '芋頭中',
  taro_S:         '芋頭小',
  taro_paste:     '芋泥包',
  broken_egg:     '碎皮蛋碗',
  whole_egg:      '完整皮蛋碗',
  celery:         '芹菜碗',
  pickled_radish: '菜脯碗',
  note:           '備註',
  created_at:     '建立時間'
};

function getDispatches(params) {
  const rows = sheetToObjects(SHEETS.DISPATCH_RECORDS);
  const date     = params.date     || '';
  const stall_id = params.stall_id || '';
  let filtered = rows;
  if (date)     filtered = filtered.filter(r => r['日期'] === date);
  if (stall_id) filtered = filtered.filter(r => r['攤位編號'] === stall_id);
  return { success: true, data: filtered.map(denormalizeDispatch) };
}

// 中文欄位 → JS key（給前端用）
function denormalizeDispatch(r) {
  const inv = invertMap(DISPATCH_KEY_MAP);
  const obj = {};
  Object.entries(inv).forEach(([zh, en]) => { obj[en] = r[zh]; });
  return obj;
}

function saveDispatch(body) {
  if (!body.date || !body.stall_id) return { success: false, error: '日期與攤位為必填' };
  body.id         = generateId('D');
  body.created_at = new Date().toISOString();
  const row = mapToRow(body, DISPATCH_KEY_MAP, DISPATCH_HEADERS);
  getSheet(SHEETS.DISPATCH_RECORDS).appendRow(row);
  return { success: true, id: body.id };
}

// ── 攤位回報 ─────────────────────────────────────────────────
const REPORT_HEADERS = [
  '記錄編號','日期','攤位編號','攤位名稱','回報人','賣完時間',
  '桶數','大碗數','小碗數',
  '剩底料大','剩底料中','剩底料小',
  '剩米大','剩米中','剩米小',
  '剩芋頭大','剩芋頭中','剩芋頭小',
  '剩芋泥包','剩碎皮蛋碗','剩完整皮蛋碗',
  '剩芹菜碗','剩菜脯碗',
  '備註','建立時間'
];

const REPORT_KEY_MAP = {
  id:              '記錄編號',
  date:            '日期',
  stall_id:        '攤位編號',
  stall_name:      '攤位名稱',
  reporter:        '回報人',
  sold_out_time:   '賣完時間',
  barrels:         '桶數',
  big_bowls:       '大碗數',
  small_bowls:     '小碗數',
  rem_base_L:      '剩底料大',
  rem_base_M:      '剩底料中',
  rem_base_S:      '剩底料小',
  rem_rice_L:      '剩米大',
  rem_rice_M:      '剩米中',
  rem_rice_S:      '剩米小',
  rem_taro_L:      '剩芋頭大',
  rem_taro_M:      '剩芋頭中',
  rem_taro_S:      '剩芋頭小',
  rem_taro_paste:  '剩芋泥包',
  rem_broken_egg:  '剩碎皮蛋碗',
  rem_whole_egg:   '剩完整皮蛋碗',
  rem_celery:      '剩芹菜碗',
  rem_pickled_radish: '剩菜脯碗',
  note:            '備註',
  created_at:      '建立時間'
};

function getReports(params) {
  const rows = sheetToObjects(SHEETS.STALL_REPORTS);
  const date     = params.date     || '';
  const stall_id = params.stall_id || '';
  let filtered = rows;
  if (date)     filtered = filtered.filter(r => r['日期'] === date);
  if (stall_id) filtered = filtered.filter(r => r['攤位編號'] === stall_id);
  return { success: true, data: filtered.map(r => denormalizeByMap(r, REPORT_KEY_MAP)) };
}

function saveReport(body) {
  if (!body.date || !body.stall_id) return { success: false, error: '日期與攤位為必填' };
  body.id         = generateId('R');
  body.created_at = new Date().toISOString();
  const row = mapToRow(body, REPORT_KEY_MAP, REPORT_HEADERS);
  getSheet(SHEETS.STALL_REPORTS).appendRow(row);
  return { success: true, id: body.id };
}

// ── 庫存 ─────────────────────────────────────────────────────
const INVENTORY_LOG_HEADERS = [
  '記錄編號','日期','品項編號','品項名稱','單位','異動類型',
  '數量','單價','總金額','備註','建立時間'
];

const INVENTORY_LOG_KEY_MAP = {
  id:          '記錄編號',
  date:        '日期',
  item_id:     '品項編號',
  item_name:   '品項名稱',
  unit:        '單位',
  type:        '異動類型',
  qty:         '數量',
  unit_price:  '單價',
  total_price: '總金額',
  note:        '備註',
  created_at:  '建立時間'
};

function getInventory() {
  const items = sheetToObjects(SHEETS.INVENTORY);
  const logs  = sheetToObjects(SHEETS.INVENTORY_LOG);

  return {
    success: true,
    data: items.map(item => {
      const id = item['品項編號'];
      let current = Number(item['初始庫存']) || 0;
      logs.filter(l => l['品項編號'] === id).forEach(l => {
        const t = l['異動類型'];
        const q = Number(l['數量']) || 0;
        if (t === '入庫' || t === 'in')    current += q;
        if (t === '出庫' || t === 'out')   current -= q;
        if (t === '耗損' || t === 'waste') current -= q;
      });
      return {
        item_id:       id,
        item_name:     item['品項名稱'],
        unit:          item['單位'],
        initial_stock: Number(item['初始庫存']) || 0,
        min_stock:     Number(item['安全庫存']) || 0,
        current_stock: current,
        is_low:        current < (Number(item['安全庫存']) || 0),
        note:          item['備註'] || ''
      };
    })
  };
}

function saveInventoryLog(body) {
  if (!body.item_id || !body.type || !body.qty) return { success: false, error: '品項、類型、數量為必填' };
  body.id          = generateId('INV');
  body.created_at  = new Date().toISOString();
  body.total_price = Number(body.qty) * Number(body.unit_price || 0);
  // 類型轉為中文存入
  const typeMap = { in: '入庫', out: '出庫', waste: '耗損' };
  body.type = typeMap[body.type] || body.type;
  const row = mapToRow(body, INVENTORY_LOG_KEY_MAP, INVENTORY_LOG_HEADERS);
  getSheet(SHEETS.INVENTORY_LOG).appendRow(row);
  return { success: true, id: body.id };
}

// ── 廚房成本 ─────────────────────────────────────────────────
const KITCHEN_COST_HEADERS = [
  '記錄編號','日期','成本類型','金額','備註','建立時間'
];

const KITCHEN_COST_KEY_MAP = {
  id:         '記錄編號',
  date:       '日期',
  type:       '成本類型',
  amount:     '金額',
  note:       '備註',
  created_at: '建立時間'
};

const COST_TYPE_MAP = {
  labor:      '人事費',
  driver:     '司機費',
  ingredient: '食材',
  other:      '其他'
};

function getKitchenCosts(params) {
  const rows  = sheetToObjects(SHEETS.KITCHEN_COSTS);
  const date  = params.date  || '';
  const month = params.month || '';
  let filtered = rows;
  if (date)  filtered = filtered.filter(r => r['日期'] === date);
  if (month) filtered = filtered.filter(r => String(r['日期']).startsWith(month));
  return {
    success: true,
    data: filtered.map(r => ({
      id:     r['記錄編號'],
      date:   r['日期'],
      type:   r['成本類型'],
      amount: r['金額'],
      note:   r['備註'] || '',
      created_at: r['建立時間']
    }))
  };
}

function saveKitchenCost(body) {
  if (!body.date || !body.amount) return { success: false, error: '日期與金額為必填' };
  body.id         = generateId('KC');
  body.created_at = new Date().toISOString();
  body.type       = COST_TYPE_MAP[body.type] || body.type;
  const row = mapToRow(body, KITCHEN_COST_KEY_MAP, KITCHEN_COST_HEADERS);
  getSheet(SHEETS.KITCHEN_COSTS).appendRow(row);
  return { success: true, id: body.id };
}

// ── 攤位成本 ─────────────────────────────────────────────────
const STALL_COST_HEADERS = [
  '記錄編號','日期','攤位編號','攤位名稱','成本類型','金額','備註','建立時間'
];

const STALL_COST_KEY_MAP = {
  id:         '記錄編號',
  date:       '日期',
  stall_id:   '攤位編號',
  stall_name: '攤位名稱',
  type:       '成本類型',
  amount:     '金額',
  note:       '備註',
  created_at: '建立時間'
};

function getStallCosts(params) {
  const rows     = sheetToObjects(SHEETS.STALL_COSTS);
  const date     = params.date     || '';
  const stall_id = params.stall_id || '';
  let filtered = rows;
  if (date)     filtered = filtered.filter(r => r['日期'] === date);
  if (stall_id) filtered = filtered.filter(r => r['攤位編號'] === stall_id);
  return {
    success: true,
    data: filtered.map(r => ({
      id:         r['記錄編號'],
      date:       r['日期'],
      stall_id:   r['攤位編號'],
      stall_name: r['攤位名稱'],
      type:       r['成本類型'],
      amount:     r['金額'],
      note:       r['備註'] || ''
    }))
  };
}

function saveStallCost(body) {
  body.id         = generateId('SC');
  body.created_at = new Date().toISOString();
  const row = mapToRow(body, STALL_COST_KEY_MAP, STALL_COST_HEADERS);
  getSheet(SHEETS.STALL_COSTS).appendRow(row);
  return { success: true, id: body.id };
}

// ── 損益彙總 ─────────────────────────────────────────────────
function getProfitSummary(params) {
  const date         = params.date || today();
  const settings     = getSettings().data;
  const supplyPrice  = Number(settings['每桶供貨價']) || 1275;
  const bigPrice     = Number(settings['大碗售價'])   || 80;
  const smallPrice   = Number(settings['小碗售價'])   || 60;

  const reports      = getReports({ date }).data;
  const kitchenCosts = getKitchenCosts({ date }).data;
  const stallCosts   = getStallCosts({ date }).data;
  const stalls       = getStalls().data;

  const kitchenRevenue  = reports.reduce((s, r) => s + (Number(r.barrels) || 0) * supplyPrice, 0);
  const kitchenCostSum  = kitchenCosts.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const kitchenProfit   = kitchenRevenue - kitchenCostSum;

  const stallSummaries = stalls.map(stall => {
    const report = reports.find(r => r.stall_id === stall.stall_id);
    if (!report) return { stall_id: stall.stall_id, stall_name: stall.stall_name, has_report: false };

    const revenue    = (Number(report.big_bowls) || 0) * bigPrice + (Number(report.small_bowls) || 0) * smallPrice;
    const cogs       = (Number(report.barrels)   || 0) * supplyPrice;
    const extras     = stallCosts.filter(c => c.stall_id === stall.stall_id).reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const dailyRent  = Math.round((Number(stall.rent)       || 0) / 26);
    const dailyFixed = Math.round((Number(stall.fixed_cost) || 0) / 26);
    const netProfit  = revenue - cogs - extras - dailyRent - dailyFixed;

    return {
      stall_id: stall.stall_id, stall_name: stall.stall_name, has_report: true,
      barrels: Number(report.barrels) || 0,
      big_bowls: Number(report.big_bowls) || 0,
      small_bowls: Number(report.small_bowls) || 0,
      sold_out_time: report.sold_out_time,
      revenue, cogs, extras, dailyRent, dailyFixed,
      totalCost: cogs + extras + dailyRent + dailyFixed, netProfit
    };
  });

  return {
    success: true,
    data: {
      date,
      kitchen: { revenue: kitchenRevenue, cost: kitchenCostSum, profit: kitchenProfit },
      stalls:  stallSummaries,
      prices:  { supplyPrice, bigBowlPrice: bigPrice, smallBowlPrice: smallPrice }
    }
  };
}

// ── 工具：key map 轉換 ───────────────────────────────────────
function invertMap(map) {
  const inv = {};
  Object.entries(map).forEach(([en, zh]) => { inv[zh] = en; });
  return inv;
}

function denormalizeByMap(row, keyMap) {
  const inv = invertMap(keyMap);
  const obj = {};
  Object.entries(inv).forEach(([zh, en]) => { obj[en] = row[zh]; });
  return obj;
}

// JS body（英文 key）→ 中文 headers 順序的陣列
function mapToRow(body, keyMap, headers) {
  return headers.map(zh => {
    const en = invertMap(keyMap)[zh];
    return en !== undefined && body[en] !== undefined ? body[en] : '';
  });
}

// ── 初始化工作表（第一次使用時執行）────────────────────────
function initSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const sheetDefs = [
    {
      name: SHEETS.SETTINGS,
      headers: ['設定項目', '設定值', '說明'],
      defaults: [
        ['每桶供貨價',  '1275',   '中廚供貨給攤位的每桶價格（元）'],
        ['大碗售價',    '80',     '攤位大碗對外售價（元）'],
        ['小碗售價',    '60',     '攤位小碗對外售價（元）'],
        ['老闆PIN',     '請修改', '老闆登入 PIN，建議 6 位數字'],
        ['系統名稱',    '中央廚房管理系統', ''],
        ['時區',        'Asia/Taipei', '']
      ]
    },
    {
      name: SHEETS.STALL_CONFIG,
      headers: ['攤位編號', '攤位名稱', '啟用', '月租金', '月固定成本', '備註'],
      defaults: [
        ['S001', '信義攤位', 'TRUE', '8000', '2000', ''],
        ['S002', '大安攤位', 'TRUE', '7500', '1800', ''],
        ['S003', '中山攤位', 'TRUE', '9000', '2200', '']
      ]
    },
    {
      name: SHEETS.INGREDIENT_CONFIG,
      headers: ['配料編號', '配料名稱', '單位', '成本', '啟用', '納入庫存', '備註'],
      defaults: [
        ['I001', '底料',     '桶', '900', 'TRUE', 'TRUE',  ''],
        ['I002', '米',       'kg', '35',  'TRUE', 'TRUE',  ''],
        ['I003', '芋頭',     'kg', '55',  'TRUE', 'TRUE',  ''],
        ['I004', '芋泥',     '包', '40',  'TRUE', 'TRUE',  ''],
        ['I005', '碎皮蛋',   '碗', '15',  'TRUE', 'FALSE', ''],
        ['I006', '完整皮蛋', '碗', '25',  'TRUE', 'FALSE', ''],
        ['I007', '芹菜',     '碗', '8',   'TRUE', 'TRUE',  ''],
        ['I008', '菜脯',     '碗', '5',   'TRUE', 'TRUE',  ''],
        ['I009', '肉鬆',     'kg', '280', 'TRUE', 'TRUE',  ''],
        ['I010', '油條',     '條', '8',   'TRUE', 'TRUE',  '']
      ]
    },
    {
      name: SHEETS.DISPATCH_RECORDS,
      headers: DISPATCH_HEADERS,
      defaults: []
    },
    {
      name: SHEETS.STALL_REPORTS,
      headers: REPORT_HEADERS,
      defaults: []
    },
    {
      name: SHEETS.INVENTORY,
      headers: ['品項編號', '品項名稱', '單位', '初始庫存', '安全庫存', '備註'],
      defaults: [
        ['I001', '底料',   '桶', '20',  '8',  ''],
        ['I002', '米',     'kg', '50',  '30', ''],
        ['I003', '芋頭',   'kg', '30',  '25', ''],
        ['I004', '芋泥',   '包', '40',  '20', ''],
        ['I007', '芹菜',   '碗', '30',  '15', ''],
        ['I008', '菜脯',   '碗', '30',  '20', ''],
        ['I009', '肉鬆',   'kg', '8',   '5',  ''],
        ['I010', '油條',   '條', '100', '40', '']
      ]
    },
    {
      name: SHEETS.INVENTORY_LOG,
      headers: INVENTORY_LOG_HEADERS,
      defaults: []
    },
    {
      name: SHEETS.KITCHEN_COSTS,
      headers: KITCHEN_COST_HEADERS,
      defaults: []
    },
    {
      name: SHEETS.STALL_COSTS,
      headers: STALL_COST_HEADERS,
      defaults: []
    },
    {
      name: SHEETS.WASTE,
      headers: ['記錄編號','日期','攤位編號','攤位名稱','品項編號','品項名稱','數量','單位','耗損原因','備註','建立時間'],
      defaults: []
    },
    {
      name: SHEETS.PROFIT_SUMMARY,
      headers: ['日期','廚房收入','廚房成本','廚房毛利','攤位總營收','攤位總淨利','備註'],
      defaults: []
    }
  ];

  sheetDefs.forEach(def => {
    let sheet = ss.getSheetByName(def.name);
    if (!sheet) sheet = ss.insertSheet(def.name);
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(def.headers);
      def.defaults.forEach(row => sheet.appendRow(row));
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, def.headers.length)
        .setBackground('#1d4ed8')
        .setFontColor('#ffffff')
        .setFontWeight('bold');
    }
  });

  return { success: true, message: '所有工作表初始化完成！' };
}
