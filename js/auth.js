// ============================================================
// auth.js — 身份驗證模組 v1.2
//
// 安全機制說明：
// 1. 員工端：不需要任何 token，可呼叫 STAFF 級 API
// 2. 老闆端：登入後取得 owner_token（= SHA-256(PIN:日期)）
//            每天午夜自動失效
//            每次 OWNER_ONLY API 呼叫都帶上此 token
//            後端獨立驗證，前端移除 token 不影響後端拒絕
// ============================================================

const AUTH = (() => {

  const SESSION_KEY    = 'ck_owner_session';
  const TOKEN_KEY      = 'ck_owner_token';
  const SESSION_TTL    = 8 * 60 * 60 * 1000; // 8 小時

  // ── session 讀寫 ───────────────────────────────────────────
  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
  }
  function writeSession(token) {
    const s = { authed: true, ts: Date.now(), token };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }
  function clearSession() {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }

  // ── 公開方法 ───────────────────────────────────────────────

  /** 老闆 session 是否有效（含 TTL 檢查） */
  function isOwnerAuthed() {
    const s = readSession();
    if (!s || !s.authed || !s.token) return false;
    if (Date.now() - s.ts > SESSION_TTL) { clearSession(); return false; }
    return true;
  }

  /**
   * 取得 owner_token（供 api.js 帶入每次請求）
   * 未登入則回傳空字串
   */
  function getOwnerToken() {
    if (!isOwnerAuthed()) return '';
    return readSession()?.token || '';
  }

  /**
   * 用 PIN 登入老闆端
   * 成功時後端回傳 owner_token，儲存於 sessionStorage
   */
  async function loginOwner(pin) {
    if (!pin || pin.trim() === '') return false;
    try {
      const res = await API.call('verifyPin', {}, { pin: pin.trim() });
      if (res.success && res.verified && res.owner_token) {
        writeSession(res.owner_token);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[AUTH] PIN 驗證失敗:', err);
      return false;
    }
  }

  /** 登出老闆端 */
  function logoutOwner() {
    clearSession();
    window.location.href = 'login.html';
  }

  /**
   * 老闆頁面守衛：每頁頂端呼叫。
   * 未登入立即導回 login.html。
   */
  function requireOwner() {
    if (!isOwnerAuthed()) {
      window.location.replace('login.html?redirect=owner');
    }
  }

  /** 使用者有互動時刷新 session 計時 */
  function refreshSession() {
    const s = readSession();
    if (!s || !s.token) return;
    writeSession(s.token);
  }

  return {
    isOwnerAuthed,
    getOwnerToken,
    loginOwner,
    logoutOwner,
    requireOwner,
    refreshSession,
  };
})();
