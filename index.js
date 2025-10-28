// index.js

require("dotenv").config();
const express = require("express"); // node_modules에 있는 express 관련 파일을 가져옴
const cors = require("cors");
const path = require("path"); // path 모듈 추가

const app = express(); // express는 함수이므로, 반환값을 변수에 저장.
const PORT = process.env.PORT || 8080;

app.use(cors()); // CORS 허용
app.use(express.json()); // JSON 파싱

// '/uploads' 경로로 들어오는 요청에 대해 './uploads' 폴더의 파일을 제공합니다.
// 예를 들어, /uploads/videos/video-123.mp4 요청이 오면 실제 ./uploads/videos/video-123.mp4 파일을 찾아 보내줍니다.
app.use("/uploads", express.static(path.join(__dirname, "uploads")));
// ------------------------------------

/** 라우터 연결  */
const authRouter = require("./routes/auth"); // 방금 만든 auth.js 라우터를 불러옴. 이 라우터를 불러와야 실제로 API가 동작함.
const courseRouter = require("./routes/courses");
const adminRouter = require("./routes/admin");
const cartRouter = require("./routes/cart");
const enrollmentsRouter = require("./routes/enrollments");
const paymentsRouter = require("./routes/payments");
const learnRouter = require("./routes/learn"); // learn 라우터 import
const videoRouter = require("./routes/video"); // 비디오 라우터 import
const memosRouter = require("./routes/memos");

app.use("/api/auth", authRouter); // '/api/auth' 경로로 들어오는 모든 요청을 authRouter가 처리하도록 연결.
app.use("/api/courses", courseRouter);
app.use("/api/admin", adminRouter);
app.use("/api/cart", cartRouter);
app.use("/api/enrollments", enrollmentsRouter);
app.use("/api/payments", paymentsRouter);
app.use("/api/learn", learnRouter);
app.use("/api/video", videoRouter);
app.use("/api/memos", memosRouter);

// 기본 경로로 이동하면 반환됨
app.get("/", (req, res) => {
  res.send("<h1>Welcome to CareerFolio API Server!</h1>");
});

// PORT에 저장된 포트 번호로 서버를 오픈
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
