// ** 관리자 API 라우터 **

const express = require("express");
const router = express.Router();
const pool = require("../db");
const { protect } = require("../middleware/authMiddleWare.js");
const { admin } = require("../middleware/adminMiddleWare.js");

// 1. 모든 강좌 목록 조회 (관리자용)
// GET /api/admin/courses
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

// 2. 특정 강좌 상태 변경
// PUT /api/admin/courses/:courseId/status
router.put("/courses/:courseId/status", protect, admin, async (req, res) => {
  const { courseId } = req.params;
  const { status } = req.body;

  if (!["draft", "published", "archived"].includes(status)) {
    return res.status(400).json({ message: "잘못된 상태 값입니다." });
  }

  try {
    await pool.query("UPDATE courses SET status = ? WHERE idx = ?", [
      status,
      courseId,
    ]);
    res.json({ message: `강좌 상태가 '${status}'(으)로 변경되었습니다.` });
  } catch (error) {
    res.status(500).json({ message: "서버 오류" });
  }
});

// 3. 특정 강좌 가격 변경 (정가 및 할인가)
// PUT /api/admin/courses/:courseId/price
router.put("/courses/:courseId/price", protect, admin, async (req, res) => {
  const { courseId } = req.params;
  // 클라이언트에서 price와 discount_price를 받습니다.
  const { price, discount_price } = req.body;

  // 가격이 숫자인지, 음수가 아닌지 기본적인 유효성 검사
  if (
    (price !== undefined && (isNaN(price) || price < 0)) ||
    (discount_price !== undefined &&
      discount_price !== null &&
      (isNaN(discount_price) || discount_price < 0))
  ) {
    return res.status(400).json({ message: "가격 정보가 올바르지 않습니다." });
  }

  try {
    await pool.query(
      "UPDATE courses SET price = ?, discount_price = ? WHERE idx = ?",
      [price, discount_price, courseId]
    );
    res.json({ message: `강좌 가격이 성공적으로 변경되었습니다.` });
  } catch (error) {
    console.error("강좌 가격 변경 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

module.exports = router;
