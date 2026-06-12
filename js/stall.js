// ============================================================
// stall.js — 攤位阿姨回報系統 v2.0（手機優先）
// ============================================================

const StallApp = {
  stalls:  [],
  settings: {},
};

const REM_OPTS = Array.from({length:11},(_,i)=>`<option value="${i}">${i}</option>`).join('');

// ── 初始化 ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // 日期顯示
  const now = new Date();
  document.getElementById('stall-date-display').textContent =
    now.toLocaleDateString('zh-TW', { month:'long', day:'numeric', weekday:'short' });

  // 填入選單預設日期
  document.getElementById('s-date').value = UI.todayISO();

  // 替換 HTML 裡的 __REM_OPTS__ 佔位符
  document.querySelectorAll('.rem-field select').forEach(sel => {
    sel.innerHTML = REM_OPTS;
  });

  // 載入攤位清單
  const connBadge = document.getElementById('stall-conn-badge');
  UI.showLoading('連線中…');
  try {
    const [sr, stR] = await Promise.all([API.getSettings(), API.getStalls()]);
    StallApp.settings = sr.data;
    StallApp.stalls   = stR.data;

    const stallSel = document.getElementById('s-stall');
    StallApp.stalls.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.stall_id; opt.textContent = s.stall_name;
      stallSel.appendChild(opt);
    });

    // 回報人清單（未來可從 Settings 讀取，目前暫用固定列表）
    const reporters = (StallApp.settings['回報人清單'] || '阿珍,阿芳,小美,阿蘭,其他').split(',');
    const repSel = document.getElementById('s-reporter');
    reporters.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n.trim(); opt.textContent = n.trim();
      repSel.appendChild(opt);
    });

    connBadge.textContent = '已連線 ✓'; connBadge.classList.add('conn-badge--ok');
    connBadge.style.background = 'rgba(255,255,255,.25)';
  } catch(e) {
    connBadge.textContent = '連線失敗'; connBadge.classList.add('conn-badge--error');
    connBadge.style.background = 'rgba(239,68,68,.3)';
    UI.toast('無法連線，請確認網路', 'error', 6000);
  } finally { UI.hideLoading(); }

  // 送出按鈕
  document.getElementById('btn-stall-submit').addEventListener('click', submitStallReport);
});

// ── 送出回報 ──────────────────────────────────────────────────
async function submitStallReport() {
  const form = document.getElementById('stall-form');

  // 必填驗證
  const stall_id = document.getElementById('s-stall').value;
  const reporter = document.getElementById('s-reporter').value;
  const barrels  = document.getElementById('s-barrels').value;
  const soldout  = document.getElementById('s-soldout').value;
  const big      = document.getElementById('s-big').value;
  const small    = document.getElementById('s-small').value;

  if (!stall_id) { UI.toast('請選擇攤位', 'error'); document.getElementById('s-stall').focus(); return; }
  if (!reporter) { UI.toast('請選擇回報人', 'error'); return; }
  if (!barrels)  { UI.toast('請選擇今日桶數', 'error'); return; }
  if (!soldout)  { UI.toast('請選擇賣完時間', 'error'); return; }

  const stall = StallApp.stalls.find(s => s.stall_id === stall_id);
  const data  = UI.formData(form);
  data.stall_name   = stall?.stall_name || '';
  // 合併異常備註
  if (data.anomaly_type && data.anomaly_type !== '無異常') {
    data.note = `[${data.anomaly_type}] ${data.note||''}`.trim();
  }
  delete data.anomaly_type;

  const btn = document.getElementById('btn-stall-submit');
  UI.btnLoad(btn, true, '送出中…');
  UI.showLoading('送出回報…');

  try {
    await API.saveReport(data);

    // 顯示完成畫面
    document.getElementById('stall-page').style.display = 'none';
    document.getElementById('submit-bar').style.display = 'none';
    const done = document.getElementById('stall-done');
    const detail = document.getElementById('stall-done-detail');
    detail.innerHTML = `
      <strong>${stall?.stall_name || ''}</strong> 今日回報已送出<br>
      ${UI.fmtDate(data.date)} · ${data.sold_out_time} 賣完<br>
      桶數 ${barrels} · 大碗 ${big} · 小碗 ${small}
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
  // 重設所有剩料選單回 0
  document.querySelectorAll('.rem-field select').forEach(s => s.value = '0');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.resetStallForm = resetStallForm;
