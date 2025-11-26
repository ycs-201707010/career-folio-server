const { GoogleGenerativeAI } = require("@google/generative-ai");
const { createNotification } = require("./notification.service");
const pool = require("../db");
require("dotenv").config();

// Gemini 클라이언트 초기화
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const generateAIAnswer = async (questionId, title, content, category) => {
  try {
    // 1. AI 모델 설정
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // 2. 프롬프트 엔지니어링 (AI에게 페르소나 부여)
    const prompt = `
      당신은 'CareerFolio'라는 커리어 개발 플랫폼의 친절하고 전문적인 멘토 AI입니다.
      사용자가 올린 질문에 대해 명확하고 도움이 되는 답변을 마크다운(Markdown) 형식으로 작성해주세요.
      
      - 질문 카테고리: ${category}
      - 질문 제목: ${title}
      - 질문 내용: ${content}
      
      답변은 서론, 본론, 결론 혹은 단계별 해결책으로 구조화해서 작성해주세요.
      너무 길지 않게 핵심만 요약해서 친절하게 답변해 주세요.
    `;

    // 3. Gemini에게 질문
    console.log(`[AI] Generating answer for Question ${questionId}...`);
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const aiText = response.text();

    // 4. 답변을 DB에 저장 (is_ai = true)
    // (AI 답변은 user_idx를 0 또는 관리자 ID로 설정하거나, 별도의 'AI 봇' 계정을 만들어 그 ID를 쓰면 좋습니다.)
    // 여기서는 user_idx = 1 (임시: 첫 번째 가입자, 보통 관리자)로 넣겠습니다.
    // 실제 운영시엔 'AI_BOT' 전용 계정을 만들어 그 idx를 쓰세요.
    const AI_USER_IDX = 5; // AI 답변용 봇으로 만든 계정의 idx를 삽입.

    await pool.query(
      `INSERT INTO answers (question_idx, user_idx, content, is_ai) VALUES (?, ?, ?, ?)`,
      [questionId, AI_USER_IDX, aiText, true] // is_ai = true
    );

    // (선택) 답변 등록 활동 로그도 남길 수 있음
    // logActivity(AI_USER_IDX, 'AI_ANSWER', questionId);

    // --- 👇 [추가] 질문자에게 알림 발송 ---
    // (questionId로 질문자 user_idx를 찾아야 함)
    const [[question]] = await pool.query(
      "SELECT user_idx FROM questions WHERE idx = ?",
      [questionId]
    );
    if (question) {
      await createNotification(
        question.user_idx,
        "answer",
        `🤖 AI 멘토가 회원님의 질문에 답변을 남겼습니다!`,
        `/qna/${questionId}`
      );
    }

    console.log(`[AI] Answer saved for Question ${questionId}`);
  } catch (error) {
    console.error("[AI] Failed to generate answer:", error);
    // AI 답변 실패는 치명적이지 않으므로 서버를 죽이지 않고 로그만 남김
  }
};

module.exports = { generateAIAnswer };
