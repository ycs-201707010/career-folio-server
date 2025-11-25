// services/activity.service.js
const pool = require("../db");

/**
 * 사용자의 활동을 user_activities 테이블에 기록합니다.
 * (이 함수는 메인 로직을 방해하지 않도록 비동기적으로 실행하고, 에러를 조용히 처리합니다.)
 * * @param {number} user_idx - 활동한 사용자 ID
 * @param {string} activity_type - 활동 타입 ('question', 'answer', 'lecture_complete' 등)
 * @param {number|null} target_idx - (선택) 대상 ID (질문 번호, 강의 번호 등)
 */
const logActivity = async (user_idx, activity_type, target_idx = null) => {
  try {
    await pool.query(
      `INSERT INTO user_activities (user_idx, activity_type, target_idx) VALUES (?, ?, ?)`,
      [user_idx, activity_type, target_idx]
    );
    // console.log(`[Activity] Logged: User ${user_idx} -> ${activity_type}`);
  } catch (error) {
    // 로그 기록 실패는 메인 기능(질문 등록, 강의 완료 등)을 멈추면 안 되므로
    // 에러를 console에만 찍고 throw 하지 않습니다.
    console.error(`[Activity Error] Failed to log activity:`, error);
  }
};

module.exports = {
  logActivity,
};
