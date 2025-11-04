const pool = require("../db");

/**
 * 특정 뱃지를 획득했는지 확인하고, 없으면 새로 추가(부여)합니다.
 * @param {number} user_idx - 사용자 ID
 * @param {string} badge_code - 부여할 뱃지의 고유 코드 (예: 'FIRST_ANSWER')
 */
const awardBadge = async (user_idx, badge_code) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. 뱃지 카탈로그에서 badge_idx를 찾습니다.
    const [[badge]] = await connection.query(
      "SELECT idx FROM badges WHERE badge_code = ?",
      [badge_code]
    );

    if (!badge) {
      console.warn(
        `[BadgeService] 뱃지 코드를 찾을 수 없습니다: ${badge_code}`
      );
      await connection.rollback();
      return;
    }

    const badge_idx = badge.idx;

    // 2. 이미 획득한 뱃지인지 확인합니다. (UNIQUE KEY 덕분에 INSERT IGNORE로도 가능)
    const [[existing]] = await connection.query(
      "SELECT idx FROM user_badges WHERE user_idx = ? AND badge_idx = ?",
      [user_idx, badge_idx]
    );

    if (existing) {
      // 3. 이미 획득했다면 아무것도 하지 않습니다.
      console.log(
        `[BadgeService] User ${user_idx}는 이미 ${badge_code} 뱃지를 보유중입니다.`
      );
      await connection.rollback();
      return;
    }

    // 4. 새 뱃지를 획득시킵니다.
    await connection.query(
      "INSERT INTO user_badges (user_idx, badge_idx) VALUES (?, ?)",
      [user_idx, badge_idx]
    );

    await connection.commit();
    console.log(
      `[BadgeService] ✨ User ${user_idx}가 ${badge_code} 뱃지를 획득했습니다!`
    );
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(
      `[BadgeService] 뱃지 부여 실패 (User: ${user_idx}, Badge: ${badge_code}):`,
      error
    );
  } finally {
    if (connection) connection.release();
  }
};

module.exports = {
  awardBadge,
};
