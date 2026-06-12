// ============================================================
// owner.js — 老闆管理系統頁面邏輯（含損益、成本、設定）
// 此檔案只在通過 AUTH.requireOwner() 驗證後才執行
// ============================================================

const OwnerApp = {
  currentPage: 'dashboard',
  cache: {
    stalls:      null,
    ingredients: null,
    settings:    null,
  },
};

const OWNER_PAGE_TITLES = {
  'dashboard':           '總儀表板',
  'kitchen-pl':          '中央廚房損益',
  'stall-pl':            '各攤位損益',
  'monthly-report':      '月報表',
  'inventory':           '庫存總覽',
  'kitchen-costs':       '成本管理',
  'settings-prices':     '供貨價格設定',
  'settings-stalls':     '攤位設定',
  'settings-ingredients':'配料設定',
};

// ── 初始化 ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  });

  UI.showLoading('載入管理資料…');
  try {
    const [settingsRes, stallsRes, ingRes] = await Promise.all([
      API.getSettings(),
      API.getStalls(),
      API.getIngredients(),
    ]);
    OwnerApp.cache.settings    = settingsRes.data;
    OwnerApp.cache.stalls      = stallsRes.data;
    OwnerApp.cache.ingredients = ingRes.data;
  } catch (err) {
    UI.toast('無法載入設定：' + err.message, 'error', 6000);
  } finally {
    UI.hideLoading();
  }
  showPage('dashboard');
});

// ── 路由 ─────────────────────────────────────────────────────
function showPage(page) {
  OwnerApp.currentPage = page;
  document.getElementById('page-title').textContent = OWNER_PAGE_TITLES[page] || page;
  document.querySelectorAll('.sidebar__item').forEach(el => {
    el.classList.toggle('is-active', el.dataset.page === page);
  });
  const content = document.getElementById('page-content');
  content.innerHTML = '';
  switch (page) {
    case 'dashboard':            renderDashboard(content);        break;
    case 'kitchen-pl':           renderKitchenPL(content);        break;
    case 'stall-pl':             renderStallPL(content);          break;
    case 'monthly-report':       renderMonthlyReport(content);    break;
    case 'inventory':            renderInventory(content);        break;
    case 'kitchen-costs':        renderKitchenCosts(content);     break;
    case 'settings-prices':      renderSettingsPrices(content);   break;
    case 'settings-stalls':      renderSettingsStalls(content);   break;
    case 'settings-ingredients': renderSettingsIngredients(content); break;
    default:
      content.innerHTML = '<div class="empty-state">頁面不存在</div>';
  }
}

function todayStr() { return UI.todayISO(); }
function fmt(n) { return UI.formatCurrency(n); }

// ═══════════════════════════════════════════════════════════════
// 頁面：總儀表板
// ═══════════════════════════════════════════════════════════════
async function renderDashboard(el) {
  el.innerHTML = `
    <div class="form-grid form-grid-2" style="margin-bottom:16px;max-width:400px">
      <div class="field">
        <label>查詢日期</label>
        <input type="date" id="dash-date" value="${todayStr()}">
      </div>
      <div style="display:flex;align-items:flex-end">
        <button class="btn btn--primary" onclick="loadDashboard()">
          <i class="ti ti-search"></i> 查詢
        </button>
      </div>
    </div>
    <div id="dash-content"></div>
  `;
  loadDashboard();
}

async function loadDashboard() {
  const date = document.getElementById('dash-date')?.value || todayStr();
  const container = document.getElementById('dash-content');
  if (!container) return;
  container.innerHTML = '<div class="empty-state"><i class="ti ti-loader" style="animation:spin .8s linear infinite"></i>載入中…</div>';

  try {
    const [profitRes, invRes] = await Promise.all([
      API.getProfitSummary(date),
      API.getInventory(),
    ]);

    const p = profitRes.data;
    const invItems = invRes.data || [];
    const lowStock = invItems.filter(i => i.is_low);

    container.innerHTML = `
      <!-- 中央廚房 -->
      <div class="section-title"><i class="ti ti-building-factory-2"></i>中央廚房 — ${p.date}</div>
      <div class="card" style="margin-bottom:20px">
        <div class="grid-3">
          <div class="metric-card">
            <div class="metric-card__label">今日收入</div>
            <div class="metric-card__value text-green">${fmt(p.kitchen.revenue)}</div>
            <div class="metric-card__sub">@ ${fmt(p.prices.supplyPrice)}/桶</div>
          </div>
          <div class="metric-card">
            <div class="metric-card__label">今日成本</div>
            <div class="metric-card__value text-red">${fmt(p.kitchen.cost)}</div>
          </div>
          <div class="metric-card">
            <div class="metric-card__label">今日毛利</div>
            <div class="metric-card__value ${p.kitchen.profit >= 0 ? 'text-green' : 'text-red'}">${fmt(p.kitchen.profit)}</div>
            <div class="metric-card__sub">毛利率 ${p.kitchen.revenue ? Math.round(p.kitchen.profit/p.kitchen.revenue*100) : 0}%</div>
          </div>
        </div>
      </div>

      <!-- 庫存警示 -->
      ${lowStock.length > 0 ? `
      <div class="section-title"><i class="ti ti-alert-triangle"></i>庫存警示（${lowStock.length} 項）</div>
      <div class="card" style="margin-bottom:20px">
        ${lowStock.map(i=>`
          <div class="alert alert--warning" style="margin-bottom:6px">
            <i class="ti ti-alert-triangle"></i>
            <div>
              <strong>${i.item_name}</strong> 目前 ${i.current_stock} ${i.unit}，低於安全庫存 ${i.min_stock} ${i.unit}
            </div>
          </div>`).join('')}
      </div>` : ''}

      <!-- 各攤位 -->
      <div class="section-title"><i class="ti ti-store"></i>各攤位今日</div>
      <div class="grid-3">
        ${(p.stalls || []).map(s => `
          <div class="card">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
              <span class="dot ${s.has_report ? 'dot--green' : 'dot--amber'}"></span>
              <strong>${s.stall_name}</strong>
            </div>
            ${s.has_report ? `
              <div class="profit-row">
                <span class="profit-row__label">今日營收</span>
                <span class="profit-row__value text-green">${fmt(s.revenue)}</span>
              </div>
              <div class="profit-row">
                <span class="profit-row__label">今日淨利</span>
                <span class="profit-row__value ${s.netProfit >= 0 ? 'text-green' : 'text-red'}">${fmt(s.netProfit)}</span>
              </div>
              <div class="profit-row">
                <span class="profit-row__label">桶數</span>
                <span class="profit-row__value">${s.barrels} 桶</span>
              </div>
              <div class="profit-row">
                <span class="profit-row__label">大碗 / 小碗</span>
                <span class="profit-row__value">${s.big_bowls} / ${s.small_bowls}</span>
              </div>
              <div class="profit-row" style="border:none">
                <span class="profit-row__label">賣完時間</span>
                <span class="badge badge--success">${s.sold_out_time}</span>
              </div>` : `
              <div class="empty-state" style="padding:12px 0;font-size:12px">尚未回報</div>`}
          </div>`).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="alert alert--danger">載入失敗：${err.message}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// 頁面：中央廚房損益
// ═══════════════════════════════════════════════════════════════
async function renderKitchenPL(el) {
  el.innerHTML = `
    <div class="form-grid form-grid-2" style="margin-bottom:16px;max-width:400px">
      <div class="field"><label>查詢日期</label><input type="date" id="kpl-date" value="${todayStr()}"></div>
      <div style="display:flex;align-items:flex-end">
        <button class="btn btn--primary" onclick="loadKitchenPL()"><i class="ti ti-search"></i> 查詢</button>
      </div>
    </div>
    <div id="kpl-content"></div>
    <!-- 新增成本 -->
    <div class="section-title" style="margin-top:24px"><i class="ti ti-plus"></i>新增廚房成本</div>
    <div class="card">
      <form id="kc-form" novalidate>
        <div class="form-grid form-grid-4">
          <div class="field"><label>日期</label><input type="date" name="date" value="${todayStr()}"></div>
          <div class="field"><label>類型</label>
            <select name="type">
              <option value="labor">人事</option>
              <option value="driver">司機</option>
              <option value="ingredient">食材</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div class="field"><label>金額 ($)</label><input type="number" name="amount" min="0" value="0"></div>
          <div class="field"><label>備註</label><input type="text" name="note" placeholder="說明"></div>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn--primary" id="btn-kc-save">
            <i class="ti ti-plus"></i> 新增成本
          </button>
        </div>
      </form>
    </div>
  `;
  document.getElementById('kc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = UI.getFormData(e.target);
    const btn = document.getElementById('btn-kc-save');
    UI.btnLoading(btn, true);
    try {
      await API.saveKitchenCost(data);
      UI.toast('✓ 成本已新增');
      UI.resetForm(e.target);
      e.target.querySelector('[name="date"]').value = todayStr();
      loadKitchenPL();
    } catch (err) {
      UI.toast('儲存失敗：' + err.message, 'error');
    } finally {
      UI.btnLoading(btn, false);
    }
  });
  loadKitchenPL();
}

async function loadKitchenPL() {
  const date = document.getElementById('kpl-date')?.value || todayStr();
  const container = document.getElementById('kpl-content');
  if (!container) return;
  container.innerHTML = '<div class="empty-state"><i class="ti ti-loader" style="animation:spin .8s linear infinite"></i>載入中…</div>';
  try {
    const [profitRes, costsRes] = await Promise.all([
      API.getProfitSummary(date),
      API.getKitchenCosts(date),
    ]);
    const p = profitRes.data;
    const costs = costsRes.data || [];
    const barrels = (p.stalls||[]).reduce((s,r) => s + (r.barrels||0), 0);
    container.innerHTML = `
      <div class="grid-4" style="margin-bottom:20px">
        <div class="metric-card"><div class="metric-card__label">配發桶數</div><div class="metric-card__value">${barrels}</div></div>
        <div class="metric-card"><div class="metric-card__label">今日收入</div><div class="metric-card__value text-green">${fmt(p.kitchen.revenue)}</div></div>
        <div class="metric-card"><div class="metric-card__label">今日成本</div><div class="metric-card__value text-red">${fmt(p.kitchen.cost)}</div></div>
        <div class="metric-card">
          <div class="metric-card__label">今日毛利</div>
          <div class="metric-card__value ${p.kitchen.profit>=0?'text-green':'text-red'}">${fmt(p.kitchen.profit)}</div>
          <div class="metric-card__sub">每桶均毛利 ${fmt(barrels?Math.round(p.kitchen.profit/barrels):0)}</div>
        </div>
      </div>
      <div class="grid-2">
        <div class="card">
          <div class="card__header"><div class="card__title"><i class="ti ti-trending-up"></i>收入明細</div></div>
          ${(p.stalls||[]).filter(s=>s.has_report).map(s=>`
            <div class="profit-row">
              <span class="profit-row__label">${s.stall_name} — ${s.barrels} 桶</span>
              <span class="profit-row__value text-green">${fmt(s.barrels * p.prices.supplyPrice)}</span>
            </div>`).join('') || '<div class="text-muted" style="padding:8px 0;font-size:13px">無資料</div>'}
          <div class="profit-total">
            <span class="profit-total__label">總收入</span>
            <span class="profit-total__value text-green">${fmt(p.kitchen.revenue)}</span>
          </div>
        </div>
        <div class="card">
          <div class="card__header"><div class="card__title"><i class="ti ti-trending-down"></i>成本明細</div></div>
          ${costs.length === 0 ? '<div class="text-muted" style="padding:8px 0;font-size:13px">無成本記錄</div>' :
            costs.map(c=>`
              <div class="profit-row">
                <span class="profit-row__label">${c.note||c.type}</span>
                <span class="profit-row__value text-red">${fmt(c.amount)}</span>
              </div>`).join('')}
          <div class="profit-total">
            <span class="profit-total__label">總成本</span>
            <span class="profit-total__value text-red">${fmt(p.kitchen.cost)}</span>
          </div>
        </div>
      </div>`;
  } catch (err) {
    container.innerHTML = `<div class="alert alert--danger">載入失敗：${err.message}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// 頁面：各攤位損益
// ═══════════════════════════════════════════════════════════════
async function renderStallPL(el) {
  el.innerHTML = `
    <div class="form-grid form-grid-2" style="margin-bottom:16px;max-width:400px">
      <div class="field"><label>查詢日期</label><input type="date" id="spl-date" value="${todayStr()}"></div>
      <div style="display:flex;align-items:flex-end">
        <button class="btn btn--primary" onclick="loadStallPL()"><i class="ti ti-search"></i> 查詢</button>
      </div>
    </div>
    <div id="spl-content"></div>
  `;
  loadStallPL();
}

async function loadStallPL() {
  const date = document.getElementById('spl-date')?.value || todayStr();
  const container = document.getElementById('spl-content');
  if (!container) return;
  container.innerHTML = '<div class="empty-state"><i class="ti ti-loader" style="animation:spin .8s linear infinite"></i>載入中…</div>';
  try {
    const profitRes = await API.getProfitSummary(date);
    const p = profitRes.data;
    container.innerHTML = (p.stalls||[]).map(s => {
      if (!s.has_report) return `
        <div class="card" style="margin-bottom:14px">
          <div style="display:flex;align-items:center;gap:8px">
            <span class="dot dot--amber"></span>
            <strong>${s.stall_name}</strong>
            <span class="text-muted" style="font-size:12px">尚無今日回報</span>
          </div>
        </div>`;
      return `
        <div class="card" style="margin-bottom:14px">
          <div class="card__header">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="dot dot--green"></span>
              <strong style="font-size:15px">${s.stall_name}</strong>
            </div>
            <div style="display:flex;gap:8px">
              <span class="badge badge--info">${s.barrels}桶 大${s.big_bowls} 小${s.small_bowls}</span>
              <span class="badge ${s.netProfit>=0?'badge--success':'badge--danger'}">淨利 ${fmt(s.netProfit)}</span>
            </div>
          </div>
          <div class="grid-2">
            <div>
              <div class="profit-row"><span class="profit-row__label">大碗 ${s.big_bowls} × ${fmt(p.prices.bigBowlPrice)}</span><span class="profit-row__value text-green">${fmt(s.big_bowls * p.prices.bigBowlPrice)}</span></div>
              <div class="profit-row"><span class="profit-row__label">小碗 ${s.small_bowls} × ${fmt(p.prices.smallBowlPrice)}</span><span class="profit-row__value text-green">${fmt(s.small_bowls * p.prices.smallBowlPrice)}</span></div>
              <div class="profit-total"><span class="profit-total__label">總營收</span><span class="profit-total__value text-green">${fmt(s.revenue)}</span></div>
            </div>
            <div>
              <div class="profit-row"><span class="profit-row__label">進貨成本（${s.barrels}桶）</span><span class="profit-row__value text-red">${fmt(s.cogs)}</span></div>
              <div class="profit-row"><span class="profit-row__label">每日租金</span><span class="profit-row__value text-red">${fmt(s.dailyRent)}</span></div>
              <div class="profit-row"><span class="profit-row__label">固定成本（日）</span><span class="profit-row__value text-red">${fmt(s.dailyFixed)}</span></div>
              <div class="profit-row"><span class="profit-row__label">包材等其他</span><span class="profit-row__value text-red">${fmt(s.extras)}</span></div>
              <div class="profit-total"><span class="profit-total__label">淨利</span><span class="profit-total__value ${s.netProfit>=0?'text-green':'text-red'}">${fmt(s.netProfit)}</span></div>
            </div>
          </div>
        </div>`;
    }).join('') || '<div class="empty-state">當日無資料</div>';
  } catch (err) {
    container.innerHTML = `<div class="alert alert--danger">載入失敗：${err.message}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// 頁面：月報表（骨架，第五階段完整實作）
// ═══════════════════════════════════════════════════════════════
function renderMonthlyReport(el) {
  const ym = new Date().toISOString().slice(0, 7);
  el.innerHTML = `
    <div class="section-title"><i class="ti ti-calendar-stats"></i>月報表</div>
    <div class="form-grid form-grid-2" style="margin-bottom:16px;max-width:400px">
      <div class="field"><label>月份</label><input type="month" id="month-input" value="${ym}"></div>
      <div style="display:flex;align-items:flex-end">
        <button class="btn btn--primary" onclick="loadMonthlyReport()"><i class="ti ti-search"></i> 查詢</button>
      </div>
    </div>
    <div id="monthly-content">
      <div class="alert alert--info" style="background:var(--blue-50);border-color:var(--blue-100);color:var(--blue-600)">
        <i class="ti ti-info-circle"></i> 月報表將在第五階段完整實作。目前僅提供查詢介面。
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// 頁面：庫存總覽
// ═══════════════════════════════════════════════════════════════
async function renderInventory(el) {
  el.innerHTML = `
    <div class="section-title"><i class="ti ti-package"></i>庫存總覽</div>
    <div class="grid-2" style="margin-bottom:20px">
      <div class="card" id="inv-overview"></div>
      <div class="card">
        <div class="card__header"><div class="card__title"><i class="ti ti-plus"></i>入庫 / 出庫登記</div></div>
        <form id="inv-form" novalidate>
          <div class="form-grid form-grid-2">
            <div class="field"><label>日期</label><input type="date" name="date" value="${todayStr()}"></div>
            <div class="field"><label>類型</label>
              <select name="type"><option value="in">入庫</option><option value="out">出庫</option></select>
            </div>
          </div>
          <div class="form-grid form-grid-2">
            <div class="field">
              <label>品項</label>
              <select name="item_id" id="inv-item-select">
                <option value="">── 請選擇 ──</option>
                ${(OwnerApp.cache.ingredients||[]).filter(i=>i.in_inventory==='TRUE'||i.in_inventory===true)
                  .map(i=>`<option value="${i.ingredient_id}" data-unit="${i.unit}">${i.ingredient_name}（${i.unit}）</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>數量</label><input type="number" name="qty" min="0.1" step="0.1" value="1"></div>
          </div>
          <div class="form-grid form-grid-2">
            <div class="field"><label>單價 ($)</label><input type="number" name="unit_price" min="0" value="0" id="inv-price" oninput="calcInvTotal()"></div>
            <div class="field"><label>備註</label><input type="text" name="note"></div>
          </div>
          <div id="inv-total-display" style="font-size:12px;color:var(--gray-500);margin-bottom:4px"></div>
          <div class="btn-row">
            <button type="submit" class="btn btn--primary" id="btn-inv-save"><i class="ti ti-device-floppy"></i>儲存</button>
          </div>
        </form>
      </div>
    </div>
    <div class="section-title"><i class="ti ti-history"></i>異動記錄</div>
    <div class="card" id="inv-log-card">
      <div class="empty-state">載入中…</div>
    </div>
  `;
  document.getElementById('inv-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = UI.getFormData(e.target);
    if (!data.item_id) { UI.toast('請選擇品項', 'error'); return; }
    const opt = document.querySelector(`#inv-item-select option[value="${data.item_id}"]`);
    data.item_name = opt ? opt.textContent.split('（')[0] : '';
    data.unit = opt ? opt.dataset.unit : '';
    const btn = document.getElementById('btn-inv-save');
    UI.btnLoading(btn, true);
    try {
      await API.saveInventoryLog(data);
      UI.toast('✓ 庫存記錄已儲存');
      UI.resetForm(e.target);
      e.target.querySelector('[name="date"]').value = todayStr();
      loadInventoryOverview();
    } catch (err) { UI.toast('儲存失敗：' + err.message, 'error'); }
    finally { UI.btnLoading(btn, false); }
  });
  loadInventoryOverview();
}

function calcInvTotal() {
  const q = parseFloat(document.querySelector('[name="qty"]')?.value || 0);
  const p = parseFloat(document.getElementById('inv-price')?.value || 0);
  const el = document.getElementById('inv-total-display');
  if (el) el.textContent = q && p ? `總金額：${UI.formatCurrency(q * p)}` : '';
}

async function loadInventoryOverview() {
  const ov = document.getElementById('inv-overview');
  const lg = document.getElementById('inv-log-card');
  try {
    const res = await API.getInventory();
    const items = res.data || [];
    ov.innerHTML = `<div class="card__header"><div class="card__title"><i class="ti ti-list"></i>目前庫存</div></div>`
      + items.map(item => {
        const pct = Math.min(100, Math.round((item.current_stock / item.min_stock) * 100));
        return `<div class="stock-row">
          <div class="stock-row__header">
            <span class="stock-row__name">${item.item_name}</span>
            <span class="stock-row__qty ${item.is_low ? 'is-low' : ''}">${item.current_stock} / ${item.min_stock} ${item.unit}${item.is_low ? ' ⚠️' : ''}</span>
          </div>
          <div class="stock-bar"><div class="stock-bar__fill ${item.is_low ? 'is-low' : ''}" style="width:${pct}%"></div></div>
        </div>`;
      }).join('');
  } catch (err) {
    if (ov) ov.innerHTML = `<div class="alert alert--danger">${err.message}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// 頁面：成本管理
// ═══════════════════════════════════════════════════════════════
function renderKitchenCosts(el) {
  el.innerHTML = `
    <div class="section-title"><i class="ti ti-receipt"></i>廚房成本記錄</div>
    <div class="card" style="margin-bottom:20px">
      <form id="cost-query-form">
        <div class="form-grid form-grid-3">
          <div class="field"><label>查詢日期</label><input type="date" id="cost-date" value="${todayStr()}"></div>
          <div style="display:flex;align-items:flex-end">
            <button type="button" class="btn btn--primary" onclick="loadCostRecords()"><i class="ti ti-search"></i> 查詢</button>
          </div>
        </div>
      </form>
    </div>
    <div class="card" id="cost-records">
      <div class="empty-state">請點擊查詢</div>
    </div>
  `;
  loadCostRecords();
}

async function loadCostRecords() {
  const date = document.getElementById('cost-date')?.value || todayStr();
  const card = document.getElementById('cost-records');
  if (!card) return;
  card.innerHTML = '<div class="empty-state"><i class="ti ti-loader" style="animation:spin .8s linear infinite"></i></div>';
  try {
    const res = await API.getKitchenCosts(date);
    const rows = res.data || [];
    if (!rows.length) { card.innerHTML = '<div class="empty-state"><i class="ti ti-inbox"></i>當日無成本記錄</div>'; return; }
    card.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>日期</th><th>類型</th><th>金額</th><th>備註</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td>${r.date}</td>
        <td><span class="badge badge--gray">${r.type}</span></td>
        <td class="text-red">${fmt(r.amount)}</td>
        <td class="text-muted">${r.note||'—'}</td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div class="profit-total" style="margin-top:12px">
      <span class="profit-total__label">合計</span>
      <span class="profit-total__value text-red">${fmt(rows.reduce((s,r)=>s+Number(r.amount||0),0))}</span>
    </div>`;
  } catch (err) { card.innerHTML = `<div class="alert alert--danger">${err.message}</div>`; }
}

// ═══════════════════════════════════════════════════════════════
// 頁面：供貨價格設定
// ═══════════════════════════════════════════════════════════════
function renderSettingsPrices(el) {
  const s = OwnerApp.cache.settings || {};
  el.innerHTML = `
    <div class="section-title"><i class="ti ti-currency-dollar"></i>供貨價格設定</div>
    <div class="card" style="max-width:480px">
      <div class="alert alert--warning" style="margin-bottom:16px">
        <i class="ti ti-alert-triangle"></i>
        修改後請同步更新 Google Sheets → Settings 工作表中對應的 value 欄位，才能確保資料一致。
      </div>
      <div class="form-grid">
        <div class="field">
          <label>每桶供貨價 ($)</label>
          <input type="number" id="sp-barrel" value="${s.supply_price_per_barrel||1275}">
        </div>
        <div class="field">
          <label>大碗售價 ($)</label>
          <input type="number" id="sp-big" value="${s.big_bowl_price||80}">
        </div>
        <div class="field">
          <label>小碗售價 ($)</label>
          <input type="number" id="sp-small" value="${s.small_bowl_price||60}">
        </div>
      </div>
      <p style="font-size:12px;color:var(--gray-500);margin-top:8px;line-height:1.6">
        注意：本系統的價格主要來源為 Google Sheets Settings 工作表。<br>
        請直接在 Sheets 中修改，系統下次載入時會自動讀取最新值。
      </p>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// 頁面：攤位設定（唯讀顯示，修改請在 Sheets）
// ═══════════════════════════════════════════════════════════════
function renderSettingsStalls(el) {
  const stalls = OwnerApp.cache.stalls || [];
  el.innerHTML = `
    <div class="section-title"><i class="ti ti-store"></i>攤位設定</div>
    <div class="alert alert--info" style="background:var(--blue-50);border-color:var(--blue-100);color:var(--blue-600);margin-bottom:16px">
      <i class="ti ti-info-circle"></i>
      攤位資料來自 Google Sheets → StallConfig 工作表。請直接在 Sheets 中新增或修改，系統會自動讀取。
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>攤位 ID</th><th>名稱</th><th>狀態</th><th>月租金</th><th>月固定成本</th><th>備註</th></tr>
          </thead>
          <tbody>
            ${stalls.map(s=>`<tr>
              <td class="text-mono text-muted">${s.stall_id}</td>
              <td><strong>${s.stall_name}</strong></td>
              <td><span class="badge badge--success">啟用</span></td>
              <td>${UI.formatCurrency(s.rent)}</td>
              <td>${UI.formatCurrency(s.fixed_cost)}</td>
              <td class="text-muted">${s.note||'—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <p style="font-size:12px;color:var(--gray-400);margin-top:12px">
        共 ${stalls.length} 個啟用攤位。新增攤位請至 Google Sheets → StallConfig 工作表。
      </p>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// 頁面：配料設定（唯讀顯示）
// ═══════════════════════════════════════════════════════════════
function renderSettingsIngredients(el) {
  const ings = OwnerApp.cache.ingredients || [];
  el.innerHTML = `
    <div class="section-title"><i class="ti ti-salad"></i>配料設定</div>
    <div class="alert alert--info" style="background:var(--blue-50);border-color:var(--blue-100);color:var(--blue-600);margin-bottom:16px">
      <i class="ti ti-info-circle"></i>
      配料資料來自 Google Sheets → IngredientConfig 工作表。請直接在 Sheets 中新增或修改。
    </div>
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>配料 ID</th><th>名稱</th><th>單位</th><th>成本</th><th>狀態</th><th>納入庫存</th><th>備註</th></tr>
          </thead>
          <tbody>
            ${ings.map(i=>`<tr>
              <td class="text-mono text-muted">${i.ingredient_id}</td>
              <td><strong>${i.ingredient_name}</strong></td>
              <td>${i.unit}</td>
              <td>${UI.formatCurrency(i.cost)}</td>
              <td><span class="badge badge--success">啟用</span></td>
              <td><span class="badge ${(i.in_inventory==='TRUE'||i.in_inventory===true)?'badge--info':'badge--gray'}">${(i.in_inventory==='TRUE'||i.in_inventory===true)?'是':'否'}</span></td>
              <td class="text-muted">${i.note||'—'}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}
