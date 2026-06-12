// ============================================================
// ui.js — 共用 UI 工具 v2.0
// ============================================================
const UI = (() => {

  // ── Toast ─────────────────────────────────────────────────
  function toast(msg, type = 'success', ms = 3000) {
    document.getElementById('ck-toast')?.remove();
    const el = document.createElement('div');
    el.id = 'ck-toast';
    el.className = `toast toast--${type}`;
    const icons = { success:'ti-circle-check', error:'ti-circle-x', info:'ti-info-circle' };
    el.innerHTML = `<i class="ti ${icons[type]||'ti-info-circle'} toast__icon"></i><span>${msg}</span>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, ms);
  }

  // ── Loading ───────────────────────────────────────────────
  function showLoading(msg = '載入中…') {
    let el = document.getElementById('ck-loading');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ck-loading';
      el.className = 'loading-overlay';
      el.innerHTML = `<div class="loading-box"><div class="loading-spinner"></div><p class="loading-msg"></p></div>`;
      document.body.appendChild(el);
    }
    el.querySelector('.loading-msg').textContent = msg;
    el.classList.add('show');
  }
  function hideLoading() {
    document.getElementById('ck-loading')?.classList.remove('show');
  }

  // ── Button state ──────────────────────────────────────────
  function btnLoad(btn, loading, txt = '處理中…') {
    if (loading) { btn._orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<i class="ti ti-loader" style="animation:spin .7s linear infinite"></i>${txt}`; }
    else         { btn.disabled = false; btn.innerHTML = btn._orig || btn.innerHTML; }
  }

  // ── Form helpers ──────────────────────────────────────────
  function formData(form) {
    const d = {};
    form.querySelectorAll('[name]').forEach(el => {
      const v = el.value;
      d[el.name] = el.type === 'number' ? (v === '' ? '' : Number(v)) : v.trim?.() ?? v;
    });
    return d;
  }
  function resetForm(form) {
    form.reset();
    form.querySelectorAll('.field--error').forEach(f => f.classList.remove('field--error'));
    form.querySelectorAll('.field__error').forEach(e => e.remove());
  }

  // ── Date ──────────────────────────────────────────────────
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function fmtDate(s) {
    if (!s) return '—';
    const [y,m,d] = String(s).split('-');
    return `${y}/${m}/${d}`;
  }
  function monthISO() { return new Date().toISOString().slice(0, 7); }

  // ── Currency ──────────────────────────────────────────────
  function fmtMoney(n) { return '$' + Number(n||0).toLocaleString('zh-TW'); }
  function fmtNum(n)   { return Number(n||0).toLocaleString('zh-TW'); }

  // ── Color helpers ─────────────────────────────────────────
  function moneyClass(n) { return Number(n) >= 0 ? 'c-green' : 'c-red'; }

  return { toast, showLoading, hideLoading, btnLoad, formData, resetForm, todayISO, monthISO, fmtDate, fmtMoney, fmtNum, moneyClass };
})();
