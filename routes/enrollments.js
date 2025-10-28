// ** 결제 관련 라우터 **

const express = require("express");
const router = express.Router();
const pool = require("../db");
const { protect } = require("../middleware/authMiddleWare.js");

// 내 수강 목록 조회 API
// GET /api/enrollments/my
router.get("/my", protect, async (req, res) => {
  const user_idx = req.user.userIdx;
  const connection = await pool.getConnection(); // 트랜잭션 또는 다중 쿼리를 위해 connection 사용

  try {
    // 1. 사용자가 수강 중인 강좌 목록 기본 정보 조회 (enrollment idx 포함)
    const [enrollments] = await connection.query(
      `SELECT 
                e.idx as enrollment_idx, e.course_idx, e.progress_percent as stored_progress,
                c.title, c.thumbnail_url,
                u.name as instructor_name
             FROM enrollments e
             JOIN courses c ON e.course_idx = c.idx
             JOIN users u ON c.instructor_idx = u.idx
             WHERE e.user_idx = ?
             ORDER BY e.enrolled_at DESC`,
      [user_idx]
    );

    if (enrollments.length === 0) {
      await connection.release();
      return res.json([]); // 빈 배열 반환
    }

    // 2. 각 수강 건에 대해 최신 진행률 계산 및 업데이트
    const updatedEnrollments = await Promise.all(
      enrollments.map(async (enrollment) => {
        const { enrollment_idx, course_idx, stored_progress } = enrollment;

        // 2-1. 해당 강좌의 현재 총 강의 수 계산
        const [lectureCountResult] = await connection.query(
          `SELECT COUNT(l.idx) as total_lectures 
                 FROM lectures l JOIN sections s ON l.section_idx = s.idx 
                 WHERE s.course_idx = ?`,
          [course_idx]
        );
        const total_lectures = lectureCountResult[0].total_lectures;

        // 2-2. 해당 수강 건의 완료된 강의 수 계산
        const [completedCountResult] = await connection.query(
          `SELECT COUNT(*) as completed_lectures 
                 FROM lecture_progress 
                 WHERE enrollment_idx = ? AND is_completed = 1`,
          [enrollment_idx]
        );
        const completed_lectures = completedCountResult[0].completed_lectures;

        // 2-3. 최신 진행률 계산
        const current_progress =
          total_lectures > 0
            ? Math.round((completed_lectures / total_lectures) * 100)
            : 0;

        // 2-4. DB에 저장된 값과 다르면 업데이트
        if (current_progress !== stored_progress) {
          console.log(
            `Progress mismatch for enrollment ${enrollment_idx}: DB=${stored_progress}, Calculated=${current_progress}. Updating DB.`
          );
          await connection.query(
            `UPDATE enrollments SET progress_percent = ? WHERE idx = ?`,
            [current_progress, enrollment_idx]
          );
        }

        // 최종적으로 반환할 객체에 계산된 최신 진행률 포함
        return {
          ...enrollment, // enrollment_idx, course_idx 등 포함
          progress_percent: current_progress, // stored_progress 대신 최신 값 사용
        };
      })
    );

    res.json(updatedEnrollments);
  } catch (error) {
    console.error("내 수강 목록 조회 오류 (진행률 계산 포함):", error);
    res.status(500).json({ message: "서버 오류" });
  } finally {
    if (connection) connection.release(); // 사용 후 반드시 connection 반환
  }
});

// 무료 강좌 즉시 수강 신청 API
// POST /api/enrollments/free
router.post("/free", protect, async (req, res) => {
  const { courseId } = req.body;
  const user_idx = req.user.userIdx;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. 강좌 정보 확인 (정말로 무료 강좌인지 서버에서 한번 더 확인)
    const [courses] = await connection.query(
      "SELECT price, discount_price FROM courses WHERE idx = ?",
      [courseId]
    );

    if (courses.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: "강좌를 찾을 수 없습니다." });
    }

    const course = courses[0];
    const isFree = course.price == 0 || course.discount_price == 0;

    if (!isFree) {
      await connection.rollback();
      return res.status(400).json({ message: "무료 강좌가 아닙니다." });
    }

    // 2. 이미 수강 중인지 확인
    const [existingEnrollment] = await connection.query(
      "SELECT * FROM enrollments WHERE user_idx = ? AND course_idx = ?",
      [user_idx, courseId]
    );

    if (existingEnrollment.length > 0) {
      await connection.rollback();
      return res.status(409).json({ message: "이미 수강 신청한 강좌입니다." });
    }

    // 3. 수강 신청 정보 생성 (enrollments 테이블에 INSERT)
    await connection.query(
      "INSERT INTO enrollments (user_idx, course_idx) VALUES (?, ?)",
      [user_idx, courseId]
    );

    // 4. 강좌의 수강생 수 1 증가 (courses 테이블 UPDATE)
    await connection.query(
      "UPDATE courses SET enrollment_count = enrollment_count + 1 WHERE idx = ?",
      [courseId]
    );

    await connection.commit();
    res.status(201).json({
      message: "수강 신청이 완료되었습니다. 바로 학습을 시작할 수 있습니다.",
    });
  } catch (error) {
    await connection.rollback();
    console.error("무료 수강 신청 오류:", error);
    res.status(500).json({ message: "서버 오류가 발생했습니다." });
  } finally {
    connection.release();
  }
});

module.exports = router;
