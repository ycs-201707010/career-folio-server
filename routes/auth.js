const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const pool = require("../db"); // DB 커넥션 풀
const { sendVerificationEmail } = require("../services/emailService"); // 이메일 서비스

const router = express.Router();

// 이메일 인증코드를 임시로 저장할 객체 (실제 프로덕션에서는 Redis 사용을 권장)
// { "user@example.com": { code: "123456", expiresAt: 1678886400000, verified: false } }
const emailVerifications = {};

// 1. 아이디 중복 확인 API
// GET /api/auth/check-duplicate?type=id&value=some_id
router.get("/check-duplicate", async (req, res) => {
  const { type, value } = req.query;

  if (type !== "id") {
    return res.status(400).json({ message: "유효하지 않은 확인 타입입니다." });
  }

  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) as count FROM user_credentials WHERE id = ?`,
      [value]
    );
    const exists = rows[0].count > 0;
    res.status(200).json({ exists });
  } catch (error) {
    console.error("아이디 중복 확인 중 DB 오류:", error);
    res.status(500).json({ message: "서버 오류가 발생했습니다." });
  }
});

// 2. 이메일 인증 코드 발송 API
// POST /api/auth/send-code
router.post("/send-code", async (req, res) => {
  const { email } = req.body;

  try {
    // 이메일 중복 확인
    const [users] = await pool.query(
      `SELECT COUNT(*) as count FROM users WHERE email = ?`,
      [email]
    );
    if (users[0].count > 0) {
      return res.status(409).json({ message: "이미 가입된 이메일입니다." });
    }

    const code = Math.floor(100000 + Math.random() * 900000).toString(); // 6자리 랜덤 코드 생성
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5분 후 만료

    // 인증 정보 저장
    emailVerifications[email] = { code, expiresAt, verified: false };

    await sendVerificationEmail(email, code);

    res
      .status(200)
      .json({ success: true, message: "인증 코드가 이메일로 전송되었습니다." });
  } catch (error) {
    console.error("이메일 인증 코드 발송 중 오류:", error);
    res.status(500).json({ success: false, error: "서버 통신 오류" });
  }
});

// 3. 이메일 인증 코드 확인 API
// POST /api/auth/verify-code
router.post("/verify-code", (req, res) => {
  const { email, code } = req.body;
  const verification = emailVerifications[email];

  if (!verification) {
    return res.status(400).json({
      verified: false,
      message: "인증 코드가 발송되지 않은 이메일입니다.",
    });
  }
  if (Date.now() > verification.expiresAt) {
    delete emailVerifications[email]; // 만료된 코드는 삭제
    return res
      .status(400)
      .json({ verified: false, message: "인증 코드가 만료되었습니다." });
  }
  if (verification.code !== code) {
    return res
      .status(400)
      .json({ verified: false, message: "인증코드가 일치하지 않습니다." });
  }

  // 인증 성공
  verification.verified = true;
  res.status(200).json({ verified: true, message: "이메일 인증 성공!" });
});

// 4. 최종 회원가입 API
// POST /api/auth/signup
router.post("/signup", async (req, res) => {
  const { name, email, phoneNumber, id, password } = req.body;

  // 이메일 인증 여부 확인
  const verification = emailVerifications[email];
  if (!verification || !verification.verified) {
    return res
      .status(400)
      .json({ message: "이메일 인증이 완료되지 않았습니다." });
  }

  const connection = await pool.getConnection(); // 트랜잭션을 위해 커넥션 가져오기
  try {
    await connection.beginTransaction(); // 트랜잭션 시작

    // 1. users 테이블에 사용자 정보 삽입
    const [userResult] = await connection.query(
      `INSERT INTO users (name, email, phone_number) VALUES (?, ?, ?)`,
      [name, email, phoneNumber]
    );
    const newUserId = userResult.insertId;

    // 2. user_profile 테이블에 초기 프로필 생성
    await connection.query(
      `INSERT INTO user_profile (user_idx, nickname) VALUES (?, ?)`,
      [newUserId, id]
    );

    // 3. user_credentials 테이블에 로그인 정보 삽입
    const hashedPassword = await bcrypt.hash(password, 10);
    await connection.query(
      `INSERT INTO user_credentials (user_idx, id, password) VALUES (?, ?, ?)`,
      [newUserId, id, hashedPassword]
    );

    await connection.commit(); // 모든 쿼리 성공 시 커밋

    // 성공 후 임시 인증 정보 삭제
    delete emailVerifications[email];

    res.status(201).json({ message: "회원가입이 성공적으로 완료되었습니다." });
  } catch (error) {
    await connection.rollback(); // 오류 발생 시 롤백
    console.error("회원가입 중 DB 오류:", error);
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "이미 사용 중인 이메일 또는 아이디입니다." });
    }
    res.status(500).json({ message: "서버 오류가 발생했습니다." });
  } finally {
    connection.release(); // 커넥션 반환
  }
});

// 5. 일반 로그인 API
// POST /api/auth/login
router.post("/login", async (req, res) => {
  const { id, password } = req.body;

  if (!id || !password) {
    return res
      .status(400)
      .json({ message: "아이디와 비밀번호를 모두 입력해주세요." });
  }

  try {
    // 1. user_credentials 테이블에서 id로 사용자 자격 증명 정보 조회
    const [credentials] = await pool.query(
      `SELECT * FROM user_credentials WHERE id = ?`,
      [id]
    );

    if (credentials.length === 0) {
      return res
        .status(401)
        .json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." });
    }

    const credential = credentials[0];

    // 2. 비밀번호 비교
    const isMatch = await bcrypt.compare(password, credential.password);
    if (!isMatch) {
      return res
        .status(401)
        .json({ message: "아이디 또는 비밀번호가 올바르지 않습니다." });
    }

    // 3. users 테이블과 user_profile 테이블에서 사용자 정보 조회
    const [users] = await pool.query(
      `SELECT u.idx, u.name, u.email, up.nickname 
             FROM users u 
             JOIN user_profile up ON u.idx = up.user_idx 
             WHERE u.idx = ?`,
      [credential.user_idx]
    );

    if (users.length === 0) {
      return res
        .status(404)
        .json({ message: "사용자 정보를 찾을 수 없습니다." });
    }

    const user = users[0];

    // 4. JWT 토큰 생성
    const token = jwt.sign(
      {
        userIdx: user.idx,
        name: user.name,
        email: user.email,
        nickname: user.nickname,
      },
      process.env.JWT_SECRET,
      { expiresIn: "3h" } // 3시간 유효
    );

    // 5. 토큰과 함께 사용자 정보 응답
    res.json({
      message: "로그인 성공!",
      token,
      user,
    });
  } catch (error) {
    console.error("로그인 중 DB 오류:", error);
    res.status(500).json({ message: "서버 오류가 발생했습니다." });
  }
});

module.exports = router;
