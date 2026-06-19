// ============================================================
// api.js — 所有對 Google Apps Script 的 API 呼叫 v1.2
//
// 角色機制：
//   STAFF API      → 不帶 owner_token，後端直接放行
//   OWNER_ONLY API → 自動帶 AUTH.getOwnerToken()，後端驗證
//   若後端回傳 code:'UNAUTHORIZED'，自動導回登入頁
// ============================================================

const API = (() => {

  // ── 哪些 action 需要帶 owner_token（暫時停用，PIN 驗證關閉中）──
  const OWNER_ACTIONS = new Set([]); // 暫時清空，所有 API 直接可用

  // ── 核心 fetch ────────────────────────────────────────────
  async function call(action, params = {}, body = null) {
    const url = new URL(CK_CONFIG.APPS_SCRIPT_URL);
    url.searchParams.set('action', action);

    Object.entries(params).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, v);
    });

    let options;
    if (body) {
      const payload = { action, ...body };
      options = {
        method: 'POST',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify(payload),
      };
    } else {
      options = { method: 'GET', redirect: 'follow' };
    }

    const res  = await fetch(url.toString(), options);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
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

  // 廚房初始化：一次拿回所有設定 + 今日配發 + 庫存
  async function getKitchenInit(date) {
    return call('getKitchenInit', { date });
  }

  // 月度成本設定 & 休息記錄
  async function getMonthlyCost(month)      { return call('getMonthlyCost',  { month }); }
  async function saveMonthlyCost(data)      { return call('saveMonthlyCost', {}, data); }
  async function getClosureLogs(date, month){ return call('getClosureLogs',  { date, month }); }
  async function saveClosure(data)          { return call('saveClosure',      {}, data); }
  async function deleteClosure(id)          { return call('deleteClosure',    {}, { id }); }
  async function getMonthSummary(month)     { return call('getMonthSummary', { month }); }
  async function getMonthlyReport(month)    { return call('getMonthlyReport', { month }); }
  async function saveActualRevenue(id, amount) { return call('saveActualRevenue', {}, { id, actual_revenue: amount }); }

  // 工作項目庫 & 新增週計畫任務
  async function getTaskLibrary()    { return call('getTaskLibrary'); }
  async function saveWeeklyTask(data){ return call('saveWeeklyTask', {}, data); }

  // 週計畫
  async function getWeeklyPlan(week, month) { return call('getWeeklyPlan', { week, month }); }
  async function saveWeeklyPlanStatus(data)  { return call('saveWeeklyPlanStatus', {}, data); }

  // 廚房報廢
  async function getWasteLogs(date, month) { return call('getWasteLogs', { date, month }); }
  async function saveWasteLog(data)         { return call('saveWasteLog', {}, data); }

  // 攤位阿姨表單選項（一次拿回所有選單設定）
  async function getStallFormOptions() { return call('getStallFormOptions'); }

  // ── 刪除功能 ──────────────────────────────────────────────
  async function deleteReport(id)        { return call('deleteReport',      {}, { id }); }
  async function deleteDispatch(id)      { return call('deleteDispatch',    {}, { id }); }
  async function deleteKitchenCost(id)   { return call('deleteKitchenCost', {}, { id }); }
  async function deleteStallCost(id)     { return call('deleteStallCost',   {}, { id }); }
  async function deleteWasteLog(id)      { return call('deleteWasteLog',    {}, { id }); }
  async function deleteWeeklyTask(task_id){ return call('deleteWeeklyTask', {}, { task_id }); }
  async function deletePerson(name, listType) {
    return call('deletePerson', {}, { name, list_type: listType });
  }

  // OWNER — 一次拿完所有資料
  async function getOwnerDashboard(date) {
    return call('getOwnerDashboard', { date });
  }

  return {
    call,
    getMonthlyCost, saveMonthlyCost,
    getClosureLogs, saveClosure, deleteClosure,
    getMonthSummary,
    getMonthlyReport,
    saveActualRevenue,
    getOwnerDashboard,
    getKitchenInit,
    getStallFormOptions,
    deleteReport, deleteDispatch, deleteKitchenCost, deleteStallCost,
    deleteWasteLog, deleteWeeklyTask, deletePerson,
    getTaskLibrary, saveWeeklyTask,
    getWeeklyPlan, saveWeeklyPlanStatus,
    getWasteLogs,  saveWasteLog,
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
