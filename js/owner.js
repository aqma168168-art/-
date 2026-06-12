// ============================================================
// owner.js — 老闆管理後台 v2.0
// ============================================================

const OwnerApp = {
  page: 'dashboard',
  cache: { settings: null, stalls: null, ingredients: null },
};

const PAGE_TITLES = {
  dashboard: '今日總覽', 'kitchen-pl': '中央廚房損益',
  'stall-pl': '各攤位損益', monthly: '月報表',
  inventory: '庫存總覽', costs: '成本管理', settings: '設定中心',
};

// ── 初始化（直接進入，無 PIN 驗證）─────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('topbar-date').textContent =
    new Date().toLocaleDateString('zh-TW', { year:'numeric', month:'long', day:'numeric', weekday:'short' });

  UI.showLoading('載入設定…');
  try {
    const [sr, stR, ingR] = await Promise.all([API.getSettings(), API.getStalls(), API.getIngredients()]);
    OwnerApp.cache.settings    = sr.data;
    OwnerApp.cache.stalls      = stR.data;
    OwnerApp.cache.ingredients = ingR.data;
  } catch (e) {
    UI.toast('載入失敗，請確認 Apps Script URL：' + e.message, 'error', 8000);
  } finally {
    UI.hideLoading();
  }

  document.querySelectorAll('.nav-item[data-page]').forEach(el =>
    el.addEventListener('click', () => showPage(el.dataset.page)));

  showPage('dashboard');
});

function showPage(page) {
  OwnerApp.page = page;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.getElementById('page-title').textContent = PAGE_TITLES[page] || page;
  const body = document.getElementById('page-body');
  body.innerHTML = '';
  ({
    dashboard:   renderDashboard,
    'kitchen-pl':renderKitchenPL,
    'stall-pl':  renderStallPL,
    monthly:     renderMonthly,
    inventory:   renderInventory,
    costs:       renderCosts,
    settings:    renderSettings,
  }[page] || (() => {}))(body);
}

const $ = id => document.getElementById(id);
const t = UI.todayISO;
const fm = UI.fmtMoney;
const fn = UI.fmtNum;

// ═══════════════════════════════════════════════════════════════
// 今日總覽
// ═══════════════════════════════════════════════════════════════
async function renderDashboard(el) {
  el.innerHTML = `
    <div class="section-header mb-16">
      <div class="section-title"><i class="ti ti-calendar-event"></i>查詢日期</div>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="date" id="dash-date" value="${t()}" style="padding:7px 10px;border:1.5px solid var(--ink-200);border-radius:var(--r-md);font-size:13px;outline:none">
        <button class="btn btn--primary btn--sm" onclick="loadDash()"><i class="ti ti-refresh"></i> 更新</button>
      </div>
    </div>
    <div id="dash-content"><div class="empty"><i class="ti ti-loader" style="animation:spin .7s linear infinite"></i><p>載入中…</p></div></div>`;
  loadDash();
}

async function loadDash() {
  const date = $('dash-date')?.value || t();
  const c = $('dash-content'); if (!c) return;
  c.innerHTML = '<div class="empty"><i class="ti ti-loader" style="animation:spin .7s linear infinite"></i><p>計算中…</p></div>';
  try {
    const [pr, ir] = await Promise.all([API.getProfitSummary(date), API.getInventory()]);
    const p = pr.data;
    const lowStock = (ir.data||[]).filter(i => i.is_low);

    // 全體加總
    const totalRev = (p.stalls||[]).reduce((s,x) => s + (x.revenue||0), 0);
    const totalCost= (p.stalls||[]).reduce((s,x) => s + (x.totalCost||0), 0);
    const totalNet = (p.stalls||[]).reduce((s,x) => s + (x.netProfit||0), 0);
    const unreported = (p.stalls||[]).filter(x => !x.has_report);

    const heroClass = p.kitchen.profit >= 0 ? 'hero-card--profit' : 'hero-card--loss';

    c.innerHTML = `
      <!-- Hero：今日廚房毛利 -->
      <div class="hero-card ${heroClass} mb-24" style="margin-bottom:24px">
        <div class="hero-card__label">今日廚房毛利</div>
        <div class="hero-card__value">${fm(p.kitchen.profit)}</div>
        <div class="hero-card__sub">收入 ${fm(p.kitchen.revenue)} ／ 成本 ${fm(p.kitchen.cost)} ／ 配發 ${(p.stalls||[]).filter(s=>s.has_report).reduce((s,x)=>s+(x.barrels||0),0)} 桶</div>
        <i class="ti ti-building-factory-2 hero-card__bg-icon"></i>
      </div>

      <!-- 全體統計 -->
      <div class="grid g4 mb-24" style="margin-bottom:24px">
        <div class="stat-card stat-card--green">
          <div class="stat-card__label">攤位總營收</div>
          <div class="stat-card__value font-num c-green">${fm(totalRev)}</div>
        </div>
        <div class="stat-card stat-card--red">
          <div class="stat-card__label">攤位總成本</div>
          <div class="stat-card__value font-num c-red">${fm(totalCost)}</div>
        </div>
        <div class="stat-card stat-card--violet">
          <div class="stat-card__label">攤位總淨利</div>
          <div class="stat-card__value font-num ${UI.moneyClass(totalNet)}">${fm(totalNet)}</div>
        </div>
        <div class="stat-card stat-card--amber">
          <div class="stat-card__label">未回報攤位</div>
          <div class="stat-card__value font-num ${unreported.length ? 'c-red' : 'c-green'}">${unreported.length}</div>
          <div class="stat-card__sub">${unreported.length ? '⚠ ' + unreported.map(s=>s.stall_name).join('、') : '全部已回報'}</div>
        </div>
      </div>

      <!-- 各攤位卡片 -->
      <div class="section-header" style="margin-bottom:16px">
        <div class="section-title"><i class="ti ti-store"></i>各攤位今日表現</div>
      </div>
      <div class="grid g3 mb-24" style="margin-bottom:24px">
        ${(p.stalls||[]).map(s => stallCard(s, p.prices)).join('')}
      </div>

      <!-- 庫存警示 + 異常 -->
      <div class="grid g2" style="gap:20px">
        <div>
          <div class="section-title mb-16" style="margin-bottom:12px"><i class="ti ti-package"></i>庫存警示</div>
          <div class="card">
            ${lowStock.length === 0
              ? '<div class="alert-row alert-row--ok"><i class="ti ti-circle-check alert-row__icon"></i><div class="alert-row__body"><strong>庫存正常</strong><span>所有品項均高於安全庫存</span></div></div>'
              : lowStock.map(i => `<div class="alert-row alert-row--danger"><i class="ti ti-alert-triangle alert-row__icon"></i><div class="alert-row__body"><strong>${i.item_name}</strong><span>目前 ${fn(i.current_stock)} ${i.unit}，安全庫存 ${fn(i.min_stock)}</span></div></div>`).join('')}
          </div>
        </div>
        <div>
          <div class="section-title mb-16" style="margin-bottom:12px"><i class="ti ti-alert-circle"></i>異常提醒</div>
          <div class="card">
            ${anomalyRows(p)}
          </div>
        </div>
      </div>`;
  } catch(e) {
    c.innerHTML = `<div class="alert-row alert-row--danger"><i class="ti ti-alert-triangle alert-row__icon"></i><div class="alert-row__body"><strong>載入失敗</strong><span>${e.message}</span></div></div>`;
  }
}

function stallCard(s, prices) {
  if (!s.has_report) return `
    <div class="stall-card">
      <div class="stall-card__head">
        <div class="stall-card__name"><span class="dot dot--amber"></span>${s.stall_name}</div>
        <span class="badge badge--amber">未回報</span>
      </div>
      <div class="stall-card__body"><div class="empty" style="padding:16px 0"><i class="ti ti-clock" style="font-size:28px;opacity:.4"></i><p style="font-size:12px">尚未送出今日回報</p></div></div>
    </div>`;
  return `
    <div class="stall-card">
      <div class="stall-card__head">
        <div class="stall-card__name"><span class="dot dot--green"></span>${s.stall_name}</div>
        <span class="badge badge--green">${s.sold_out_time} 賣完</span>
      </div>
      <div class="stall-card__body">
        <div class="stall-card__row"><span class="stall-card__row-label">今日營收</span><span class="stall-card__row-val c-green font-num">${fm(s.revenue)}</span></div>
        <div class="stall-card__row"><span class="stall-card__row-label">今日淨利</span><span class="stall-card__row-val ${UI.moneyClass(s.netProfit)} font-num">${fm(s.netProfit)}</span></div>
        <div class="stall-card__row"><span class="stall-card__row-label">桶數</span><span class="stall-card__row-val">${s.barrels} 桶</span></div>
        <div class="stall-card__row"><span class="stall-card__row-label">大碗 / 小碗</span><span class="stall-card__row-val">${fn(s.big_bowls)} / ${fn(s.small_bowls)}</span></div>
      </div>
      <div class="stall-card__footer">
        <span>大碗 ${fm(prices.bigBowlPrice)} · 小碗 ${fm(prices.smallBowlPrice)}</span>
      </div>
    </div>`;
}

function anomalyRows(p) {
  const rows = [];
  // 未回報
  (p.stalls||[]).filter(s => !s.has_report).forEach(s =>
    rows.push(`<div class="alert-row alert-row--warning"><i class="ti ti-clock alert-row__icon"></i><div class="alert-row__body"><strong>${s.stall_name}：尚未回報</strong><span>今日尚未送出銷售回報</span></div></div>`));
  // 賣完時間異常（17:00後仍在）
  (p.stalls||[]).filter(s => s.has_report && s.sold_out_time === '未賣完').forEach(s =>
    rows.push(`<div class="alert-row alert-row--warning"><i class="ti ti-alert-triangle alert-row__icon"></i><div class="alert-row__body"><strong>${s.stall_name}：未賣完</strong><span>今日仍有剩料</span></div></div>`));
  if (!rows.length)
    rows.push('<div class="alert-row alert-row--ok"><i class="ti ti-circle-check alert-row__icon"></i><div class="alert-row__body"><strong>無異常</strong><span>今日一切正常</span></div></div>');
  return rows.join('');
}

// ═══════════════════════════════════════════════════════════════
// 中央廚房損益
// ═══════════════════════════════════════════════════════════════
async function renderKitchenPL(el) {
  el.innerHTML = datePicker('kpl-date', 'loadKitchenPL') + '<div id="kpl-content"></div>' + addCostForm();
  loadKitchenPL();
  $('kc-form')?.addEventListener('submit', saveKCost);
}

async function loadKitchenPL() {
  const date = $('kpl-date')?.value || t();
  const c = $('kpl-content'); if(!c) return;
  c.innerHTML = spinnerHTML();
  try {
    const [pr, cr] = await Promise.all([API.getProfitSummary(date), API.getKitchenCosts(date)]);
    const p = pr.data; const costs = cr.data||[];
    const barrels = (p.stalls||[]).filter(s=>s.has_report).reduce((s,x)=>s+(x.barrels||0),0);
    const heroClass = p.kitchen.profit>=0?'hero-card--profit':'hero-card--loss';
    c.innerHTML = `
      <div class="hero-card ${heroClass}" style="margin-bottom:24px">
        <div class="hero-card__label">今日廚房毛利</div>
        <div class="hero-card__value">${fm(p.kitchen.profit)}</div>
        <div class="hero-card__sub">毛利率 ${p.kitchen.revenue ? Math.round(p.kitchen.profit/p.kitchen.revenue*100) : 0}% ／ 每桶均毛利 ${fm(barrels ? Math.round(p.kitchen.profit/barrels) : 0)}</div>
        <i class="ti ti-chart-line hero-card__bg-icon"></i>
      </div>
      <div class="grid g4" style="margin-bottom:24px">
        <div class="stat-card stat-card--sky"><div class="stat-card__label">配發桶數</div><div class="stat-card__value font-num">${barrels}</div></div>
        <div class="stat-card stat-card--green"><div class="stat-card__label">今日收入</div><div class="stat-card__value font-num c-green">${fm(p.kitchen.revenue)}</div><div class="stat-card__sub">@ ${fm(p.prices.supplyPrice)}/桶</div></div>
        <div class="stat-card stat-card--red"><div class="stat-card__label">今日成本</div><div class="stat-card__value font-num c-red">${fm(p.kitchen.cost)}</div></div>
        <div class="stat-card stat-card--violet"><div class="stat-card__label">每桶均成本</div><div class="stat-card__value font-num">${fm(barrels ? Math.round(p.kitchen.cost/barrels) : 0)}</div></div>
      </div>
      <div class="grid g2" style="gap:20px">
        <div class="card">
          <div class="card__header"><div class="card__title"><i class="ti ti-trending-up"></i>收入明細</div></div>
          ${(p.stalls||[]).filter(s=>s.has_report).map(s=>`<div class="pl-row"><span class="pl-row__label">${s.stall_name} (${s.barrels}桶)</span><span class="pl-row__val c-green">${fm(s.barrels*p.prices.supplyPrice)}</span></div>`).join('')||noDataHTML()}
          <div class="pl-total"><span class="pl-total__label">總收入</span><span class="pl-total__val c-green">${fm(p.kitchen.revenue)}</span></div>
        </div>
        <div class="card">
          <div class="card__header"><div class="card__title"><i class="ti ti-trending-down"></i>成本明細</div></div>
          ${costs.map(c=>`<div class="pl-row"><span class="pl-row__label">${c.note||c.type}</span><span class="pl-row__val c-red">${fm(c.amount)}</span></div>`).join('')||noDataHTML()}
          <div class="pl-total"><span class="pl-total__label">總成本</span><span class="pl-total__val c-red">${fm(p.kitchen.cost)}</span></div>
        </div>
      </div>`;
  } catch(e) { c.innerHTML = errHTML(e); }
}

function addCostForm() {
  return `
  <div class="section-title mt-24 mb-16" style="margin-top:24px;margin-bottom:12px"><i class="ti ti-plus"></i>新增廚房成本</div>
  <div class="card">
    <form id="kc-form" novalidate>
      <div class="fg fg4">
        <div class="field"><label>日期</label><input type="date" name="date" value="${t()}"></div>
        <div class="field"><label>類型</label><select name="type"><option value="labor">人事費</option><option value="driver">司機費</option><option value="ingredient">食材</option><option value="other">其他</option></select></div>
        <div class="field"><label>金額 ($)</label><input type="number" name="amount" min="0" value="0"></div>
        <div class="field"><label>備註</label><input type="text" name="note" placeholder="說明"></div>
      </div>
      <div class="btn-row"><button type="submit" class="btn btn--primary" id="btn-kc"><i class="ti ti-plus"></i>新增</button></div>
    </form>
  </div>`;
}

async function saveKCost(e) {
  e.preventDefault();
  const data = UI.formData(e.target); const btn = $('btn-kc');
  UI.btnLoad(btn, true);
  try { await API.saveKitchenCost(data); UI.toast('✓ 成本已新增'); UI.resetForm(e.target); e.target.date.value = t(); loadKitchenPL(); }
  catch(err) { UI.toast(err.message, 'error'); }
  finally { UI.btnLoad(btn, false); }
}

// ═══════════════════════════════════════════════════════════════
// 各攤位損益
// ═══════════════════════════════════════════════════════════════
async function renderStallPL(el) {
  el.innerHTML = datePicker('spl-date', 'loadStallPL') + '<div id="spl-content"></div>';
  loadStallPL();
}

async function loadStallPL() {
  const date = $('spl-date')?.value || t(); const c = $('spl-content'); if(!c) return;
  c.innerHTML = spinnerHTML();
  try {
    const pr = await API.getProfitSummary(date); const p = pr.data;
    c.innerHTML = (p.stalls||[]).map(s => {
      if (!s.has_report) return `<div class="card mb-16" style="margin-bottom:14px"><div style="display:flex;align-items:center;gap:8px"><span class="dot dot--amber"></span><strong>${s.stall_name}</strong><span class="c-muted" style="font-size:12px">尚無今日回報</span></div></div>`;
      return `
        <div class="card" style="margin-bottom:16px">
          <div class="card__header">
            <div style="display:flex;align-items:center;gap:10px">
              <span class="dot dot--green"></span>
              <span style="font-size:16px;font-weight:700">${s.stall_name}</span>
              <span class="badge badge--gray">${s.barrels}桶 大${fn(s.big_bowls)} 小${fn(s.small_bowls)}</span>
            </div>
            <span class="badge ${s.netProfit>=0?'badge--green':'badge--red'}" style="font-size:13px;padding:5px 12px">淨利 ${fm(s.netProfit)}</span>
          </div>
          <div class="grid g2" style="gap:20px">
            <div>
              <div class="pl-row"><span class="pl-row__label">大碗 ${fn(s.big_bowls)} × ${fm(p.prices.bigBowlPrice)}</span><span class="pl-row__val c-green">${fm(s.big_bowls*p.prices.bigBowlPrice)}</span></div>
              <div class="pl-row"><span class="pl-row__label">小碗 ${fn(s.small_bowls)} × ${fm(p.prices.smallBowlPrice)}</span><span class="pl-row__val c-green">${fm(s.small_bowls*p.prices.smallBowlPrice)}</span></div>
              <div class="pl-total"><span class="pl-total__label">總營收</span><span class="pl-total__val c-green">${fm(s.revenue)}</span></div>
            </div>
            <div>
              <div class="pl-row"><span class="pl-row__label">進貨成本（${s.barrels}桶）</span><span class="pl-row__val c-red">${fm(s.cogs)}</span></div>
              <div class="pl-row"><span class="pl-row__label">每日租金</span><span class="pl-row__val c-red">${fm(s.dailyRent)}</span></div>
              <div class="pl-row"><span class="pl-row__label">固定成本</span><span class="pl-row__val c-red">${fm(s.dailyFixed)}</span></div>
              <div class="pl-row"><span class="pl-row__label">包材等其他</span><span class="pl-row__val c-red">${fm(s.extras)}</span></div>
              <div class="pl-total"><span class="pl-total__label">淨利</span><span class="pl-total__val ${UI.moneyClass(s.netProfit)}">${fm(s.netProfit)}</span></div>
            </div>
          </div>
        </div>`;
    }).join('') || noDataHTML();
  } catch(e) { c.innerHTML = errHTML(e); }
}

// ═══════════════════════════════════════════════════════════════
// 月報表
// ═══════════════════════════════════════════════════════════════
function renderMonthly(el) {
  el.innerHTML = `
    <div class="card" style="max-width:520px">
      <div class="alert-row alert-row--warning" style="margin-bottom:0">
        <i class="ti ti-info-circle alert-row__icon"></i>
        <div class="alert-row__body"><strong>月報表（第五階段實作）</strong>
        <span>目前系統已逐日記錄所有數據，月報表彙整功能將在第五階段開發。</span></div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// 庫存總覽
// ═══════════════════════════════════════════════════════════════
async function renderInventory(el) {
  el.innerHTML = `
    <div class="grid g2-1" style="gap:20px">
      <div>
        <div class="section-title mb-16" style="margin-bottom:12px"><i class="ti ti-package"></i>目前庫存</div>
        <div class="card" id="inv-overview"><div class="empty"><i class="ti ti-loader" style="animation:spin .7s linear infinite"></i></div></div>
      </div>
      <div>
        <div class="section-title mb-16" style="margin-bottom:12px"><i class="ti ti-plus"></i>入庫 / 出庫</div>
        <div class="card">
          <form id="inv-form" novalidate>
            <div class="fg" style="gap:12px">
              <div class="field"><label>日期</label><input type="date" name="date" value="${t()}"></div>
              <div class="field"><label>類型</label><select name="type"><option value="in">入庫</option><option value="out">出庫</option></select></div>
              <div class="field"><label>品項</label>
                <select name="item_id" id="inv-item">
                  <option value="">請選擇…</option>
                  ${(OwnerApp.cache.ingredients||[]).filter(i=>String(i.in_inventory).toUpperCase()==='TRUE')
                    .map(i=>`<option value="${i.ingredient_id}" data-unit="${i.unit}">${i.ingredient_name}（${i.unit}）</option>`).join('')}
                </select>
              </div>
              <div class="field"><label>數量</label><input type="number" name="qty" min="0.1" step="0.1" value="1"></div>
              <div class="field"><label>單價 ($)</label><input type="number" name="unit_price" min="0" value="0" id="inv-price" oninput="calcInvTotal()"></div>
              <div id="inv-total-display" style="font-size:12px;color:var(--ink-400)"></div>
              <div class="field"><label>備註</label><input type="text" name="note"></div>
            </div>
            <div class="btn-row"><button type="submit" class="btn btn--primary" id="btn-inv"><i class="ti ti-device-floppy"></i>儲存</button></div>
          </form>
        </div>
      </div>
    </div>`;
  loadInvOverview();
  $('inv-form').addEventListener('submit', saveInvLog);
}

window.calcInvTotal = () => {
  const q = +($('inv-form')?.qty?.value||0), p = +($('inv-price')?.value||0);
  const el = $('inv-total-display'); if(el) el.textContent = q&&p ? `總金額：${fm(q*p)}` : '';
};

async function loadInvOverview() {
  const ov = $('inv-overview'); if(!ov) return;
  try {
    const res = await API.getInventory();
    ov.innerHTML = (res.data||[]).map(item => {
      const pct = Math.min(100, Math.round(item.current_stock/item.min_stock*100));
      const cls = item.is_low ? 'low' : pct < 60 ? 'warn' : '';
      return `<div class="stock-item">
        <div class="stock-item__header">
          <span class="stock-item__name">${item.item_name}</span>
          <span class="stock-item__qty ${item.is_low?'low':''}">${fn(item.current_stock)} / ${fn(item.min_stock)} ${item.unit}${item.is_low?' ⚠':''}</span>
        </div>
        <div class="stock-bar"><div class="stock-bar__fill ${cls}" style="width:${pct}%"></div></div>
      </div>`;
    }).join('') || noDataHTML();
  } catch(e) { ov.innerHTML = errHTML(e); }
}

async function saveInvLog(e) {
  e.preventDefault();
  const data = UI.formData(e.target); const btn = $('btn-inv');
  if (!data.item_id) { UI.toast('請選擇品項', 'error'); return; }
  const opt = $('inv-item').selectedOptions[0];
  data.item_name = opt?.text?.split('（')[0] || '';
  data.unit = opt?.dataset?.unit || '';
  UI.btnLoad(btn, true);
  try { await API.saveInventoryLog(data); UI.toast('✓ 已儲存'); UI.resetForm(e.target); e.target.date.value=t(); loadInvOverview(); }
  catch(err) { UI.toast(err.message, 'error'); }
  finally { UI.btnLoad(btn, false); }
}

// ═══════════════════════════════════════════════════════════════
// 成本管理
// ═══════════════════════════════════════════════════════════════
async function renderCosts(el) {
  el.innerHTML = datePicker('cost-date', 'loadCosts') + '<div id="cost-content"></div>';
  loadCosts();
}
async function loadCosts() {
  const date = $('cost-date')?.value || t(); const c = $('cost-content'); if(!c) return;
  c.innerHTML = spinnerHTML();
  try {
    const res = await API.getKitchenCosts(date); const rows = res.data||[];
    if(!rows.length){ c.innerHTML=`<div class="card">${noDataHTML()}</div>`; return; }
    c.innerHTML = `<div class="card"><div class="table-wrap"><table>
      <thead><tr><th>日期</th><th>類型</th><th>金額</th><th>備註</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td>${r.date}</td><td><span class="badge badge--gray">${r.type}</span></td><td class="td-num c-red">${fm(r.amount)}</td><td class="td-muted">${r.note||'—'}</td></tr>`).join('')}</tbody>
    </table></div>
    <div class="pl-total" style="margin-top:12px"><span class="pl-total__label">合計</span><span class="pl-total__val c-red">${fm(rows.reduce((s,r)=>s+Number(r.amount||0),0))}</span></div>
    </div>`;
  } catch(e) { c.innerHTML=errHTML(e); }
}

// ═══════════════════════════════════════════════════════════════
// 設定中心
// ═══════════════════════════════════════════════════════════════
function renderSettings(el) {
  const s = OwnerApp.cache.settings||{};
  const stalls = OwnerApp.cache.stalls||[];
  const ings   = OwnerApp.cache.ingredients||[];

  el.innerHTML = `
    <div class="tabs mb-16" id="set-tabs">
      <div class="tab active" data-tab="prices">價格設定</div>
      <div class="tab" data-tab="stalls">攤位設定</div>
      <div class="tab" data-tab="ingredients">配料設定</div>
    </div>
    <div id="set-content"></div>`;

  const tabContents = {
    prices: `
      <div class="card" style="max-width:480px">
        <div class="alert-row alert-row--warning" style="margin-bottom:16px">
          <i class="ti ti-info-circle alert-row__icon"></i>
          <div class="alert-row__body"><strong>修改說明</strong><span>請直接至 Google Sheets → 系統設定 工作表修改，系統下次載入時自動生效。</span></div>
        </div>
        <div class="fg" style="gap:14px">
          <div class="field"><label>每桶供貨價 ($)</label><input type="number" value="${s['每桶供貨價']||1275}" readonly style="background:var(--ink-50)"></div>
          <div class="field"><label>大碗售價 ($)</label><input type="number" value="${s['大碗售價']||80}" readonly style="background:var(--ink-50)"></div>
          <div class="field"><label>小碗售價 ($)</label><input type="number" value="${s['小碗售價']||60}" readonly style="background:var(--ink-50)"></div>
        </div>
        <p style="font-size:11px;color:var(--ink-400);margin-top:12px">目前為唯讀顯示。請至 Google Sheets 修改。</p>
      </div>`,
    stalls: `
      <div class="alert-row alert-row--warning" style="margin-bottom:12px">
        <i class="ti ti-info-circle alert-row__icon"></i>
        <div class="alert-row__body"><strong>修改說明</strong><span>請至 Google Sheets → 攤位設定 工作表新增或修改攤位。</span></div>
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>攤位編號</th><th>攤位名稱</th><th>月租金</th><th>月固定成本</th><th>備註</th></tr></thead>
        <tbody>${stalls.map(s=>`<tr><td class="td-muted font-num">${s.stall_id}</td><td><strong>${s.stall_name}</strong></td><td class="td-num">${fm(s.rent)}</td><td class="td-num">${fm(s.fixed_cost)}</td><td class="td-muted">${s.note||'—'}</td></tr>`).join('')}</tbody>
      </table></div></div>`,
    ingredients: `
      <div class="alert-row alert-row--warning" style="margin-bottom:12px">
        <i class="ti ti-info-circle alert-row__icon"></i>
        <div class="alert-row__body"><strong>修改說明</strong><span>請至 Google Sheets → 配料設定 工作表新增或修改配料。</span></div>
      </div>
      <div class="card"><div class="table-wrap"><table>
        <thead><tr><th>編號</th><th>名稱</th><th>單位</th><th>成本</th><th>納入庫存</th></tr></thead>
        <tbody>${ings.map(i=>`<tr><td class="td-muted font-num">${i.ingredient_id}</td><td><strong>${i.ingredient_name}</strong></td><td>${i.unit}</td><td class="td-num">${fm(i.cost)}</td><td>${String(i.in_inventory).toUpperCase()==='TRUE'?'<span class="badge badge--sky">是</span>':'<span class="badge badge--gray">否</span>'}</td></tr>`).join('')}</tbody>
      </table></div></div>`
  };

  const render = (tab) => {
    $('set-content').innerHTML = tabContents[tab] || '';
  };
  el.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    el.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    render(t.dataset.tab);
  }));
  render('prices');
}

// ── 共用 HTML helpers ─────────────────────────────────────────
function datePicker(id, fn) {
  return `<div class="section-header mb-16" style="margin-bottom:16px"><div class="section-title"><i class="ti ti-calendar"></i>查詢日期</div><div style="display:flex;gap:8px"><input type="date" id="${id}" value="${t()}" style="padding:7px 10px;border:1.5px solid var(--ink-200);border-radius:var(--r-md);font-size:13px;outline:none"><button class="btn btn--primary btn--sm" onclick="${fn}()"><i class="ti ti-refresh"></i> 更新</button></div></div>`;
}
function spinnerHTML() { return '<div class="empty"><i class="ti ti-loader" style="animation:spin .7s linear infinite"></i><p>載入中…</p></div>'; }
function noDataHTML()   { return '<div class="empty" style="padding:24px"><i class="ti ti-inbox"></i><p>目前無資料</p></div>'; }
function errHTML(e)     { return `<div class="alert-row alert-row--danger"><i class="ti ti-alert-triangle alert-row__icon"></i><div class="alert-row__body"><strong>載入失敗</strong><span>${e.message}</span></div></div>`; }

// 把函式掛到 window 讓 HTML onclick 可以呼叫
window.loadDash = loadDash;
window.loadKitchenPL = loadKitchenPL;
window.loadStallPL   = loadStallPL;
window.loadCosts     = loadCosts;
