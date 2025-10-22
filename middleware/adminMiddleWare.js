// 이 미들웨어는 'protect' 미들웨어 다음에 실행되어야 합니다.
const admin = (req, res, next) => {
  // protect 미들웨어가 req.user에 넣어준 정보를 확인합니다.
  if (req.user && req.user.role === "admin") {
    next(); // 관리자면 통과
  } else {
    res
      .status(403)
      .json({ message: "접근 권한이 없습니다. 관리자만 접근 가능합니다." });
  }
};

module.exports = { admin };
