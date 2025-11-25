// routes/qna.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleWare");
const qnaService = require("../services/qna.service");
const { logActivity } = require("../services/activity.service"); // 👈 잔디 심기용
const { uploadImage } = require("../config/multerConfig");
const pool = require("../db"); // DB 커넥션 풀

// 1. 질문 목록 조회 (공개)
// GET /api/qna?page=1&category=tech&sort=latest
router.get("/", async (req, res) => {
  try {
    const questions = await qnaService.getQuestions(req.query);
    res.json(questions);
  } catch (error) {
    console.error("질문 목록 조회 실패:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 2. 질문 상세 조회 (공개)
// GET /api/qna/:id
router.get("/:id", async (req, res) => {
  try {
    const data = await qnaService.getQuestionDetail(req.params.id);
    if (!data)
      return res.status(404).json({ message: "질문을 찾을 수 없습니다." });
    res.json(data);
  } catch (error) {
    console.error("질문 상세 조회 실패:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 3. 질문 작성 (인증 필요)
// POST /api/qna
router.post("/", protect, uploadImage.array("images", 5), async (req, res) => {
  const { title, content, category } = req.body; // tags는 배열 ['React', 'Error']
  const user_idx = req.user.userIdx;

  // FormData에서 태그 배열 처리 (여러개의 'tags' 키로 들어옴)
  let tags = [];
  if (req.body.tags) {
    tags = Array.isArray(req.body.tags) ? req.body.tags : [req.body.tags];
  }

  // 👇 [신규] 업로드된 파일 정보 처리
  const imageUrls = req.files
    ? req.files.map((file) => file.path.replace(/\\/g, "/"))
    : [];

  if (!title || !content || !category) {
    // 실패 시 업로드한 이미지 지우기
    // TODO : 실제 운영 환경에선 fs.unlink로 지워주는 게 좋다.
    return res
      .status(400)
      .json({ message: "제목, 내용, 카테고리는 필수입니다." });
  }

  try {
    const newQuestionId = await qnaService.createQuestion({
      user_idx,
      title,
      content,
      category,
      tags,
      imageUrls,
    });

    // 🌱 잔디 심기! (질문 등록)
    logActivity(user_idx, "Q_POST", newQuestionId);

    res
      .status(201)
      .json({ message: "질문이 등록되었습니다.", idx: newQuestionId });
  } catch (error) {
    console.error("질문 등록 실패:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 4. 답변 작성 (인증 필요)
// POST /api/qna/:id/answers
router.post("/:id/answers", protect, async (req, res) => {
  const question_idx = req.params.id;
  const user_idx = req.user.userIdx;
  const { content } = req.body;

  if (!content)
    return res.status(400).json({ message: "내용을 입력해주세요." });

  try {
    const newAnswerId = await qnaService.createAnswer({
      user_idx,
      question_idx,
      content,
    });

    // 🌱 잔디 심기! (답변 등록)
    logActivity(user_idx, "A_POST", newAnswerId);

    res
      .status(201)
      .json({ message: "답변이 등록되었습니다.", idx: newAnswerId });
  } catch (error) {
    console.error("답변 등록 실패:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 5. 답변 채택하기 (질문 작성자만 가능)
router.post(
  "/:questionId/answers/:answerId/adopt",
  protect,
  async (req, res) => {
    const { questionId, answerId } = req.params;
    const user_idx = req.user.userIdx;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // 1. 질문 작성자 확인
      const [[question]] = await connection.query(
        "SELECT user_idx FROM questions WHERE idx = ?",
        [questionId]
      );
      if (!question) throw new Error("질문을 찾을 수 없습니다.");
      if (question.user_idx !== user_idx)
        return res.status(403).json({ message: "채택 권한이 없습니다." });

      // 2. 기존 채택 취소 (하나만 채택 가능하게 할 경우)
      await connection.query(
        "UPDATE answers SET is_adopted = 0 WHERE question_idx = ?",
        [questionId]
      );

      // 3. 새 답변 채택
      await connection.query(
        "UPDATE answers SET is_adopted = 1 WHERE idx = ?",
        [answerId]
      );

      // 4. 질문을 '해결됨(is_solved)' 상태로 변경
      await connection.query(
        "UPDATE questions SET is_solved = 1 WHERE idx = ?",
        [questionId]
      );

      await connection.commit();
      res.json({ message: "답변을 채택했습니다." });
    } catch (error) {
      await connection.rollback();
      console.error("답변 채택 오류:", error);
      res.status(500).json({ message: "서버 오류" });
    } finally {
      connection.release();
    }
  }
);

// 6. 답변 투표 (좋아요/싫어요 토글)
router.post("/answers/:answerId/vote", protect, async (req, res) => {
  const { answerId } = req.params;
  const user_idx = req.user.userIdx;
  const { voteType } = req.body; // 'like' or 'dislike'

  try {
    // 이미 투표했는지 확인
    const [[existingVote]] = await pool.query(
      "SELECT * FROM answer_likes WHERE answer_idx = ? AND user_idx = ?",
      [answerId, user_idx]
    );

    if (existingVote) {
      if (existingVote.vote_type === voteType) {
        // 같은 거 또 누르면 -> 취소 (삭제)
        await pool.query("DELETE FROM answer_likes WHERE idx = ?", [
          existingVote.idx,
        ]);
        return res.json({
          message: "투표를 취소했습니다.",
          action: "canceled",
        });
      } else {
        // 다른 거 누르면 -> 변경 (Update)
        await pool.query(
          "UPDATE answer_likes SET vote_type = ? WHERE idx = ?",
          [voteType, existingVote.idx]
        );
        return res.json({ message: "투표를 변경했습니다.", action: "changed" });
      }
    } else {
      // 없으면 -> 생성 (Insert)
      await pool.query(
        "INSERT INTO answer_likes (answer_idx, user_idx, vote_type) VALUES (?, ?, ?)",
        [answerId, user_idx, voteType]
      );
      return res.json({ message: "투표했습니다.", action: "voted" });
    }
  } catch (error) {
    console.error("투표 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 7. 질문 삭제
router.delete("/:id", protect, async (req, res) => {
  const { id } = req.params;
  const user_idx = req.user.userIdx;
  const user_role = req.user.role;

  try {
    const [[question]] = await pool.query(
      "SELECT user_idx FROM questions WHERE idx = ?",
      [id]
    );
    if (!question) return res.status(404).json({ message: "질문 없음" });

    if (user_role !== "admin" && question.user_idx !== user_idx) {
      return res.status(403).json({ message: "권한 없음" });
    }

    await pool.query("DELETE FROM questions WHERE idx = ?", [id]);
    res.json({ message: "삭제되었습니다." });
  } catch (e) {
    res.status(500).json({ message: "오류 발생" });
  }
});

// 8. 답변 삭제
router.delete("/answers/:id", protect, async (req, res) => {
  const { id } = req.params;
  const user_idx = req.user.userIdx;
  const user_role = req.user.role;

  try {
    const [[answer]] = await pool.query(
      "SELECT user_idx FROM answers WHERE idx = ?",
      [id]
    );
    if (!answer) return res.status(404).json({ message: "답변 없음" });

    if (user_role !== "admin" && answer.user_idx !== user_idx) {
      return res.status(403).json({ message: "권한 없음" });
    }

    await pool.query("DELETE FROM answers WHERE idx = ?", [id]);
    res.json({ message: "삭제되었습니다." });
  } catch (e) {
    res.status(500).json({ message: "오류 발생" });
  }
});

module.exports = router;
