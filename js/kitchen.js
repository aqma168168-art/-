// ============================================================
// kitchen.js — 廚房作業系統 v2.0
// 不顯示任何毛利、淨利、成本分析數字
// ============================================================

const KitchenApp = {
  page: 'dispatch',
  cache: { settings: null, stalls: null, ingredients: null },
};

const K_TITLES = {
  dispatch:    '今日配發表',
  'new-dispatch': '新增配發',
  leftover:    '昨日攤位剩料',
  suggestion:  '建議備料',
  inventory:   '庫存管理',
  'cost-input':'成本輸入',
};

// ── 初始化 ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('topbar-date').textContent =
    new Date().toLocaleDateString('zh-TW', { year:'numeric', month:'long', day:'numeric', weekday:'short' });

  UI.showLoading('載入設定…');
  try {
    const [sr, stR, ingR] = await Promise.all([API.getSettings(), API.getStalls(), API.getIngredients()]);
    KitchenApp.cache.settings    = sr.data;
    KitchenApp.cache.stalls      = stR.data;
    KitchenApp.cache.ingredients = ingR.data;
    const b = document.getElementById('conn-badge');
    if (b) { b.textContent = '已連線'; b.className = 'badge badge--green'; }
  } catch(e) {
    UI.toast('無法載入設定：' + e.message, 'error', 6000);
    const b = document.getElementById('conn-badge');
    if (b) { b.textContent = '連線失敗'; b.className = 'badge badge--red'; }
  } finally { UI.hideLoading(); }

  document.querySelectorAll('.nav-item[data-page]').forEach(el =>
    el.addEventListener('click', () => showPage(el.dataset.page)));

  showPage('dispatch');
});

function showPage(page) {
  KitchenApp.page = page;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.page === page));
  document.getElementById('page-title').textContent = K_TITLES[page] || page;
  const body = document.getElementById('page-body');
  body.innerHTML = '';
  ({
    dispatch:      renderDispatchList,
    'new-dispatch':renderNewDispatch,
    leftover:      renderLeftover,
    suggestion:    renderSuggestion,
    inventory:     renderInventory,
    'cost-input':  renderCostInput,
  }[page] || (() => {}))(body);
}

const $ = id => document.getElementById(id);
const t = UI.todayISO;
const fn = UI.fmtNum;

function yesterday() {
  const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10);
}
function spinHTML() { return '<div class="empty"><i class="ti ti-loader" style="animation:spin .7s linear infinite"></i><p>載入中…</p></div>'; }
function noDataHTML() { return '<div class="empty" style="padding:24px"><i class="ti ti-inbox"></i><p>無資料</p></div>'; }
function errHTML(e) { return `<div class="alert-row alert-row--danger" style="margin:0"><i class="ti ti-alert-triangle alert-row__icon"></i><div class="alert-row__body"><strong>載入失敗</strong><span>${e.message}</span></div></div>`; }

// ═══════════════════════════════════════════════════════════════
// 今日配發表
// ═══════════════════════════════════════════════════════════════
async function renderDispatchList(el) {
  el.innerHTML = `
    <div class="section-header" style="margin-bottom:16px">
      <div class="section-title"><i class="ti ti-truck-delivery"></i>配發記錄</div>
      <div style="display:flex;gap:8px">
        <input type="date" id="disp-date" value="${t()}" style="padding:7px 10px;border:1.5px solid var(--ink-200);border-radius:var(--r-md);font-size:13px;outline:none">
        <button class="btn btn--sm btn--primary" onclick="loadDispatchList()"><i class="ti ti-refresh"></i> 更新</button>
        <button class="btn btn--sm btn--green" onclick="showPage('new-dispatch')"><i class="ti ti-plus"></i> 新增</button>
      </div>
    </div>
    <div id="disp-list">${spinHTML()}</div>`;
  loadDispatchList();
}

async function loadDispatchList() {
  const date = $('disp-date')?.value || t();
  const c = $('disp-list'); if (!c) return;
  c.innerHTML = spinHTML();
  try {
    const res = await API.getDispatches(date);
    const rows = res.data || [];
    if (!rows.length) { c.innerHTML = `<div class="card">${noDataHTML()}</div>`; return; }
    c.innerHTML = `<div class="card"><div class="table-wrap"><table>
      <thead><tr>
        <th>攤位</th><th>配發人</th>
        <th>底料 大/中/小</th><th>米 大/中/小</th><th>芋頭 大/中/小</th>
        <th>芋泥(包)</th><th>碎皮蛋</th><th>整皮蛋</th><th>芹菜</th><th>菜脯</th>
        <th>備註</th>
      </tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td><strong>${r.stall_name||r.stall_id}</strong></td>
        <td>${r.dispatcher||'—'}</td>
        <td class="td-num">${r.base_L||0}/${r.base_M||0}/${r.base_S||0}</td>
        <td class="td-num">${r.rice_L||0}/${r.rice_M||0}/${r.rice_S||0}</td>
        <td class="td-num">${r.taro_L||0}/${r.taro_M||0}/${r.taro_S||0}</td>
        <td class="td-num">${r.taro_paste||0}</td>
        <td class="td-num">${r.broken_egg||0}</td>
        <td class="td-num">${r.whole_egg||0}</td>
        <td class="td-num">${r.celery||0}</td>
        <td class="td-num">${r.pickled_radish||0}</td>
        <td class="td-muted">${r.note||'—'}</td>
      </tr>`).join('')}</tbody>
    </table></div></div>`;
  } catch(e) { c.innerHTML = errHTML(e); }
}
window.loadDispatchList = loadDispatchList;

// ═══════════════════════════════════════════════════════════════
// 新增配發
// ═══════════════════════════════════════════════════════════════
function renderNewDispatch(el) {
  const stalls = KitchenApp.cache.stalls || [];
  const sz = ['大','中','小'];

  el.innerHTML = `
    <div class="section-title mb-16" style="margin-bottom:16px"><i class="ti ti-plus"></i>新增配發記錄</div>
    <div class="card">
      <form id="dispatch-form" novalidate>
        <div class="form-section">
          <div class="form-section__title"><i class="ti ti-info-circle"></i>基本資料</div>
          <div class="fg fg3">
            <div class="field"><label>日期</label><input type="date" name="date" value="${t()}" required></div>
            <div class="field"><label>攤位 *</label>
              <select name="stall_id" required>
                <option value="">請選擇攤位…</option>
                ${stalls.map(s=>`<option value="${s.stall_id}">${s.stall_name}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>配發人</label>
              <select name="dispatcher">
                <option>阿明</option><option>阿華</option><option>阿成</option><option>其他</option>
              </select>
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section__title"><i class="ti ti-droplet"></i>底料配發</div>
          <div class="fg fg3">${sz.map(s=>`<div class="field"><label>底料（${s}）</label><input type="number" name="base_${s==='大'?'L':s==='中'?'M':'S'}" min="0" value="0"></div>`).join('')}</div>
        </div>

        <div class="form-section">
          <div class="form-section__title"><i class="ti ti-grain"></i>米配發</div>
          <div class="fg fg3">${sz.map(s=>`<div class="field"><label>米（${s}）</label><input type="number" name="rice_${s==='大'?'L':s==='中'?'M':'S'}" min="0" value="0"></div>`).join('')}</div>
        </div>

        <div class="form-section">
          <div class="form-section__title"><i class="ti ti-plant"></i>芋頭 / 芋泥</div>
          <div class="fg fg4">
            ${sz.map(s=>`<div class="field"><label>芋頭（${s}）</label><input type="number" name="taro_${s==='大'?'L':s==='中'?'M':'S'}" min="0" value="0"></div>`).join('')}
            <div class="field"><label>芋泥（包）</label><input type="number" name="taro_paste" min="0" value="0"></div>
          </div>
        </div>

        <div class="form-section">
          <div class="form-section__title"><i class="ti ti-egg"></i>其他配料</div>
          <div class="fg fg4">
            <div class="field"><label>碎皮蛋（碗）</label><input type="number" name="broken_egg" min="0" value="0"></div>
            <div class="field"><label>完整皮蛋（碗）</label><input type="number" name="whole_egg" min="0" value="0"></div>
            <div class="field"><label>芹菜（碗）</label><input type="number" name="celery" min="0" value="0"></div>
            <div class="field"><label>菜脯（碗）</label><input type="number" name="pickled_radish" min="0" value="0"></div>
          </div>
        </div>

        <div class="form-section" style="margin-bottom:0">
          <div class="field"><label>備註</label><textarea name="note" placeholder="選填"></textarea></div>
        </div>

        <div class="btn-row">
          <button type="button" class="btn" onclick="UI.resetForm(document.getElementById('dispatch-form'))"><i class="ti ti-eraser"></i>清除</button>
          <button type="submit" class="btn btn--primary" id="btn-dispatch"><i class="ti ti-device-floppy"></i>儲存配發記錄</button>
        </div>
      </form>
    </div>`;

  $('dispatch-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = UI.formData(e.target);
    if (!data.stall_id) { UI.toast('請選擇攤位', 'error'); return; }
    const stall = KitchenApp.cache.stalls.find(s => s.stall_id === data.stall_id);
    data.stall_name = stall?.stall_name || '';
    const btn = $('btn-dispatch'); UI.btnLoad(btn, true, '儲存中…');
    try {
      await API.saveDispatch(data);
      UI.toast(`✓ ${data.stall_name} 配發記錄已儲存`);
      UI.resetForm(e.target);
      e.target.querySelector('[name="date"]').value = t();
    } catch(err) { UI.toast(err.message, 'error'); }
    finally { UI.btnLoad(btn, false); }
  });
}

// ═══════════════════════════════════════════════════════════════
// 昨日剩料
// ═══════════════════════════════════════════════════════════════
async function renderLeftover(el) {
  const yest = yesterday();
  el.innerHTML = `
    <div class="section-header mb-16" style="margin-bottom:16px">
      <div class="section-title"><i class="ti ti-history"></i>昨日攤位剩料（${yest}）</div>
    </div>
    <div id="leftover-content">${spinHTML()}</div>`;
  try {
    const res = await API.getReports(yest);
    const rows = res.data || [];
    const c = $('leftover-content');
    if (!rows.length) { c.innerHTML = `<div class="card">${noDataHTML()}</div>`; return; }
    c.innerHTML = `<div class="card"><div class="table-wrap"><table>
      <thead><tr>
        <th>攤位</th><th>底料 大/中/小</th><th>米 大/中/小</th><th>芋頭 大/中/小</th>
        <th>芋泥</th><th>碎皮蛋</th><th>整皮蛋</th><th>芹菜</th><th>菜脯</th>
      </tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td><strong>${r.stall_name||r.stall_id}</strong></td>
        <td class="td-num">${r.rem_base_L||0}/${r.rem_base_M||0}/${r.rem_base_S||0}</td>
        <td class="td-num">${r.rem_rice_L||0}/${r.rem_rice_M||0}/${r.rem_rice_S||0}</td>
        <td class="td-num">${r.rem_taro_L||0}/${r.rem_taro_M||0}/${r.rem_taro_S||0}</td>
        <td class="td-num">${r.rem_taro_paste||0}</td>
        <td class="td-num">${r.rem_broken_egg||0}</td>
        <td class="td-num">${r.rem_whole_egg||0}</td>
        <td class="td-num">${r.rem_celery||0}</td>
        <td class="td-num">${r.rem_pickled_radish||0}</td>
      </tr>`).join('')}</tbody>
    </table></div></div>`;
  } catch(e) { $('leftover-content').innerHTML = errHTML(e); }
}

// ═══════════════════════════════════════════════════════════════
// 建議備料（昨日銷售 - 昨日剩料 = 今日建議）
// ═══════════════════════════════════════════════════════════════
async function renderSuggestion(el) {
  const yest = yesterday();
  el.innerHTML = `
    <div class="section-title mb-16" style="margin-bottom:16px"><i class="ti ti-bulb"></i>今日建議備料（依昨日推算）</div>
    <div id="suggestion-content">${spinHTML()}</div>`;
  try {
    const [dispRes, repRes] = await Promise.all([API.getDispatches(yest), API.getReports(yest)]);
    const dispatches = dispRes.data || [];
    const reports    = repRes.data  || [];
    const stalls     = KitchenApp.cache.stalls || [];
    const c = $('suggestion-content');

    if (!dispatches.length || !reports.length) {
      c.innerHTML = `<div class="card"><div class="alert-row alert-row--warning"><i class="ti ti-info-circle alert-row__icon"></i><div class="alert-row__body"><strong>資料不足</strong><span>昨日配發或回報資料不完整，無法計算建議備料。</span></div></div></div>`;
      return;
    }

    const fields = [
      { label:'底料大', dKey:'base_L', rKey:'rem_base_L' },
      { label:'底料中', dKey:'base_M', rKey:'rem_base_M' },
      { label:'底料小', dKey:'base_S', rKey:'rem_base_S' },
      { label:'米大',   dKey:'rice_L', rKey:'rem_rice_L' },
      { label:'米中',   dKey:'rice_M', rKey:'rem_rice_M' },
      { label:'米小',   dKey:'rice_S', rKey:'rem_rice_S' },
    ];

    c.innerHTML = stalls.map(stall => {
      const d = dispatches.find(x => x.stall_id === stall.stall_id);
      const r = reports.find(x => x.stall_id === stall.stall_id);
      if (!d && !r) return '';
      const rows = fields.map(f => {
        const sent = Number(d?.[f.dKey]||0);
        const rem  = Number(r?.[f.rKey]||0);
        const used = sent - rem;
        const suggest = Math.max(0, Math.ceil(used * 1.1)); // 加1成緩衝
        return `<div class="stall-card__row">
          <span class="stall-card__row-label">${f.label}</span>
          <span class="td-muted">昨送 ${sent} 剩 ${rem} → 用 ${used}</span>
          <span class="stall-card__row-val c-sky fw-700">建議 ${suggest}</span>
        </div>`;
      }).join('');
      return `<div class="stall-card" style="margin-bottom:14px">
        <div class="stall-card__head"><div class="stall-card__name"><span class="dot dot--sky"></span>${stall.stall_name}</div></div>
        <div class="stall-card__body">${rows}</div>
        <div class="stall-card__footer"><span>建議數量 = 昨日實際用量 × 1.1（含緩衝）</span></div>
      </div>`;
    }).join('') || noDataHTML();
  } catch(e) { $('suggestion-content').innerHTML = errHTML(e); }
}

// ═══════════════════════════════════════════════════════════════
// 庫存管理（廚房版：入出庫 + 目前庫存，不顯示金額分析）
// ═══════════════════════════════════════════════════════════════
async function renderInventory(el) {
  const ings = (KitchenApp.cache.ingredients||[]).filter(i => String(i.in_inventory).toUpperCase() === 'TRUE');
  el.innerHTML = `
    <div class="grid g2-1" style="gap:20px">
      <div>
        <div class="section-title mb-16" style="margin-bottom:12px"><i class="ti ti-package"></i>目前庫存</div>
        <div class="card" id="k-inv-overview">${spinHTML()}</div>
      </div>
      <div>
        <div class="section-title mb-16" style="margin-bottom:12px"><i class="ti ti-arrows-transfer-up"></i>入庫 / 出庫</div>
        <div class="card">
          <form id="k-inv-form" novalidate>
            <div class="fg" style="gap:12px">
              <div class="field"><label>日期</label><input type="date" name="date" value="${t()}"></div>
              <div class="field"><label>類型</label><select name="type"><option value="in">入庫</option><option value="out">出庫（廚房使用）</option></select></div>
              <div class="field"><label>品項</label>
                <select name="item_id" id="k-inv-item">
                  <option value="">請選擇…</option>
                  ${ings.map(i=>`<option value="${i.ingredient_id}" data-unit="${i.unit}">${i.ingredient_name}（${i.unit}）</option>`).join('')}
                </select>
              </div>
              <div class="field"><label>數量</label><input type="number" name="qty" min="0.1" step="0.1" value="1"></div>
              <div class="field"><label>備註</label><input type="text" name="note" placeholder="例：早市採購"></div>
            </div>
            <div class="btn-row"><button type="submit" class="btn btn--primary" id="btn-k-inv"><i class="ti ti-device-floppy"></i>儲存</button></div>
          </form>
        </div>
      </div>
    </div>
    <div class="section-title mt-24 mb-16" style="margin-top:20px;margin-bottom:12px"><i class="ti ti-history"></i>近期異動記錄</div>
    <div class="card" id="k-inv-log">${spinHTML()}</div>`;

  loadKitchenInv();
  $('k-inv-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = UI.formData(e.target);
    if (!data.item_id) { UI.toast('請選擇品項', 'error'); return; }
    const opt = $('k-inv-item').selectedOptions[0];
    data.item_name = opt?.text?.split('（')[0] || '';
    data.unit = opt?.dataset?.unit || '';
    data.unit_price = 0; // 廚房員工不填單價
    const btn = $('btn-k-inv'); UI.btnLoad(btn, true);
    try { await API.saveInventoryLog(data); UI.toast('✓ 已儲存'); UI.resetForm(e.target); e.target.querySelector('[name="date"]').value=t(); loadKitchenInv(); }
    catch(err) { UI.toast(err.message,'error'); }
    finally { UI.btnLoad(btn,false); }
  });
}

async function loadKitchenInv() {
  const [ov, lg] = [$('k-inv-overview'), $('k-inv-log')];
  try {
    const res = await API.getInventory();
    const items = res.data || [];
    if (ov) ov.innerHTML = items.map(item => {
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
  } catch(e) { if(ov) ov.innerHTML = errHTML(e); }
  if (lg) lg.innerHTML = '<div class="empty" style="padding:20px"><p style="font-size:12px">庫存異動記錄請至老闆後台查看完整記錄。</p></div>';
}

// ═══════════════════════════════════════════════════════════════
// 成本輸入（廚房員工可以輸入人事、司機成本，不顯示毛利計算）
// ═══════════════════════════════════════════════════════════════
function renderCostInput(el) {
  el.innerHTML = `
    <div class="section-title mb-16" style="margin-bottom:16px"><i class="ti ti-receipt"></i>今日成本輸入</div>
    <div class="card" style="max-width:560px">
      <div class="alert-row alert-row--warning" style="margin-bottom:16px">
        <i class="ti ti-info-circle alert-row__icon"></i>
        <div class="alert-row__body"><strong>說明</strong><span>請輸入廚房今日實際成本。損益計算由老闆後台負責。</span></div>
      </div>
      <form id="cost-form" novalidate>
        <div class="fg fg3" style="margin-bottom:14px">
          <div class="field"><label>日期</label><input type="date" name="date" value="${t()}"></div>
          <div class="field"><label>成本類型</label>
            <select name="type">
              <option value="labor">廚房人事費</option>
              <option value="driver">司機費用</option>
              <option value="ingredient">食材採購</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div class="field"><label>金額 ($)</label><input type="number" name="amount" min="0" value="0" required></div>
        </div>
        <div class="field" style="margin-bottom:14px"><label>備註說明</label><input type="text" name="note" placeholder="例：今日阿明加班費、早市買芋頭…"></div>
        <div class="btn-row"><button type="submit" class="btn btn--primary" id="btn-cost"><i class="ti ti-device-floppy"></i>送出成本記錄</button></div>
      </form>
    </div>
    <div id="cost-today-list" style="margin-top:20px"></div>`;

  $('cost-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = UI.formData(e.target); const btn = $('btn-cost');
    if (!data.amount) { UI.toast('請填入金額', 'error'); return; }
    UI.btnLoad(btn, true);
    try { await API.saveKitchenCost(data); UI.toast('✓ 成本已送出'); UI.resetForm(e.target); e.target.querySelector('[name="date"]').value=t(); loadTodayCosts(); }
    catch(err) { UI.toast(err.message,'error'); }
    finally { UI.btnLoad(btn, false); }
  });
  loadTodayCosts();
}

async function loadTodayCosts() {
  const c = $('cost-today-list'); if(!c) return;
  try {
    const res = await API.getKitchenCosts(t()); const rows = res.data||[];
    if(!rows.length){ c.innerHTML=''; return; }
    c.innerHTML = `<div class="section-title mb-16" style="margin-bottom:12px"><i class="ti ti-list"></i>今日已輸入成本</div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>類型</th><th>金額</th><th>備註</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td><span class="badge badge--gray">${r.type}</span></td><td class="td-num">${UI.fmtMoney(r.amount)}</td><td class="td-muted">${r.note||'—'}</td></tr>`).join('')}</tbody>
    </table></div></div>`;
  } catch(e) { c.innerHTML=errHTML(e); }
}
