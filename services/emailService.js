const nodemailer = require("nodemailer");
require("dotenv").config();

// Nodemailer transporter 설정
// Gmail을 사용하는 경우, '앱 비밀번호'를 발급받아 사용해야 합니다.
const transporter = nodemailer.createTransport({
  service: "gmail",
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // true for 465, false for other ports
  auth: {
    user: process.env.EMAIL_USER, // .env 파일에 Gmail 주소 설정
    pass: process.env.EMAIL_PASS, // .env 파일에 Gmail 앱 비밀번호 설정
  },
});

/**
 * 인증 코드를 이메일로 발송하는 함수
 * @param {string} to - 수신자 이메일 주소
 * @param {string} code - 발송할 6자리 인증 코드
 */
const sendVerificationEmail = async (to, code) => {
  const mailOptions = {
    from: `CareerFolio <${process.env.EMAIL_USER}>`,
    to: to,
    subject: "[CareerFolio] 회원가입 인증 코드입니다.",
    html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px;">
                <h2 style="color: #333;">CareerFolio 회원가입 인증 코드</h2>
                <p>안녕하세요! CareerFolio에 가입해주셔서 감사합니다.</p>
                <p>아래 6자리 인증 코드를 회원가입 화면에 입력해주세요.</p>
                <div style="background-color: #f5f5f5; padding: 15px; text-align: center; border-radius: 5px; margin: 20px 0;">
                    <strong style="font-size: 24px; letter-spacing: 5px; color: #007bff;">${code}</strong>
                </div>
                <p>이 코드는 5분간 유효합니다.</p>
                <hr style="border: none; border-top: 1px solid #eee;" />
                <p style="font-size: 12px; color: #999;">본인이 요청하지 않은 경우 이 메일을 무시해주세요.</p>
            </div>
        `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`인증 이메일 발송 성공: ${to}`);
  } catch (error) {
    console.error(`인증 이메일 발송 실패: ${to}`, error);
    throw new Error("이메일 발송에 실패했습니다.");
  }
};

module.exports = { sendVerificationEmail };
