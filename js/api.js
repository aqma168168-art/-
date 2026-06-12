// ============================================================
// api.js — 所有對 Google Apps Script 的 API 呼叫 v1.2
//
// 角色機制：
//   STAFF API      → 不帶 owner_token，後端直接放行
//   OWNER_ONLY API → 自動帶 AUTH.getOwnerToken()，後端驗證
//   若後端回傳 code:'UNAUTHORIZED'，自動導回登入頁
// ============================================================

const API = (() => {

  // ── 哪些 action 需要帶 owner_token ────────────────────────
  const OWNER_ACTIONS = new Set([
    'getInventory',
    'getKitchenCosts',
    'saveKitchenCost',
    'getStallCosts',
    'saveStallCost',
    'getProfitSummary',
  ]);

  // ── 核心 fetch ────────────────────────────────────────────
  async function call(action, params = {}, body = null) {
    const url = new URL(CK_CONFIG.APPS_SCRIPT_URL);
    url.searchParams.set('action', action);

    // 老闆專用 action → 帶 token 進 URL 參數（GET 與 POST 都帶）
    if (OWNER_ACTIONS.has(action)) {
      const token = typeof AUTH !== 'undefined' ? AUTH.getOwnerToken() : '';
      if (token) url.searchParams.set('owner_token', token);
    }

    Object.entries(params).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, v);
    });

    const options = { method: body ? 'POST' : 'GET', redirect: 'follow' };

    if (body) {
      // POST body 也一併帶 owner_token（雙保險）
      const payload = { action, ...body };
      if (OWNER_ACTIONS.has(action)) {
        const token = typeof AUTH !== 'undefined' ? AUTH.getOwnerToken() : '';
        if (token) payload.owner_token = token;
      }
      options.headers = { 'Content-Type': 'application/json' };
      options.body    = JSON.stringify(payload);
    }

    const res  = await fetch(url.toString(), options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    // 後端拒絕（UNAUTHORIZED）→ 導回登入頁
    if (!data.success && data.code === 'UNAUTHORIZED') {
      if (typeof AUTH !== 'undefined') AUTH.logoutOwner();
      throw new Error('權限不足，請重新登入');
    }

    if (!data.success) throw new Error(data.error || '伺服器回傳錯誤');
    return data;
  }

  // ── 公開方法（與 ROUTE_ROLES 對應）──────────────────────

  // PUBLIC / STAFF
  async function getSettings()            { return call('getSettings'); }
  async function getStalls()              { return call('getStalls'); }
  async function getIngredients()         { return call('getIngredients'); }
  async function getDispatches(date, sid) { return call('getDispatches', { date, stall_id: sid }); }
  async function saveDispatch(data)       { return call('saveDispatch', {}, data); }
  async function getReports(date, sid)    { return call('getReports', { date, stall_id: sid }); }
  async function saveReport(data)         { return call('saveReport', {}, data); }
  async function saveInventoryLog(data)   { return call('saveInventoryLog', {}, data); }

  // OWNER_ONLY（自動帶 token，後端驗證）
  async function getInventory()             { return call('getInventory'); }
  async function getKitchenCosts(date, mon) { return call('getKitchenCosts', { date, month: mon }); }
  async function saveKitchenCost(data)      { return call('saveKitchenCost', {}, data); }
  async function getStallCosts(date, sid)   { return call('getStallCosts', { date, stall_id: sid }); }
  async function saveStallCost(data)        { return call('saveStallCost', {}, data); }
  async function getProfitSummary(date)     { return call('getProfitSummary', { date }); }

  return {
    call,
    getSettings, getStalls, getIngredients,
    getDispatches, saveDispatch,
    getReports, saveReport,
    saveInventoryLog,
    getInventory,
    getKitchenCosts, saveKitchenCost,
    getStallCosts, saveStallCost,
    getProfitSummary,
  };
})();
