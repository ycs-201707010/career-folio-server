// ** 결제 관련 라우터 **

const express = require("express");
const router = express.Router();
const pool = require("../db");
const { protect } = require("../middleware/authMiddleWare.js");

// 내 수강 목록 조회 API
// GET /api/enrollments/my
router.get("/my", protect, async (req, res) => {
  const user_idx = req.user.userIdx;

  try {
    const [myCourses] = await pool.query(
      `SELECT 
                c.idx, c.title, c.thumbnail_url,
                u.name as instructor_name,
                e.progress_percent
             FROM enrollments e
             JOIN courses c ON e.course_idx = c.idx
             JOIN users u ON c.instructor_idx = u.idx
             WHERE e.user_idx = ?
             ORDER BY e.enrolled_at DESC`,
      [user_idx]
    );
    res.json(myCourses);
  } catch (error) {
    console.error("내 수강 목록 조회 오류:", error);
    res.status(500).json({ message: "서버 오류" });
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
