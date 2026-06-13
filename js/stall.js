// ============================================================
// stall.js — 攤位阿姨回報系統 v2.1
// 所有選單選項從 Google Sheets 讀取，不寫死
// ============================================================

const StallApp = { opts: null }; // 快取表單選項

// ── 工具：產生 options HTML ──────────────────────────────────
function makeOptions(values, selectedVal = '') {
  return values.map(v =>
    `<option value="${v}"${v==selectedVal?' selected':''}>${v}</option>`
  ).join('');
}

function remOptions(max) {
  return Array.from({ length: max + 1 }, (_, i) =>
    `<option value="${i}">${i}</option>`
  ).join('');
}

// ── 初始化：localStorage 快取選單 → 立即顯示表單，背景刷新 ──
const STALL_OPTS_CACHE_KEY = 'stall_form_options';
const STALL_OPTS_MAX_AGE   = 30 * 60 * 1000; // 30 分鐘（選單變動不頻繁）

document.addEventListener('DOMContentLoaded', async () => {
  const now = new Date();
  document.getElementById('stall-date-display').textContent =
    now.toLocaleDateString('zh-TW', { month:'long', day:'numeric', weekday:'short' });
  document.getElementById('s-date').value = UI.todayISO();

  const connBadge = document.getElementById('stall-conn-badge');
  document.getElementById('btn-stall-submit').addEventListener('click', submitStallReport);

  // 1. 嘗試從 localStorage 取得快取，立即顯示表單
  const cached = UI.cacheGet(STALL_OPTS_CACHE_KEY, STALL_OPTS_MAX_AGE);
  let renderedFromCache = false;
  if (cached) {
    StallApp.opts = cached;
    buildForm(StallApp.opts);
    connBadge.textContent = '快取載入';
    connBadge.classList.add('conn-badge--ok');
    renderedFromCache = true;
  } else {
    UI.showLoading('連線中…');
  }

  // 2. 背景向後端確認最新選單（攤位、回報人名單可能變動）
  try {
    const res = await API.getStallFormOptions();
    StallApp.opts = res.data;
    UI.cacheSet(STALL_OPTS_CACHE_KEY, res.data);

    if (!renderedFromCache) {
      buildForm(StallApp.opts);
    } else {
      // 已用快取顯示表單，若選項有變動，靜默更新（不打斷使用者填寫）
      refreshFormOptionsIfChanged(cached, StallApp.opts);
    }
    connBadge.textContent = '已連線 ✓';
    connBadge.classList.remove('conn-badge--error');
    connBadge.classList.add('conn-badge--ok');
  } catch(e) {
    if (!renderedFromCache) {
      connBadge.textContent = '連線失敗';
      connBadge.classList.add('conn-badge--error');
      UI.toast('無法載入設定，請確認網路', 'error', 6000);
    } else {
      // 已有快取可用，背景更新失敗不影響填寫
      connBadge.textContent = '離線（使用快取）';
    }
  } finally {
    UI.hideLoading();
  }
});

// 比較快取與最新選單，若有差異才重建表單（避免不必要的重繪打斷輸入）
function refreshFormOptionsIfChanged(oldOpts, newOpts) {
  const changed = JSON.stringify(oldOpts) !== JSON.stringify(newOpts);
  if (!changed) return;
  // 選單有變動：保留使用者目前已選的攤位/回報人（若仍存在於新清單）
  const curStall    = document.getElementById('s-stall').value;
  const curReporter = document.getElementById('s-reporter').value;
  buildForm(newOpts);
  if (curStall)    document.getElementById('s-stall').value = curStall;
  if (curReporter) document.getElementById('s-reporter').value = curReporter;
}

// ── 動態建立表單選單 ──────────────────────────────────────────
function buildForm(opts) {
  // 攤位下拉（清除舊選項，保留第一個「請選擇…」）
  const stallSel = document.getElementById('s-stall');
  stallSel.innerHTML = '<option value="">請選擇…</option>';
  opts.stalls.forEach(s => {
    const o = document.createElement('option');
    o.value = s.stall_id; o.textContent = s.stall_name;
    stallSel.appendChild(o);
  });

  // 回報人（清除舊選項，保留第一個「請選擇…」）
  const repSel = document.getElementById('s-reporter');
  repSel.innerHTML = '<option value="">請選擇…</option>';
  opts.reporters.forEach(n => {
    const o = document.createElement('option');
    o.value = n; o.textContent = n;
    repSel.appendChild(o);
  });

  // 賣完時間：自由輸入，自動格式化（只綁定一次，避免重複觸發）
  const timeInput = document.getElementById('s-soldout');
  if (timeInput && !timeInput.dataset.bound) {
    timeInput.addEventListener('input', formatTimeInput);
    timeInput.addEventListener('blur',  validateTimeInput);
    timeInput.addEventListener('focus', () => {
      const hint = document.getElementById('soldout-hint');
      if (hint) hint.style.display = 'none';
    });
    timeInput.dataset.bound = '1';
  }

  // 桶數（0.5 間距，從 0.5 到 maxBarrels）
  const barrelSel = document.getElementById('s-barrels');
  barrelSel.innerHTML = `<option value="">選桶數…</option>`;
  let b = 0.5;
  while (b <= opts.maxBarrels) {
    const label = Number.isInteger(b) ? `${b} 桶` : `${b} 桶（半桶）`;
    barrelSel.innerHTML += `<option value="${b}">${label}</option>`;
    b = Math.round((b + 0.5) * 10) / 10; // 避免浮點誤差
  }

  // 所有剩料選單（0 到 maxRemainder）
  const remOpts = remOptions(opts.maxRemainder);
  document.querySelectorAll('.rem-field select').forEach(sel => {
    sel.innerHTML = remOpts;
  });
}

// ── 時間自動格式化 ────────────────────────────────────────────
// 使用者輸入 1430 → 自動轉成 14:30
// 使用者輸入 930  → 轉成 09:30
function formatTimeInput(e) {
  const input = e.target;
  // 只保留數字
  let raw = input.value.replace(/\D/g, '');

  // 移除舊的冒號再重算
  if (raw.length >= 4) {
    const hh = raw.slice(0, 2);
    const mm = raw.slice(2, 4);
    input.value = `${hh}:${mm}`;
  } else if (raw.length === 3) {
    // 輸入 3 碼時先顯示原始，等第 4 碼
    input.value = raw;
  } else {
    input.value = raw;
  }

  // 格式完成後更新 hint
  const hint = document.getElementById('soldout-hint');
  if (hint) hint.style.display = raw.length > 0 ? 'none' : '';
}

function validateTimeInput(e) {
  const input = e.target;
  const raw = input.value.replace(/\D/g, '');
  if (!raw) return;

  // 補齊 3 碼情況，例如 930 → 09:30
  let digits = raw.padStart(4, '0');
  const hh = parseInt(digits.slice(0, 2));
  const mm = parseInt(digits.slice(2, 4));

  if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
    input.value = `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
    input.style.borderColor = 'var(--stall-accent)';
  } else {
    // 格式錯誤，清空讓使用者重填
    input.value = '';
    input.placeholder = '格式錯誤，請重新輸入（如 1430）';
    input.style.borderColor = 'var(--red-500)';
    UI.toast('時間格式錯誤，請輸入如 1430 代表 14:30', 'error', 3000);
  }
}

// ── 送出回報 ──────────────────────────────────────────────────
async function submitStallReport() {
  const stall_id  = document.getElementById('s-stall').value;
  const reporter  = document.getElementById('s-reporter').value;
  const barrels   = document.getElementById('s-barrels').value;
  const soldout   = document.getElementById('s-soldout').value.trim();

  if (!stall_id) { UI.toast('請選擇攤位', 'error');          return; }
  if (!reporter) { UI.toast('請選擇回報人', 'error');        return; }
  if (!barrels)  { UI.toast('請選擇今日桶數', 'error');      return; }
  if (!soldout)  { UI.toast('請填入賣完時間', 'error');
    document.getElementById('s-soldout').focus();            return; }

  // 確保時間格式正確（含冒號）
  const timeRegex = /^\d{1,2}:\d{2}$/;
  if (!timeRegex.test(soldout)) {
    UI.toast('時間格式錯誤，請輸入如 1430', 'error');
    document.getElementById('s-soldout').focus();
    return;
  }

  const stall = (StallApp.opts?.stalls||[]).find(s => s.stall_id === stall_id);
  const form  = document.getElementById('stall-form');
  const data  = UI.formData(form);
  data.stall_name = stall?.stall_name || '';

  // 合併異常備註
  if (data.anomaly_type && data.anomaly_type !== '') {
    data.note = `[${data.anomaly_type}] ${data.note||''}`.trim();
  }
  delete data.anomaly_type;

  const btn = document.getElementById('btn-stall-submit');
  UI.btnLoad(btn, true, '送出中…');
  UI.showLoading('送出回報…');

  try {
    await API.saveReport(data);
    // 顯示完成畫面
    document.getElementById('stall-page').style.display   = 'none';
    document.getElementById('submit-bar').style.display   = 'none';
    const done   = document.getElementById('stall-done');
    const detail = document.getElementById('stall-done-detail');
    detail.innerHTML = `
      <strong>${stall?.stall_name||''}</strong> 今日回報已送出<br>
      ${UI.fmtDate(data.date)}・${data.sold_out_time} 賣完<br>
      桶數 ${barrels}・大碗 ${data.big_bowls}・小碗 ${data.small_bowls}
    `;
    done.classList.add('show');
  } catch(e) {
    UI.toast('送出失敗：' + e.message, 'error', 5000);
  } finally {
    UI.btnLoad(btn, false);
    UI.hideLoading();
  }
}

// ── 重設表單 ──────────────────────────────────────────────────
function resetStallForm() {
  document.getElementById('stall-done').classList.remove('show');
  document.getElementById('stall-page').style.display = '';
  document.getElementById('submit-bar').style.display = '';
  const form = document.getElementById('stall-form');
  UI.resetForm(form);
  document.getElementById('s-date').value = UI.todayISO();
  // 重設剩料選單回 0
  document.querySelectorAll('.rem-field select').forEach(s => s.value = '0');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.resetStallForm = resetStallForm;
