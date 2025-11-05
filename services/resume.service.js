const pool = require("../db");

/**
 * 날짜 문자열(ISO)을 'YYYY-MM-DD' 형식으로 변환합니다.
 * 날짜가 없거나(null) 비어있으면(undefined, "") null을 반환합니다.
 */
const formatDateForMySQL = (dateString) => {
  if (!dateString) {
    return null;
  }
  try {
    // '2020-03-01T15:00:00.000Z' -> '2020-03-01'
    return dateString.split("T")[0];
  } catch (e) {
    // 혹시 모를 잘못된 형식 방어
    console.error(`Invalid date string format: ${dateString}`, e);
    return null;
  }
};

/**
 * 이력서 전체 데이터를 트랜잭션으로 일괄 업데이트합니다.
 */
const bulkUpdateResume = async (user_idx, resumeData) => {
  const { profile, experiences, educations, projects, skills } = resumeData;
  let connection;

  try {
    // 1. 커넥션 연결 후 트랜젝션 시작
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 프로필 정보 처리
    // (이력서 빌더에서 수정할 수 있는 항목만 업데이트)
    if (profile) {
      await connection.query(
        `UPDATE user_profile SET 
          nickname = ?, bio = ?, 
          resume_photo_url = ?,   -- 👈 추가
          resume_title = ?,     -- 👈 추가
          introduction = ?,      -- 👈 추가
          address = ?,
          resume_email = ?,   -- 👈 추가
          resume_phone = ?    -- 👈 추가
         WHERE user_idx = ?`,
        [
          profile.nickname,
          profile.bio,
          profile.resume_photo_url,
          profile.resume_title,
          profile.introduction,
          profile.address,
          profile.email, // 👈 'profile.email'이 'resume_email'로 저장됨
          profile.phone, // 👈 'profile.phone'이 'resume_phone'으로 저장됨
          user_idx,
        ]
      );
    }

    // --- 2. 경력(Experiences) 처리 ---
    // 2-1. 프론트에서 받은 기존 경력 ID 목록
    const incomingExpIds = experiences
      .filter((exp) => exp.idx)
      .map((exp) => exp.idx);

    // 2-2. DB에서 삭제 (프론트에서 넘어오지 않은 항목들)
    const deleteExpSql =
      "DELETE FROM experiences WHERE user_idx = ? AND idx NOT IN (?)";
    if (incomingExpIds.length > 0) {
      await connection.query(deleteExpSql, [user_idx, incomingExpIds]);
    } else {
      // 넘어온 기존 경력이 없으면 모두 삭제
      await connection.query("DELETE FROM experiences WHERE user_idx = ?", [
        user_idx,
      ]);
    }

    // 2-3. 추가(INSERT) 및 수정(UPDATE)
    if (experiences.length > 0) {
      const expValues = experiences.map((exp) => [
        exp.idx || null, // 새 항목은 idx가 null
        user_idx,
        exp.company_name,
        exp.position,
        formatDateForMySQL(exp.start_date),
        formatDateForMySQL(exp.end_date),
        exp.description,
      ]);

      const expSql = `
        INSERT INTO experiences (idx, user_idx, company_name, position, start_date, end_date, description)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          company_name = VALUES(company_name),
          position = VALUES(position),
          start_date = VALUES(start_date),
          end_date = VALUES(end_date),
          description = VALUES(description)
      `;
      await connection.query(expSql, [expValues]);
    }

    // --- 3. 학력(Educations) 처리 ---
    // (경력과 동일한 패턴으로 삭제 및 C-U 로직 수행)
    const incomingEduIds = educations
      .filter((edu) => edu.idx)
      .map((edu) => edu.idx);
    const deleteEduSql =
      "DELETE FROM educations WHERE user_idx = ? AND idx NOT IN (?)";
    if (incomingEduIds.length > 0) {
      await connection.query(deleteEduSql, [user_idx, incomingEduIds]);
    } else {
      await connection.query("DELETE FROM educations WHERE user_idx = ?", [
        user_idx,
      ]);
    }
    if (educations.length > 0) {
      const eduValues = educations.map((edu) => [
        edu.idx || null,
        user_idx,
        edu.institution_name,
        edu.degree,
        edu.major,
        formatDateForMySQL(edu.start_date),
        formatDateForMySQL(edu.end_date),
      ]);
      const eduSql = `INSERT INTO educations (idx, user_idx, institution_name, degree, major, start_date, end_date) VALUES ? ON DUPLICATE KEY UPDATE institution_name=VALUES(institution_name), degree=VALUES(degree), major=VALUES(major), start_date=VALUES(start_date), end_date=VALUES(end_date)`;
      await connection.query(eduSql, [eduValues]);
    }

    // --- 4. 프로젝트(Projects) 처리 ---
    // (동일 패턴)
    const incomingProjIds = projects
      .filter((proj) => proj.idx)
      .map((proj) => proj.idx);
    const deleteProjSql =
      "DELETE FROM projects WHERE user_idx = ? AND idx NOT IN (?)";
    if (incomingProjIds.length > 0) {
      await connection.query(deleteProjSql, [user_idx, incomingProjIds]);
    } else {
      await connection.query("DELETE FROM projects WHERE user_idx = ?", [
        user_idx,
      ]);
    }
    if (projects.length > 0) {
      const projValues = projects.map((proj) => [
        proj.idx || null,
        user_idx,
        proj.project_name,
        proj.description,
        formatDateForMySQL(proj.start_date),
        formatDateForMySQL(proj.end_date),
        proj.project_url,
      ]);
      const projSql = `INSERT INTO projects (idx, user_idx, project_name, description, start_date, end_date, project_url) VALUES ? ON DUPLICATE KEY UPDATE project_name=VALUES(project_name), description=VALUES(description), start_date=VALUES(start_date), end_date=VALUES(end_date), project_url=VALUES(project_url)`;
      await connection.query(projSql, [projValues]);
    }

    // --- 5. 스킬(Skills) 처리 ---
    // (동일 패턴)
    const incomingSkillIds = skills
      .filter((skill) => skill.idx)
      .map((skill) => skill.idx);
    const deleteSkillSql =
      "DELETE FROM skills WHERE user_idx = ? AND idx NOT IN (?)";
    if (incomingSkillIds.length > 0) {
      await connection.query(deleteSkillSql, [user_idx, incomingSkillIds]);
    } else {
      await connection.query("DELETE FROM skills WHERE user_idx = ?", [
        user_idx,
      ]);
    }
    if (skills.length > 0) {
      const skillValues = skills.map((skill) => [
        skill.idx || null,
        user_idx,
        skill.skill_name,
        skill.category,
      ]);
      const skillSql = `INSERT INTO skills (idx, user_idx, skill_name, category) VALUES ? ON DUPLICATE KEY UPDATE skill_name=VALUES(skill_name), category=VALUES(category)`;
      await connection.query(skillSql, [skillValues]);
    }

    // --- 6. 모든 쿼리 성공 시 커밋(Commit) ---
    await connection.commit();
  } catch (error) {
    // --- 7. 에러 발생 시 롤백(Rollback) ---
    await connection.rollback();
    console.error("이력서 벌크 업데이트 트랜잭션 실패:", error);
    throw new Error("데이터베이스 저장에 실패했습니다.");
  } finally {
    // 8. 커넥션 반환
    connection.release();
  }
};

module.exports = {
  bulkUpdateResume,
};
