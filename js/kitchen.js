// ============================================================
// kitchen.js — 廚房作業系統 v2.1
// ============================================================

const KitchenApp = {
  page:  'dispatch',
  cache: {
    settings:        null,
    stalls:          null,
    ingredients:     null,
    dispatchers:     [],
    taskLibrary:     [],   // 工作項目庫
    todayDispatches: [],
    inventory:       [],
    lowStock:        [],
    initDate:        null,
  },
};

const K_TITLES = {
  dispatch:      '今日配發表',
  'new-dispatch':'新增配發',
  leftover:      '昨日攤位剩料',
  suggestion:    '建議備料',
  'weekly-plan': '週計畫',
  'monthly-cal': '月曆',
  'waste-log':   '廚房報廢',
  inventory:     '庫存管理',
  'cost-input':  '成本輸入',
};

// ── 初始化：一次 API 搞定所有設定 ────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('topbar-date').textContent =
    new Date().toLocaleDateString('zh-TW', {
      year:'numeric', month:'long', day:'numeric', weekday:'short'
    });

  const badge = document.getElementById('conn-badge');
  UI.showLoading('載入廚房資料…');
  try {
    // 一次 API：設定 + 攤位 + 配料 + 今日配發 + 庫存
    const res = await API.getKitchenInit(t());
    const d   = res.data;

    KitchenApp.cache.settings        = d.settings;
    KitchenApp.cache.stalls          = d.stalls;
    KitchenApp.cache.ingredients     = d.ingredients;
    KitchenApp.cache.dispatchers     = d.dispatchers || [];
    KitchenApp.cache.taskLibrary     = d.taskLibrary || [];
    KitchenApp.cache.todayDispatches = d.todayDispatches || [];
    KitchenApp.cache.inventory       = d.inventory || [];
    KitchenApp.cache.lowStock        = d.lowStock || [];
    KitchenApp.cache.initDate        = d.date;

    if (badge) { badge.textContent = '已連線'; badge.className = 'badge badge--green'; }

    // 低庫存警示
    if (d.lowStock.length > 0) {
      UI.toast(`⚠ ${d.lowStock.length} 項庫存低於安全庫存`, 'info', 5000);
    }
  } catch(e) {
    UI.toast('無法載入設定：' + e.message, 'error', 6000);
    if (badge) { badge.textContent = '連線失敗'; badge.className = 'badge badge--red'; }
  } finally {
    UI.hideLoading();
  }

  document.querySelectorAll('.nav-item[data-page]').forEach(el =>
    el.addEventListener('click', () => showPage(el.dataset.page)));

  showPage('dispatch');
});

// ── 路由（同步包裝 async 函式，確保 el 正確傳入）────────────
function showPage(page) {
  KitchenApp.page = page;
  document.querySelectorAll('.nav-item').forEach(el =>
    el.classList.toggle('active', el.dataset.page === page));
  document.getElementById('page-title').textContent = K_TITLES[page] || page;
  const body = document.getElementById('page-body');
  body.innerHTML = '';

  const pages = {
    dispatch:      () => renderDispatchList(body),
    'new-dispatch':() => renderNewDispatch(body),
    leftover:      () => renderLeftover(body),
    suggestion:    () => renderSuggestion(body),
    'weekly-plan': () => renderWeeklyPlan(body),
    'monthly-cal': () => renderMonthlyCal(body),
    'waste-log':   () => renderWasteLog(body),
    inventory:     () => renderInventory(body),
    'cost-input':  () => renderCostInput(body),
  };
  const fn = pages[page];
  if (fn) fn();
}

// ── 工具 ─────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const t = UI.todayISO;
const fn = UI.fmtNum;

function yesterday() {
  const d = new Date(); d.setDate(d.getDate()-1); return d.toISOString().slice(0,10);
}
function spinHTML()   { return '<div class="empty"><i class="ti ti-loader" style="animation:spin .7s linear infinite"></i><p>載入中…</p></div>'; }
function noDataHTML() { return '<div class="empty" style="padding:24px"><i class="ti ti-inbox"></i><p>無資料</p></div>'; }
function errHTML(e)   { return `<div class="alert-row alert-row--danger" style="margin:0"><i class="ti ti-alert-triangle alert-row__icon"></i><div class="alert-row__body"><strong>載入失敗</strong><span>${e.message}</span></div></div>`; }

// ═══════════════════════════════════════════════════════════════
// 今日配發表
// ═══════════════════════════════════════════════════════════════
function renderDispatchList(el) {
  el.innerHTML = `
    <div class="section-header" style="margin-bottom:16px">
      <div class="section-title"><i class="ti ti-truck-delivery"></i>配發記錄</div>
      <div style="display:flex;gap:8px">
        <input type="date" id="disp-date" value="${t()}"
               style="padding:7px 10px;border:1.5px solid var(--ink-200);border-radius:var(--r-md);font-size:13px;outline:none">
        <button class="btn btn--sm btn--kitchen" onclick="loadDispatchList()">
          <i class="ti ti-refresh"></i> 更新
        </button>
        <button class="btn btn--sm btn--kitchen" onclick="showPage('new-dispatch')">
          <i class="ti ti-plus"></i> 新增
        </button>
      </div>
    </div>
    <div id="disp-list">${spinHTML()}</div>`;

  // 若快取日期 = 今日，直接渲染快取，不發 API
  const today = t();
  if (KitchenApp.cache.initDate === today && KitchenApp.cache.todayDispatches.length >= 0) {
    renderDispatchRows($('disp-list'), KitchenApp.cache.todayDispatches);
  } else {
    loadDispatchList();
  }
}

// 渲染配發記錄表格（共用，避免重複代碼）
function renderDispatchRows(container, rows) {
  if (!rows.length) {
    container.innerHTML = `<div class="card card--kitchen">${noDataHTML()}</div>`;
    return;
  }
  container.innerHTML = `<div class="card card--kitchen">
    <div class="table-wrap table-wrap--kitchen"><table>
      <thead><tr>
        <th>攤位</th><th>配發人</th>
        <th>底料 大/中/小</th><th>米 大/中/小</th><th>芋頭 大/中/小</th>
        <th>芋泥(包)</th><th>碎皮蛋</th><th>整皮蛋</th><th>芹菜</th><th>菜脯</th><th>備註</th>
      </tr></thead>
      <tbody>${rows.map(r=>`<tr>
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
}

window.loadDispatchList = async function() {
  const date = $('disp-date')?.value || t();
  const c    = $('disp-list'); if (!c) return;
  c.innerHTML = spinHTML();
  try {
    const res  = await API.getDispatches(date);
    const rows = res.data || [];
    // 若是今日，更新快取
    if (date === t()) {
      KitchenApp.cache.todayDispatches = rows;
      KitchenApp.cache.initDate        = date;
    }
    renderDispatchRows(c, rows);
  } catch(e) { c.innerHTML = errHTML(e); }
};

// ═══════════════════════════════════════════════════════════════
// 新增配發
// ═══════════════════════════════════════════════════════════════
function renderNewDispatch(el) {
  const stalls = KitchenApp.cache.stalls || [];
  const sz = ['大','中','小'];
  el.innerHTML = `
    <div class="section-title mb-16" style="margin-bottom:16px">
      <i class="ti ti-plus"></i>新增配發記錄
    </div>
    <div class="card card--kitchen">
      <form id="dispatch-form" novalidate>
        <div class="form-section">
          <div class="form-section__title"><i class="ti ti-info-circle"></i>基本資料</div>
          <div class="fg fg3">
            <div class="field"><label>日期</label>
              <input type="date" name="date" value="${t()}" required>
            </div>
            <div class="field"><label>攤位 *</label>
              <select name="stall_id" required>
                <option value="">請選擇攤位…</option>
                ${stalls.map(s=>`<option value="${s.stall_id}">${s.stall_name}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>配發人</label>
              <select name="dispatcher">
                ${(KitchenApp.cache.dispatchers.length
                    ? KitchenApp.cache.dispatchers
                    : ['阿明','阿華','阿成','其他'])
                  .map(n=>`<option value="${n}">${n}</option>`).join('')}
              </select>
            </div>
          </div>
        </div>
        <div class="form-section">
          <div class="form-section__title"><i class="ti ti-droplet"></i>底料配發</div>
          <div class="fg fg3">
            ${sz.map(s=>`<div class="field"><label>底料（${s}）</label>
              <input type="number" name="base_${s==='大'?'L':s==='中'?'M':'S'}" min="0" step="0.5" value="0">
            </div>`).join('')}
          </div>
        </div>
        <div class="form-section">
          <div class="form-section__title"><i class="ti ti-grain"></i>米配發</div>
          <div class="fg fg3">
            ${sz.map(s=>`<div class="field"><label>米（${s}）</label>
              <input type="number" name="rice_${s==='大'?'L':s==='中'?'M':'S'}" min="0" step="0.5" value="0">
            </div>`).join('')}
          </div>
        </div>
        <div class="form-section">
          <div class="form-section__title"><i class="ti ti-plant"></i>芋頭 / 芋泥</div>
          <div class="fg fg4">
            ${sz.map(s=>`<div class="field"><label>芋頭（${s}）</label>
              <input type="number" name="taro_${s==='大'?'L':s==='中'?'M':'S'}" min="0" step="0.5" value="0">
            </div>`).join('')}
            <div class="field"><label>芋泥（包）</label>
              <input type="number" name="taro_paste" min="0" step="0.5" value="0">
            </div>
          </div>
        </div>
        <div class="form-section">
          <div class="form-section__title"><i class="ti ti-egg"></i>其他配料</div>
          <div class="fg fg4">
            <div class="field"><label>碎皮蛋（碗）</label><input type="number" name="broken_egg" min="0" step="0.5" value="0"></div>
            <div class="field"><label>完整皮蛋（碗）</label><input type="number" name="whole_egg" min="0" step="0.5" value="0"></div>
            <div class="field"><label>芹菜（碗）</label><input type="number" name="celery" min="0" step="0.5" value="0"></div>
            <div class="field"><label>菜脯（碗）</label><input type="number" name="pickled_radish" min="0" step="0.5" value="0"></div>
          </div>
        </div>
        <div class="form-section" style="margin-bottom:0">
          <div class="field"><label>備註</label><textarea name="note" placeholder="選填"></textarea></div>
        </div>
        <div class="btn-row">
          <button type="button" class="btn" onclick="UI.resetForm(document.getElementById('dispatch-form'))">
            <i class="ti ti-eraser"></i>清除
          </button>
          <button type="submit" class="btn btn--kitchen" id="btn-dispatch">
            <i class="ti ti-device-floppy"></i>儲存配發記錄
          </button>
        </div>
      </form>
    </div>`;

  $('dispatch-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = UI.formData(e.target);
    if (!data.stall_id) { UI.toast('請選擇攤位', 'error'); return; }
    const stall = KitchenApp.cache.stalls.find(s => s.stall_id === data.stall_id);
    data.stall_name = stall?.stall_name || '';
    const btn = $('btn-dispatch');
    UI.btnLoad(btn, true, '儲存中…');
    try {
      await API.saveDispatch(data);
      UI.toast(`✓ ${data.stall_name} 配發記錄已儲存`);
      UI.resetForm(e.target);
      e.target.querySelector('[name="date"]').value = t();
      // 若是今日配發，更新快取
      if (data.date === t()) {
        KitchenApp.cache.todayDispatches.push(data);
      }
    } catch(err) { UI.toast(err.message, 'error'); }
    finally { UI.btnLoad(btn, false); }
  });
}

// ═══════════════════════════════════════════════════════════════
// 昨日剩料
// ═══════════════════════════════════════════════════════════════
function renderLeftover(el) {
  const yest = yesterday();
  el.innerHTML = `
    <div class="section-header mb-16" style="margin-bottom:16px">
      <div class="section-title"><i class="ti ti-history"></i>昨日攤位剩料（${yest}）</div>
    </div>
    <div id="leftover-content">${spinHTML()}</div>`;
  (async () => {
    try {
      const res  = await API.getReports(yest);
      const rows = res.data || [];
      const c = $('leftover-content');
      if (!rows.length) { c.innerHTML = `<div class="card card--kitchen">${noDataHTML()}</div>`; return; }
      c.innerHTML = `<div class="card card--kitchen"><div class="table-wrap table-wrap--kitchen"><table>
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
  })();
}

// ═══════════════════════════════════════════════════════════════
// 建議備料
// ═══════════════════════════════════════════════════════════════
function renderSuggestion(el) {
  const yest = yesterday();
  el.innerHTML = `
    <div class="section-title mb-16" style="margin-bottom:16px">
      <i class="ti ti-bulb"></i>今日建議備料（依昨日推算）
    </div>
    <div id="suggestion-content">${spinHTML()}</div>`;
  (async () => {
    try {
      const [dispRes, repRes] = await Promise.all([API.getDispatches(yest), API.getReports(yest)]);
      const dispatches = dispRes.data || [];
      const reports    = repRes.data  || [];
      const stalls     = KitchenApp.cache.stalls || [];
      const c = $('suggestion-content');
      if (!dispatches.length || !reports.length) {
        c.innerHTML = `<div class="card card--kitchen"><div class="alert-row alert-row--warning">
          <i class="ti ti-info-circle alert-row__icon"></i>
          <div class="alert-row__body"><strong>資料不足</strong>
          <span>昨日配發或回報資料不完整，無法計算建議備料。</span></div>
        </div></div>`;
        return;
      }
      const fields = [
        { label:'底料大', dKey:'base_L', rKey:'rem_base_L' },
        { label:'底料中', dKey:'base_M', rKey:'rem_base_M' },
        { label:'底料小', dKey:'base_S', rKey:'rem_base_S' },
        { label:'米大',   dKey:'rice_L', rKey:'rem_rice_L' },
        { label:'米中',   dKey:'rice_M', rKey:'rem_rice_M' },
        { label:'米小',   dKey:'rice_S', rKey:'rem_rice_S' },
        { label:'芋頭大', dKey:'taro_L', rKey:'rem_taro_L' },
        { label:'芋頭中', dKey:'taro_M', rKey:'rem_taro_M' },
        { label:'芋頭小', dKey:'taro_S', rKey:'rem_taro_S' },
        { label:'芋泥',   dKey:'taro_paste', rKey:'rem_taro_paste' },
      ];
      c.innerHTML = stalls.map(stall => {
        const d = dispatches.find(x => x.stall_id === stall.stall_id);
        const r = reports.find(x => x.stall_id === stall.stall_id);
        if (!d && !r) return '';
        const rows = fields.map(f => {
          const sent    = Number(d?.[f.dKey]||0);
          const rem     = Number(r?.[f.rKey]||0);
          const used    = Math.max(0, sent - rem);
          const suggest = Math.ceil(used * 1.1);
          return `<div class="stall-card__row">
            <span class="stall-card__row-label">${f.label}</span>
            <span class="td-muted" style="font-size:11px">昨送${sent} 剩${rem} 用${used}</span>
            <span class="stall-card__row-val c-orange fw-700">建議 ${suggest}</span>
          </div>`;
        }).join('');
        return `<div class="stall-card stall-card--kitchen" style="margin-bottom:14px">
          <div class="stall-card__head">
            <div class="stall-card__name"><span class="dot dot--sky"></span>${stall.stall_name}</div>
          </div>
          <div class="stall-card__body">${rows}</div>
          <div class="stall-card__footer"><span>建議 = 昨日用量 × 1.1（含緩衝）</span></div>
        </div>`;
      }).join('') || noDataHTML();
    } catch(e) { $('suggestion-content').innerHTML = errHTML(e); }
  })();
}

// ═══════════════════════════════════════════════════════════════
// 週計畫
// ═══════════════════════════════════════════════════════════════
function currentWeekStr() {
  const now  = new Date();
  const year = now.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const week = Math.ceil((((now - jan1) / 86400000) + jan1.getDay() + 1) / 7);
  return year + '-W' + String(week).padStart(2, '0');
}

function getWeekDates(weekStr) {
  const [y, w] = weekStr.split('-W');
  const jan1 = new Date(+y, 0, 1);
  const start = new Date(jan1.getTime() + (+w - 1) * 7 * 86400000);
  const dow   = start.getDay() || 7;
  start.setDate(start.getDate() - dow + 1);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start); d.setDate(start.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function renderWeeklyPlan(el) {
  const weekStr = currentWeekStr();
  el.innerHTML = `
    <div class="section-header" style="margin-bottom:20px">
      <div class="section-title"><i class="ti ti-calendar-week"></i>本週工作計畫</div>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="week" id="week-input" value="${weekStr}"
               style="padding:7px 10px;border:1.5px solid var(--kitchen-card-border);
                      border-radius:var(--r-md);font-size:13px;outline:none;background:var(--white)">
        <button class="btn btn--kitchen btn--sm" onclick="loadWeeklyPlan()">
          <i class="ti ti-refresh"></i> 切換
        </button>
        <button class="btn btn--kitchen btn--sm" onclick="openAddTaskModal()">
          <i class="ti ti-plus"></i> 新增任務
        </button>
      </div>
    </div>
    <div id="weekly-content">${spinHTML()}</div>

    <!-- 新增任務 Modal -->
    <div id="add-task-modal" style="display:none;position:fixed;inset:0;
         background:rgba(15,23,42,.5);z-index:9999;align-items:center;
         justify-content:center;backdrop-filter:blur(2px)">
      <div style="background:var(--white);border-radius:var(--r-xl);padding:28px;
                  width:92%;max-width:480px;box-shadow:var(--shadow-lg)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">
          <div style="font-size:17px;font-weight:700;color:var(--ink-900)">
            <i class="ti ti-plus" style="color:var(--kitchen-sidebar-accent)"></i> 新增任務
          </div>
          <button onclick="closeAddTaskModal()"
                  style="background:none;border:none;font-size:20px;color:var(--ink-400);cursor:pointer">✕</button>
        </div>

        <form id="add-task-form" novalidate>
          <!-- 工作內容：下拉選單 + 自由輸入切換 -->
          <div class="field" style="margin-bottom:14px">
            <label style="color:var(--ink-700)">工作內容 *</label>
            <div style="display:flex;gap:6px">
              <select id="task-content-select"
                      style="flex:1;padding:9px 12px;border:1.5px solid var(--kitchen-card-border);
                             border-radius:var(--r-md);font-size:13px;outline:none;background:var(--white)"
                      onchange="onTaskContentSelect(this)">
                <option value="">── 從項目庫選擇 ──</option>
                ${buildTaskLibraryOptions()}
                <option value="__custom__">✏️ 自行輸入…</option>
              </select>
            </div>
            <input type="text" id="task-content-input" name="content"
                   placeholder="請輸入工作內容"
                   style="display:none;margin-top:6px;width:100%;padding:9px 12px;
                          border:1.5px solid var(--kitchen-sidebar-accent);
                          border-radius:var(--r-md);font-size:13px;outline:none">
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
            <div class="field">
              <label style="color:var(--ink-700)">日期 *</label>
              <input type="date" name="date" id="task-date" value="${t()}"
                     style="padding:9px 12px;border:1.5px solid var(--kitchen-card-border);
                            border-radius:var(--r-md);font-size:13px;outline:none;width:100%">
            </div>
            <div class="field">
              <label style="color:var(--ink-700)">任務類型</label>
              <select name="type" id="task-type"
                      style="padding:9px 12px;border:1.5px solid var(--kitchen-card-border);
                             border-radius:var(--r-md);font-size:13px;outline:none;background:var(--white)">
                <option value="備料">備料</option>
                <option value="清潔">清潔</option>
                <option value="採購">採購</option>
                <option value="配送">配送</option>
                <option value="庫存">庫存</option>
                <option value="設備">設備</option>
                <option value="其他">其他</option>
              </select>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
            <div class="field">
              <label style="color:var(--ink-700)">負責人</label>
              <select name="assignee"
                      style="padding:9px 12px;border:1.5px solid var(--kitchen-card-border);
                             border-radius:var(--r-md);font-size:13px;outline:none;background:var(--white)">
                <option value="">不指定</option>
                ${(KitchenApp.cache.dispatchers||[])
                  .map(n=>`<option value="${n}">${n}</option>`).join('')}
              </select>
            </div>
            <div class="field">
              <label style="color:var(--ink-700)">優先級</label>
              <select name="priority"
                      style="padding:9px 12px;border:1.5px solid var(--kitchen-card-border);
                             border-radius:var(--r-md);font-size:13px;outline:none;background:var(--white)">
                <option value="高">🔴 高</option>
                <option value="中" selected>🟡 中</option>
                <option value="低">⚪ 低</option>
              </select>
            </div>
          </div>

          <div style="display:flex;gap:8px;justify-content:flex-end;padding-top:8px">
            <button type="button" class="btn btn--sm" onclick="closeAddTaskModal()">取消</button>
            <button type="submit" class="btn btn--kitchen btn--sm" id="btn-add-task">
              <i class="ti ti-device-floppy"></i> 儲存任務
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 更新狀態 Modal -->
    <div id="task-modal" style="display:none;position:fixed;inset:0;
         background:rgba(15,23,42,.5);z-index:9999;align-items:center;
         justify-content:center;backdrop-filter:blur(2px)">
      <div style="background:var(--white);border-radius:var(--r-xl);padding:28px;
                  width:90%;max-width:400px;box-shadow:var(--shadow-lg)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
          <div style="font-size:16px;font-weight:700">更新任務狀態</div>
          <button onclick="closeTaskModal()"
                  style="background:none;border:none;font-size:20px;color:var(--ink-400);cursor:pointer">✕</button>
        </div>
        <input type="hidden" id="modal-task-id">
        <div class="field" style="margin-bottom:12px">
          <label>狀態</label>
          <select id="modal-status"
                  style="padding:10px;border:1.5px solid var(--kitchen-card-border);
                         border-radius:var(--r-md);font-size:14px;width:100%">
            <option value="待完成">待完成</option>
            <option value="進行中">進行中</option>
            <option value="完成">完成</option>
          </select>
        </div>
        <div class="field" style="margin-bottom:16px">
          <label>備註</label>
          <textarea id="modal-note" rows="3"
                    style="padding:10px;border:1.5px solid var(--kitchen-card-border);
                           border-radius:var(--r-md);font-size:13px;width:100%;resize:vertical"></textarea>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn--sm" onclick="closeTaskModal()">取消</button>
          <button class="btn btn--kitchen btn--sm" id="btn-modal-save" onclick="saveTaskModal()">
            <i class="ti ti-device-floppy"></i> 儲存
          </button>
        </div>
      </div>
    </div>`;

  // 新增任務表單送出
  $('add-task-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const selectEl  = $('task-content-select');
    const inputEl   = $('task-content-input');
    const content   = selectEl.value === '__custom__'
      ? inputEl.value.trim()
      : (selectEl.value || inputEl.value.trim());
    if (!content) { UI.toast('請選擇或輸入工作內容', 'error'); return; }
    const data = {
      content,
      date:     $('task-date').value,
      type:     e.target.querySelector('[name="type"]').value,
      assignee: e.target.querySelector('[name="assignee"]').value,
      priority: e.target.querySelector('[name="priority"]').value,
    };
    const btn = $('btn-add-task');
    UI.btnLoad(btn, true);
    try {
      await API.saveWeeklyTask(data);
      UI.toast('✓ 任務已新增');
      closeAddTaskModal();
      loadWeeklyPlan();
    } catch(err) { UI.toast(err.message, 'error'); }
    finally { UI.btnLoad(btn, false); }
  });

  loadWeeklyPlan();
}

// 產生工作項目庫的 option HTML（依類型分組）
function buildTaskLibraryOptions() {
  const library = KitchenApp.cache.taskLibrary || [];
  if (!library.length) return '';
  // 依類型分組
  const groups = {};
  library.forEach(item => {
    const type = item.type || '其他';
    if (!groups[type]) groups[type] = [];
    groups[type].push(item);
  });
  return Object.entries(groups).map(([type, items]) => `
    <optgroup label="── ${type} ──">
      ${items.map(item =>
        `<option value="${item.content}"
                 data-type="${item.type}"
                 data-priority="${item.priority}">
          ${item.content}
        </option>`
      ).join('')}
    </optgroup>`
  ).join('');
}

// 選擇工作項目時自動帶入類型和優先級
window.onTaskContentSelect = function(sel) {
  const opt      = sel.selectedOptions[0];
  const inputEl  = $('task-content-input');
  if (sel.value === '__custom__') {
    inputEl.style.display = 'block';
    inputEl.focus();
  } else {
    inputEl.style.display = 'none';
    // 帶入對應的類型和優先級
    if (opt?.dataset?.type) {
      const typeEl = $('task-type');
      if (typeEl) typeEl.value = opt.dataset.type;
    }
    if (opt?.dataset?.priority) {
      const priEl = document.querySelector('[name="priority"]');
      if (priEl) priEl.value = opt.dataset.priority;
    }
  }
};

window.openAddTaskModal = function() {
  const m = $('add-task-modal');
  if (m) {
    m.style.display = 'flex';
    // 重設表單
    const sel = $('task-content-select');
    if (sel) sel.value = '';
    const inp = $('task-content-input');
    if (inp) { inp.style.display = 'none'; inp.value = ''; }
    $('task-date').value = t();
  }
};
window.closeAddTaskModal = function() {
  const m = $('add-task-modal'); if (m) m.style.display = 'none';
};

window.loadWeeklyPlan = async function() {
  const weekStr = $('week-input')?.value || currentWeekStr();
  const c = $('weekly-content'); if (!c) return;
  c.innerHTML = spinHTML();
  try {
    const res   = await API.getWeeklyPlan(weekStr, '');
    const tasks = res.data || [];
    const dates = getWeekDates(weekStr);
    const dayNames  = ['一','二','三','四','五','六','日'];
    const priColor  = { '高':'badge--red', '中':'badge--amber', '低':'badge--gray' };
    const statColor = { '待完成':'badge--gray', '進行中':'badge--sky', '完成':'badge--green' };
    const byDate = {};
    dates.forEach(d => { byDate[d] = []; });
    tasks.forEach(task => { if (byDate[task.date]) byDate[task.date].push(task); });

    c.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px;margin-bottom:24px">
        ${dates.map((date, i) => {
          const dayTasks = byDate[date] || [];
          const isToday  = date === t();
          return `<div style="background:${isToday?'var(--kitchen-section-head)':'var(--white)'};
                              border:${isToday?'2px solid var(--kitchen-sidebar-accent)':'1px solid var(--kitchen-card-border)'};
                              border-radius:var(--r-lg);padding:10px;min-height:120px">
            <div style="font-size:11px;font-weight:700;color:var(--amber-700);text-transform:uppercase">週${dayNames[i]}</div>
            <div style="font-size:12px;color:var(--ink-500);margin-bottom:8px">${date.slice(5)}</div>
            ${dayTasks.length === 0
              ? '<div style="font-size:11px;color:var(--ink-300);text-align:center;padding:8px 0">—</div>'
              : dayTasks.map(task => `
                <div style="background:var(--white);border:1px solid var(--kitchen-card-border);
                            border-radius:var(--r-md);padding:7px;margin-bottom:5px;cursor:pointer"
                     onclick="openTaskModal('${task.task_id}','${task.status}','${encodeURIComponent(task.note||'')}')">
                  <div style="font-size:11px;font-weight:600;color:var(--ink-900);line-height:1.3;margin-bottom:3px">${task.content}</div>
                  <div style="display:flex;gap:3px;flex-wrap:wrap">
                    <span class="badge ${priColor[task.priority]||'badge--gray'}" style="font-size:9px;padding:1px 5px">${task.priority||'中'}</span>
                    <span class="badge ${statColor[task.status]||'badge--gray'}" style="font-size:9px;padding:1px 5px">${task.status}</span>
                  </div>
                </div>`).join('')}
          </div>`;
        }).join('')}
      </div>

      <div class="section-title" style="margin-bottom:12px"><i class="ti ti-list-check"></i>本週任務清單</div>
      <div class="card card--kitchen">
        ${tasks.length === 0 ? noDataHTML() : tasks.map(task => `
          <div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;
                      border-bottom:1px solid var(--kitchen-card-border)">
            <input type="checkbox" id="ck-${task.task_id}"
                   ${task.status==='完成'?'checked':''}
                   onchange="updateTaskStatus('${task.task_id}',this.checked)"
                   style="width:18px;height:18px;margin-top:2px;cursor:pointer;
                          accent-color:var(--kitchen-sidebar-accent);flex-shrink:0">
            <div style="flex:1;min-width:0">
              <div style="font-size:14px;font-weight:600;
                          ${task.status==='完成'?'text-decoration:line-through;color:var(--ink-400)':'color:var(--ink-900)'}">
                ${task.content}
              </div>
              <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap;align-items:center">
                <span style="font-size:11px;color:var(--ink-400)">${task.date}</span>
                <span class="badge badge--orange" style="font-size:9px">${task.type||''}</span>
                ${task.assignee?`<span style="font-size:11px;color:var(--ink-400)">👤 ${task.assignee}</span>`:''}
              </div>
              ${task.note?`<div style="font-size:12px;color:var(--ink-500);margin-top:4px;
                                       background:var(--kitchen-section-head);padding:4px 8px;
                                       border-radius:var(--r-sm)">✏️ ${task.note}</div>`:''}
            </div>
            <span class="badge ${statColor[task.status]||'badge--gray'}">${task.status}</span>
          </div>`).join('')}
      </div>

      <div id="task-modal" style="display:none;position:fixed;inset:0;
           background:rgba(15,23,42,.5);z-index:9999;align-items:center;
           justify-content:center;backdrop-filter:blur(2px)">
        <div style="background:var(--white);border-radius:var(--r-xl);padding:28px;
                    width:90%;max-width:420px;box-shadow:var(--shadow-lg)">
          <div style="font-size:16px;font-weight:700;margin-bottom:16px">更新任務狀態</div>
          <input type="hidden" id="modal-task-id">
          <div class="field" style="margin-bottom:12px">
            <label>狀態</label>
            <select id="modal-status" style="padding:10px;border:1.5px solid var(--kitchen-card-border);border-radius:var(--r-md);font-size:14px">
              <option value="待完成">待完成</option>
              <option value="進行中">進行中</option>
              <option value="完成">完成</option>
            </select>
          </div>
          <div class="field" style="margin-bottom:16px">
            <label>備註</label>
            <textarea id="modal-note" rows="3"
                      style="padding:10px;border:1.5px solid var(--kitchen-card-border);
                             border-radius:var(--r-md);font-size:13px;width:100%;resize:vertical">
            </textarea>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn--sm" onclick="closeTaskModal()">取消</button>
            <button class="btn btn--kitchen btn--sm" id="btn-modal-save" onclick="saveTaskModal()">
              <i class="ti ti-device-floppy"></i> 儲存
            </button>
          </div>
        </div>
      </div>`;
  } catch(e) { c.innerHTML = errHTML(e); }
};

window.openTaskModal = function(taskId, status, noteEnc) {
  $('modal-task-id').value = taskId;
  $('modal-status').value  = decodeURIComponent(status);
  $('modal-note').value    = decodeURIComponent(noteEnc);
  $('task-modal').style.display = 'flex';
};
window.closeTaskModal = function() {
  const m = $('task-modal'); if (m) m.style.display = 'none';
};
window.saveTaskModal = async function() {
  const btn = $('btn-modal-save');
  UI.btnLoad(btn, true);
  try {
    await API.saveWeeklyPlanStatus({
      task_id: $('modal-task-id').value,
      status:  $('modal-status').value,
      note:    $('modal-note').value,
    });
    UI.toast('✓ 任務已更新');
    closeTaskModal();
    loadWeeklyPlan();
  } catch(e) { UI.toast(e.message, 'error'); }
  finally { UI.btnLoad(btn, false); }
};
window.updateTaskStatus = async function(taskId, checked) {
  try {
    await API.saveWeeklyPlanStatus({ task_id: taskId, status: checked?'完成':'待完成', note:'' });
    UI.toast(checked ? '✓ 任務完成' : '任務重設為待完成');
  } catch(e) { UI.toast(e.message, 'error'); }
};

// ═══════════════════════════════════════════════════════════════
// 月曆
// ═══════════════════════════════════════════════════════════════
function renderMonthlyCal(el) {
  const month = UI.monthISO();
  el.innerHTML = `
    <div class="section-header" style="margin-bottom:20px">
      <div class="section-title"><i class="ti ti-calendar-month"></i>月曆</div>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="month" id="month-input" value="${month}"
               style="padding:7px 10px;border:1.5px solid var(--kitchen-card-border);
                      border-radius:var(--r-md);font-size:13px;outline:none;background:var(--white)">
        <button class="btn btn--kitchen btn--sm" onclick="loadMonthlyCal()">
          <i class="ti ti-refresh"></i> 切換
        </button>
      </div>
    </div>
    <div id="cal-content">${spinHTML()}</div>`;
  loadMonthlyCal();
}

window.loadMonthlyCal = async function() {
  const month = $('month-input')?.value || UI.monthISO();
  const c = $('cal-content'); if (!c) return;
  c.innerHTML = spinHTML();
  try {
    const res   = await API.getWeeklyPlan('', month);
    const tasks = res.data || [];
    const [y, m] = month.split('-').map(Number);
    const firstDay  = new Date(y, m-1, 1);
    const lastDay   = new Date(y, m, 0);
    const startDow  = (firstDay.getDay() || 7) - 1;
    const totalDays = lastDay.getDate();
    const byDate = {};
    tasks.forEach(task => {
      const d = String(task.date);
      if (!byDate[d]) byDate[d] = [];
      byDate[d].push(task);
    });
    const dayNames   = ['一','二','三','四','五','六','日'];
    const statColor  = { '待完成':'#F59E0B', '進行中':'#0EA5E9', '完成':'#10B981' };
    const today      = t();
    let cells = '';
    for (let i = 0; i < startDow; i++) cells += `<div style="min-height:90px"></div>`;
    for (let day = 1; day <= totalDays; day++) {
      const dateStr  = `${month}-${String(day).padStart(2,'0')}`;
      const dayTasks = byDate[dateStr] || [];
      const isToday  = dateStr === today;
      cells += `<div style="min-height:90px;
                  background:${isToday?'var(--kitchen-section-head)':'var(--white)'};
                  border:${isToday?'2px solid var(--kitchen-sidebar-accent)':'1px solid var(--kitchen-card-border)'};
                  border-radius:var(--r-md);padding:8px;overflow:hidden">
        <div style="font-size:12px;font-weight:${isToday?'700':'500'};
                    color:${isToday?'var(--kitchen-sidebar-accent)':'var(--ink-700)'};margin-bottom:4px">${day}</div>
        ${dayTasks.slice(0,3).map(task=>`
          <div style="font-size:10px;padding:2px 5px;border-radius:3px;margin-bottom:2px;cursor:pointer;
                      background:${statColor[task.status]||'#94A3B8'}20;
                      color:${statColor[task.status]||'#94A3B8'};font-weight:500;
                      overflow:hidden;white-space:nowrap;text-overflow:ellipsis"
               title="${task.content}"
               onclick="openTaskModal('${task.task_id}','${task.status}','${encodeURIComponent(task.note||'')}')">
            ${task.content}
          </div>`).join('')}
        ${dayTasks.length>3?`<div style="font-size:10px;color:var(--ink-400)">+${dayTasks.length-3} 項</div>`:''}
      </div>`;
    }
    c.innerHTML = `
      <div style="background:var(--white);border:1px solid var(--kitchen-card-border);
                  border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-sm)">
        <div style="background:var(--kitchen-sidebar-bg);color:var(--white);
                    padding:14px 20px;font-size:16px;font-weight:700;text-align:center">
          ${y} 年 ${m} 月
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);
                    background:var(--kitchen-section-head);border-bottom:1px solid var(--kitchen-card-border)">
          ${dayNames.map(d=>`<div style="text-align:center;padding:8px 4px;font-size:11px;
                                         font-weight:700;color:var(--amber-700)">${d}</div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:8px">${cells}</div>
      </div>
      <div style="display:flex;gap:16px;margin-top:12px;font-size:12px;color:var(--ink-500);align-items:center;flex-wrap:wrap">
        <span style="font-weight:600">圖例：</span>
        ${Object.entries(statColor).map(([s,c])=>`
          <span style="display:flex;align-items:center;gap:4px">
            <span style="width:10px;height:10px;border-radius:2px;background:${c};display:inline-block"></span>${s}
          </span>`).join('')}
      </div>
      <div id="task-modal" style="display:none;position:fixed;inset:0;background:rgba(15,23,42,.5);
           z-index:9999;align-items:center;justify-content:center;backdrop-filter:blur(2px)">
        <div style="background:var(--white);border-radius:var(--r-xl);padding:28px;
                    width:90%;max-width:420px;box-shadow:var(--shadow-lg)">
          <div style="font-size:16px;font-weight:700;margin-bottom:16px">更新任務狀態</div>
          <input type="hidden" id="modal-task-id">
          <div class="field" style="margin-bottom:12px">
            <label>狀態</label>
            <select id="modal-status" style="padding:10px;border:1.5px solid var(--kitchen-card-border);border-radius:var(--r-md);font-size:14px">
              <option value="待完成">待完成</option><option value="進行中">進行中</option><option value="完成">完成</option>
            </select>
          </div>
          <div class="field" style="margin-bottom:16px">
            <label>備註</label>
            <textarea id="modal-note" rows="3"
                      style="padding:10px;border:1.5px solid var(--kitchen-card-border);border-radius:var(--r-md);font-size:13px;width:100%;resize:vertical"></textarea>
          </div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button class="btn btn--sm" onclick="closeTaskModal()">取消</button>
            <button class="btn btn--kitchen btn--sm" id="btn-modal-save" onclick="saveTaskModal()">
              <i class="ti ti-device-floppy"></i> 儲存
            </button>
          </div>
        </div>
      </div>`;
  } catch(e) { c.innerHTML = errHTML(e); }
};

// ═══════════════════════════════════════════════════════════════
// 廚房報廢
// ═══════════════════════════════════════════════════════════════
function renderWasteLog(el) {
  const ings = (KitchenApp.cache.ingredients||[]).filter(i =>
    String(i.in_inventory).toUpperCase() === 'TRUE');
  el.innerHTML = `
    <div class="section-title" style="margin-bottom:16px"><i class="ti ti-trash"></i>新增報廢記錄</div>
    <div class="card card--kitchen" style="margin-bottom:24px">
      <div class="alert-row alert-row--warning" style="margin-bottom:16px">
        <i class="ti ti-info-circle alert-row__icon"></i>
        <div class="alert-row__body"><strong>報廢會自動扣除庫存</strong>
          <span>系統同時在庫存異動表記錄耗損</span></div>
      </div>
      <form id="waste-form" novalidate>
        <div class="fg fg3" style="margin-bottom:12px">
          <div class="field"><label>日期</label><input type="date" name="date" value="${t()}"></div>
          <div class="field"><label>品項 *</label>
            <select name="item_id" id="waste-item">
              <option value="">請選擇…</option>
              ${ings.map(i=>`<option value="${i.ingredient_id}"
                data-name="${i.ingredient_name}" data-unit="${i.unit}">
                ${i.ingredient_name}（${i.unit}）</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>數量 *</label>
            <input type="number" name="qty" min="0.1" step="0.1" value="1">
          </div>
        </div>
        <div class="fg fg3" style="margin-bottom:12px">
          <div class="field"><label>報廢原因 *</label>
            <select name="reason">
              <option value="expired">過期</option>
              <option value="spoiled">變質</option>
              <option value="accident">操作失誤</option>
              <option value="overstock">備料過多</option>
              <option value="other">其他</option>
            </select>
          </div>
          <div class="field"><label>記錄人</label>
            <select name="recorder">
              ${(KitchenApp.cache.settings?.['配發人清單']||'阿明,阿華,阿成').split(',')
                .map(n=>`<option value="${n.trim()}">${n.trim()}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>備註</label><input type="text" name="note" placeholder="選填"></div>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn--kitchen" id="btn-waste">
            <i class="ti ti-trash"></i> 新增報廢記錄
          </button>
        </div>
      </form>
    </div>
    <div class="section-header" style="margin-bottom:12px">
      <div class="section-title"><i class="ti ti-history"></i>報廢記錄查詢</div>
      <div style="display:flex;gap:8px">
        <input type="date" id="waste-date" value="${t()}"
               style="padding:6px 10px;border:1.5px solid var(--kitchen-card-border);
                      border-radius:var(--r-md);font-size:13px;outline:none;background:var(--white)">
        <button class="btn btn--sm btn--kitchen" onclick="loadWasteLogs()">
          <i class="ti ti-refresh"></i> 查詢
        </button>
      </div>
    </div>
    <div class="card card--kitchen" id="waste-list">${spinHTML()}</div>`;

  $('waste-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = UI.formData(e.target);
    if (!data.item_id) { UI.toast('請選擇品項', 'error'); return; }
    const opt = $('waste-item').selectedOptions[0];
    data.item_name = opt?.dataset?.name || '';
    data.unit      = opt?.dataset?.unit || '';
    const btn = $('btn-waste');
    UI.btnLoad(btn, true);
    try {
      await API.saveWasteLog(data);
      UI.toast('✓ 報廢記錄已新增，庫存已扣除');
      UI.resetForm(e.target);
      e.target.querySelector('[name="date"]').value = t();
      loadWasteLogs();
    } catch(err) { UI.toast(err.message, 'error'); }
    finally { UI.btnLoad(btn, false); }
  });
  loadWasteLogs();
}

window.loadWasteLogs = async function() {
  const date = $('waste-date')?.value || t();
  const c = $('waste-list'); if (!c) return;
  c.innerHTML = spinHTML();
  try {
    const res  = await API.getWasteLogs(date, '');
    const rows = res.data || [];
    if (!rows.length) { c.innerHTML = noDataHTML(); return; }
    c.innerHTML = `<div class="table-wrap table-wrap--kitchen"><table>
      <thead><tr><th>日期</th><th>品項</th><th>數量</th><th>報廢原因</th><th>記錄人</th><th>備註</th></tr></thead>
      <tbody>${rows.map(r=>`<tr>
        <td>${r.date}</td>
        <td><strong>${r.item_name}</strong></td>
        <td class="td-num">${r.qty} ${r.unit}</td>
        <td><span class="badge badge--red">${r.reason}</span></td>
        <td>${r.recorder||'—'}</td>
        <td class="td-muted">${r.note||'—'}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  } catch(e) { c.innerHTML = errHTML(e); }
};

// ═══════════════════════════════════════════════════════════════
// 庫存管理
// ═══════════════════════════════════════════════════════════════
function renderInventory(el) {
  const ings = (KitchenApp.cache.ingredients||[]).filter(i =>
    String(i.in_inventory).toUpperCase() === 'TRUE');
  el.innerHTML = `
    <div class="grid g2-1" style="gap:20px">
      <div>
        <div class="section-title mb-16" style="margin-bottom:12px">
          <i class="ti ti-package"></i>目前庫存
        </div>
        <div class="card card--kitchen" id="k-inv-overview">
          ${renderInventoryList(KitchenApp.cache.inventory)}
        </div>
      </div>
      <div>
        <div class="section-title mb-16" style="margin-bottom:12px">
          <i class="ti ti-arrows-transfer-up"></i>入庫 / 出庫
        </div>
        <div class="card card--kitchen">
          <form id="k-inv-form" novalidate>
            <div class="fg" style="gap:12px">
              <div class="field"><label>日期</label><input type="date" name="date" value="${t()}"></div>
              <div class="field"><label>類型</label>
                <select name="type">
                  <option value="in">入庫</option>
                  <option value="out">出庫（廚房使用）</option>
                </select>
              </div>
              <div class="field"><label>品項</label>
                <select name="item_id" id="k-inv-item">
                  <option value="">請選擇…</option>
                  ${ings.map(i=>`<option value="${i.ingredient_id}" data-unit="${i.unit}">
                    ${i.ingredient_name}（${i.unit}）</option>`).join('')}
                </select>
              </div>
              <div class="field"><label>數量</label>
                <input type="number" name="qty" min="0.1" step="0.1" value="1">
              </div>
              <div class="field"><label>備註</label>
                <input type="text" name="note" placeholder="例：早市採購">
              </div>
            </div>
            <div class="btn-row">
              <button type="submit" class="btn btn--kitchen" id="btn-k-inv">
                <i class="ti ti-device-floppy"></i>儲存
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>`;

  $('k-inv-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = UI.formData(e.target);
    if (!data.item_id) { UI.toast('請選擇品項', 'error'); return; }
    const opt = $('k-inv-item').selectedOptions[0];
    data.item_name  = opt?.text?.split('（')[0] || '';
    data.unit       = opt?.dataset?.unit || '';
    data.unit_price = 0;
    const btn = $('btn-k-inv');
    UI.btnLoad(btn, true);
    try {
      await API.saveInventoryLog(data);
      UI.toast('✓ 已儲存');
      UI.resetForm(e.target);
      e.target.querySelector('[name="date"]').value = t();
      // 儲存後重新抓庫存更新快取
      await refreshInventoryCache();
    } catch(err) { UI.toast(err.message, 'error'); }
    finally { UI.btnLoad(btn, false); }
  });
}

function renderInventoryList(items) {
  if (!items || !items.length) return '<div class="empty" style="padding:16px"><p>無庫存資料</p></div>';
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

async function refreshInventoryCache() {
  try {
    const res = await API.getInventory();
    KitchenApp.cache.inventory = res.data || [];
    KitchenApp.cache.lowStock  = KitchenApp.cache.inventory.filter(i => i.is_low);
    // 更新畫面上的庫存列表
    const ov = $('k-inv-overview');
    if (ov) ov.innerHTML = renderInventoryList(KitchenApp.cache.inventory);
  } catch(e) { /* 靜默失敗，不影響主流程 */ }
}

// ═══════════════════════════════════════════════════════════════
// 成本輸入
// ═══════════════════════════════════════════════════════════════
function renderCostInput(el) {
  el.innerHTML = `
    <div class="section-title mb-16" style="margin-bottom:16px">
      <i class="ti ti-receipt"></i>今日成本輸入
    </div>
    <div class="card card--kitchen" style="max-width:560px">
      <div class="alert-row alert-row--warning" style="margin-bottom:16px">
        <i class="ti ti-info-circle alert-row__icon"></i>
        <div class="alert-row__body"><strong>說明</strong>
          <span>請輸入廚房今日實際成本。損益計算由老闆後台負責。</span></div>
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
          <div class="field"><label>金額 ($)</label>
            <input type="number" name="amount" min="0" value="0" required>
          </div>
        </div>
        <div class="field" style="margin-bottom:14px">
          <label>備註說明</label>
          <input type="text" name="note" placeholder="例：今日阿明加班費">
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn--kitchen" id="btn-cost">
            <i class="ti ti-device-floppy"></i>送出成本記錄
          </button>
        </div>
      </form>
    </div>
    <div id="cost-today-list" style="margin-top:20px"></div>`;

  $('cost-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = UI.formData(e.target);
    const btn  = $('btn-cost');
    if (!data.amount) { UI.toast('請填入金額', 'error'); return; }
    UI.btnLoad(btn, true);
    try {
      await API.saveKitchenCost(data);
      UI.toast('✓ 成本已送出');
      UI.resetForm(e.target);
      e.target.querySelector('[name="date"]').value = t();
      loadTodayCosts();
    } catch(err) { UI.toast(err.message, 'error'); }
    finally { UI.btnLoad(btn, false); }
  });
  loadTodayCosts();
}

async function loadTodayCosts() {
  const c = $('cost-today-list'); if (!c) return;
  try {
    const res  = await API.getKitchenCosts(t());
    const rows = res.data || [];
    if (!rows.length) { c.innerHTML = ''; return; }
    c.innerHTML = `
      <div class="section-title mb-16" style="margin-bottom:12px">
        <i class="ti ti-list"></i>今日已輸入成本
      </div>
      <div class="card card--kitchen">
        <div class="table-wrap table-wrap--kitchen"><table>
          <thead><tr><th>類型</th><th>金額</th><th>備註</th></tr></thead>
          <tbody>${rows.map(r=>`<tr>
            <td><span class="badge badge--gray">${r.type}</span></td>
            <td class="td-num">${UI.fmtMoney(r.amount)}</td>
            <td class="td-muted">${r.note||'—'}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
  } catch(e) { c.innerHTML = errHTML(e); }
}
