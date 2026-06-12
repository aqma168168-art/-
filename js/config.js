// ============================================================
// config.js — 全域設定
// 部署前請修改 APPS_SCRIPT_URL 為你的 Apps Script 網址
// ============================================================

const CK_CONFIG = {
  // ▼ 部署後請將這裡換成你的 Apps Script Web App URL
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbwxMNk8ud0gWUcP4iQJG0hNDKUSEXysCHV171JHVNKW9f6ON6xto9D9eeg4UOjN9NiLjQ/exec',

  // 版本
  VERSION: '1.0.0',

  // 每頁預設筆數
  DEFAULT_PAGE_SIZE: 50,

  // 日期格式
  DATE_FORMAT: 'zh-TW',
};

// 開發模式：設為 true 時，API 失敗會顯示詳細錯誤
CK_CONFIG.DEV_MODE = window.location.hostname === 'localhost' ||
                     window.location.hostname === '127.0.0.1';
