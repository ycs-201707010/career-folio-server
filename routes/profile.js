const express = require("express");
const router = express.Router();
const pool = require("../db"); // DB 연결 풀
const { protect } = require("../middleware/authMiddleWare");
const { uploadImage } = require("../config/multerConfig"); // 이미지 업로드용 multer 설정
const fs = require("fs").promises; // 파일 시스템 접근 (파일 삭제용)
const path = require("path"); // 경로 처리용

// --- 내 프로필 및 이력서 정보 관리 API ---

/**
 * @route   GET /api/profile/me
 * @desc    Get current user's full profile and resume data
 * @access  Private
 */
router.get("/me", protect, async (req, res) => {
  const user_idx = req.user.userIdx;
  console.log(`[GET /api/profile/me] Fetching profile for user: ${user_idx}`);
  try {
    // Promise.all을 사용하여 모든 관련 데이터를 병렬로 조회
    const [
      profileResult, // user_profile 테이블 조회 결과
      experiences,
      educations,
      projects,
      skills,
    ] = await Promise.all([
      pool.query("SELECT * FROM user_profile WHERE user_idx = ?", [user_idx]),
      pool.query(
        "SELECT * FROM experiences WHERE user_idx = ? ORDER BY start_date DESC, idx DESC",
        [user_idx]
      ),
      pool.query(
        "SELECT * FROM educations WHERE user_idx = ? ORDER BY start_date DESC, idx DESC",
        [user_idx]
      ),
      pool.query(
        "SELECT * FROM projects WHERE user_idx = ? ORDER BY start_date DESC, idx DESC",
        [user_idx]
      ),
      pool.query(
        "SELECT * FROM skills WHERE user_idx = ? ORDER BY category, skill_name, idx DESC",
        [user_idx]
      ),
    ]);

    let profile = profileResult[0][0]; // 결과 배열의 첫 번째 요소

    // 만약 프로필이 없다면 (회원가입 로직 누락 대비) 생성 시도
    if (!profile) {
      console.warn(
        `User profile not found for user_idx: ${user_idx}. Attempting to create one.`
      );
      try {
        // users 테이블에서 기본 정보를 가져와서 프로필 생성
        const [[userForProfile]] = await pool.query(
          "SELECT idx, id FROM users WHERE idx = ?",
          [user_idx]
        );
        if (userForProfile) {
          await pool.query(
            "INSERT INTO user_profile (user_idx, nickname) VALUES (?, ?)",
            [user_idx, userForProfile.id]
          );
          const [[newProfile]] = await pool.query(
            "SELECT * FROM user_profile WHERE user_idx = ?",
            [user_idx]
          );
          profile = newProfile;
          console.log(`Successfully created profile for user_idx: ${user_idx}`);
        } else {
          console.error(
            `Cannot create profile because user ${user_idx} not found.`
          );
          return res.status(404).json({
            message: "사용자 정보를 찾을 수 없어 프로필을 생성할 수 없습니다.",
          });
        }
      } catch (createError) {
        console.error(
          `Error creating profile for user_idx: ${user_idx}`,
          createError
        );
        return res.status(500).json({ message: "프로필 생성 중 오류 발생" });
      }
    }

    res.json({
      profile: profile,
      experiences,
      educations,
      projects,
      skills,
    });
  } catch (error) {
    console.error("내 프로필 조회 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

/**
 * @route   PUT /api/profile/me
 * @desc    Update current user's profile (nickname, bio, picture, etc.)
 * @access  Private
 */
router.put(
  "/me",
  protect,
  uploadImage.single("picture"), // 'picture' 이름의 이미지 파일 하나 처리
  async (req, res) => {
    const user_idx = req.user.userIdx;
    const profileData = req.body; // 텍스트 필드 (multer가 처리)
    let pictureUrl = undefined; // undefined: 변경 없음, null: 삭제, string: 새 경로

    console.log(`[PUT /api/profile/me] Updating profile for user: ${user_idx}`);
    console.log("[DEBUG] req.body:", profileData);
    console.log("[DEBUG] req.file:", req.file);

    try {
      // 기존 프로필 정보 조회 (기존 이미지 경로 확인용)
      const [[existingProfile]] = await pool.query(
        "SELECT picture_url FROM user_profile WHERE user_idx = ?",
        [user_idx]
      );
      const existingPictureUrl = existingProfile?.picture_url;

      // 새 파일 처리
      if (req.file) {
        pictureUrl = req.file.path.replace(/\\/g, "/");
        console.log(`New profile picture uploaded: ${pictureUrl}`);
        // 기존 파일 삭제 시도
        if (existingPictureUrl) {
          try {
            const filePath = path.join(__dirname, "..", existingPictureUrl); // '..' 추가하여 루트 폴더 기준 경로 생성
            await fs.unlink(filePath);
            console.log(`Deleted old profile picture: ${filePath}`);
          } catch (unlinkError) {
            console.error(
              `Error deleting old profile picture ${existingPictureUrl}:`,
              unlinkError.code !== "ENOENT" ? unlinkError : "(File not found)"
            );
          }
        }
      } else if (profileData.picture_url === "null") {
        // 'null' 문자열로 삭제 요청 확인
        pictureUrl = null;
        console.log(`Request to delete profile picture.`);
        // 기존 파일 삭제 시도
        if (existingPictureUrl) {
          try {
            const filePath = path.join(__dirname, "..", existingPictureUrl); // '..' 추가
            await fs.unlink(filePath);
            console.log(`Deleted old profile picture: ${filePath}`);
          } catch (unlinkError) {
            console.error(
              `Error deleting old profile picture ${existingPictureUrl}:`,
              unlinkError.code !== "ENOENT" ? unlinkError : "(File not found)"
            );
          }
        }
      }

      // --- 동적 UPDATE 쿼리 생성 ---
      const fieldsToUpdate = [];
      const values = [];

      // req.body에서 직접 키를 확인하여 업데이트할 필드 결정
      if (profileData.nickname !== undefined) {
        fieldsToUpdate.push("nickname = ?");
        values.push(profileData.nickname);
      }
      if (profileData.bio !== undefined) {
        fieldsToUpdate.push("bio = ?");
        values.push(profileData.bio);
      }

      // pictureUrl 업데이트 (undefined가 아닐 때만)
      if (pictureUrl !== undefined) {
        fieldsToUpdate.push("picture_url = ?");
        values.push(pictureUrl);
      }

      if (fieldsToUpdate.length === 0) {
        console.log("[DEBUG] No fields to update.");
        // 변경사항 없어도 현재 프로필 정보 반환
        const [[currentProfile]] = await pool.query(
          "SELECT * FROM user_profile WHERE user_idx = ?",
          [user_idx]
        );
        return res.json(currentProfile);
        // return res.json({ message: '변경된 내용이 없습니다.' }); // 또는 메시지만 반환
      }

      values.push(user_idx); // WHERE 절
      const sql = `UPDATE user_profile SET ${fieldsToUpdate.join(
        ", "
      )} WHERE user_idx = ?`;

      console.log("[DEBUG] Executing SQL:", sql);
      console.log("[DEBUG] With Values:", values);

      await pool.query(sql, values);
      // --- 동적 쿼리 생성 끝 ---

      const [[updatedProfile]] = await pool.query(
        "SELECT * FROM user_profile WHERE user_idx = ?",
        [user_idx]
      );
      console.log("Profile updated successfully.");
      res.json(updatedProfile);
    } catch (error) {
      console.error("프로필 수정 오류:", error);
      // 오류 발생 시 업로드된 파일 삭제 시도
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
          console.log(`Deleted temporary file due to error: ${req.file.path}`);
        } catch (cleanupError) {
          console.error(
            `Error deleting temporary file ${req.file.path}:`,
            cleanupError
          );
        }
      }
      res.status(500).json({ message: "서버 오류" });
    }
  }
);

// --- 이력 항목 관리 API (경력 예시) ---

/**
 * @route   POST /api/profile/experiences
 * @desc    Add new experience
 * @access  Private
 */
router.post("/experiences", protect, async (req, res) => {
  const user_idx = req.user.userIdx;
  const { company_name, position, start_date, end_date, description } =
    req.body;

  if (!company_name || !position || !start_date) {
    return res
      .status(400)
      .json({ message: "회사명, 직책, 시작일은 필수입니다." });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO experiences (user_idx, company_name, position, start_date, end_date, description) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        user_idx,
        company_name,
        position,
        start_date,
        end_date || null,
        description,
      ]
    );
    const [[newExperience]] = await pool.query(
      "SELECT * FROM experiences WHERE idx = ?",
      [result.insertId]
    );
    res.status(201).json(newExperience);
  } catch (error) {
    console.error("경력 추가 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

/**
 * @route   PUT /api/profile/experiences/:expId
 * @desc    Update an experience item
 * @access  Private
 */
router.put("/experiences/:expId", protect, async (req, res) => {
  const { expId } = req.params;
  const user_idx = req.user.userIdx;
  const updateData = req.body;

  // TODO: 동적 쿼리 생성 및 보안 검증 구현
  console.warn(
    `[WARN] PUT /api/profile/experiences/${expId} is not fully implemented yet.`
  );
  res
    .status(501)
    .json({ message: "경력 수정 API는 아직 구현되지 않았습니다." });
});

/**
 * @route   DELETE /api/profile/experiences/:expId
 * @desc    Delete an experience item
 * @access  Private
 */
router.delete("/experiences/:expId", protect, async (req, res) => {
  const { expId } = req.params;
  const user_idx = req.user.userIdx;

  try {
    // 보안 검증: 해당 경력이 현재 사용자의 것인지 확인
    const [result] = await pool.query(
      "DELETE FROM experiences WHERE idx = ? AND user_idx = ?",
      [expId, user_idx]
    );
    if (result.affectedRows === 0) {
      return res
        .status(404)
        .json({ message: "해당 경력을 찾을 수 없거나 삭제 권한이 없습니다." });
    }
    res.json({ message: "경력이 성공적으로 삭제되었습니다." });
  } catch (error) {
    console.error("경력 삭제 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// --- TODO: 학력(educations), 프로젝트(projects), 기술(skills) CRUD API 추가 ---
// 경력 API와 유사한 방식으로 구현합니다.

module.exports = router;
