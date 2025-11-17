// routes/resume.js
const express = require("express");
const router = express.Router();
const pool = require("../db"); // DB 연결 풀
// 1. 사용자님의 인증 미들웨어 경로와 이름(protect)으로 변경
const { protect } = require("../middleware/authMiddleWare");
// 2. 서비스 파일 require
const { bulkUpdateResume } = require("../services/resume.service.js");
const { fetchProfileData } = require("../services/profile.service.js");
// PDF 저장을 위한 라이브러리 require
const puppeteer = require("puppeteer");
const ejs = require("ejs");
const path = require("path");

// --- 👇 [신규 추가] 이력서 빌더 데이터 로드 API ---
/**
 * @route   GET /api/resume/me
 * @desc    Get current user's full data FOR RESUME BUILDER
 * @access  Private
 */
router.get("/me", protect, async (req, res) => {
  const user_idx = req.user.userIdx;
  console.log(
    `[GET /api/resume/me] Fetching data for builder (User: ${user_idx})`
  );

  try {
    // 1. [이관] profile.js에 있던 "COALESCE 쿼리"를 그대로 가져옴
    const [profileResult] = await pool.query(
      `SELECT 
         u.name AS username, 
         p.*, 
         COALESCE(p.resume_email, u.email) AS email,
         COALESCE(p.resume_phone, u.phone_number) AS phone,
         p.address AS address 
       FROM users u
       LEFT JOIN user_profile p ON u.idx = p.user_idx 
       WHERE u.idx = ?`,
      [user_idx]
    );
    let profile = profileResult[0];

    // (프로필 생성 로직 - auth.js로 이동했으므로 여기선 불필요)
    if (!profile) {
      return res
        .status(404)
        .json({ message: "프로필 정보를 찾을 수 없습니다." });
    }

    // 2. 모든 이력 항목 조회
    const [[experiences], [educations], [projects], [skills]] =
      await Promise.all([
        pool.query(
          "SELECT * FROM experiences WHERE user_idx = ? ORDER BY start_date DESC",
          [user_idx]
        ),
        pool.query(
          "SELECT * FROM educations WHERE user_idx = ? ORDER BY start_date DESC",
          [user_idx]
        ),
        pool.query(
          "SELECT * FROM projects WHERE user_idx = ? ORDER BY start_date DESC",
          [user_idx]
        ),
        pool.query(
          "SELECT * FROM skills WHERE user_idx = ? ORDER BY category, skill_name",
          [user_idx]
        ),
      ]);

    // 3. 이력서 빌더용 데이터 전송
    res.json({
      profile: profile,
      experiences,
      educations,
      projects,
      skills,
    });
  } catch (error) {
    console.error("이력서 빌더 데이터 조회 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// [PUT] /api/resume/bulk-update
// 3. 미들웨어를 'auth' 대신 'protect'로 변경
router.put("/bulk-update", protect, async (req, res) => {
  try {
    const user_idx = req.user.userIdx; // protect 미들웨어가 req.user에 사용자 정보를 넣어준다고 가정

    // 1. 서비스 호출: 알아서 저장해줘
    await bulkUpdateResume(user_idx, req.body);

    // 2. 서비스 호출: 저장된 최신 데이터 다시 가져와줘
    const updatedData = await fetchProfileData(user_idx);

    // 3. 프론트에 최신 데이터 전송
    res.status(200).json(updatedData);
  } catch (error) {
    res
      .status(500)
      .json({ message: error.message || "서버 에러가 발생했습니다." });
  }
});

/**
 * @route   POST /api/resume/download-pdf
 * @desc    Generate and download PDF from draftData
 * @access  Private
 */
router.post("/download-pdf", protect, async (req, res) => {
  console.log("[PDF] PDF 생성 요청 수신...");

  // 1. 프론트엔드에서 "현재 수정 중인" 이력서 데이터(draftData)를 받습니다.
  const data = req.body.draftData;
  if (!data) {
    return res.status(400).json({ message: "이력서 데이터가 없습니다." });
  }

  try {
    // 2. EJS 템플릿 파일을 HTML 문자열로 렌더링합니다.
    const ejsTemplatePath = path.join(__dirname, "../templates/resume.ejs");
    const html = await ejs.renderFile(ejsTemplatePath, {
      data: data,
      process: process, // 템플릿 내에서 process.env를 사용할 수 있게 전달
    });

    // 3. Puppeteer 실행
    console.log("[PDF] Puppeteer 브라우저 실행...");
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"], // (선택적) Linux 서버 배포 시 필요할 수 있음
    });
    const page = await browser.newPage();

    // 4. 렌더링된 HTML을 Puppeteer 페이지에 로드
    // waitUntil: 'networkidle0'은 CDN(Tailwind) 로드가 완료될 때까지 기다립니다.
    await page.setContent(html, { waitUntil: "networkidle0" });

    // 5. PDF 생성 (A4, 배경 그래픽 인쇄)
    console.log("[PDF] PDF 파일 생성 중...");
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
    });

    await browser.close();
    console.log("[PDF] Puppeteer 브라우저 종료 및 파일 전송.");

    // 6. 생성된 PDF 버퍼를 클라이언트에 전송
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", "attachment; filename=resume.pdf"); // (파일명은 클라이언트에서 정함)
    res.send(pdfBuffer);
  } catch (error) {
    console.error("PDF 생성 실패:", error);
    res.status(500).json({ message: "PDF 생성 중 서버 오류 발생" });
  }
});

// [신규] 1. 포트폴리오 설정 저장 API
/**
 * @route   PUT /api/resume/settings
 * @desc    Update portfolio settings (template, public/private)
 * @access  Private
 */
router.put("/settings", protect, async (req, res) => {
  const user_idx = req.user.userIdx;
  // 1. 클라이언트에서 'template' 이름과 'isPublic' 여부를 받음
  const { template, isPublic } = req.body;

  if (template === undefined || isPublic === undefined) {
    return res.status(400).json({ message: "필수 설정값이 누락되었습니다." });
  }

  console.log(`template : ${template}`);
  console.log(`isPublic : ${isPublic}`);

  try {
    await pool.query(
      `UPDATE user_profile SET 
         portfolio_template = ?, 
         is_portfolio_public = ? 
       WHERE user_idx = ?`,
      [template, isPublic, user_idx]
    );

    res.json({ message: "포트폴리오 설정이 저장되었습니다." });
  } catch (error) {
    console.error("포트폴리오 설정 저장 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// [신규] 2. 공개 포트폴리오 조회 API
/**
 * @route   GET /api/resume/public/:id
 * @desc    Get a user's public portfolio data by their string ID
 * @access  Public
 */
router.get("/public/:id", async (req, res) => {
  const targetId = req.params.id; // 예: 'king-gwangpil'

  try {
    // 1. ID로 user_idx 찾기
    const [[credential]] = await pool.query(
      "SELECT user_idx FROM user_credentials WHERE id = ?",
      [targetId]
    );
    if (!credential) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }
    const user_idx = credential.user_idx;

    // 2. [핵심] 이력서 빌더용 'fetchProfileData' (services/profile.service.js)를 재사용
    // (이 함수는 COALESCE 쿼리가 적용된 모든 데이터를 가져옴)
    const profileData = await fetchProfileData(user_idx); // (Turn 70 코드 재사용)

    // 3. [보안] 공개 여부 확인
    if (!profileData.profile.is_portfolio_public) {
      return res.status(403).json({ message: "이 포트폴리오는 비공개입니다." });
    }

    // 4. 공개 포트폴리오에 필요한 모든 데이터 전송
    // (profile 객체 안에 'portfolio_template' 이름도 포함되어 있음)
    res.json(profileData);
  } catch (error) {
    console.error(`공개 포트폴리오 조회 오류 (ID: ${targetId}):`, error);
    res.status(500).json({ message: "서버 오류" });
  }
});

module.exports = router;
