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

  // ── localStorage 快取（設定類資料）──────────────────────────
  // 用於 settings/stalls/ingredients/taskLibrary/dispatchers 等
  // 不常變動的設定資料，減少重複呼叫 API
  const CACHE_PREFIX  = 'ck_cache_';
  const CACHE_VERSION = 'v1'; // 改變此值可強制讓所有用戶端快取失效

  function cacheKey(key) { return CACHE_PREFIX + CACHE_VERSION + '_' + key; }

  /**
   * 寫入快取，附帶時間戳記
   */
  function cacheSet(key, value) {
    try {
      localStorage.setItem(cacheKey(key), JSON.stringify({
        ts: Date.now(),
        data: value,
      }));
    } catch (e) { /* localStorage 滿了或不可用，靜默失敗 */ }
  }

  /**
   * 讀取快取，超過 maxAgeMs 視為過期回傳 null
   * @param {string} key
   * @param {number} maxAgeMs - 預設 10 分鐘
   */
  function cacheGet(key, maxAgeMs = 10 * 60 * 1000) {
    try {
      const raw = localStorage.getItem(cacheKey(key));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts > maxAgeMs) return null;
      return parsed.data;
    } catch (e) { return null; }
  }

  function cacheClear(key) {
    try { localStorage.removeItem(cacheKey(key)); } catch (e) {}
  }

  /** 清除所有 ck_cache_ 開頭的快取（例如登出或強制重新整理時）*/
  function cacheClearAll() {
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith(CACHE_PREFIX))
        .forEach(k => localStorage.removeItem(k));
    } catch (e) {}
  }

  return {
    toast, showLoading, hideLoading, btnLoad, formData, resetForm,
    todayISO, monthISO, fmtDate, fmtMoney, fmtNum, moneyClass,
    cacheSet, cacheGet, cacheClear, cacheClearAll,
  };
})();
