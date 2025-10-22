// ** 강좌 API 라우터 **

/** 얘네 셋은 필수인듯 */
const express = require("express");
const router = express.Router();
const pool = require("../db");
// 로그인 인증 기능을 수행할 미들웨어
const { protect } = require("../middleware/authMiddleWare.js");
const upload = require("../config/multerConfig"); // 방금 만든 multer 설정 import

// -- 강좌 관리 API --

// 1. 새 강좌 생성
// POST /api/courses
router.post("/", protect, async (req, res) => {
  const { title, description, price, discount_price } = req.body;
  const instructor_idx = req.user.userIdx; // 미들웨어를 통과한 사용자의 인덱스

  if (!title) {
    return res.status(400).json({ message: "강좌 제목은 필수입니다." });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO courses (instructor_idx, title, description, price, discount_price, status) VALUES (?, ?, ?, ?, ?, 'draft')`,
      [instructor_idx, title, description, price || 0, discount_price]
    );
    const newCourseId = result.insertId;
    const [newCourse] = await pool.query(
      `SELECT * FROM courses WHERE idx = ?`,
      [newCourseId]
    );
    res.status(201).json(newCourse[0]);
  } catch (error) {
    console.error("강좌 생성 중 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 2. "내가 만든" 강좌 목록 조회
// GET /api/courses/my-courses
router.get("/my-courses", protect, async (req, res) => {
  const instructor_idx = req.user.userIdx;
  try {
    const [courses] = await pool.query(
      `SELECT * FROM courses WHERE instructor_idx = ? ORDER BY created_at DESC`,
      [instructor_idx]
    );
    res.json(courses);
  } catch (error) {
    console.error("내 강좌 목록 조회 중 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 3. 특정 강좌 상세 정보 조회 (관리용)
// GET /api/courses/:courseId
router.get("/:courseId", protect, async (req, res) => {
  const { courseId } = req.params;
  const instructor_idx = req.user.userIdx;

  try {
    // 본인이 만든 강좌가 맞는지 확인
    const [courses] = await pool.query(
      `SELECT * FROM courses WHERE idx = ? AND instructor_idx = ?`,
      [courseId, instructor_idx]
    );

    if (courses.length === 0) {
      return res
        .status(404)
        .json({ message: "강좌를 찾을 수 없거나 권한이 없습니다." });
    }

    const course = courses[0];

    // 이 강좌에 속한 섹션 목록을 순서대로 가져옵니다.
    const [sections] = await pool.query(
      `SELECT * FROM sections WHERE course_idx = ? ORDER BY \`order\` ASC`,
      [courseId]
    );

    // 각 섹션에 속한 동영상 강의(lectures) 목록도 함께 조회합니다.
    for (const section of sections) {
      const [lectures] = await pool.query(
        `SELECT * FROM lectures WHERE section_idx = ? ORDER BY \`order\` ASC`,
        [section.idx]
      );
      section.lectures = lectures;
    }

    res.json({ ...course, sections });
  } catch (error) {
    console.error("강좌 상세 정보 조회 중 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 4. 특정 강좌 정보 수정
// PUT /api/courses/:courseId
router.put("/:courseId", protect, async (req, res) => {
  const { courseId } = req.params;
  const courseData = req.body;
  const instructor_idx = req.user.userIdx;

  try {
    // 본인이 만든 강좌가 맞는지 확인
    const [courseCheck] = await pool.query(
      `SELECT instructor_idx FROM courses WHERE idx = ?`,
      [courseId]
    );
    if (
      courseCheck.length === 0 ||
      courseCheck[0].instructor_idx !== instructor_idx
    ) {
      return res.status(403).json({ message: "권한이 없습니다." });
    }

    // **동적으로 Update 쿼리 생성**
    const fieldsToUpdate = []; // 업데이트할 필드 (title, )
    const values = []; // 필드에 삽입될 value 값 모음.

    // req.body에 포함된 키만 쿼리에 추가
    if (courseData.title !== undefined) {
      fieldsToUpdate.push("title = ?");
      values.push(courseData.title);
    }
    if (courseData.description !== undefined) {
      fieldsToUpdate.push("description = ?");
      values.push(courseData.description);
    }
    if (courseData.price !== undefined) {
      fieldsToUpdate.push("price = ?");
      values.push(courseData.price);
    }
    // discount_price는 null일 수 있으므로 별도 처리
    if (courseData.hasOwnProperty("discount_price")) {
      fieldsToUpdate.push("discount_price = ?");
      values.push(courseData.discount_price);
    }

    if (fieldsToUpdate.length === 0) {
      return res.status(400).json({ message: "수정할 내용이 없습니다." });
    }

    values.push(courseId); // WHERE 절에 사용할 courseId 추가

    const sql = `UPDATE courses SET ${fieldsToUpdate.join(", ")} WHERE idx = ?`;

    await pool.query(sql, values);
    // 동적 쿼리 생성 끝

    const [updatedCourse] = await pool.query(
      `SELECT * FROM courses WHERE idx = ?`,
      [courseId]
    );
    res.json(updatedCourse[0]);
  } catch (error) {
    console.error("강좌 수정 중 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 5. 특정 강좌에 새 섹션 추가
// POST /api/courses/:courseId/sections
router.post("/:courseId/sections", protect, async (req, res) => {
  const { courseId } = req.params;
  const { title } = req.body;
  const instructor_idx = req.user.userIdx;

  if (!title) {
    return res.status(400).json({ message: "섹션 제목은 필수입니다." });
  }

  try {
    // 본인 강좌가 맞는지 확인
    const [courseCheck] = await pool.query(
      `SELECT idx FROM courses WHERE idx = ? AND instructor_idx = ?`,
      [courseId, instructor_idx]
    );
    if (courseCheck.length === 0) {
      return res.status(403).json({ message: "권한이 없습니다." });
    }

    // 현재 섹션 개수를 세어서 다음 순서(order)를 결정
    const [countResult] = await pool.query(
      `SELECT COUNT(*) as count FROM sections WHERE course_idx = ?`,
      [courseId]
    );
    const newOrder = countResult[0].count + 1;

    // 새 섹션 삽입
    const [result] = await pool.query(
      `INSERT INTO sections (course_idx, title, \`order\`) VALUES (?, ?, ?)`,
      [courseId, title, newOrder]
    );

    const [newSection] = await pool.query(
      `SELECT * FROM sections WHERE idx = ?`,
      [result.insertId]
    );
    res.status(201).json(newSection[0]);
  } catch (error) {
    console.error("섹션 생성 중 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 6. 특정 섹션에 새 강의 추가 (★★파일 업로드 기능 적용★★)
// POST /api/courses/sections/:sectionId/lectures
router.post(
  "/sections/:sectionId/lectures",
  protect,
  upload.single("video"), // 'video'라는 이름의 파일을 하나 받아서 처리하는 multer 미들웨어
  async (req, res) => {
    const { sectionId } = req.params;
    // multer가 텍스트 필드를 req.body에 채워줍니다.
    const {
      title,
      duration_seconds,
      uploadType,
      video_url: videoUrlFromClient,
    } = req.body;
    const instructor_idx = req.user.userIdx;

    let finalVideoUrl = "";

    // 1. 업로드 타입에 따라 video_url 결정
    if (uploadType === "upload") {
      if (!req.file) {
        return res
          .status(400)
          .json({ message: "동영상 파일이 업로드되지 않았습니다." });
      }
      // multer가 저장한 파일의 경로를 finalVideoUrl로 사용
      // Windows에서는 경로의 '\'를 '/'로 변경해주는 것이 좋습니다.
      finalVideoUrl = req.file.path.replace(/\\/g, "/");
    } else if (uploadType === "url") {
      if (!videoUrlFromClient) {
        return res
          .status(400)
          .json({ message: "동영상 URL이 입력되지 않았습니다." });
      }
      finalVideoUrl = videoUrlFromClient;
    } else {
      return res.status(400).json({ message: "알 수 없는 업로드 타입입니다." });
    }

    if (!title || !duration_seconds) {
      return res
        .status(400)
        .json({ message: "강의 제목과 영상 길이는 필수입니다." });
    }

    try {
      // (보안 검증 로직은 이전과 동일)
      const [sectionCheck] = await pool.query(
        `SELECT c.instructor_idx FROM sections s JOIN courses c ON s.course_idx = c.idx WHERE s.idx = ?`,
        [sectionId]
      );
      if (
        sectionCheck.length === 0 ||
        sectionCheck[0].instructor_idx !== instructor_idx
      ) {
        return res.status(403).json({ message: "권한이 없습니다." });
      }

      const [countResult] = await pool.query(
        `SELECT COUNT(*) as count FROM lectures WHERE section_idx = ?`,
        [sectionId]
      );
      const newOrder = countResult[0].count + 1;

      // 2. 최종 결정된 finalVideoUrl을 DB에 저장
      const [result] = await pool.query(
        "INSERT INTO lectures (section_idx, title, video_url, duration_seconds, `order`) VALUES (?, ?, ?, ?, ?)",
        [sectionId, title, finalVideoUrl, duration_seconds, newOrder]
      );

      const [newLecture] = await pool.query(
        `SELECT * FROM lectures WHERE idx = ?`,
        [result.insertId]
      );
      res.status(201).json(newLecture[0]);
    } catch (error) {
      console.error("강의 생성 중 오류:", error);
      res.status(500).json({ message: "서버 오류" });
    }
  }
);

// 7. 섹션 순서 일괄 변경
// PATCH /api/courses/sections/reorder
router.patch("/sections/reorder", protect, async (req, res) => {
  // req.body 예시: [{ idx: 3, order: 1 }, { idx: 1, order: 2 }, { idx: 2, order: 3 }]
  const { sections } = req.body;
  const instructor_idx = req.user.userIdx;

  if (!Array.isArray(sections) || sections.length === 0) {
    return res
      .status(400)
      .json({ message: "섹션 순서 정보가 올바르지 않습니다." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 보안: 요청된 모든 섹션이 현재 로그인한 강사의 소유인지 확인
    const sectionIds = sections.map((s) => s.idx);
    const [ownedSections] = await connection.query(
      `SELECT s.idx FROM sections s JOIN courses c ON s.course_idx = c.idx WHERE c.instructor_idx = ? AND s.idx IN (?)`,
      [instructor_idx, sectionIds]
    );
    if (ownedSections.length !== sections.length) {
      await connection.rollback();
      return res
        .status(403)
        .json({ message: "권한이 없는 섹션이 포함되어 있습니다." });
    }

    // Promise.all을 사용하여 모든 업데이트 쿼리를 병렬로 실행
    await Promise.all(
      sections.map((section) =>
        connection.query("UPDATE sections SET `order` = ? WHERE idx = ?", [
          section.order,
          section.idx,
        ])
      )
    );

    await connection.commit();
    res.json({ message: "섹션 순서가 성공적으로 업데이트되었습니다." });
  } catch (error) {
    await connection.rollback();
    console.error("섹션 순서 변경 중 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  } finally {
    connection.release();
  }
});

// 8. 강의 순서 및 소속 섹션 일괄 변경
// PATCH /api/courses/lectures/reorder
router.patch("/lectures/reorder", protect, async (req, res) => {
  // req.body 예시:
  // [
  //   { idx: 101, order: 1, section_idx: 1 },
  //   { idx: 103, order: 2, section_idx: 1 },
  //   { idx: 102, order: 1, section_idx: 2 } // 102번 강의가 2번 섹션으로 이동
  // ]
  const { lectures } = req.body;
  const instructor_idx = req.user.userIdx;

  if (!Array.isArray(lectures) || lectures.length === 0) {
    return res
      .status(400)
      .json({ message: "강의 순서 정보가 올바르지 않습니다." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 보안 검증 (생략 - 섹션 검증과 유사하게 구현 가능)

    await Promise.all(
      lectures.map((lecture) =>
        connection.query(
          "UPDATE lectures SET `order` = ?, section_idx = ? WHERE idx = ?",
          [lecture.order, lecture.section_idx, lecture.idx]
        )
      )
    );

    await connection.commit();
    res.json({ message: "강의 순서가 성공적으로 업데이트되었습니다." });
  } catch (error) {
    await connection.rollback();
    console.error("강의 순서 변경 중 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  } finally {
    connection.release();
  }
});

// 9. 섹션 정보 수정 (제목 변경)
// PUT /api/courses/sections/:sectionId
router.put("/sections/:sectionId", protect, async (req, res) => {
  const { sectionId } = req.params;
  const { title } = req.body;
  const instructor_idx = req.user.userIdx;

  if (!title) {
    return res.status(400).json({ message: "섹션 제목은 필수입니다." });
  }

  try {
    // 보안 검증 (본인 강좌의 섹션인지 확인)
    const [sectionCheck] = await pool.query(
      `SELECT c.instructor_idx FROM sections s JOIN courses c ON s.course_idx = c.idx WHERE s.idx = ?`,
      [sectionId]
    );
    if (
      sectionCheck.length === 0 ||
      sectionCheck[0].instructor_idx !== instructor_idx
    ) {
      return res.status(403).json({ message: "권한이 없습니다." });
    }

    await pool.query("UPDATE sections SET title = ? WHERE idx = ?", [
      title,
      sectionId,
    ]);
    res.json({ message: "섹션이 성공적으로 수정되었습니다." });
  } catch (error) {
    console.error("섹션 수정 중 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 10. 섹션 삭제
// DELETE /api/courses/sections/:sectionId
router.delete("/sections/:sectionId", protect, async (req, res) => {
  const { sectionId } = req.params;
  const instructor_idx = req.user.userIdx;

  try {
    // 보안 검증
    const [sectionCheck] = await pool.query(
      `SELECT c.instructor_idx FROM sections s JOIN courses c ON s.course_idx = c.idx WHERE s.idx = ?`,
      [sectionId]
    );
    if (
      sectionCheck.length === 0 ||
      sectionCheck[0].instructor_idx !== instructor_idx
    ) {
      return res.status(403).json({ message: "권한이 없습니다." });
    }

    // DB에서 ON DELETE CASCADE 제약조건에 의해 하위 강의들도 함께 삭제됩니다.
    await pool.query("DELETE FROM sections WHERE idx = ?", [sectionId]);
    res.json({ message: "섹션이 성공적으로 삭제되었습니다." });
  } catch (error) {
    console.error("섹션 삭제 중 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 11. 강의 정보 수정 (제목, 영상 길이 등)
// PUT /api/courses/lectures/:lectureId
router.put(
  "/lectures/:lectureId",
  protect,
  upload.single("video"),
  async (req, res) => {
    const { lectureId } = req.params;
    // 아래와 같은 방법은, 무조건 duration_seconds가 body에 담겨있어야 하며, null이 들어갈 경우 수정되지 않는다.
    // 제목만 수정할 경우 까지 고려해서 만들어져야 한다.
    //const { title, duration_seconds } = req.body;
    const updateFields = req.body;
    const instructor_idx = req.user.userIdx;

    try {
      // 보안 검증 (본인 강좌의 강의인지 확인)
      const [lectureCheck] = await pool.query(
        `SELECT c.instructor_idx FROM lectures l
                 JOIN sections s ON l.section_idx = s.idx
                 JOIN courses c ON s.course_idx = c.idx
                 WHERE l.idx = ?`,
        [lectureId]
      );
      if (
        lectureCheck.length === 0 ||
        lectureCheck[0].instructor_idx !== instructor_idx
      ) {
        return res.status(403).json({ message: "권한이 없습니다." });
      }

      // **동적 쿼리 생성**
      const fieldsToUpdate = []; // 업데이트할 필드 (title, )
      const values = []; // 필드에 삽입될 value 값 모음.

      // req.body에 포함된 키만 쿼리에 추가
      if (updateFields.title) {
        fieldsToUpdate.push("title = ?");
        values.push(updateFields.title);
      }
      if (updateFields.duration_seconds) {
        fieldsToUpdate.push("duration_seconds = ?");
        values.push(updateFields.duration_seconds);
      }
      // ... 나중에 다른 필드를 수정하고 싶다면 여기에 추가 ...

      // 파일 필드 업데이트 (새 파일이 업로드되었을 경우)
      if (req.file) {
        const newVideoUrl = req.file.path.replace(/\\/g, "/");
        fieldsToUpdate.push("video_url = ?");
        values.push(newVideoUrl);
        // TODO: 여기에 기존에 업로드되었던 영상 파일을 서버에서 삭제하는 로직을 추가하면 좋습니다.
      }
      // 2순위: 새 파일은 없지만, URL 텍스트가 전달된 경우
      else if (updateFields.video_url) {
        fieldsToUpdate.push("video_url = ?");
        values.push(updateFields.video_url);
      }

      if (updateFields.length === 0) {
        res.status(400).json({ message: "수정 가능한 필드가 없습니다." });
      }

      values.push(lectureId); // WHERE 절에 사용할 lectureId 추가

      const sql = `UPDATE lectures SET ${fieldsToUpdate.join(
        ", "
      )} WHERE idx = ?`;

      await pool.query(sql, values);

      res.json({ message: "강의가 성공적으로 수정되었습니다." });
    } catch (error) {
      console.error("강의 수정 중 오류:", error);
      res.status(500).json({ message: "서버 오류" });
    }
  }
);

// 12. 강의 삭제
// DELETE /api/courses/lectures/:lectureId
router.delete("/lectures/:lectureId", protect, async (req, res) => {
  const { lectureId } = req.params;
  const instructor_idx = req.user.userIdx;
  try {
    // 보안 검증 생략
    await pool.query("DELETE FROM lectures WHERE idx = ?", [lectureId]);
    res.json({ message: "강의가 성공적으로 삭제되었습니다." });
  } catch (error) {
    console.error("강의 삭제 중 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 13. 게시된 모든 강좌 목록 조회 (공개용)
// GET /api/courses
router.get("/", async (req, res) => {
  try {
    const [courses] = await pool.query(
      `SELECT c.idx, c.title, c.description, c.thumbnail_url, c.price, c.discount_price, 
                c.avg_rating, c.review_count, c.enrollment_count,
                u.name as instructor_name 
             FROM courses c
             JOIN users u ON c.instructor_idx = u.idx
             WHERE c.status = 'published'
             ORDER BY c.created_at DESC`
    );

    res.json(courses);
  } catch (error) {
    console.error("전체 강좌 목록 조회 중 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

// 14. 게시된 특정 강좌의 상세 정보 조회 (공개용)
// GET /api/courses/public/:courseId
router.get("/public/:courseId", async (req, res) => {
  const { courseId } = req.params;

  try {
    // 1. 강좌 기본 정보 및 강사 정보 조회
    const [courses] = await pool.query(
      `SELECT 
                c.*, 
                u.name as instructor_name 
             FROM courses c
             JOIN users u ON c.instructor_idx = u.idx
             WHERE c.idx = ? AND c.status = 'published'`,
      [courseId]
    );

    if (courses.length === 0) {
      return res
        .status(404)
        .json({ message: "게시된 강좌를 찾을 수 없습니다." });
    }

    const course = courses[0];

    // 2. 해당 강좌의 커리큘럼 (섹션 및 강의 목록) 조회
    const [sections] = await pool.query(
      "SELECT * FROM sections WHERE course_idx = ? ORDER BY `order` ASC",
      [courseId]
    );

    for (const section of sections) {
      const [lectures] = await pool.query(
        "SELECT idx, title, duration_seconds, `order` FROM lectures WHERE section_idx = ? ORDER BY `order` ASC",
        [section.idx]
      );
      // 공개용이므로 video_url은 제외하고 보냅니다.
      section.lectures = lectures;
    }

    // TODO: 해당 강좌의 수강 후기 목록 조회

    res.json({ ...course, sections });
  } catch (error) {
    console.error("공개 강좌 상세 조회 중 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  }
});

module.exports = router;
