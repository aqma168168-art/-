// ============================================================
// owner.js — 老闆管理後台 v2.1
// 核心改進：進入頁面只呼叫一次 API（getOwnerDashboard）
// 之後切換左側選單全部純前端渲染，速度提升 80%
// ============================================================

const OwnerApp = {
  page:       'dashboard',
  queryDate:  null,       // 目前查詢日期
  data:       null,       // 快取的 dashboard 資料（一次 API 拿回來）
  loading:    false,
};

const PAGE_TITLES = {
  dashboard:    '今日總覽',
  'kitchen-pl': '中央廚房損益',
  'stall-pl':   '各攤位損益',
  monthly:      '月報表',
  inventory:    '庫存總覽',
  costs:        '成本管理',
  settings:     '設定中心',
  'month-setup':'月度設定',
  closures:     '休息日管理',
};

// ── 工具 ──────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const t = UI.todayISO;
const fm = UI.fmtMoney;
const fn = UI.fmtNum;

function spinnerHTML() {
  return '<div class="empty"><i class="ti ti-loader" style="animation:spin .7s linear infinite"></i><p>載入中…</p></div>';
}
function noDataHTML() {
  return '<div class="empty" style="padding:24px"><i class="ti ti-inbox"></i><p>目前無資料</p></div>';
}
function errHTML(e) {
  return `<div class="alert-row alert-row--danger"><i class="ti ti-alert-triangle alert-row__icon"></i><div class="alert-row__body"><strong>載入失敗</strong><span>${e.message}</span></div></div>`;
}

// ── 初始化 ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('topbar-date').textContent =
    new Date().toLocaleDateString('zh-TW', { year:'numeric', month:'long', day:'numeric', weekday:'short' });

  document.querySelectorAll('.nav-item[data-page]').forEach(el =>
    el.addEventListener('click', () => showPage(el.dataset.page)));

  // 1. 嘗試從 localStorage 取得快取（短 TTL，2 分鐘），先顯示舊資料不等待
  const date = t();
  const cached = UI.cacheGet('dashboard_' + date, 2 * 60 * 1000);
  if (cached) {
    OwnerApp.data      = cached;
    OwnerApp.queryDate = date;
    showPage('dashboard');
  }

  // 2. 背景抓最新資料（一定執行，確保資料正確）
  await fetchDashboard(date, !cached);
  if (!cached) showPage('dashboard');
  else showPage(OwnerApp.page); // 用最新資料重新渲染目前頁面
});

// ── 核心：向後端請求一次，拿回所有資料 ──────────────────────
// showSpinner: 是否顯示全螢幕載入動畫（背景刷新時不顯示，避免畫面閃爍）
async function fetchDashboard(date, showSpinner = true) {
  if (OwnerApp.loading) return;
  OwnerApp.loading = true;
  OwnerApp.queryDate = date;

  if (showSpinner) UI.showLoading('載入資料…');
  try {
    const res = await API.getOwnerDashboard(date);
    OwnerApp.data = res.data;

    // 寫入 localStorage（依日期分 key，短 TTL）
    UI.cacheSet('dashboard_' + date, res.data);

    // 更新 topbar 日期顯示（若查詢非今日）
    if (date !== t()) {
      document.getElementById('topbar-date').textContent =
        `查詢日期：${UI.fmtDate(date)}`;
    }
  } catch (e) {
    UI.toast('載入失敗：' + e.message, 'error', 8000);
    if (!OwnerApp.data) OwnerApp.data = null;
  } finally {
    UI.hideLoading();
    OwnerApp.loading = false;
  }
}

// ── 路由：切換頁面純前端，不發 API ──────────────────────────
function showPage(page) {
  OwnerApp.page = page;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page));
  document.getElementById('page-title').textContent = PAGE_TITLES[page] || page;
  const body = document.getElementById('page-body');
  body.innerHTML = '';
  ({
    dashboard:    renderDashboard,
    'kitchen-pl': renderKitchenPL,
    'stall-pl':   renderStallPL,
    monthly:      renderMonthly,
    inventory:    renderInventory,
    costs:        renderCosts,
    settings:     renderSettings,
    'month-setup':renderMonthSetup,
    closures:     renderClosures,
  }[page] || (() => {}))(body);
}

// ── 日期選擇器（切換日期時重新 fetch）────────────────────────
function dateBar(inputId) {
  return `
    <div class="section-header" style="margin-bottom:20px">
      <div class="section-title"><i class="ti ti-calendar-event"></i>查詢日期</div>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="date" id="${inputId}" value="${OwnerApp.queryDate||t()}"
               style="padding:7px 10px;border:1.5px solid var(--ink-200);border-radius:var(--r-md);font-size:13px;outline:none">
        <button class="btn btn--primary btn--sm" onclick="changeDate('${inputId}')">
          <i class="ti ti-refresh"></i> 切換日期
        </button>
      </div>
    </div>`;
}

window.changeDate = async (inputId) => {
  const date = $(inputId)?.value || t();

  // 切換到的日期若有快取，先顯示，再背景更新
  const cached = UI.cacheGet('dashboard_' + date, 2 * 60 * 1000);
  if (cached) {
    OwnerApp.data = cached;
    OwnerApp.queryDate = date;
    showPage(OwnerApp.page);
    await fetchDashboard(date, false);
    showPage(OwnerApp.page);
  } else {
    await fetchDashboard(date, true);
    showPage(OwnerApp.page);
  }
};

// ═══════════════════════════════════════════════════════════════
// 今日總覽（純前端渲染，不發 API）
// ═══════════════════════════════════════════════════════════════
function renderDashboard(el) {
  el.innerHTML = dateBar('dash-date');

  if (!OwnerApp.data) {
    el.innerHTML += errHTML({ message: '無資料，請確認 Apps Script 設定' });
    return;
  }

  const d = OwnerApp.data;
  const totalRev  = (d.stalls||[]).reduce((s,x) => s+(x.revenue||0), 0);
  const totalCost = (d.stalls||[]).reduce((s,x) => s+(x.totalCost||0), 0);
  const totalNet  = (d.stalls||[]).reduce((s,x) => s+(x.netProfit||0), 0);
  const unreported = (d.stalls||[]).filter(x => !x.has_report);
  const heroClass = d.kitchen.profit >= 0 ? 'hero-card--profit' : 'hero-card--loss';

  el.innerHTML += `
    <div class="hero-card ${heroClass}" style="margin-bottom:24px">
      <div class="hero-card__label">今日廚房毛利</div>
      <div class="hero-card__value">${fm(d.kitchen.profit)}</div>
      <div class="hero-card__sub">
        收入 ${fm(d.kitchen.revenue)} ／ 成本 ${fm(d.kitchen.cost)} ／
        配發 ${d.kitchen.totalBarrels} 桶 ／ 每桶均毛利 ${fm(d.kitchen.avgProfitPerBarrel)}
      </div>
      <i class="ti ti-building-factory-2 hero-card__bg-icon"></i>
    </div>

    <div class="grid g4" style="margin-bottom:24px">
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

    <div class="section-title" style="margin-bottom:14px"><i class="ti ti-store"></i>各攤位今日表現</div>
    <div class="grid g3" style="margin-bottom:24px">
      ${(d.stalls||[]).map(s => stallCard(s, d.prices)).join('')}
    </div>

    <div class="grid g2" style="gap:20px">
      <div>
        <div class="section-title" style="margin-bottom:12px"><i class="ti ti-package"></i>庫存警示</div>
        <div class="card">
          ${d.lowStock.length === 0
            ? '<div class="alert-row alert-row--ok"><i class="ti ti-circle-check alert-row__icon"></i><div class="alert-row__body"><strong>庫存正常</strong><span>所有品項均高於安全庫存</span></div></div>'
            : d.lowStock.map(i => `<div class="alert-row alert-row--danger"><i class="ti ti-alert-triangle alert-row__icon"></i><div class="alert-row__body"><strong>${i.item_name}</strong><span>目前 ${fn(i.current_stock)} ${i.unit}，安全庫存 ${fn(i.min_stock)}</span></div></div>`).join('')}
        </div>
      </div>
      <div>
        <div class="section-title" style="margin-bottom:12px"><i class="ti ti-alert-circle"></i>異常提醒</div>
        <div class="card">
          ${d.anomalies.length === 0
            ? '<div class="alert-row alert-row--ok"><i class="ti ti-circle-check alert-row__icon"></i><div class="alert-row__body"><strong>無異常</strong><span>今日一切正常</span></div></div>'
            : d.anomalies.map(a => `<div class="alert-row alert-row--warning"><i class="ti ti-alert-triangle alert-row__icon"></i><div class="alert-row__body"><strong>${a.stall}：${a.type==='unreported'?'尚未回報':a.type==='leftover'?'未賣完':'備註'}</strong><span>${a.msg}</span></div></div>`).join('')}
        </div>
      </div>
    </div>`;
}

function stallCard(s, prices) {
  if (!s.has_report) return `
    <div class="stall-card">
      <div class="stall-card__head">
        <div class="stall-card__name"><span class="dot dot--amber"></span>${s.stall_name}</div>
        <span class="badge badge--amber">未回報</span>
      </div>
      <div class="stall-card__body">
        <div class="empty" style="padding:16px 0">
          <i class="ti ti-clock" style="font-size:28px;opacity:.4"></i>
          <p style="font-size:12px">尚未送出今日回報</p>
        </div>
      </div>
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

// ═══════════════════════════════════════════════════════════════
// 中央廚房損益（純前端，快取資料）
// ═══════════════════════════════════════════════════════════════
function renderKitchenPL(el) {
  el.innerHTML = dateBar('kpl-date');

  if (!OwnerApp.data) { el.innerHTML += errHTML({ message: '無資料' }); return; }
  const d = OwnerApp.data;
  const k = d.kitchen;
  const heroClass = k.profit >= 0 ? 'hero-card--profit' : 'hero-card--loss';

  el.innerHTML += `
    <div class="hero-card ${heroClass}" style="margin-bottom:24px">
      <div class="hero-card__label">今日廚房毛利</div>
      <div class="hero-card__value">${fm(k.profit)}</div>
      <div class="hero-card__sub">
        毛利率 ${k.revenue ? Math.round(k.profit/k.revenue*100) : 0}% ／
        每桶均毛利 ${fm(k.avgProfitPerBarrel)} ／ 本月毛利 ${fm(k.profitMonth)}
      </div>
      <i class="ti ti-chart-line hero-card__bg-icon"></i>
    </div>

    <div class="grid g4" style="margin-bottom:24px">
      <div class="stat-card stat-card--sky">
        <div class="stat-card__label">配發桶數</div>
        <div class="stat-card__value font-num">${k.totalBarrels}</div>
      </div>
      <div class="stat-card stat-card--green">
        <div class="stat-card__label">今日收入</div>
        <div class="stat-card__value font-num c-green">${fm(k.revenue)}</div>
        <div class="stat-card__sub">@ ${fm(d.prices.supplyPrice)}/桶</div>
      </div>
      <div class="stat-card stat-card--red">
        <div class="stat-card__label">今日成本</div>
        <div class="stat-card__value font-num c-red">${fm(k.cost)}</div>
      </div>
      <div class="stat-card stat-card--violet">
        <div class="stat-card__label">每桶均成本</div>
        <div class="stat-card__value font-num">${fm(k.avgCostPerBarrel)}</div>
      </div>
    </div>

    <!-- 本月數字 -->
    <div class="grid g2" style="margin-bottom:24px;gap:16px">
      <div class="stat-card stat-card--green">
        <div class="stat-card__label">本月廚房毛利</div>
        <div class="stat-card__value font-num ${UI.moneyClass(k.profitMonth)}">${fm(k.profitMonth)}</div>
        <div class="stat-card__sub">${d.month}</div>
      </div>
      <div class="stat-card stat-card--violet">
        <div class="stat-card__label">每桶均毛利</div>
        <div class="stat-card__value font-num ${UI.moneyClass(k.avgProfitPerBarrel)}">${fm(k.avgProfitPerBarrel)}</div>
        <div class="stat-card__sub">今日</div>
      </div>
    </div>

    <div class="grid g2" style="gap:20px;margin-bottom:24px">
      <div class="card">
        <div class="card__header"><div class="card__title"><i class="ti ti-trending-up"></i>收入明細</div></div>
        ${(d.stalls||[]).filter(s=>s.has_report).map(s=>`
          <div class="pl-row">
            <span class="pl-row__label">${s.stall_name}（${s.barrels} 桶）</span>
            <span class="pl-row__val c-green">${fm(s.barrels * d.prices.supplyPrice)}</span>
          </div>`).join('') || noDataHTML()}
        <div class="pl-total">
          <span class="pl-total__label">總收入</span>
          <span class="pl-total__val c-green">${fm(k.revenue)}</span>
        </div>
      </div>
      <div class="card">
        <div class="card__header"><div class="card__title"><i class="ti ti-trending-down"></i>成本明細</div></div>
        ${(k.costs||[]).map(c=>`
          <div class="pl-row">
            <span class="pl-row__label">${c.note||c.type}</span>
            <span class="pl-row__val c-red">${fm(c.amount)}</span>
          </div>`).join('') || noDataHTML()}
        <div class="pl-total">
          <span class="pl-total__label">總成本</span>
          <span class="pl-total__val c-red">${fm(k.cost)}</span>
        </div>
      </div>
    </div>`;

  // 新增成本表單（這個儲存後需要重新 fetch）
  el.innerHTML += `
    <div class="section-title" style="margin-bottom:12px"><i class="ti ti-plus"></i>新增廚房成本</div>
    <div class="card">
      <form id="kc-form" novalidate>
        <div class="fg fg4">
          <div class="field"><label>日期</label><input type="date" name="date" value="${OwnerApp.queryDate||t()}"></div>
          <div class="field"><label>類型</label>
            <select name="type">
              <option value="labor">人事費</option>
              <option value="driver">司機費</option>
              <option value="ingredient">食材</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div class="field"><label>金額 ($)</label><input type="number" name="amount" min="0" value="0"></div>
          <div class="field"><label>備註</label><input type="text" name="note" placeholder="說明"></div>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn--primary" id="btn-kc">
            <i class="ti ti-plus"></i> 新增成本
          </button>
        </div>
      </form>
    </div>`;

  $('kc-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = UI.formData(e.target);
    const btn = $('btn-kc');
    UI.btnLoad(btn, true);
    try {
      await API.saveKitchenCost(data);
      UI.toast('✓ 成本已新增');

      // 本地更新快取資料，不重抓整張表
      const queryDate = OwnerApp.queryDate || t();
      if (data.date === queryDate && OwnerApp.data) {
        const amount = Number(data.amount) || 0;
        OwnerApp.data.kitchen.costs.push({
          date: data.date, type: data.type, amount, note: data.note || '',
        });
        OwnerApp.data.kitchen.cost   += amount;
        OwnerApp.data.kitchen.profit -= amount;
        const tb = OwnerApp.data.kitchen.totalBarrels;
        OwnerApp.data.kitchen.avgCostPerBarrel   = tb ? Math.round(OwnerApp.data.kitchen.cost / tb)   : 0;
        OwnerApp.data.kitchen.avgProfitPerBarrel = tb ? Math.round(OwnerApp.data.kitchen.profit / tb) : 0;
        if (data.date === t()) {
          OwnerApp.data.kitchen.profitMonth -= amount;
        }
        UI.cacheSet('dashboard_' + queryDate, OwnerApp.data);
      }

      showPage('kitchen-pl');
    } catch(err) { UI.toast(err.message, 'error'); }
    finally { UI.btnLoad(btn, false); }
  });
}

// ═══════════════════════════════════════════════════════════════
// 各攤位損益（純前端）
// ═══════════════════════════════════════════════════════════════
function renderStallPL(el) {
  el.innerHTML = dateBar('spl-date');

  if (!OwnerApp.data) { el.innerHTML += errHTML({ message: '無資料' }); return; }
  const d = OwnerApp.data;

  el.innerHTML += (d.stalls||[]).map(s => {
    // 找本月資料
    const monthly = (d.stallMonthly||[]).find(m => m.stall_id === s.stall_id);

    if (!s.has_report) return `
      <div class="card" style="margin-bottom:14px;display:flex;align-items:center;gap:10px">
        <span class="dot dot--amber"></span>
        <strong>${s.stall_name}</strong>
        <span class="c-muted" style="font-size:12px">尚無今日回報</span>
        ${monthly ? `<span class="badge badge--gray" style="margin-left:auto">本月淨利 ${fm(monthly.monthNetProfit)}</span>` : ''}
      </div>`;

    return `
      <div class="card" style="margin-bottom:16px">
        <div class="card__header">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <span class="dot dot--green"></span>
            <span style="font-size:16px;font-weight:700">${s.stall_name}</span>
            <span class="badge badge--gray">${s.barrels}桶 大${fn(s.big_bowls)} 小${fn(s.small_bowls)}</span>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
            <span class="badge ${s.netProfit>=0?'badge--green':'badge--red'}"
                  style="font-size:13px;padding:5px 12px">
              今日淨利 ${fm(s.netProfit)}
            </span>
            ${monthly ? `<span class="badge badge--violet" style="font-size:12px;padding:4px 10px">
              本月淨利 ${fm(monthly.monthNetProfit)}
            </span>` : ''}
          </div>
        </div>
        <div class="grid g2" style="gap:20px">
          <div>
            <div class="pl-row">
              <span class="pl-row__label">大碗 ${fn(s.big_bowls)} × ${fm(d.prices.bigBowlPrice)}</span>
              <span class="pl-row__val c-green">${fm(s.big_bowls*d.prices.bigBowlPrice)}</span>
            </div>
            <div class="pl-row">
              <span class="pl-row__label">小碗 ${fn(s.small_bowls)} × ${fm(d.prices.smallBowlPrice)}</span>
              <span class="pl-row__val c-green">${fm(s.small_bowls*d.prices.smallBowlPrice)}</span>
            </div>
            <div class="pl-total">
              <span class="pl-total__label">總營收</span>
              <span class="pl-total__val c-green">${fm(s.revenue)}</span>
            </div>
          </div>
          <div>
            <div class="pl-row">
              <span class="pl-row__label">進貨成本（${s.barrels}桶）</span>
              <span class="pl-row__val c-red">${fm(s.cogs)}</span>
            </div>
            <div class="pl-row">
              <span class="pl-row__label">每日租金</span>
              <span class="pl-row__val c-red">${fm(s.dailyRent)}</span>
            </div>
            <div class="pl-row">
              <span class="pl-row__label">固定成本</span>
              <span class="pl-row__val c-red">${fm(s.dailyFixed)}</span>
            </div>
            <div class="pl-row">
              <span class="pl-row__label">包材等其他</span>
              <span class="pl-row__val c-red">${fm(s.extras)}</span>
            </div>
            <div class="pl-total">
              <span class="pl-total__label">淨利</span>
              <span class="pl-total__val ${UI.moneyClass(s.netProfit)}">${fm(s.netProfit)}</span>
            </div>
          </div>
        </div>
      </div>`;
  }).join('') || noDataHTML();

  // ── 攤位成本輸入（包材等） ────────────────────────────────
  el.innerHTML += `
    <div class="section-title" style="margin-top:24px;margin-bottom:12px">
      <i class="ti ti-plus"></i>新增攤位成本（包材、其他）
    </div>
    <div class="card">
      <form id="sc-form" novalidate>
        <div class="fg fg4" style="margin-bottom:12px">
          <div class="field"><label>日期</label>
            <input type="date" name="date" value="${OwnerApp.queryDate||t()}">
          </div>
          <div class="field"><label>攤位</label>
            <select name="stall_id" id="sc-stall">
              <option value="">請選擇…</option>
              ${(d.stalls||[]).map(s=>`<option value="${s.stall_id}">${s.stall_name}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>成本類型</label>
            <select name="type">
              <option value="packaging">包材</option>
              <option value="labor">人事費</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div class="field"><label>金額 ($)</label>
            <input type="number" name="amount" min="0" value="0">
          </div>
        </div>
        <div class="field" style="margin-bottom:12px"><label>備註</label>
          <input type="text" name="note" placeholder="例：今日袋子費用">
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn--primary" id="btn-sc">
            <i class="ti ti-plus"></i> 新增
          </button>
        </div>
      </form>
    </div>`;

  document.getElementById('sc-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = UI.formData(e.target);
    if (!data.stall_id) { UI.toast('請選擇攤位', 'error'); return; }
    const stall = (d.stalls||[]).find(s => s.stall_id === data.stall_id);
    data.stall_name = stall?.stall_name || '';
    const btn = document.getElementById('btn-sc');
    UI.btnLoad(btn, true);
    try {
      await API.saveStallCost(data);
      UI.toast('✓ 攤位成本已新增');

      // 本地更新快取資料，不重抓整張表
      const queryDate = OwnerApp.queryDate || t();
      if (data.date === queryDate && OwnerApp.data) {
        const amount = Number(data.amount) || 0;
        const s = OwnerApp.data.stalls.find(x => x.stall_id === data.stall_id);
        if (s && s.has_report) {
          s.extras     = (s.extras || 0) + amount;
          s.totalCost  = (s.totalCost || 0) + amount;
          s.netProfit  = (s.netProfit || 0) - amount;
        }
        // 本月淨利也扣除（若今日在本月內，通常是）
        if (queryDate === t()) {
          const m = OwnerApp.data.stallMonthly?.find(x => x.stall_id === data.stall_id);
          if (m) m.monthNetProfit = (m.monthNetProfit || 0) - amount;
        }
        UI.cacheSet('dashboard_' + queryDate, OwnerApp.data);
      }

      showPage('stall-pl');
    } catch(err) { UI.toast(err.message, 'error'); }
    finally { UI.btnLoad(btn, false); }
  });
}

// ═══════════════════════════════════════════════════════════════
// 月報表
// ═══════════════════════════════════════════════════════════════
function renderMonthly(el) {
  el.innerHTML = `
    <div class="card" style="max-width:520px">
      <div class="alert-row alert-row--warning" style="margin-bottom:0">
        <i class="ti ti-info-circle alert-row__icon"></i>
        <div class="alert-row__body">
          <strong>月報表（第五階段實作）</strong>
          <span>目前系統已逐日記錄所有數據，月報彙整功能將在第五階段開發。</span>
        </div>
      </div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// 庫存總覽（用快取資料顯示，儲存後重新 fetch）
// ═══════════════════════════════════════════════════════════════
function renderInventory(el) {
  const ings = (OwnerApp.data?.ingredients||[]).filter(i =>
    String(i.in_inventory).toUpperCase() === 'TRUE');

  el.innerHTML = `
    <div class="grid g2-1" style="gap:20px">
      <div>
        <div class="section-title" style="margin-bottom:12px"><i class="ti ti-package"></i>目前庫存</div>
        <div class="card" id="inv-overview">
          ${renderInventoryList(OwnerApp.data?.inventory||[])}
        </div>
      </div>
      <div>
        <div class="section-title" style="margin-bottom:12px"><i class="ti ti-plus"></i>入庫 / 出庫</div>
        <div class="card">
          <form id="inv-form" novalidate>
            <div class="fg" style="gap:12px">
              <div class="field"><label>日期</label><input type="date" name="date" value="${t()}"></div>
              <div class="field"><label>類型</label>
                <select name="type">
                  <option value="in">入庫</option>
                  <option value="out">出庫</option>
                </select>
              </div>
              <div class="field"><label>品項</label>
                <select name="item_id" id="inv-item">
                  <option value="">請選擇…</option>
                  ${ings.map(i=>`<option value="${i.ingredient_id}" data-unit="${i.unit}">${i.ingredient_name}（${i.unit}）</option>`).join('')}
                </select>
              </div>
              <div class="field"><label>數量</label>
                <input type="number" name="qty" min="0.1" step="0.1" value="1">
              </div>
              <div class="field"><label>單價 ($)</label>
                <input type="number" name="unit_price" min="0" value="0" id="inv-price" oninput="calcInvTotal()">
              </div>
              <div id="inv-total-display" style="font-size:12px;color:var(--ink-400)"></div>
              <div class="field"><label>備註</label><input type="text" name="note"></div>
            </div>
            <div class="btn-row">
              <button type="submit" class="btn btn--primary" id="btn-inv">
                <i class="ti ti-device-floppy"></i> 儲存
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>`;

  $('inv-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = UI.formData(e.target);
    if (!data.item_id) { UI.toast('請選擇品項', 'error'); return; }
    const opt = $('inv-item').selectedOptions[0];
    data.item_name = opt?.text?.split('（')[0] || '';
    data.unit = opt?.dataset?.unit || '';
    const btn = $('btn-inv');
    UI.btnLoad(btn, true);
    try {
      await API.saveInventoryLog(data);
      UI.toast('✓ 已儲存');

      // 本地更新庫存數字，不重抓整張表
      const queryDate = OwnerApp.queryDate || t();
      if (OwnerApp.data) {
        const item = OwnerApp.data.inventory?.find(x => x.item_id === data.item_id);
        if (item) {
          const qty = Number(data.qty) || 0;
          if (data.type === 'in')  item.current_stock += qty;
          if (data.type === 'out') item.current_stock -= qty;
          item.is_low = item.current_stock < item.min_stock;
          OwnerApp.data.lowStock = OwnerApp.data.inventory.filter(i => i.is_low);
          UI.cacheSet('dashboard_' + queryDate, OwnerApp.data);
        }
      }

      UI.resetForm(e.target);
      showPage('inventory');
    } catch(err) { UI.toast(err.message, 'error'); }
    finally { UI.btnLoad(btn, false); }
  });
}

function renderInventoryList(items) {
  if (!items.length) return noDataHTML();
  return items.map(item => {
    const pct = Math.min(100, Math.round(item.current_stock/item.min_stock*100));
    const cls = item.is_low ? 'low' : pct < 60 ? 'warn' : '';
    return `<div class="stock-item">
      <div class="stock-item__header">
        <span class="stock-item__name">${item.item_name}</span>
        <span class="stock-item__qty ${item.is_low?'low':''}">
          ${fn(item.current_stock)} / ${fn(item.min_stock)} ${item.unit}${item.is_low?' ⚠':''}
        </span>
      </div>
      <div class="stock-bar">
        <div class="stock-bar__fill ${cls}" style="width:${pct}%"></div>
      </div>
    </div>`;
  }).join('');
}

window.calcInvTotal = () => {
  const form = $('inv-form');
  const q = +(form?.querySelector('[name="qty"]')?.value||0);
  const p = +($('inv-price')?.value||0);
  const el = $('inv-total-display');
  if (el) el.textContent = q&&p ? `總金額：${fm(q*p)}` : '';
};

// ═══════════════════════════════════════════════════════════════
// 成本管理（用快取資料）
// ═══════════════════════════════════════════════════════════════
function renderCosts(el) {
  el.innerHTML = dateBar('cost-date');

  if (!OwnerApp.data) { el.innerHTML += errHTML({ message: '無資料' }); return; }
  const costs = OwnerApp.data.kitchen?.costs || [];

  if (!costs.length) {
    el.innerHTML += `<div class="card">${noDataHTML()}</div>`;
    return;
  }

  el.innerHTML += `
    <div class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>日期</th><th>類型</th><th>金額</th><th>備註</th><th></th></tr>
          </thead>
          <tbody>
            ${costs.map(r=>`
              <tr>
                <td>${r.date}</td>
                <td><span class="badge badge--gray">${r.type}</span></td>
                <td class="td-num c-red">${fm(r.amount)}</td>
                <td class="td-muted">${r.note||'—'}</td>
                <td style="text-align:right">
                  <button class="btn btn--sm btn--danger" onclick="deleteKitchenCost('${r.id}')" title="刪除">
                    <i class="ti ti-trash"></i>
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="pl-total" style="margin-top:12px">
        <span class="pl-total__label">合計</span>
        <span class="pl-total__val c-red">${fm(costs.reduce((s,r)=>s+Number(r.amount||0),0))}</span>
      </div>
    </div>`;
}

// 刪除廚房成本記錄
window.deleteKitchenCost = async function(id) {
  if (!confirm('確定要刪除這筆成本記錄嗎？此操作無法復原。')) return;
  try {
    await API.deleteKitchenCost(id);
    UI.toast('✓ 已刪除');
    // 本地移除並更新統計數字
    const idx = OwnerApp.data.kitchen.costs.findIndex(c => c.id === id);
    if (idx >= 0) {
      const amount = Number(OwnerApp.data.kitchen.costs[idx].amount) || 0;
      OwnerApp.data.kitchen.costs.splice(idx, 1);
      OwnerApp.data.kitchen.cost   -= amount;
      OwnerApp.data.kitchen.profit += amount;
      const tb = OwnerApp.data.kitchen.totalBarrels;
      OwnerApp.data.kitchen.avgCostPerBarrel   = tb ? Math.round(OwnerApp.data.kitchen.cost / tb)   : 0;
      OwnerApp.data.kitchen.avgProfitPerBarrel = tb ? Math.round(OwnerApp.data.kitchen.profit / tb) : 0;
      UI.cacheSet('dashboard_' + (OwnerApp.queryDate || t()), OwnerApp.data);
    }
    showPage('costs');
  } catch(e) { UI.toast('刪除失敗：' + e.message, 'error'); }
};

// ═══════════════════════════════════════════════════════════════
// 設定中心（用快取資料）
// ═══════════════════════════════════════════════════════════════
function renderSettings(el) {
  const s      = OwnerApp.data?.settings || {};
  const stalls = OwnerApp.data?.stalls   || [];
  const ings   = OwnerApp.data?.ingredients || [];

  el.innerHTML = `
    <div class="tabs" id="set-tabs" style="margin-bottom:20px">
      <div class="tab active" data-tab="prices">價格設定</div>
      <div class="tab" data-tab="stalls">攤位設定</div>
      <div class="tab" data-tab="ingredients">配料設定</div>
      <div class="tab" data-tab="people">人員管理</div>
    </div>
    <div id="set-content"></div>`;

  const tabs = {
    prices: `
      <div class="card" style="max-width:480px">
        <div class="alert-row alert-row--warning" style="margin-bottom:16px">
          <i class="ti ti-info-circle alert-row__icon"></i>
          <div class="alert-row__body">
            <strong>修改說明</strong>
            <span>請至 Google Sheets → 系統設定 工作表修改，重新整理頁面後生效。</span>
          </div>
        </div>
        <div class="fg" style="gap:14px">
          <div class="field"><label>每桶供貨價 ($)</label>
            <input type="number" value="${s['每桶供貨價']||1275}" readonly style="background:var(--ink-50)">
          </div>
          <div class="field"><label>大碗售價 ($)</label>
            <input type="number" value="${s['大碗售價']||80}" readonly style="background:var(--ink-50)">
          </div>
          <div class="field"><label>小碗售價 ($)</label>
            <input type="number" value="${s['小碗售價']||60}" readonly style="background:var(--ink-50)">
          </div>
        </div>
      </div>`,
    stalls: `
      <div class="alert-row alert-row--warning" style="margin-bottom:12px">
        <i class="ti ti-info-circle alert-row__icon"></i>
        <div class="alert-row__body">
          <strong>修改說明</strong>
          <span>請至 Google Sheets → 攤位設定 工作表新增或修改。</span>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>攤位編號</th><th>攤位名稱</th><th>月租金</th><th>月固定成本</th><th>備註</th></tr></thead>
            <tbody>
              ${stalls.map(s=>`
                <tr>
                  <td class="td-muted font-num">${s.stall_id}</td>
                  <td><strong>${s.stall_name}</strong></td>
                  <td class="td-num">${fm(s.rent)}</td>
                  <td class="td-num">${fm(s.fixed_cost)}</td>
                  <td class="td-muted">${s.note||'—'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`,
    ingredients: `
      <div class="alert-row alert-row--warning" style="margin-bottom:12px">
        <i class="ti ti-info-circle alert-row__icon"></i>
        <div class="alert-row__body">
          <strong>修改說明</strong>
          <span>請至 Google Sheets → 配料設定 工作表新增或修改。</span>
        </div>
      </div>
      <div class="card">
        <div class="table-wrap">
          <table>
            <thead><tr><th>編號</th><th>名稱</th><th>單位</th><th>成本</th><th>納入庫存</th></tr></thead>
            <tbody>
              ${ings.map(i=>`
                <tr>
                  <td class="td-muted font-num">${i.ingredient_id}</td>
                  <td><strong>${i.ingredient_name}</strong></td>
                  <td>${i.unit}</td>
                  <td class="td-num">${fm(i.cost)}</td>
                  <td>${String(i.in_inventory).toUpperCase()==='TRUE'
                    ? '<span class="badge badge--sky">是</span>'
                    : '<span class="badge badge--gray">否</span>'}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`,
    people: renderPeopleTab(s),
  };

  const render = (tab) => { $('set-content').innerHTML = tabs[tab]||''; };
  el.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
    el.querySelectorAll('.tab').forEach(x => x.classList.remove('active'));
    tab.classList.add('active');
    render(tab.dataset.tab);
  }));
  render('prices');
}

// 人員管理：回報人清單 / 配發人清單，可在網頁端刪除
function renderPeopleTab(settings) {
  const reporters   = String(settings['回報人清單']  || '').split(',').map(s=>s.trim()).filter(Boolean);
  const dispatchers = String(settings['配發人清單']  || '').split(',').map(s=>s.trim()).filter(Boolean);

  function listHTML(names, listType) {
    if (!names.length) return noDataHTML();
    return names.map(n => `
      <div class="stall-card__row">
        <span class="stall-card__row-label">${n}</span>
        <button class="btn btn--sm btn--danger" onclick="deletePersonFromList('${n}','${listType}')" title="刪除">
          <i class="ti ti-trash"></i>
        </button>
      </div>`).join('');
  }

  return `
    <div class="alert-row alert-row--warning" style="margin-bottom:12px">
      <i class="ti ti-info-circle alert-row__icon"></i>
      <div class="alert-row__body">
        <strong>說明</strong>
        <span>刪除後該人員將不再出現在攤位回報 / 廚房配發的選單中。新增人員請至 Google Sheets → 系統設定 工作表編輯「回報人清單」或「配發人清單」。</span>
      </div>
    </div>
    <div class="grid g2" style="gap:16px">
      <div class="card">
        <div class="card__header"><div class="card__title"><i class="ti ti-users"></i>攤位回報人清單</div></div>
        ${listHTML(reporters, 'reporter')}
      </div>
      <div class="card">
        <div class="card__header"><div class="card__title"><i class="ti ti-truck-delivery"></i>廚房配發人清單</div></div>
        ${listHTML(dispatchers, 'dispatcher')}
      </div>
    </div>`;
}

// 刪除人員（從回報人清單或配發人清單移除）
window.deletePersonFromList = async function(name, listType) {
  const label = listType === 'reporter' ? '攤位回報人' : '廚房配發人';
  if (!confirm(`確定要將「${name}」從${label}清單中移除嗎？`)) return;
  try {
    await API.deletePerson(name, listType);
    UI.toast(`✓ 已移除 ${name}`);

    // 本地更新設定快取
    const key = listType === 'reporter' ? '回報人清單' : '配發人清單';
    const names = String(OwnerApp.data.settings[key] || '')
      .split(',').map(s=>s.trim()).filter(n => n && n !== name);
    OwnerApp.data.settings[key] = names.join(',');
    UI.cacheSet('dashboard_' + (OwnerApp.queryDate || t()), OwnerApp.data);

    showPage('settings');
  } catch(e) { UI.toast('刪除失敗：' + e.message, 'error'); }
};

// ═══════════════════════════════════════════════════════════════
// 月度設定（攤位營業天數、租金分攤）
// ═══════════════════════════════════════════════════════════════
async function renderMonthSetup(el) {
  const month = UI.monthISO();
  el.innerHTML = `
    <div class="section-header" style="margin-bottom:20px">
      <div class="section-title"><i class="ti ti-calendar-check"></i>月度設定</div>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="month" id="ms-month" value="${month}"
               style="padding:7px 10px;border:1.5px solid var(--ink-200);
                      border-radius:var(--r-md);font-size:13px;outline:none">
        <button class="btn btn--primary btn--sm" onclick="loadMonthSetup()">
          <i class="ti ti-refresh"></i> 查詢
        </button>
      </div>
    </div>

    <div class="alert-row alert-row--warning" style="margin-bottom:16px">
      <i class="ti ti-info-circle alert-row__icon"></i>
      <div class="alert-row__body">
        <strong>說明</strong>
        <span>系統依攤位設定的「營業規律」自動計算每月應營業天數及每日分攤金額。如有颱風等臨時休息，請至「休息日管理」登記，月底再點「確認月結」鎖定實際天數。</span>
      </div>
    </div>

    <div id="ms-content">${spinnerHTML()}</div>`;
  loadMonthSetup();
}

window.loadMonthSetup = async function() {
  const month = $('ms-month')?.value || UI.monthISO();
  const c = $('ms-content'); if (!c) return;
  c.innerHTML = spinnerHTML();
  try {
    const [costRes, summaryRes] = await Promise.all([
      API.getMonthlyCost(month),
      API.getMonthSummary(month),
    ]);
    const costs   = costRes.data   || [];
    const summary = summaryRes.data || [];

    const dayNames = ['','週一','週二','週三','週四','週五','週六','週日'];

    c.innerHTML = `
      <div class="grid g2" style="gap:16px;margin-bottom:20px">
        ${summary.map(s => {
          const needsAdj = s.closure_count > 0;
          return `
            <div class="card">
              <div class="card__header">
                <div class="card__title"><i class="ti ti-store"></i>${s.stall_name}</div>
                <span class="badge ${needsAdj ? 'badge--amber' : 'badge--green'}">
                  ${needsAdj ? `⚠ 有 ${s.closure_count} 天休息` : '✓ 正常'}
                </span>
              </div>

              <div class="pl-row">
                <span class="pl-row__label">租金模式</span>
                <span class="pl-row__val">
                  ${s.rent_mode === '日租'
                    ? `日租（每日固定）`
                    : '月租（固定總額）'}
                </span>
              </div>
              <div class="pl-row">
                <span class="pl-row__label">本月應營業天數</span>
                <span class="pl-row__val font-num">${s.scheduled_days} 天</span>
              </div>
              <div class="pl-row">
                <span class="pl-row__label">實際營業天數</span>
                <span class="pl-row__val font-num ${needsAdj ? 'c-amber' : ''}">${s.actual_days} 天</span>
              </div>
              <div class="pl-row">
                <span class="pl-row__label">月租金總額</span>
                <span class="pl-row__val font-num">${fm(s.monthly_rent)}</span>
              </div>
              <div class="pl-row">
                <span class="pl-row__label">每日租金分攤（用預計天數）</span>
                <span class="pl-row__val font-num">${fm(s.daily_rent_scheduled)}/天</span>
              </div>
              ${needsAdj ? `
              <div class="pl-row">
                <span class="pl-row__label">月結後每日分攤（用實際天數）</span>
                <span class="pl-row__val font-num c-amber">${fm(s.daily_rent_actual)}/天</span>
              </div>` : ''}

              ${needsAdj ? `
              <div style="margin-top:12px">
                <button class="btn btn--primary btn--sm btn--full"
                        onclick="confirmMonthClose('${s.stall_id}','${month}')">
                  <i class="ti ti-lock"></i> 確認月結（用實際 ${s.actual_days} 天）
                </button>
              </div>` : `
              <div style="margin-top:12px">
                <button class="btn btn--sm btn--full"
                        onclick="confirmMonthClose('${s.stall_id}','${month}')">
                  <i class="ti ti-check"></i> 確認月結
                </button>
              </div>`}
            </div>`;
        }).join('')}
      </div>

      <!-- 全部月結按鈕 -->
      <div class="btn-row btn-row--center">
        <button class="btn btn--primary btn--lg" onclick="confirmAllMonthClose('${month}')">
          <i class="ti ti-lock"></i> 一鍵月結所有攤位（${month}）
        </button>
      </div>`;
  } catch(e) { c.innerHTML = errHTML(e); }
};

window.confirmMonthClose = async function(stallId, month) {
  const summary = await API.getMonthSummary(month);
  const s = summary.data.find(x => x.stall_id === stallId);
  if (!s) return;
  const msg = s.closure_count > 0
    ? `確認 ${s.stall_name} ${month} 月結？\n本月有 ${s.closure_count} 天休息\n實際天數：${s.actual_days} 天\n月結後每日分攤：${fm(s.daily_rent_actual)}/天`
    : `確認 ${s.stall_name} ${month} 月結？（${s.scheduled_days} 天，無臨時休息）`;
  if (!confirm(msg)) return;
  try {
    await API.saveMonthlyCost({
      month, stall_id: s.stall_id, stall_name: s.stall_name,
      rent_mode: s.rent_mode, scheduled_days: s.scheduled_days,
      actual_days: s.actual_days, monthly_rent: s.monthly_rent,
      monthly_fixed: s.monthly_fixed,
      daily_rent: s.daily_rent_actual, daily_fixed: s.daily_fixed_actual,
    });
    UI.toast(`✓ ${s.stall_name} 月結完成`);
    loadMonthSetup();
  } catch(e) { UI.toast('月結失敗：' + e.message, 'error'); }
};

window.confirmAllMonthClose = async function(month) {
  if (!confirm(`確認 ${month} 全部攤位月結？月結後本月每日分攤金額將鎖定，不再隨天數自動計算。`)) return;
  const summary = await API.getMonthSummary(month);
  let success = 0;
  for (const s of summary.data) {
    try {
      await API.saveMonthlyCost({
        month, stall_id: s.stall_id, stall_name: s.stall_name,
        rent_mode: s.rent_mode, scheduled_days: s.scheduled_days,
        actual_days: s.actual_days, monthly_rent: s.monthly_rent,
        monthly_fixed: s.monthly_fixed,
        daily_rent: s.daily_rent_actual, daily_fixed: s.daily_fixed_actual,
      });
      success++;
    } catch(e) {}
  }
  UI.toast(`✓ 已完成 ${success} 個攤位月結`);
  loadMonthSetup();
};

// ═══════════════════════════════════════════════════════════════
// 休息日管理（颱風、臨時休息）
// ═══════════════════════════════════════════════════════════════
async function renderClosures(el) {
  const stalls = OwnerApp.data?.stalls || [];
  el.innerHTML = `
    <div class="section-title" style="margin-bottom:16px"><i class="ti ti-beach"></i>新增休息記錄</div>
    <div class="card" style="margin-bottom:24px;max-width:600px">
      <form id="closure-form" novalidate>
        <div class="fg fg3" style="margin-bottom:12px">
          <div class="field"><label>日期 *</label>
            <input type="date" name="date" value="${t()}">
          </div>
          <div class="field"><label>攤位 *</label>
            <select name="stall_id" id="closure-stall">
              <option value="">全部攤位</option>
              ${stalls.map(s=>`<option value="${s.stall_id}">${s.stall_name}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>原因</label>
            <select name="reason">
              <option value="颱風">🌀 颱風</option>
              <option value="臨時休息">🏖 臨時休息</option>
              <option value="設備維修">🔧 設備維修</option>
              <option value="家庭因素">👨‍👩‍👧 家庭因素</option>
              <option value="其他">其他</option>
            </select>
          </div>
        </div>
        <div class="field" style="margin-bottom:12px"><label>備註</label>
          <input type="text" name="note" placeholder="選填">
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn--primary" id="btn-closure">
            <i class="ti ti-plus"></i> 新增休息記錄
          </button>
        </div>
      </form>
    </div>

    <div class="section-header" style="margin-bottom:12px">
      <div class="section-title"><i class="ti ti-history"></i>休息記錄查詢</div>
      <div style="display:flex;gap:8px">
        <input type="month" id="closure-month" value="${UI.monthISO()}"
               style="padding:7px 10px;border:1.5px solid var(--ink-200);border-radius:var(--r-md);font-size:13px;outline:none">
        <button class="btn btn--primary btn--sm" onclick="loadClosures()">
          <i class="ti ti-refresh"></i> 查詢
        </button>
      </div>
    </div>
    <div id="closure-list">${spinnerHTML()}</div>`;

  $('closure-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = UI.formData(e.target);
    const stallSel = $('closure-stall');

    // 支援「全部攤位」一次新增
    const stallsToAdd = data.stall_id
      ? [{ stall_id: data.stall_id, stall_name: stallSel.selectedOptions[0]?.text || '' }]
      : stalls.map(s => ({ stall_id: s.stall_id, stall_name: s.stall_name }));

    const btn = $('btn-closure');
    UI.btnLoad(btn, true);
    try {
      for (const stall of stallsToAdd) {
        await API.saveClosure({ ...data, stall_id: stall.stall_id, stall_name: stall.stall_name });
      }
      UI.toast(`✓ 已新增 ${stallsToAdd.length} 筆休息記錄`);
      UI.resetForm(e.target);
      e.target.querySelector('[name="date"]').value = t();
      loadClosures();
    } catch(err) { UI.toast(err.message, 'error'); }
    finally { UI.btnLoad(btn, false); }
  });

  loadClosures();
}

window.loadClosures = async function() {
  const month = $('closure-month')?.value || UI.monthISO();
  const c = $('closure-list'); if (!c) return;
  c.innerHTML = spinnerHTML();
  try {
    const res  = await API.getClosureLogs('', month);
    const rows = res.data || [];
    if (!rows.length) {
      c.innerHTML = `<div class="card"><div class="empty"><i class="ti ti-sun"></i><p>本月無休息記錄</p></div></div>`;
      return;
    }
    c.innerHTML = `<div class="card"><div class="table-wrap"><table>
      <thead><tr><th>日期</th><th>攤位</th><th>原因</th><th>備註</th><th></th></tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td>${r.date}</td>
        <td><strong>${r.stall_name}</strong></td>
        <td><span class="badge badge--amber">${r.reason}</span></td>
        <td class="td-muted">${r.note||'—'}</td>
        <td style="text-align:right">
          <button class="btn btn--sm btn--danger" onclick="deleteClosureItem('${r.id}')" title="刪除">
            <i class="ti ti-trash"></i>
          </button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>
    <div style="padding:10px 14px;font-size:12px;color:var(--ink-500)">
      共 ${rows.length} 筆休息記錄｜刪除後需重新月結才會更新分攤金額
    </div></div>`;
  } catch(e) { c.innerHTML = errHTML(e); }
};

window.deleteClosureItem = async function(id) {
  if (!confirm('確定要刪除這筆休息記錄嗎？')) return;
  try {
    await API.deleteClosure(id);
    UI.toast('✓ 已刪除');
    loadClosures();
  } catch(e) { UI.toast('刪除失敗：' + e.message, 'error'); }
};
