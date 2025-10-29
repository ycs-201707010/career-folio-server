const express = require("express");
const router = express.Router();
const pool = require("../db");
const { protect } = require("../middleware/authMiddleWare.js");

// 1. 수강생용 강좌 상세 정보 조회 (영상 URL, 수강 기록 포함)
// GET /api/learn/course/:courseId
router.get("/course/:courseId", protect, async (req, res) => {
  const { courseId } = req.params;
  const user_idx = req.user.userIdx;

  // ▼▼▼ 로그 추가 ▼▼▼
  console.log(`[DEBUG] learn/course API called`);
  console.log(`[DEBUG] User Index from Token: ${user_idx}`);
  console.log(`[DEBUG] Course ID from URL: ${courseId}`);
  // ▲▲▲ 로그 추가 ▲▲▲

  try {
    // 1. 사용자가 이 강좌를 수강 중인지 확인
    const [enrollments] = await pool.query(
      `SELECT * FROM enrollments WHERE user_idx = ? AND course_idx = ?`,
      [user_idx, courseId]
    );

    // ▼▼▼ 로그 추가 ▼▼▼
    console.log(
      `[DEBUG] Enrollment query result (length): ${enrollments.length}`
    );
    // ▲▲▲ 로그 추가 ▲▲▲

    if (enrollments.length === 0) {
      return res.status(403).json({ message: "수강 중인 강좌가 아닙니다." });
    }
    const enrollment_idx = enrollments[0].idx;

    // 2. 강좌 기본 정보 및 커리큘럼 조회
    const [courses] = await pool.query(`SELECT * FROM courses WHERE idx = ?`, [
      courseId,
    ]);
    const course = courses[0];
    const [sections] = await pool.query(
      "SELECT * FROM sections WHERE course_idx = ? ORDER BY `order` ASC",
      [courseId]
    );

    // 3. 모든 강의 및 각 강의에 대한 사용자의 수강 기록(progress)을 함께 조회 (LEFT JOIN)
    for (const section of sections) {
      const [lectures] = await pool.query(
        `SELECT 
                    l.*, 
                    lp.watched_seconds, 
                    lp.is_completed
                 FROM lectures l
                 LEFT JOIN lecture_progress lp ON l.idx = lp.lecture_idx AND lp.enrollment_idx = ?
                 WHERE l.section_idx = ? 
                 ORDER BY l.order ASC`,
        [enrollment_idx, section.idx]
      );
      section.lectures = lectures;
    }

    res.json({ ...course, sections });
  } catch (error) {
    console.error("학습용 강좌 데이터 조회 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 2. 강의 시청 진행률 업데이트
// POST /api/learn/progress
router.post("/progress", protect, async (req, res) => {
  const { lectureId, watchedSeconds } = req.body;
  const user_idx = req.user.userIdx;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. enrollment_idx와 lecture의 duration_seconds 찾기
    const [lectureInfo] = await connection.query(
      `SELECT s.course_idx, l.duration_seconds 
             FROM lectures l 
             JOIN sections s ON l.section_idx = s.idx
             WHERE l.idx = ?`,
      [lectureId]
    );
    if (lectureInfo.length === 0)
      throw new Error("강의 정보를 찾을 수 없습니다.");

    const { course_idx, duration_seconds } = lectureInfo[0];

    const [enrollments] = await connection.query(
      `SELECT idx FROM enrollments WHERE user_idx = ? AND course_idx = ?`,
      [user_idx, course_idx]
    );
    if (enrollments.length === 0)
      throw new Error("수강 정보를 찾을 수 없습니다.");

    const enrollment_idx = enrollments[0].idx;

    // 2. lecture_progress 테이블에 기록 업데이트 또는 생성 (UPSERT)
    const isCompleted = watchedSeconds / duration_seconds >= 0.9; // 90% 이상 시청 시 완료
    await connection.query(
      `INSERT INTO lecture_progress (enrollment_idx, lecture_idx, watched_seconds, is_completed)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE watched_seconds = VALUES(watched_seconds), is_completed = VALUES(is_completed)`,
      [enrollment_idx, lectureId, watchedSeconds, isCompleted]
    );

    // 3. 전체 강좌 진행률(progress_percent) 재계산 및 업데이트
    const [progressStats] = await connection.query(
      `SELECT 
                (SELECT COUNT(*) FROM lectures l JOIN sections s ON l.section_idx = s.idx WHERE s.course_idx = ?) as total_lectures,
                (SELECT COUNT(*) FROM lecture_progress lp JOIN lectures l ON lp.lecture_idx = l.idx JOIN sections s ON l.section_idx = s.idx WHERE lp.enrollment_idx = ? AND lp.is_completed = 1) as completed_lectures`,
      [course_idx, enrollment_idx]
    );

    const { total_lectures, completed_lectures } = progressStats[0];
    const newProgressPercent =
      total_lectures > 0
        ? Math.round((completed_lectures / total_lectures) * 100)
        : 0;

    await connection.query(
      `UPDATE enrollments SET progress_percent = ? WHERE idx = ?`,
      [newProgressPercent, enrollment_idx]
    );

    await connection.commit();
    res.json({ message: "진행률이 저장되었습니다.", newProgressPercent });
  } catch (error) {
    await connection.rollback();
    console.error("진행률 업데이트 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  } finally {
    connection.release();
  }
});

module.exports = router;
