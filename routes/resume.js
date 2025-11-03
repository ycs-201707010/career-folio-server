// routes/resume.js
const express = require("express");
const router = express.Router();
// 1. 사용자님의 인증 미들웨어 경로와 이름(protect)으로 변경
const { protect } = require("../middleware/authMiddleWare");
// 2. 서비스 파일 require
const { bulkUpdateResume } = require("../services/resume.service.js");
const { fetchProfileData } = require("../services/profile.service.js");
// PDF 저장을 위한 라이브러리 require
const puppeteer = require("puppeteer");
const ejs = require("ejs");
const path = require("path");

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

// 4. module.exports로 라우터 내보내기
module.exports = router;
