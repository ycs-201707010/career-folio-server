// ** 관리자 API 라우터 **

const express = require("express");
const router = express.Router();
const pool = require("../db");
const { protect } = require("../middleware/authMiddleWare.js");
const { admin } = require("../middleware/adminMiddleWare.js"); // 👈 대리님이 만드신 미들웨어

// --------------------------------------------------
// --- 1. [신규] 사용자 관리 API ---
// --------------------------------------------------

/**
 * @route   GET /api/admin/users
 * @desc    모든 사용자 목록 조회 (최신 가입순)
 */
router.get("/users", protect, admin, async (req, res) => {
  try {
    // 민감한 정보(password)는 제외하고 조회
    const [users] = await pool.query(
      `SELECT idx, name, email, role, is_verified_instructor, is_blocked, created_at 
       FROM users 
       ORDER BY created_at DESC`
    );
    res.json(users);
  } catch (error) {
    console.error("사용자 목록 조회 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

/**
 * @route   PATCH /api/admin/users/:userId/block
 * @desc    사용자 차단/차단해제 토글
 */
router.patch("/users/:userId/block", protect, admin, async (req, res) => {
  const { userId } = req.params;
  const { block } = req.body; // true(차단) or false(해제)

  try {
    await pool.query("UPDATE users SET is_blocked = ? WHERE idx = ?", [
      block,
      userId,
    ]);
    res.json({
      message: block ? "사용자가 차단되었습니다." : "차단이 해제되었습니다.",
    });
  } catch (error) {
    console.error("사용자 차단 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// --------------------------------------------------
// --- 2. [신규] 커뮤니티(Q&A) 관리 API ---
// --------------------------------------------------

/**
 * @route   GET /api/admin/qna/all
 * @desc    모든 질문글 조회 (관리용)
 */
router.get("/qna/all", protect, admin, async (req, res) => {
  try {
    const [questions] = await pool.query(
      `SELECT q.*, u.name as author_name, u.email as author_email
       FROM questions q
       JOIN users u ON q.user_idx = u.idx
       ORDER BY q.created_at DESC`
    );
    res.json(questions);
  } catch (error) {
    console.error("Q&A 전체 조회 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

/**
 * @route   GET /api/admin/pending-courses
 * @desc    Get all courses awaiting approval (status = 'pending')
 * @access  Admin
 */
router.get("/pending-courses", protect, admin, async (req, res) => {
  try {
    const [courses] = await pool.query(
      `SELECT 
         c.*, u.name as instructor_name 
       FROM courses c
       JOIN users u ON c.instructor_idx = u.idx
       WHERE c.status = 'pending'
       ORDER BY c.created_at ASC`
    );
    res.json(courses);
  } catch (error) {
    console.error("검수 대기 강좌 조회 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

/**
 * @route   PATCH /api/admin/courses/:courseId/approve
 * @desc    Approve a course AND verify the instructor
 * @access  Admin
 */
router.patch("/courses/:courseId/approve", protect, admin, async (req, res) => {
  const { courseId } = req.params;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. 강좌 상태를 'published'로 변경
    const [courseUpdateResult] = await connection.query(
      "UPDATE courses SET status = 'published' WHERE idx = ? AND status = 'pending'", // pending 상태일 때만
      [courseId]
    );

    if (courseUpdateResult.affectedRows === 0) {
      throw new Error("이미 처리되었거나 존재하지 않는 강좌입니다.");
    }

    // 2. 해당 강좌의 강사 user_idx를 찾습니다.
    const [[course]] = await connection.query(
      "SELECT instructor_idx FROM courses WHERE idx = ?",
      [courseId]
    );
    const instructor_idx = course.instructor_idx;

    // 3. 해당 강사를 "검증된 강사"로 업데이트합니다. (이제 이 강사는 자동 승인됩니다)
    await connection.query(
      "UPDATE users SET is_verified_instructor = TRUE WHERE idx = ?",
      [instructor_idx]
    );

    await connection.commit();
    res.json({ message: "강좌가 승인되었으며 강사가 검증 처리되었습니다." });
  } catch (error) {
    await connection.rollback();
    console.error("강좌 승인 중 오류:", error);
    res.status(500).json({ message: "서버 오류: " + error.message });
  } finally {
    connection.release();
  }
});

/**
 * @route   PATCH /api/admin/courses/:courseId/reject
 * @desc    Reject a course (back to 'draft')
 * @access  Admin
 */
router.patch("/courses/:courseId/reject", protect, admin, async (req, res) => {
  const { courseId } = req.params;
  const { reason } = req.body; // (선택적: 반려 사유)

  try {
    // 거절 시 '초안(draft)' 상태로 되돌립니다.
    await pool.query(
      "UPDATE courses SET status = 'draft' WHERE idx = ? AND status = 'pending'",
      [courseId]
    );
    // TODO: 반려 사유(reason)를 강사에게 알림/이메일로 보내는 로직 (추후 구현)
    res.json({ message: "강좌가 반려 처리되었습니다." });
  } catch (error) {
    console.error("강좌 거절 중 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// --- (이하 대리님이 만드신 다른 관리자용 API) ---

// (참고: 강좌 상태 변경 API는 위 'approve'/'reject'로 대체하는 것을 권장합니다)
// router.put("/courses/:courseId/status", ...);

// (참고: 가격 변경 API는 그대로 사용해도 좋습니다)
router.put("/courses/:courseId/price", protect, admin, async (req, res) => {
  // ... (기존 가격 변경 로직) ...
});

// (참고: 모든 강좌 목록 API는 그대로 사용해도 좋습니다)
router.get("/courses", protect, admin, async (req, res) => {
  try {
    const [courses] = await pool.query(
      `SELECT c.*, u.name as instructor_name FROM courses c JOIN users u ON c.instructor_idx = u.idx ORDER BY c.created_at DESC`
    );
    res.json(courses);
  } catch (error) {
    res.status(500).json({ message: "서버 오류" });
  }
});

module.exports = router;
