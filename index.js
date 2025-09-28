// index.js

require("dotenv").config();
const express = require("express"); // node_modules에 있는 express 관련 파일을 가져옴
const cors = require("cors");

const app = express(); // express는 함수이므로, 반환값을 변수에 저장한다.
const PORT = process.env.PORT || 8080;

app.use(cors()); // CORS 허용
app.use(express.json()); // JSON 파싱

// 기본 경로로 이동하면 반환됨
app.get("/", (req, res) => {
  res.send("<h1>Welcome to CareerFolio API Server!</h1>");
});

// PORT에 저장된 포트 번호로 서버를 오픈
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
