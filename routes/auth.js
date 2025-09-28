// routes/auth.js
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const router = express.Router();

// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  try {
    const { email, password, username } = req.body;

    // 사용자가 입력한 값 검증
    // todo : 사용자 프로필 (닉네임 임의 생성, 기본 프로필 사진) 만들기.
  } catch (error) {}
});
