const express = require("express");
const router = express.Router();
const pool = require("../db");
const { protect } = require("../middleware/authMiddleWare");

// 1. 특정 강의의 내 메모 목록 조회
// GET /api/memos/lecture/:lectureId
router.get("/lecture/:lectureId", protect, async (req, res) => {
  const { lectureId } = req.params;
  const user_idx = req.user.userIdx;

  try {
    // 사용자가 해당 강의를 수강 중인지 확인 (enrollment_idx 필요)
    const [enrollments] = await pool.query(
      `SELECT e.idx FROM enrollments e
             JOIN sections s ON e.course_idx = s.course_idx
             JOIN lectures l ON s.idx = l.section_idx
             WHERE e.user_idx = ? AND l.idx = ?`,
      [user_idx, lectureId]
    );

    if (enrollments.length === 0) {
      return res.status(403).json({ message: "수강 중인 강의가 아닙니다." });
    }
    const enrollment_idx = enrollments[0].idx;

    // 해당 강의에 대한 현재 사용자의 메모 목록 조회 (시간 순서대로)
    const [memos] = await pool.query(
      `SELECT * FROM lecture_memos 
             WHERE enrollment_idx = ? AND lecture_idx = ? 
             ORDER BY timestamp_seconds ASC`,
      [enrollment_idx, lectureId]
    );

    res.json(memos);
  } catch (error) {
    console.error("메모 목록 조회 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 2. 새 메모 생성
// POST /api/memos
router.post("/", protect, async (req, res) => {
  const { lectureId, timestampSeconds, content } = req.body;
  const user_idx = req.user.userIdx;

  if (!lectureId || timestampSeconds === undefined || !content) {
    return res
      .status(400)
      .json({ message: "강의 ID, 시간, 내용은 필수입니다." });
  }

  try {
    // 사용자가 해당 강의를 수강 중인지 확인 (enrollment_idx 필요)
    const [enrollments] = await pool.query(
      `SELECT e.idx FROM enrollments e
             JOIN sections s ON e.course_idx = s.course_idx
             JOIN lectures l ON s.idx = l.section_idx
             WHERE e.user_idx = ? AND l.idx = ?`,
      [user_idx, lectureId]
    );

    if (enrollments.length === 0) {
      return res
        .status(403)
        .json({ message: "수강 중인 강의에만 메모를 작성할 수 있습니다." });
    }
    const enrollment_idx = enrollments[0].idx;

    // lecture_memos 테이블에 새 메모 삽입
    const [result] = await pool.query(
      `INSERT INTO lecture_memos (enrollment_idx, lecture_idx, timestamp_seconds, content) VALUES (?, ?, ?, ?)`,
      [enrollment_idx, lectureId, timestampSeconds, content]
    );

    const [newMemo] = await pool.query(
      "SELECT * FROM lecture_memos WHERE idx = ?",
      [result.insertId]
    );
    res.status(201).json(newMemo[0]);
  } catch (error) {
    console.error("메모 생성 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 3. 메모 삭제 (선택 사항 - 나중에 추가 가능)
// DELETE /api/memos/:memoId
// router.delete('/:memoId', protect, async (req, res) => { ... });

module.exports = router;
