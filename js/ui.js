// ============================================================
// ui.js — 共用 UI 工具（Toast、Loading、表單工具）
// ============================================================

const UI = (() => {

  // ── Toast 通知 ─────────────────────────────────────────────
  function toast(message, type = 'success', duration = 3000) {
    const existing = document.getElementById('ck-toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.id = 'ck-toast';
    el.className = `toast toast--${type}`;
    el.innerHTML = `
      <span class="toast__icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span class="toast__msg">${message}</span>
    `;
    document.body.appendChild(el);

    // 進場
    requestAnimationFrame(() => el.classList.add('toast--show'));

    // 退場
    setTimeout(() => {
      el.classList.remove('toast--show');
      setTimeout(() => el.remove(), 300);
    }, duration);
  }

  // ── 全頁 Loading ───────────────────────────────────────────
  function showLoading(message = '載入中…') {
    let mask = document.getElementById('ck-loading');
    if (!mask) {
      mask = document.createElement('div');
      mask.id = 'ck-loading';
      mask.className = 'loading-mask';
      mask.innerHTML = `
        <div class="loading-box">
          <div class="loading-spinner"></div>
          <p class="loading-msg"></p>
        </div>
      `;
      document.body.appendChild(mask);
    }
    mask.querySelector('.loading-msg').textContent = message;
    mask.style.display = 'flex';
  }

  function hideLoading() {
    const mask = document.getElementById('ck-loading');
    if (mask) mask.style.display = 'none';
  }

  // ── 按鈕 Loading 狀態 ─────────────────────────────────────
  function btnLoading(btn, loading, text = '處理中…') {
    if (loading) {
      btn.disabled = true;
      btn._origText = btn.textContent;
      btn.textContent = text;
    } else {
      btn.disabled = false;
      btn.textContent = btn._origText || btn.textContent;
    }
  }

  // ── 表單工具 ──────────────────────────────────────────────
  function getFormData(formEl) {
    const data = {};
    const elements = formEl.querySelectorAll('input, select, textarea');
    elements.forEach(el => {
      if (!el.name) return;
      if (el.type === 'checkbox') data[el.name] = el.checked;
      else if (el.type === 'number') data[el.name] = el.value === '' ? '' : Number(el.value);
      else data[el.name] = el.value.trim();
    });
    return data;
  }

  function resetForm(formEl) {
    formEl.reset();
    // 清除自訂 error 狀態
    formEl.querySelectorAll('.field--error').forEach(el => el.classList.remove('field--error'));
    formEl.querySelectorAll('.field__error-msg').forEach(el => el.remove());
  }

  function setFieldError(fieldEl, message) {
    fieldEl.classList.add('field--error');
    let msg = fieldEl.querySelector('.field__error-msg');
    if (!msg) {
      msg = document.createElement('p');
      msg.className = 'field__error-msg';
      const input = fieldEl.querySelector('input, select, textarea');
      if (input) input.after(msg);
    }
    msg.textContent = message;
  }

  function clearFieldErrors(formEl) {
    formEl.querySelectorAll('.field--error').forEach(el => el.classList.remove('field--error'));
    formEl.querySelectorAll('.field__error-msg').forEach(el => el.remove());
  }

  // ── 下拉選單動態產生 ──────────────────────────────────────
  function populateSelect(selectEl, items, valueKey, labelKey, placeholder = '請選擇') {
    selectEl.innerHTML = `<option value="">── ${placeholder} ──</option>`;
    items.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item[valueKey];
      opt.textContent = item[labelKey];
      selectEl.appendChild(opt);
    });
  }

  // ── 日期工具 ──────────────────────────────────────────────
  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function formatDate(isoStr) {
    if (!isoStr) return '—';
    const [y, m, d] = isoStr.split('-');
    return `${y}/${m}/${d}`;
  }

  function formatCurrency(num) {
    return '$' + Number(num || 0).toLocaleString('zh-TW');
  }

  // ── 確認對話框（原生 confirm 替代） ─────────────────────
  function confirm(message) {
    return window.confirm(message);
  }

  return {
    toast,
    showLoading,
    hideLoading,
    btnLoading,
    getFormData,
    resetForm,
    setFieldError,
    clearFieldErrors,
    populateSelect,
    todayISO,
    formatDate,
    formatCurrency,
    confirm,
  };
})();
