// services/qna.service.js
const pool = require("../db");

// 1. 질문 목록 조회 (페이지네이션 + 검색 + 필터)
const getQuestions = async ({
  page = 1,
  limit = 10,
  category,
  sort,
  search,
}) => {
  const offset = (page - 1) * limit;
  let sql = `
    SELECT 
      q.*, 
      u.name AS author_name, 
      up.nickname AS author_nickname,
      up.picture_url AS author_picture,
      (SELECT GROUP_CONCAT(t.name) 
       FROM question_tags qt 
       JOIN tags t ON qt.tag_idx = t.idx 
       WHERE qt.question_idx = q.idx) AS tags
    FROM questions q
    JOIN users u ON q.user_idx = u.idx
    LEFT JOIN user_profile up ON u.idx = up.user_idx
    WHERE 1=1
  `;
  const params = [];

  // 카테고리 필터
  if (category && category !== "all") {
    sql += ` AND q.category = ?`;
    params.push(category);
  }

  // 검색 (제목 + 내용)
  if (search) {
    sql += ` AND (q.title LIKE ? OR q.content LIKE ?)`;
    const term = `%${search}%`;
    params.push(term, term);
  }

  // 정렬 (최신순, 조회순, 답변많은순)
  if (sort === "views") {
    sql += ` ORDER BY q.view_count DESC, q.created_at DESC`;
  } else if (sort === "answers") {
    sql += ` ORDER BY q.answer_count DESC, q.created_at DESC`;
  } else {
    sql += ` ORDER BY q.created_at DESC`; // 기본값
  }

  // 페이지네이션
  sql += ` LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), parseInt(offset));

  const [rows] = await pool.query(sql, params);

  // 전체 개수 조회 (페이지네이션용)
  // (실제로는 WHERE 조건이 동일한 COUNT 쿼리를 하나 더 날려야 정확하지만, 여기선 생략하거나 별도 구현)

  return rows;
};

// 2. 질문 상세 조회 (+ 답변 목록 + 태그)
const getQuestionDetail = async (questionId) => {
  const connection = await pool.getConnection();
  try {
    // 2-1. 조회수 증가
    await connection.query(
      "UPDATE questions SET view_count = view_count + 1 WHERE idx = ?",
      [questionId]
    );

    // 2-2. 질문 본문 조회
    const [questions] = await connection.query(
      `
      SELECT 
        q.*, u.name AS author_name, up.nickname AS author_nickname, up.picture_url AS author_picture
      FROM questions q
      JOIN users u ON q.user_idx = u.idx
      LEFT JOIN user_profile up ON u.idx = up.user_idx
      WHERE q.idx = ?
    `,
      [questionId]
    );

    if (questions.length === 0) return null;
    const question = questions[0];

    // 2-3. 태그 조회
    const [tags] = await connection.query(
      `
      SELECT t.name FROM tags t
      JOIN question_tags qt ON t.idx = qt.tag_idx
      WHERE qt.question_idx = ?
    `,
      [questionId]
    );
    question.tags = tags.map((t) => t.name);

    // 2-4. 답변 목록 조회
    const [answers] = await connection.query(
      `
      SELECT 
        a.*, u.name AS author_name, up.nickname AS author_nickname, up.picture_url AS author_picture,
        (SELECT COUNT(*) FROM answer_likes WHERE answer_idx = a.idx AND vote_type = 'like') as like_count
      FROM answers a
      JOIN users u ON a.user_idx = u.idx
      LEFT JOIN user_profile up ON u.idx = up.user_idx
      WHERE a.question_idx = ?
      ORDER BY a.is_adopted DESC, a.created_at ASC
    `,
      [questionId]
    );

    return { question, answers };
  } finally {
    connection.release();
  }
};

// 3. 질문 생성 (트랜잭션: 질문 등록 -> 태그 등록 -> 연결)
const createQuestion = async ({
  user_idx,
  title,
  content,
  category,
  tags,
  imageUrls,
}) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 3-1. 질문 등록
    const [result] = await connection.query(
      `INSERT INTO questions (user_idx, title, content, category) VALUES (?, ?, ?, ?)`,
      [user_idx, title, content, category]
    );
    const questionId = result.insertId;

    // 3-2. 태그 처리 (복잡함: 없으면 만들고, 있으면 ID 가져와서 연결)
    if (tags && tags.length > 0) {
      for (const tagName of tags) {
        // 태그가 있으면 ID 가져오고, 없으면 생성 후 ID 가져옴 (INSERT IGNORE)
        await connection.query(`INSERT IGNORE INTO tags (name) VALUES (?)`, [
          tagName.trim(),
        ]);

        // ID 조회
        const [[tagRow]] = await connection.query(
          `SELECT idx FROM tags WHERE name = ?`,
          [tagName.trim()]
        );

        // 질문-태그 연결
        if (tagRow) {
          await connection.query(
            `INSERT INTO question_tags (question_idx, tag_idx) VALUES (?, ?)`,
            [questionId, tagRow.idx]
          );
        }
      }
    }

    // 이미지 업로드 처리.
    if (imageUrls && imageUrls.length > 0) {
      for (const url of imageUrls) {
        await connection.query(
          `INSERT INTO question_images (question_idx, image_url) VALUES (?, ?)`,
          [questionId, url]
        );
      }
    }

    await connection.commit();
    return questionId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// 4. 답변 등록
const createAnswer = async ({ user_idx, question_idx, content }) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 답변 등록
    const [result] = await connection.query(
      `INSERT INTO answers (question_idx, user_idx, content) VALUES (?, ?, ?)`,
      [question_idx, user_idx, content]
    );

    // 질문의 answer_count 증가 (역정규화된 컬럼 관리)
    await connection.query(
      `UPDATE questions SET answer_count = answer_count + 1 WHERE idx = ?`,
      [question_idx]
    );

    await connection.commit();
    return result.insertId;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  getQuestions,
  getQuestionDetail,
  createQuestion,
  createAnswer,
};
