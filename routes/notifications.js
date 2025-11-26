const express = require("express");
const router = express.Router();
const pool = require("../db");
const { protect } = require("../middleware/authMiddleWare");

// 1. 내 알림 목록 조회
// GET /api/notifications
router.get("/", protect, async (req, res) => {
  const user_idx = req.user.userIdx;
  try {
    const [notifications] = await pool.query(
      `SELECT * FROM notifications WHERE user_idx = ? ORDER BY created_at DESC LIMIT 20`,
      [user_idx]
    );
    // 읽지 않은 알림 개수
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_idx = ? AND is_read = 0`,
      [user_idx]
    );

    res.json({ notifications, unreadCount: countRow.count });
  } catch (error) {
    res.status(500).json({ message: "서버 오류" });
  }
});

// 2. 알림 읽음 처리
// PATCH /api/notifications/:id/read
router.patch("/:id/read", protect, async (req, res) => {
  const { id } = req.params;
  const user_idx = req.user.userIdx;
  try {
    await pool.query(
      "UPDATE notifications SET is_read = 1 WHERE idx = ? AND user_idx = ?",
      [id, user_idx]
    );
    res.json({ message: "읽음 처리되었습니다." });
  } catch (error) {
    res.status(500).json({ message: "서버 오류" });
  }
});

// 3. 전체 읽음 처리 (선택사항)
router.patch("/read-all", protect, async (req, res) => {
  const user_idx = req.user.userIdx;
  try {
    await pool.query(
      "UPDATE notifications SET is_read = 1 WHERE user_idx = ?",
      [user_idx]
    );
    res.json({ message: "모두 읽음 처리되었습니다." });
  } catch (error) {
    res.status(500).json({ message: "서버 오류" });
  }
});

module.exports = router;
