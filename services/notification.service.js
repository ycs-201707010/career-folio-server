const pool = require("../db");

/**
 * 알림 생성 함수 (비동기 fire-and-forget 권장)
 * @param {number} user_idx - 알림 받을 유저 ID
 * @param {string} type - 타입 ('answer', 'badge', etc.)
 * @param {string} message - 표시할 메시지
 * @param {string} url - 이동할 링크 (옵션)
 */
const createNotification = async (user_idx, type, message, url = null) => {
  try {
    await pool.query(
      `INSERT INTO notifications (user_idx, type, message, url) VALUES (?, ?, ?, ?)`,
      [user_idx, type, message, url]
    );
    // (나중에 여기에 WebSocket이나 FCM을 연동하면 실시간 푸시 알림도 가능합니다)
  } catch (error) {
    console.error(
      `[Notification Error] User ${user_idx} 알림 생성 실패:`,
      error
    );
  }
};

module.exports = { createNotification };
