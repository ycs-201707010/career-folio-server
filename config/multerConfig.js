const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 업로드된 파일이 저장될 폴더 경로
const uploadDir = "uploads/videos/";

// 해당 폴더가 없으면 생성
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer 디스크 스토리지 설정
const storage = multer.diskStorage({
  // 파일이 저장될 위치 설정
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  // 파일 이름 설정 (중복 방지를 위해 타임스탬프 사용)
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + "-" + uniqueSuffix + extension);
  },
});

// Multer 인스턴스 생성 및 설정
const upload = multer({
  storage: storage,
  // 파일 크기 제한 (예: 500MB)
  limits: { fileSize: 500 * 1024 * 1024 },
  // 파일 필터 (비디오 파일만 허용)
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|mp4|mov|wmv|avi/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(
      path.extname(file.originalname).toLowerCase()
    );

    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(
      new Error(
        "Error: 비디오 파일만 업로드할 수 있습니다. (mp4, mov, wmv, avi)"
      )
    );
  },
});

module.exports = upload;
