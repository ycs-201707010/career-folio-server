const express = require("express");
const router = express.Router();
const pool = require("../db"); // DB 연결 풀
const { protect } = require("../middleware/authMiddleWare");
const { uploadImage } = require("../config/multerConfig"); // 이미지 업로드용 multer 설정
const fs = require("fs").promises; // 파일 시스템 접근 (파일 삭제용)
const path = require("path"); // 경로 처리용
const { fetchProfileData } = require("../services/profile.service");

// --- 내 프로필 및 이력서 정보 관리 API ---
/**
 * @route   GET /api/profile/me
 * @desc    Get current user's full profile and resume data (Joined)
 * @access  Private
 */
router.get("/me", protect, async (req, res) => {
  const user_idx = req.user.userIdx; // (Turn 51에서 수정한 user.idx)
  console.log(`[GET /api/profile/me] Fetching full data for user: ${user_idx}`);

  try {
    // 👇 2. [핵심] 여기서 직접 SQL을 실행하는 대신, service 함수를 호출합니다.
    const profileData = await fetchProfileData(user_idx);

    // 3. service가 반환한 데이터를 그대로 클라이언트에 전송합니다.
    res.json(profileData);
  } catch (error) {
    console.error("내 프로필 조회 오류:", error);
    // 4. service에서 profile이 없으면 new Error를 throw했으므로, 여기서 잡아줍니다.
    if (error.message === "프로필을 찾을 수 없습니다.") {
      return res.status(404).json({ message: "프로필을 찾을 수 없습니다." });
    }
    res.status(500).json({ message: "서버 오류" });
  }
});

// ** 사용자의 프로필 창(수정창 아님) **
/**
 * @route   GET /api/profile/:id
 * @desc    Get a user's public profile by their string ID (from user_credentials)
 * @access  Public
 */
router.get("/:id", async (req, res) => {
  const targetId = req.params.id; // 예: 'king-gwangpil'

  try {
    // 1. ID로 user_idx 찾기
    const [[credential]] = await pool.query(
      "SELECT user_idx FROM user_credentials WHERE id = ?",
      [targetId]
    );
    if (!credential) {
      return res.status(404).json({ message: "사용자를 찾을 수 없습니다." });
    }
    const user_idx = credential.user_idx;

    // 2. [수정] 공개 프로필에 필요한 "최소한의" 정보만 JOIN
    // (username, nickname, bio, picture_url)
    const [profileResult] = await pool.query(
      `SELECT 
      u.name AS username,
      u.email,
      p.user_idx,
         p.nickname,
         p.bio,
         p.picture_url,  -- (아바타용 사진)
         p.readme
       FROM users u
       JOIN user_profile p ON u.idx = p.user_idx
       WHERE u.idx = ?`,
      [user_idx]
    );
    const profile = profileResult[0];

    // 3. [수정] "경력"과 "기술"만 조회 (대리님 요청 사항)
    const [[experiences], [skills]] = await Promise.all([
      pool.query(
        "SELECT * FROM experiences WHERE user_idx = ? ORDER BY start_date DESC",
        [user_idx]
      ),
      pool.query(
        "SELECT * FROM skills WHERE user_idx = ? ORDER BY category, skill_name",
        [user_idx]
      ),
    ]);

    // 4. [수정] 공개용으로 "안전하게" 조합
    // (educations, projects, 민감 정보는 의도적으로 제외)
    res.json({
      profile: profile,
      experiences: experiences,
      skills: skills,
      // (뱃지 정보는 나중에 여기에 추가)
    });
  } catch (error) {
    console.error(`공개 프로필 조회 오류 (ID: ${targetId}):`, error);
    res.status(500).json({ message: "서버 오류" });
  }
});

/**
 * @route   PUT /api/profile/me
 * @desc    Update user_profile (nickname, bio, picture_url)
 * @access  Private
 */
router.put(
  "/me",
  protect,
  uploadImage.single("picture"), // 'picture' (아바타용)
  async (req, res) => {
    const user_idx = req.user.userIdx;
    const profileData = req.body;
    let pictureUrl = undefined;

    console.log(`[PUT /api/profile/me] Updating profile for user: ${user_idx}`);

    try {
      const [[existingProfile]] = await pool.query(
        "SELECT picture_url FROM user_profile WHERE user_idx = ?",
        [user_idx]
      );
      const existingPictureUrl = existingProfile?.picture_url;

      if (req.file) {
        pictureUrl = req.file.path.replace(/\\/g, "/");
        if (existingPictureUrl) {
          try {
            const filePath = path.join(__dirname, "..", existingPictureUrl);
            await fs.unlink(filePath);
            console.log(`Deleted old profile picture: ${filePath}`);
          } catch (unlinkError) {
            console.error(
              `Error deleting old picture ${existingPictureUrl}:`,
              unlinkError.code !== "ENOENT" ? unlinkError : "(File not found)"
            );
          }
        }
      } else if (profileData.picture_url === "null") {
        pictureUrl = null;
        if (existingPictureUrl) {
          try {
            const filePath = path.join(__dirname, "..", existingPictureUrl);
            await fs.unlink(filePath);
            console.log(`Deleted old profile picture: ${filePath}`);
          } catch (unlinkError) {
            console.error(
              `Error deleting old picture ${existingPictureUrl}:`,
              unlinkError.code !== "ENOENT" ? unlinkError : "(File not found)"
            );
          }
        }
      }

      const fieldsToUpdate = [];
      const values = [];

      if (profileData.nickname !== undefined) {
        fieldsToUpdate.push("nickname = ?");
        values.push(profileData.nickname);
      }
      if (profileData.bio !== undefined) {
        fieldsToUpdate.push("bio = ?");
        values.push(profileData.bio);
      }
      if (profileData.address !== undefined) {
        fieldsToUpdate.push("address = ?");
        values.push(profileData.address);
      }
      if (pictureUrl !== undefined) {
        fieldsToUpdate.push("picture_url = ?");
        values.push(pictureUrl);
      }

      if (fieldsToUpdate.length === 0) {
        const [[currentProfile]] = await pool.query(
          "SELECT * FROM user_profile WHERE user_idx = ?",
          [user_idx]
        );
        return res.json(currentProfile);
      }

      values.push(user_idx);
      const sql = `UPDATE user_profile SET ${fieldsToUpdate.join(
        ", "
      )} WHERE user_idx = ?`;

      await pool.query(sql, values);

      const [[updatedProfile]] = await pool.query(
        "SELECT * FROM user_profile WHERE user_idx = ?",
        [user_idx]
      );
      console.log("Profile updated successfully.");
      res.json(updatedProfile);
    } catch (error) {
      console.error("프로필 수정 오류:", error);
      if (req.file) {
        try {
          await fs.unlink(req.file.path);
        } catch (cleanupError) {
          console.error(`Error deleting temp file:`, cleanupError);
        }
      }
      res.status(500).json({ message: "서버 오류" });
    }
  }
);

/**
 * @route   PUT /api/profile/resume-photo
 * @desc    Update resume photo (resume_photo_url)
 * @access  Private
 */
router.put(
  "/resume-photo",
  protect,
  uploadImage.single("resume_photo"), // 👈 'resume_photo'라는 이름의 파일
  async (req, res) => {
    const user_idx = req.user.userIdx;
    console.log(
      `[PUT /api/profile/resume-photo] Uploading for user: ${user_idx}`
    );

    if (!req.file) {
      return res.status(400).json({ message: "이미지 파일이 필요합니다." });
    }

    const newPhotoUrl = req.file.path.replace(/\\/g, "/");

    try {
      // 1. 기존 증명사진 경로 조회
      const [[existingProfile]] = await pool.query(
        "SELECT resume_photo_url FROM user_profile WHERE user_idx = ?",
        [user_idx]
      );
      const oldPhotoUrl = existingProfile?.resume_photo_url;

      // 2. 새 이미지 경로로 DB 업데이트
      await pool.query(
        "UPDATE user_profile SET resume_photo_url = ? WHERE user_idx = ?",
        [newPhotoUrl, user_idx]
      );

      // 3. 기존 증명사진 파일 삭제 (있었다면)
      if (oldPhotoUrl) {
        try {
          const filePath = path.join(__dirname, "..", oldPhotoUrl);
          await fs.unlink(filePath);
          console.log(`Deleted old resume photo: ${filePath}`);
        } catch (unlinkError) {
          console.error(
            `Error deleting old photo ${oldPhotoUrl}:`,
            unlinkError.code !== "ENOENT" ? unlinkError : "(File not found)"
          );
        }
      }

      // 4. 프론트엔드가 즉시 상태를 업데이트할 수 있도록 새 URL 반환
      res.json({ resume_photo_url: newPhotoUrl });
    } catch (error) {
      console.error("증명사진 업로드 오류:", error);
      // 오류 발생 시 방금 업로드된 새 파일 삭제
      try {
        await fs.unlink(req.file.path);
      } catch (e) {}
      res.status(500).json({ message: "서버 오류" });
    }
  }
);

// --------------------------------------------------
// --- 👇 [신규] README 수정 API ---
// --------------------------------------------------
/**
 * @route   PUT /api/profile/readme
 * @desc    Update user's profile README.md
 * @access  Private
 */
router.put("/readme", protect, async (req, res) => {
  const user_idx = req.user.userIdx; // (auth.js 수정에 따라 idx 또는 userIdx 확인 필요. 여기선 userIdx로 가정)
  // ★ 중요: auth.js에서 req.user에 넣는 값이 idx인지 userIdx인지 확인하세요.
  // Turn 83에서 userIdx: user.idx 로 넣으셨다면 userIdx가 맞습니다.

  const { readme } = req.body;

  try {
    await pool.query("UPDATE user_profile SET readme = ? WHERE user_idx = ?", [
      readme,
      user_idx,
    ]);
    res.json({ message: "README가 성공적으로 저장되었습니다." });
  } catch (error) {
    console.error("README 저장 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// --- ⬇️ [수정됨] 이력 항목 CRUD API (모두 구현) ⬇️ ---

// --------------------------------------------------
// --- 💼 경력(experiences) CRUD API ---
// --------------------------------------------------

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
    res.status(500).json({ message: "서버 오류" });
  }
});

router.put("/experiences/:expId", protect, async (req, res) => {
  const { expId } = req.params;
  const user_idx = req.user.userIdx;
  const { company_name, position, start_date, end_date, description } =
    req.body;
  if (!company_name || !position || !start_date) {
    return res.status(400).json({ message: "필수 항목을 입력해주세요." });
  }
  try {
    const [result] = await pool.query(
      `UPDATE experiences SET company_name = ?, position = ?, start_date = ?, end_date = ?, description = ? WHERE idx = ? AND user_idx = ?`,
      [
        company_name,
        position,
        start_date,
        end_date || null,
        description,
        expId,
        user_idx,
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "항목을 찾을 수 없습니다." });
    }
    const [[updatedExperience]] = await pool.query(
      "SELECT * FROM experiences WHERE idx = ?",
      [expId]
    );
    res.json(updatedExperience);
  } catch (error) {
    res.status(500).json({ message: "서버 오류" });
  }
});

router.delete("/experiences/:expId", protect, async (req, res) => {
  const { expId } = req.params;
  const user_idx = req.user.userIdx;
  try {
    const [result] = await pool.query(
      "DELETE FROM experiences WHERE idx = ? AND user_idx = ?",
      [expId, user_idx]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "항목을 찾을 수 없습니다." });
    }
    res.json({ message: "성공적으로 삭제되었습니다." });
  } catch (error) {
    res.status(500).json({ message: "서버 오류" });
  }
});

// --------------------------------------------------
// --- 🎓 학력(educations) CRUD API ---
// --------------------------------------------------

router.post("/educations", protect, async (req, res) => {
  const user_idx = req.user.userIdx;
  const { institution_name, degree, major, start_date, end_date } = req.body;
  if (!institution_name || !start_date) {
    return res.status(400).json({ message: "학교명과 입학일은 필수입니다." });
  }
  try {
    const [result] = await pool.query(
      `INSERT INTO educations (user_idx, institution_name, degree, major, start_date, end_date) VALUES (?, ?, ?, ?, ?, ?)`,
      [user_idx, institution_name, degree, major, start_date, end_date || null]
    );
    const [[newEducation]] = await pool.query(
      "SELECT * FROM educations WHERE idx = ?",
      [result.insertId]
    );
    res.status(201).json(newEducation);
  } catch (error) {
    res.status(500).json({ message: "서버 오류" });
  }
});

router.put("/educations/:eduId", protect, async (req, res) => {
  const { eduId } = req.params;
  const user_idx = req.user.userIdx;
  const { institution_name, degree, major, start_date, end_date } = req.body;
  if (!institution_name || !start_date) {
    return res.status(400).json({ message: "필수 항목을 입력해주세요." });
  }
  try {
    const [result] = await pool.query(
      `UPDATE educations SET institution_name = ?, degree = ?, major = ?, start_date = ?, end_date = ? WHERE idx = ? AND user_idx = ?`,
      [
        institution_name,
        degree,
        major,
        start_date,
        end_date || null,
        eduId,
        user_idx,
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "항목을 찾을 수 없습니다." });
    }
    const [[updatedEducation]] = await pool.query(
      "SELECT * FROM educations WHERE idx = ?",
      [eduId]
    );
    res.json(updatedEducation);
  } catch (error) {
    res.status(500).json({ message: "서버 오류" });
  }
});

router.delete("/educations/:eduId", protect, async (req, res) => {
  const { eduId } = req.params;
  const user_idx = req.user.userIdx;
  try {
    const [result] = await pool.query(
      "DELETE FROM educations WHERE idx = ? AND user_idx = ?",
      [eduId, user_idx]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "항목을 찾을 수 없습니다." });
    }
    res.json({ message: "성공적으로 삭제되었습니다." });
  } catch (error) {
    res.status(500).json({ message: "서버 오류" });
  }
});

// --------------------------------------------------
// --- 🚀 프로젝트(projects) CRUD API ---
// --------------------------------------------------

router.post("/projects", protect, async (req, res) => {
  const user_idx = req.user.userIdx;
  const { project_name, description, start_date, end_date, project_url } =
    req.body;
  if (!project_name || !start_date) {
    return res
      .status(400)
      .json({ message: "프로젝트명과 시작일은 필수입니다." });
  }
  try {
    const [result] = await pool.query(
      `INSERT INTO projects (user_idx, project_name, description, start_date, end_date, project_url) VALUES (?, ?, ?, ?, ?, ?)`,
      [
        user_idx,
        project_name,
        description,
        start_date,
        end_date || null,
        project_url,
      ]
    );
    const [[newProject]] = await pool.query(
      "SELECT * FROM projects WHERE idx = ?",
      [result.insertId]
    );
    res.status(201).json(newProject);
  } catch (error) {
    res.status(500).json({ message: "서버 오류" });
  }
});

router.put("/projects/:projId", protect, async (req, res) => {
  const { projId } = req.params;
  const user_idx = req.user.userIdx;
  const { project_name, description, start_date, end_date, project_url } =
    req.body;
  if (!project_name || !start_date) {
    return res.status(400).json({ message: "필수 항목을 입력해주세요." });
  }
  try {
    const [result] = await pool.query(
      `UPDATE projects SET project_name = ?, description = ?, start_date = ?, end_date = ?, project_url = ? WHERE idx = ? AND user_idx = ?`,
      [
        project_name,
        description,
        start_date,
        end_date || null,
        project_url,
        projId,
        user_idx,
      ]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "항목을 찾을 수 없습니다." });
    }
    const [[updatedProject]] = await pool.query(
      "SELECT * FROM projects WHERE idx = ?",
      [projId]
    );
    res.json(updatedProject);
  } catch (error) {
    res.status(500).json({ message: "서버 오류" });
  }
});

router.delete("/projects/:projId", protect, async (req, res) => {
  const { projId } = req.params;
  const user_idx = req.user.userIdx;
  try {
    const [result] = await pool.query(
      "DELETE FROM projects WHERE idx = ? AND user_idx = ?",
      [projId, user_idx]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "항목을 찾을 수 없습니다." });
    }
    res.json({ message: "성공적으로 삭제되었습니다." });
  } catch (error) {
    res.status(500).json({ message: "서버 오류" });
  }
});

// --------------------------------------------------
// --- 💡 스킬(skills) CRUD API ---
// --------------------------------------------------

router.post("/skills", protect, async (req, res) => {
  const user_idx = req.user.userIdx;
  const { skill_name, category } = req.body;
  if (!skill_name) {
    return res.status(400).json({ message: "스킬 이름은 필수입니다." });
  }
  try {
    const [result] = await pool.query(
      `INSERT INTO skills (user_idx, skill_name, category) VALUES (?, ?, ?)`,
      [user_idx, skill_name, category || null]
    );
    const [[newSkill]] = await pool.query(
      "SELECT * FROM skills WHERE idx = ?",
      [result.insertId]
    );
    res.status(201).json(newSkill);
  } catch (error) {
    res.status(500).json({ message: "서버 오류" });
  }
});

router.put("/skills/:skillId", protect, async (req, res) => {
  const { skillId } = req.params;
  const user_idx = req.user.userIdx;
  const { skill_name, category } = req.body;
  if (!skill_name) {
    return res.status(400).json({ message: "필수 항목을 입력해주세요." });
  }
  try {
    const [result] = await pool.query(
      `UPDATE skills SET skill_name = ?, category = ? WHERE idx = ? AND user_idx = ?`,
      [skill_name, category || null, skillId, user_idx]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "항목을 찾을 수 없습니다." });
    }
    const [[updatedSkill]] = await pool.query(
      "SELECT * FROM skills WHERE idx = ?",
      [skillId]
    );
    res.json(updatedSkill);
  } catch (error) {
    res.status(500).json({ message: "서버 오류" });
  }
});

router.delete("/skills/:skillId", protect, async (req, res) => {
  const { skillId } = req.params;
  const user_idx = req.user.userIdx;
  try {
    const [result] = await pool.query(
      "DELETE FROM skills WHERE idx = ? AND user_idx = ?",
      [skillId, user_idx]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "항목을 찾을 수 없습니다." });
    }
    res.json({ message: "성공적으로 삭제되었습니다." });
  } catch (error) {
    res.status(500).json({ message: "서버 오류" });
  }
});

module.exports = router;
