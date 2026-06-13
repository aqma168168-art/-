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

// ── 初始化 ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const now = new Date();
  document.getElementById('stall-date-display').textContent =
    now.toLocaleDateString('zh-TW', { month:'long', day:'numeric', weekday:'short' });
  document.getElementById('s-date').value = UI.todayISO();

  const connBadge = document.getElementById('stall-conn-badge');
  UI.showLoading('連線中…');

  try {
    // 一次 API 拿回所有選單設定
    const res = await API.getStallFormOptions();
    StallApp.opts = res.data;
    buildForm(StallApp.opts);
    connBadge.textContent = '已連線 ✓';
    connBadge.classList.add('conn-badge--ok');
  } catch(e) {
    connBadge.textContent = '連線失敗';
    connBadge.classList.add('conn-badge--error');
    UI.toast('無法載入設定，請確認網路', 'error', 6000);
  } finally {
    UI.hideLoading();
  }

  document.getElementById('btn-stall-submit').addEventListener('click', submitStallReport);
});

// ── 動態建立表單選單 ──────────────────────────────────────────
function buildForm(opts) {
  // 攤位下拉
  const stallSel = document.getElementById('s-stall');
  opts.stalls.forEach(s => {
    const o = document.createElement('option');
    o.value = s.stall_id; o.textContent = s.stall_name;
    stallSel.appendChild(o);
  });

  // 回報人
  const repSel = document.getElementById('s-reporter');
  opts.reporters.forEach(n => {
    const o = document.createElement('option');
    o.value = n; o.textContent = n;
    repSel.appendChild(o);
  });

  // 賣完時間
  const timeSel = document.getElementById('s-soldout');
  timeSel.innerHTML = `<option value="">選時間…</option>` + makeOptions(opts.soldOutTimes);

  // 桶數（1 到 maxBarrels）
  const barrelSel = document.getElementById('s-barrels');
  barrelSel.innerHTML = `<option value="">選桶數…</option>` +
    Array.from({ length: opts.maxBarrels }, (_, i) =>
      `<option value="${i+1}">${i+1} 桶</option>`
    ).join('');

  // 所有剩料選單（0 到 maxRemainder）
  const remOpts = remOptions(opts.maxRemainder);
  document.querySelectorAll('.rem-field select').forEach(sel => {
    sel.innerHTML = remOpts;
  });
}

// ── 送出回報 ──────────────────────────────────────────────────
async function submitStallReport() {
  const stall_id  = document.getElementById('s-stall').value;
  const reporter  = document.getElementById('s-reporter').value;
  const barrels   = document.getElementById('s-barrels').value;
  const soldout   = document.getElementById('s-soldout').value;

  if (!stall_id) { UI.toast('請選擇攤位', 'error');   return; }
  if (!reporter) { UI.toast('請選擇回報人', 'error'); return; }
  if (!barrels)  { UI.toast('請選擇今日桶數', 'error'); return; }
  if (!soldout)  { UI.toast('請選擇賣完時間', 'error'); return; }

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
