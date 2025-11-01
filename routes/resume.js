// routes/resume.js
const express = require("express");
const router = express.Router();
// 1. 사용자님의 인증 미들웨어 경로와 이름(protect)으로 변경
const { protect } = require("../middleware/authMiddleWare");
// 2. 서비스 파일 require
const { bulkUpdateResume } = require("../services/resume.service.js");
const { fetchProfileData } = require("../services/profile.service.js");

// [PUT] /api/resume/bulk-update
// 3. 미들웨어를 'auth' 대신 'protect'로 변경
router.put("/bulk-update", protect, async (req, res) => {
  try {
    const user_idx = req.user.idx; // protect 미들웨어가 req.user에 사용자 정보를 넣어준다고 가정

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

// 4. module.exports로 라우터 내보내기
module.exports = router;

// [PUT] /api/resume/bulk-update
router.put("/bulk-update", protect, async (req, res) => {
  try {
    const user_idx = req.user.idx;

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

module.exports = router;
