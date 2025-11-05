const pool = require("../db"); // 1. db.js에서 커넥션 풀 가져오기

/**
 * user_idx로 사용자의 모든 프로필 정보를 조회합니다.
 */
const fetchProfileData = async (user_idx) => {
  const connection = await pool.getConnection();

  try {
    // 1. 기본 프로필 조회
    const [profileRows] = await pool.query(
      `SELECT 
         u.name AS username, 
         p.*, 
         -- 1. 만약 p.resume_email이 NULL이면, u.email을 'email'이라는 별명으로 사용
         COALESCE(p.resume_email, u.email) AS email,
         -- 2. 만약 p.resume_phone이 NULL이면, u.phone_number를 'phone'이라는 별명으로 사용
         COALESCE(p.resume_phone, u.phone_number) AS phone,
         -- 3. [Turn 55 수정] p.address를 'address' 별명으로 사용
         p.address AS address
       FROM users u
       LEFT JOIN user_profile p ON u.idx = p.user_idx 
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
