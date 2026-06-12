// ============================================================
// staff.js — 員工作業系統頁面邏輯
// 注意：本檔案絕對不包含任何成本、毛利、淨利相關計算或顯示
// ============================================================

// ── 全域狀態 ─────────────────────────────────────────────────
const StaffApp = {
  currentPage: 'dispatch',
  cache: {
    stalls: null,
    ingredients: null,
    settings: null,
  },
};

const PAGE_TITLES = {
  'dispatch':          '中央廚房配發',
  'stall-report':      '攤位阿姨回報',
  'inventory-report':  '庫存回報',
  'today-log':         '今日作業紀錄',
};

// ── 初始化 ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('zh-TW', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'short'
  });

  UI.showLoading('載入系統設定…');
  try {
    const [settingsRes, stallsRes, ingRes] = await Promise.all([
      API.getSettings(),
      API.getStalls(),
      API.getIngredients(),
    ]);
    StaffApp.cache.settings    = settingsRes.data;
    StaffApp.cache.stalls      = stallsRes.data;
    StaffApp.cache.ingredients = ingRes.data;
  } catch (err) {
    UI.toast('無法載入設定，請確認網路與 Apps Script 設定', 'error', 6000);
  } finally {
    UI.hideLoading();
  }

  showPage('dispatch');
});

// ── 路由 ─────────────────────────────────────────────────────
function showPage(page) {
  StaffApp.currentPage = page;
  document.getElementById('page-title').textContent = PAGE_TITLES[page] || page;

  // 更新 sidebar active
  document.querySelectorAll('.sidebar__item').forEach(el => {
    el.classList.toggle('is-active', el.dataset.page === page);
  });

  const content = document.getElementById('page-content');
  content.innerHTML = '';

  switch (page) {
    case 'dispatch':         renderDispatch(content);        break;
    case 'stall-report':     renderStallReport(content);     break;
    case 'inventory-report': renderInventoryReport(content); break;
    case 'today-log':        renderTodayLog(content);        break;
    default:
      content.innerHTML = '<div class="empty-state"><i class="ti ti-alert-circle"></i>頁面不存在</div>';
  }
}

// ── 工具：取得今日字串 ────────────────────────────────────────
function todayStr() { return UI.todayISO(); }

// ── 工具：產生攤位選單 HTML ───────────────────────────────────
function stallOptions() {
  const stalls = StaffApp.cache.stalls || [];
  return stalls.map(s => `<option value="${s.stall_id}">${s.stall_name}</option>`).join('');
}

// ═══════════════════════════════════════════════════════════════
// 頁面：中央廚房配發
// ═══════════════════════════════════════════════════════════════
function renderDispatch(el) {
  el.innerHTML = `
    <div class="section-title">
      <i class="ti ti-truck-delivery"></i>新增配發記錄
    </div>

    <div class="card" id="dispatch-form-card">
      <form id="dispatch-form" novalidate>

        <div class="form-grid form-grid-3">
          <div class="field">
            <label for="d-date">日期</label>
            <input type="date" id="d-date" name="date" value="${todayStr()}" required>
          </div>
          <div class="field">
            <label for="d-stall">攤位</label>
            <select id="d-stall" name="stall_id" required>
              <option value="">── 請選擇攤位 ──</option>
              ${stallOptions()}
            </select>
          </div>
          <div class="field">
            <label for="d-dispatcher">配發人</label>
            <select id="d-dispatcher" name="dispatcher">
              ${dispatcherOptions()}
            </select>
          </div>
        </div>

        <div class="divider"></div>
        <p class="field-group-label">底料配發</p>
        <div class="form-grid form-grid-3">
          <div class="field"><label>底料（大）</label><input type="number" name="base_L" min="0" value="0"></div>
          <div class="field"><label>底料（中）</label><input type="number" name="base_M" min="0" value="0"></div>
          <div class="field"><label>底料（小）</label><input type="number" name="base_S" min="0" value="0"></div>
        </div>

        <p class="field-group-label">米配發</p>
        <div class="form-grid form-grid-3">
          <div class="field"><label>米（大）</label><input type="number" name="rice_L" min="0" value="0"></div>
          <div class="field"><label>米（中）</label><input type="number" name="rice_M" min="0" value="0"></div>
          <div class="field"><label>米（小）</label><input type="number" name="rice_S" min="0" value="0"></div>
        </div>

        <p class="field-group-label">芋頭 / 其他</p>
        <div class="form-grid form-grid-4">
          <div class="field"><label>芋頭（大）</label><input type="number" name="taro_L" min="0" value="0"></div>
          <div class="field"><label>芋頭（中）</label><input type="number" name="taro_M" min="0" value="0"></div>
          <div class="field"><label>芋頭（小）</label><input type="number" name="taro_S" min="0" value="0"></div>
          <div class="field"><label>芋泥（包）</label><input type="number" name="taro_paste" min="0" value="0"></div>
        </div>

        <div class="form-grid form-grid-4">
          <div class="field"><label>碎皮蛋（碗）</label><input type="number" name="broken_egg" min="0" value="0"></div>
          <div class="field"><label>完整皮蛋（碗）</label><input type="number" name="whole_egg" min="0" value="0"></div>
          <div class="field"><label>芹菜（碗）</label><input type="number" name="celery" min="0" value="0"></div>
          <div class="field"><label>菜脯（碗）</label><input type="number" name="pickled_radish" min="0" value="0"></div>
        </div>

        <div class="form-grid">
          <div class="field"><label>備註</label><textarea name="note" placeholder="選填"></textarea></div>
        </div>

        <div class="btn-row">
          <button type="button" class="btn" onclick="UI.resetForm(document.getElementById('dispatch-form'))">清除</button>
          <button type="submit" class="btn btn--primary" id="btn-dispatch-save">
            <i class="ti ti-device-floppy"></i> 儲存配發記錄
          </button>
        </div>
      </form>
    </div>

    <div class="section-title" style="margin-top:24px">
      <i class="ti ti-history"></i>今日配發記錄
    </div>
    <div class="card" id="dispatch-history-card">
      <div class="empty-state"><i class="ti ti-loader" style="animation:spin .8s linear infinite"></i>載入中…</div>
    </div>
  `;

  // 攤位選擇時更新 stall_name 隱藏欄
  document.getElementById('d-stall').addEventListener('change', function () {
    const stall = (StaffApp.cache.stalls || []).find(s => s.stall_id === this.value);
    document.getElementById('dispatch-form').dataset.stallName = stall ? stall.stall_name : '';
  });

  document.getElementById('dispatch-form').addEventListener('submit', submitDispatch);
  loadDispatchHistory();
}

function dispatcherOptions() {
  // 未來可從 Settings 讀取配發人名單
  return ['阿明','阿華','阿成','其他'].map(n => `<option value="${n}">${n}</option>`).join('');
}

async function submitDispatch(e) {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById('btn-dispatch-save');

  const data = UI.getFormData(form);
  if (!data.stall_id) { UI.toast('請選擇攤位', 'error'); return; }
  if (!data.date)     { UI.toast('請選擇日期', 'error'); return; }

  // 帶入 stall_name
  const stall = (StaffApp.cache.stalls || []).find(s => s.stall_id === data.stall_id);
  data.stall_name = stall ? stall.stall_name : '';

  UI.btnLoading(btn, true, '儲存中…');
  try {
    await API.saveDispatch(data);
    UI.toast(`✓ ${data.stall_name} 配發記錄已儲存`);
    UI.resetForm(form);
    form.querySelector('[name="date"]').value = todayStr();
    loadDispatchHistory();
  } catch (err) {
    UI.toast('儲存失敗：' + err.message, 'error');
  } finally {
    UI.btnLoading(btn, false);
  }
}

async function loadDispatchHistory() {
  const card = document.getElementById('dispatch-history-card');
  if (!card) return;
  try {
    const res = await API.getDispatches(todayStr());
    const rows = res.data || [];
    if (rows.length === 0) {
      card.innerHTML = '<div class="empty-state"><i class="ti ti-inbox"></i>今日尚無配發記錄</div>';
      return;
    }
    card.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>攤位</th><th>配發人</th>
              <th>底料 大/中/小</th><th>米 大/中/小</th>
              <th>芋泥</th><th>皮蛋 碎/整</th><th>芹菜</th><th>菜脯</th>
              <th>備註</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><strong>${r.stall_name || r.stall_id}</strong></td>
                <td>${r.dispatcher}</td>
                <td class="text-mono">${r.base_L||0}/${r.base_M||0}/${r.base_S||0}</td>
                <td class="text-mono">${r.rice_L||0}/${r.rice_M||0}/${r.rice_S||0}</td>
                <td>${r.taro_paste||0} 包</td>
                <td class="text-mono">${r.broken_egg||0}/${r.whole_egg||0}</td>
                <td>${r.celery||0}</td>
                <td>${r.pickled_radish||0}</td>
                <td class="text-muted">${r.note||'—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    card.innerHTML = `<div class="alert alert--danger">載入失敗：${err.message}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// 頁面：攤位阿姨回報
// ═══════════════════════════════════════════════════════════════
function renderStallReport(el) {
  const timeOptions = ['11:00','11:30','12:00','12:30','13:00','13:30','14:00',
    '14:30','15:00','15:30','16:00','16:30','17:00','17:30','未賣完']
    .map(t => `<option value="${t}">${t}</option>`).join('');

  const remOptions = (n = 5) => Array.from({length: n+1}, (_, i) => `<option value="${i}">${i}</option>`).join('');

  el.innerHTML = `
    <div class="section-title"><i class="ti ti-clipboard-text"></i>攤位今日回報</div>

    <div class="card">
      <form id="report-form" novalidate>

        <div class="form-grid form-grid-3">
          <div class="field">
            <label for="r-date">日期</label>
            <input type="date" id="r-date" name="date" value="${todayStr()}" required>
          </div>
          <div class="field">
            <label for="r-stall">攤位</label>
            <select id="r-stall" name="stall_id" required>
              <option value="">── 請選擇攤位 ──</option>
              ${stallOptions()}
            </select>
          </div>
          <div class="field">
            <label for="r-reporter">回報人</label>
            <select id="r-reporter" name="reporter">
              ${reporterOptions()}
            </select>
          </div>
        </div>

        <div class="form-grid form-grid-3">
          <div class="field">
            <label for="r-soldout">賣完時間</label>
            <select id="r-soldout" name="sold_out_time">${timeOptions}</select>
          </div>
          <div class="field">
            <label for="r-barrels">今日桶數</label>
            <select id="r-barrels" name="barrels">
              ${[1,2,3,4,5,6,7,8].map(n=>`<option value="${n}">${n} 桶</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="form-grid form-grid-3">
          <div class="field">
            <label for="r-big">大碗數</label>
            <input type="number" id="r-big" name="big_bowls" min="0" value="0" required>
          </div>
          <div class="field">
            <label for="r-small">小碗數</label>
            <input type="number" id="r-small" name="small_bowls" min="0" value="0" required>
          </div>
        </div>

        <div class="divider"></div>
        <p class="field-group-label">剩餘配料（請確認後填寫）</p>

        <div class="form-grid form-grid-3">
          <div class="field"><label>剩底料（大）</label><select name="rem_base_L">${remOptions()}</select></div>
          <div class="field"><label>剩底料（中）</label><select name="rem_base_M">${remOptions()}</select></div>
          <div class="field"><label>剩底料（小）</label><select name="rem_base_S">${remOptions()}</select></div>
        </div>

        <div class="form-grid form-grid-3">
          <div class="field"><label>剩米（大）</label><select name="rem_rice_L">${remOptions()}</select></div>
          <div class="field"><label>剩米（中）</label><select name="rem_rice_M">${remOptions()}</select></div>
          <div class="field"><label>剩米（小）</label><select name="rem_rice_S">${remOptions()}</select></div>
        </div>

        <div class="form-grid form-grid-4">
          <div class="field"><label>剩芋泥（包）</label><select name="rem_taro_paste">${remOptions()}</select></div>
          <div class="field"><label>剩碎皮蛋（碗）</label><select name="rem_broken_egg">${remOptions()}</select></div>
          <div class="field"><label>剩完整皮蛋（碗）</label><select name="rem_whole_egg">${remOptions()}</select></div>
          <div class="field"><label>剩芹菜（碗）</label><select name="rem_celery">${remOptions()}</select></div>
        </div>

        <div class="form-grid">
          <div class="field"><label>備註</label><textarea name="note" placeholder="選填，例如：天氣差、活動加碼"></textarea></div>
        </div>

        <div class="btn-row">
          <button type="button" class="btn" onclick="UI.resetForm(document.getElementById('report-form'));document.querySelector('[name=date]').value=todayStr()">清除</button>
          <button type="submit" class="btn btn--primary" id="btn-report-save">
            <i class="ti ti-send"></i> 送出今日回報
          </button>
        </div>
      </form>
    </div>

    <div class="section-title" style="margin-top:24px"><i class="ti ti-history"></i>今日回報記錄</div>
    <div class="card" id="report-history-card">
      <div class="empty-state"><i class="ti ti-loader" style="animation:spin .8s linear infinite"></i>載入中…</div>
    </div>
  `;

  document.getElementById('report-form').addEventListener('submit', submitReport);
  loadReportHistory();
}

function reporterOptions() {
  return ['阿珍','阿芳','小美','阿蘭','其他'].map(n => `<option value="${n}">${n}</option>`).join('');
}

async function submitReport(e) {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById('btn-report-save');

  const data = UI.getFormData(form);
  if (!data.stall_id) { UI.toast('請選擇攤位', 'error'); return; }
  if (!data.date)     { UI.toast('請選擇日期', 'error'); return; }

  const stall = (StaffApp.cache.stalls || []).find(s => s.stall_id === data.stall_id);
  data.stall_name = stall ? stall.stall_name : '';

  UI.btnLoading(btn, true, '送出中…');
  try {
    await API.saveReport(data);
    UI.toast(`✓ ${data.stall_name} 今日回報已送出`);
    UI.resetForm(form);
    form.querySelector('[name="date"]').value = todayStr();
    loadReportHistory();
  } catch (err) {
    UI.toast('送出失敗：' + err.message, 'error');
  } finally {
    UI.btnLoading(btn, false);
  }
}

async function loadReportHistory() {
  const card = document.getElementById('report-history-card');
  if (!card) return;
  try {
    const res = await API.getReports(todayStr());
    const rows = res.data || [];
    if (rows.length === 0) {
      card.innerHTML = '<div class="empty-state"><i class="ti ti-inbox"></i>今日尚無回報記錄</div>';
      return;
    }
    card.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>攤位</th><th>回報人</th><th>桶數</th>
              <th>大碗</th><th>小碗</th><th>賣完時間</th><th>備註</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td><strong>${r.stall_name||r.stall_id}</strong></td>
                <td>${r.reporter}</td>
                <td>${r.barrels}</td>
                <td>${r.big_bowls}</td>
                <td>${r.small_bowls}</td>
                <td><span class="badge badge--success">${r.sold_out_time}</span></td>
                <td class="text-muted">${r.note||'—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    card.innerHTML = `<div class="alert alert--danger">載入失敗：${err.message}</div>`;
  }
}

// ═══════════════════════════════════════════════════════════════
// 頁面：庫存回報（簡化版，只回報異常或短缺）
// ═══════════════════════════════════════════════════════════════
function renderInventoryReport(el) {
  el.innerHTML = `
    <div class="section-title"><i class="ti ti-package"></i>庫存回報</div>
    <div class="alert alert--info" style="background:var(--blue-50);border-color:var(--blue-100);color:var(--blue-600);margin-bottom:16px">
      <i class="ti ti-info-circle"></i>
      此頁面僅供員工回報庫存異常或短缺情況，完整庫存數字請洽老闆。
    </div>

    <div class="card">
      <form id="inv-report-form" novalidate>
        <div class="form-grid form-grid-3">
          <div class="field">
            <label>日期</label>
            <input type="date" name="date" value="${todayStr()}" required>
          </div>
          <div class="field">
            <label>品項</label>
            <select name="item_id" required>
              <option value="">── 請選擇 ──</option>
              ${(StaffApp.cache.ingredients||[]).filter(i=>i.in_inventory==='TRUE'||i.in_inventory===true)
                .map(i=>`<option value="${i.ingredient_id}">${i.ingredient_name}（${i.unit}）</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>類型</label>
            <select name="type">
              <option value="out">出庫（廚房使用）</option>
              <option value="in">入庫（補貨）</option>
              <option value="waste">耗損</option>
            </select>
          </div>
        </div>
        <div class="form-grid form-grid-2">
          <div class="field">
            <label>數量</label>
            <input type="number" name="qty" min="0.1" step="0.1" value="1" required>
          </div>
          <div class="field">
            <label>單價（入庫才需填）</label>
            <input type="number" name="unit_price" min="0" value="0">
          </div>
        </div>
        <div class="form-grid">
          <div class="field">
            <label>備註</label>
            <textarea name="note" placeholder="說明原因或數量來源"></textarea>
          </div>
        </div>
        <div class="btn-row">
          <button type="submit" class="btn btn--primary" id="btn-inv-save">
            <i class="ti ti-send"></i> 送出回報
          </button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('inv-report-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = UI.getFormData(e.target);
    if (!data.item_id) { UI.toast('請選擇品項', 'error'); return; }
    const ing = (StaffApp.cache.ingredients||[]).find(i => i.ingredient_id === data.item_id);
    data.item_name = ing ? ing.ingredient_name : '';
    data.unit = ing ? ing.unit : '';
    const btn = document.getElementById('btn-inv-save');
    UI.btnLoading(btn, true, '送出中…');
    try {
      await API.saveInventoryLog(data);
      UI.toast('✓ 庫存回報已送出');
      UI.resetForm(e.target);
      e.target.querySelector('[name="date"]').value = todayStr();
    } catch (err) {
      UI.toast('送出失敗：' + err.message, 'error');
    } finally {
      UI.btnLoading(btn, false);
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// 頁面：今日作業紀錄（唯讀彙整）
// ═══════════════════════════════════════════════════════════════
async function renderTodayLog(el) {
  el.innerHTML = `
    <div class="section-title"><i class="ti ti-calendar-event"></i>今日作業紀錄</div>
    <div class="form-grid form-grid-2" style="margin-bottom:16px">
      <div class="field">
        <label>查詢日期</label>
        <input type="date" id="log-date" value="${todayStr()}">
      </div>
      <div style="display:flex;align-items:flex-end">
        <button class="btn btn--primary" onclick="loadTodayLog()">
          <i class="ti ti-search"></i> 查詢
        </button>
      </div>
    </div>
    <div id="log-content"></div>
  `;
  loadTodayLog();
}

async function loadTodayLog() {
  const date = document.getElementById('log-date')?.value || todayStr();
  const container = document.getElementById('log-content');
  if (!container) return;
  container.innerHTML = '<div class="empty-state"><i class="ti ti-loader" style="animation:spin .8s linear infinite"></i>載入中…</div>';

  try {
    const [dispRes, repRes] = await Promise.all([
      API.getDispatches(date),
      API.getReports(date),
    ]);

    const dispatches = dispRes.data || [];
    const reports    = repRes.data || [];

    container.innerHTML = `
      <div class="section-title" style="margin-top:0"><i class="ti ti-truck-delivery"></i>配發記錄（${dispatches.length} 筆）</div>
      <div class="card" style="margin-bottom:16px">
        ${dispatches.length === 0
          ? '<div class="empty-state" style="padding:20px 0">當日無配發記錄</div>'
          : `<div class="table-wrap"><table>
              <thead><tr><th>攤位</th><th>配發人</th><th>底料 大/中/小</th><th>米 大/中/小</th><th>芋泥</th><th>皮蛋 碎/整</th><th>備註</th></tr></thead>
              <tbody>${dispatches.map(d=>`<tr>
                <td><strong>${d.stall_name||d.stall_id}</strong></td>
                <td>${d.dispatcher}</td>
                <td class="text-mono">${d.base_L||0}/${d.base_M||0}/${d.base_S||0}</td>
                <td class="text-mono">${d.rice_L||0}/${d.rice_M||0}/${d.rice_S||0}</td>
                <td>${d.taro_paste||0}包</td>
                <td class="text-mono">${d.broken_egg||0}/${d.whole_egg||0}</td>
                <td class="text-muted">${d.note||'—'}</td>
              </tr>`).join('')}</tbody>
             </table></div>`}
      </div>

      <div class="section-title"><i class="ti ti-clipboard-text"></i>攤位回報（${reports.length} 筆）</div>
      <div class="card">
        ${reports.length === 0
          ? '<div class="empty-state" style="padding:20px 0">當日無攤位回報</div>'
          : `<div class="table-wrap"><table>
              <thead><tr><th>攤位</th><th>回報人</th><th>桶數</th><th>大碗</th><th>小碗</th><th>賣完時間</th><th>備註</th></tr></thead>
              <tbody>${reports.map(r=>`<tr>
                <td><strong>${r.stall_name||r.stall_id}</strong></td>
                <td>${r.reporter}</td>
                <td>${r.barrels}</td>
                <td>${r.big_bowls}</td>
                <td>${r.small_bowls}</td>
                <td><span class="badge badge--success">${r.sold_out_time}</span></td>
                <td class="text-muted">${r.note||'—'}</td>
              </tr>`).join('')}</tbody>
             </table></div>`}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<div class="alert alert--danger">載入失敗：${err.message}</div>`;
  }
}
