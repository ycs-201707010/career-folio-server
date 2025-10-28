const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 업로드된 파일이 저장될 폴더 경로
const uploadDir = "uploads/";
const imageUploadDir = path.join(uploadDir, "images/");
const videoUploadDir = path.join(uploadDir, "videos/");

// 해당 폴더가 없으면 생성
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
} else if (!fs.existsSync(imageUploadDir)) {
  fs.mkdirSync(imageUploadDir, { recursive: true });
} else if (!fs.existsSync(videoUploadDir)) {
  fs.mkdirSync(videoUploadDir, { recursive: true });
}

// 파일 필터 함수 (이미지 및 비디오 허용)
const imageFileFilter = (req, file, cb) => {
  // 허용할 파일 확장자 및 MIME 타입 정의
  // 이미지: jpg, jpeg, png, gif
  const allowedTypes = /jpeg|jpg|png|gif/;
  const mimetype = allowedTypes.test(file.mimetype);
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );

  if (mimetype && extname) {
    return cb(null, true); // 허용
  }
  // 허용되지 않는 파일 타입일 경우 에러 반환
  cb(new Error("Error: 이미지(jpg, png 등) 파일만 업로드 가능합니다."), false);
};

const videoFileFilter = (req, file, cb) => {
  // 허용할 파일 확장자 및 MIME 타입 정의
  // 비디오: mp4, avi, mov, wmv
  const allowedTypes = /mp4|mov|wmv|avi/;
  const mimetype = allowedTypes.test(file.mimetype);
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );

  if (mimetype && extname) {
    return cb(null, true); // 허용
  }
  // 허용되지 않는 파일 타입일 경우 에러 반환
  cb(new Error("Error: 이미지(jpg, png) 파일만 업로드 가능합니다."), false);
};

// 이미지 저장을 위한 DiskStorage 설정
const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, imageUploadDir); // 이미지 저장 경로
  },
  filename: (req, file, cb) => {
    // 파일 이름 중복 방지를 위해 타임스탬프와 랜덤 숫자를 사용
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    // 필드 이름(fieldname)을 포함하여 어떤 용도의 이미지인지 구분 (예: thumbnail-12345.jpg)
    cb(null, file.fieldname + "-" + uniqueSuffix + extension);
  },
});

// 비디오 저장을 위한 DiskStorage 설정
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, videoUploadDir); // 비디오 저장 경로
  },
  filename: (req, file, cb) => {
    // 파일 이름 중복 방지를 위해 타임스탬프와 랜덤 숫자를 사용
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    // 필드 이름(fieldname)을 포함하여 어떤 용도의 비디오인지 구분 (예: video-12345.mp4)
    cb(null, file.fieldname + "-" + uniqueSuffix + extension);
  },
});

// 이미지 업로드용 multer 인스턴스
// 최대 10MB 크기 제한
const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: imageFileFilter,
});

// 비디오 업로드용 multer 인스턴스
// 최대 500MB 크기 제한 (필요에 따라 조절)
const uploadVideo = multer({
  storage: videoStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
  fileFilter: videoFileFilter,
});

module.exports = { uploadImage, uploadVideo };
