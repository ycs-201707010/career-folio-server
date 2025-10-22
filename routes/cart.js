const express = require("express");
const router = express.Router();
const pool = require("../db");
const { protect } = require("../middleware/authMiddleWare.js");

// 1. 내 장바구니 목록 조회
// GET /api/cart
router.get("/", protect, async (req, res) => {
  const user_idx = req.user.userIdx;
  try {
    const [cartItems] = await pool.query(
      `SELECT 
                c.idx, c.title, c.thumbnail_url, c.price, c.discount_price,
                u.name as instructor_name
             FROM carts ct
             JOIN courses c ON ct.course_idx = c.idx
             JOIN users u ON c.instructor_idx = u.idx
             WHERE ct.user_idx = ?`,
      [user_idx]
    );
    res.json(cartItems);
  } catch (error) {
    console.error("장바구니 조회 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 2. 장바구니에 강좌 추가
// POST /api/cart
router.post("/", protect, async (req, res) => {
  const { courseId } = req.body;
  const user_idx = req.user.userIdx;

  try {
    // 이미 수강 중인 강좌인지 확인
    const [enrollment] = await pool.query(
      `SELECT * FROM enrollments WHERE user_idx = ? AND course_idx = ?`,
      [user_idx, courseId]
    );
    if (enrollment.length > 0) {
      return res.status(400).json({ message: "이미 수강 중인 강좌입니다." });
    }

    // 이미 장바구니에 있는지 확인 (UNIQUE KEY 제약조건으로도 막히지만, 친절한 메시지 제공)
    const [cartItem] = await pool.query(
      `SELECT * FROM carts WHERE user_idx = ? AND course_idx = ?`,
      [user_idx, courseId]
    );
    if (cartItem.length > 0) {
      return res
        .status(400)
        .json({ message: "이미 장바구니에 담긴 강좌입니다." });
    }

    await pool.query("INSERT INTO carts (user_idx, course_idx) VALUES (?, ?)", [
      user_idx,
      courseId,
    ]);
    res.status(201).json({ message: "장바구니에 추가되었습니다." });
  } catch (error) {
    console.error("장바구니 추가 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 3. 장바구니에서 강좌 제거
// DELETE /api/cart/:courseId
router.delete("/:courseId", protect, async (req, res) => {
  const { courseId } = req.params;
  const user_idx = req.user.userIdx;
  try {
    await pool.query(
      "DELETE FROM carts WHERE user_idx = ? AND course_idx = ?",
      [user_idx, courseId]
    );
    res.json({ message: "장바구니에서 삭제되었습니다." });
  } catch (error) {
    console.error("장바구니 삭제 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

module.exports = router;
