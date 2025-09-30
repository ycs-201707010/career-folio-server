const mysql = require("mysql2/promise");
require("dotenv").config(); // 로컬 개발 환경에서 .env 파일을 사용하기 위해 필요

// createPool을 사용하여 DB 커넥션 풀 생성
// Pool을 사용하면 매 쿼리마다 연결을 새로 맺고 끊는 비효율을 줄일 수 있습니다.
const pool = mysql.createPool({
  host: process.env.MYSQLHOST, // Railway에서 제공하는 DB 호스트
  user: process.env.MYSQLUSER, // Railway에서 제공하는 DB 유저 이름
  password: process.env.MYSQLPASSWORD, // Railway에서 제공하는 DB 비밀번호
  database: process.env.MYSQLDATABASE, // Railway에서 제공하는 DB 이름
  port: process.env.MYSQLPORT, // Railway에서 제공하는 DB 포트

  // 아래는 안정적인 연결을 위한 추천 옵션입니다.
  waitForConnections: true,
  connectionLimit: 10, // 동시에 유지할 수 있는 최대 커넥션 수
  queueLimit: 0, // 커넥션이 모두 사용 중일 때 대기할 요청의 최대 수 (0 = 무제한)
  charset: "utf8mb4", // 한글 지원을 위한 문자 인코딩 설정
});

console.log("✅ MySQL Connection Pool is created successfully.");

// 생성된 pool을 다른 파일에서 재사용할 수 있도록 내보냅니다.
module.exports = pool;
