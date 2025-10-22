// mp4 등의 비디오 파일을 "재생해야하는" 파일로 인식시키기 위한 스트리밍 전용 라우트

const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

// 비디오 스트리밍 라우트
// GET /api/video/stream/:filename
router.get("/stream/:filename", (req, res) => {
  const { filename } = req.params;
  // 실제 파일 경로 생성 (보안상 '../' 같은 경로 이동 문자를 제거하는 것이 좋습니다)
  const safeFilename = path.basename(filename); // 파일 이름만 추출
  const videoPath = path.join(
    __dirname,
    "..",
    "uploads",
    "videos",
    safeFilename
  );

  // 1. 파일 존재 확인
  fs.stat(videoPath, (err, stats) => {
    if (err) {
      console.error("File stat error:", err);
      if (err.code === "ENOENT") {
        return res.status(404).send("Video not found");
      }
      return res.status(500).send("Error reading video file");
    }

    const fileSize = stats.size;
    const range = req.headers.range; // 브라우저가 요청하는 영상의 특정 부분 (예: bytes=1024-2048)

    // 2. Range 요청 처리 (스트리밍 및 탐색(seeking)의 핵심)
    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize) {
        res
          .status(416)
          .send(
            "Requested range not satisfiable\n" + start + " >= " + fileSize
          );
        return;
      }

      const chunksize = end - start + 1;
      const file = fs.createReadStream(videoPath, { start, end });
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize,
        "Content-Type": "video/mp4", // 또는 다른 비디오 타입
      };

      res.writeHead(206, head); // 206 Partial Content 상태 코드
      file.pipe(res); // 파일 스트림을 응답으로 바로 연결
    } else {
      // 3. Range 요청이 없을 경우 (전체 파일 요청)
      const head = {
        "Content-Length": fileSize,
        "Content-Type": "video/mp4",
      };
      res.writeHead(200, head); // 200 OK 상태 코드
      fs.createReadStream(videoPath).pipe(res);
    }
  });
});

module.exports = router;
