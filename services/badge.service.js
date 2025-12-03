const pool = require("../db");
// 👇 [신규] 알림 서비스 가져오기
const { createNotification } = require("./notification.service");

/**
 * 뱃지 부여 (중복 체크 + 알림 발송)
 */
const awardBadge = async (user_idx, badge_code) => {
  let connection;
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1. 뱃지 정보 조회
    const [[badge]] = await connection.query(
      "SELECT idx, badge_name FROM badges WHERE badge_code = ?",
      [badge_code]
    );

    if (!badge) {
      console.warn(`[Badge] 존재하지 않는 뱃지 코드: ${badge_code}`);
      await connection.rollback();
      return;
    }

    // 2. 이미 획득했는지 확인
    const [[existing]] = await connection.query(
      "SELECT idx FROM user_badges WHERE user_idx = ? AND badge_idx = ?",
      [user_idx, badge.idx]
    );

    if (existing) {
      await connection.rollback();
      return; // 이미 획득했으면 조용히 종료
    }

    // 3. 뱃지 부여 (INSERT)
    await connection.query(
      "INSERT INTO user_badges (user_idx, badge_idx) VALUES (?, ?)",
      [user_idx, badge.idx]
    );

    await connection.commit();
    console.log(
      `[Badge] ✨ User ${user_idx} -> 뱃지 획득: ${badge.badge_name}`
    );

    // --- 👇 [핵심 추가] 알림 발송 ---
    // (트랜잭션 밖에서 실행해도 됨)
    await createNotification(
      user_idx,
      "badge",
      `🎉 축하합니다! [${badge.badge_name}] 뱃지를 획득하셨습니다!`,
      `/profile/${user_idx}` // 클릭 시 내 프로필로 이동
    );
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(`[Badge Error] ${badge_code} 부여 실패:`, error);
  } finally {
    if (connection) connection.release();
  }
};

module.exports = { awardBadge };
