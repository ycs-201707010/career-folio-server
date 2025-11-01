const pool = require("../db"); // 1. db.js에서 커넥션 풀 가져오기

/**
 * user_idx로 사용자의 모든 프로필 정보를 조회합니다.
 */
const fetchProfileData = async (user_idx) => {
  const connection = await pool.getConnection();

  try {
    // 1. 기본 프로필 조회
    const [profileRows] = await connection.query(
      `SELECT 
         u.username, u.email, u.phone, u.address,  -- 👈 users 테이블의 계정 정보
         p.* -- 👈 profile 테이블의 모든 정보
       FROM users u
       JOIN user_profile p ON u.idx = p.user_idx 
       WHERE u.idx = ?`,
      [user_idx]
    );
    const profile = profileRows[0];

    if (!profile) {
      throw new Error("프로필을 찾을 수 없습니다.");
    }

    // 2. 나머지 항목들을 병렬로 조회 (Promise.all)
    const [[experiences], [educations], [projects], [skills]] =
      await Promise.all([
        connection.query("SELECT * FROM experiences WHERE user_idx = ?", [
          user_idx,
        ]),
        connection.query("SELECT * FROM educations WHERE user_idx = ?", [
          user_idx,
        ]),
        connection.query("SELECT * FROM projects WHERE user_idx = ?", [
          user_idx,
        ]),
        connection.query("SELECT * FROM skills WHERE user_idx = ?", [user_idx]),
      ]);

    // 3. 프론트엔드가 원하는 { profile, experiences, ... } 형태로 조합
    return { profile, experiences, educations, projects, skills };
  } catch (error) {
    console.error("프로필 데이터 조회 서비스 실패:", error);
    throw error; // 에러를 라우터로 전달
  } finally {
    connection.release(); // 4. 커넥션 반환
  }
};

// 2. module.exports로 함수 내보내기
module.exports = {
  fetchProfileData,
};
