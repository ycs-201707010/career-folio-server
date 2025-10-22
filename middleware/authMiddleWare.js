// **강좌 "관리"는 로그인한 사용자만 가능해야 하기 때문에, 로그인한 사용자를 식별하는 미들웨어를 만들어야 함.**

const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {
  let token;

  // 요청 헤더에 'Authorization'이 있고, 'Bearer' 토큰 형식인지 확인
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      // 'Bearer ' 부분을 제외하고 토큰만 추출
      token = req.headers.authorization.split(" ")[1];

      // 토큰 검증
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // 검증된 사용자 정보를 req.user에 담아서 다음 미들웨어로 전달
      // DB에서 최신 사용자 정보를 다시 조회하는 것이 더 안전하지만, 일단은 토큰 정보만 사용
      req.user = decoded;

      next(); // 다음 미들웨어 또는 핸들러 실행
    } catch (error) {
      console.error("Token verification failed", error);
      return res.status(401).json({ message: "Not authorized, token failed" });
    }
  }

  if (!token) {
    return res.status(401).json({ message: "Not authorized, no token" });
  }
};

module.exports = { protect };
