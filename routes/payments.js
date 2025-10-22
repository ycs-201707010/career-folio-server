const express = require("express");
const router = express.Router();
const pool = require("../db");
const { protect } = require("../middleware/authMiddleWare.js");

// 결제 처리 및 수강 등록 API
// POST /api/payments/checkout
router.post("/checkout", protect, async (req, res) => {
  const { courseIds } = req.body; // 결제할 강좌 ID 목록 (배열)
  const user_idx = req.user.userIdx;

  if (!Array.isArray(courseIds) || courseIds.length === 0) {
    return res.status(400).json({ message: "결제할 강좌를 선택해주세요." });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. 서버에서 가격을 다시 확인하고 총액 계산 (보안)
    const [coursesToBuy] = await connection.query(
      `SELECT idx, price, discount_price FROM courses WHERE idx IN (?)`,
      [courseIds]
    );

    if (coursesToBuy.length !== courseIds.length) {
      await connection.rollback();
      return res.status(404).json({ message: "일부 강좌를 찾을 수 없습니다." });
    }

    const totalAmount = coursesToBuy.reduce((acc, course) => {
      return acc + (course.discount_price ?? course.price);
    }, 0);

    // 2. payments 테이블에 결제 기록 생성
    const [paymentResult] = await connection.query(
      `INSERT INTO payments (user_idx, amount, status) VALUES (?, ?, 'completed')`,
      [user_idx, totalAmount]
    );
    const newPaymentId = paymentResult.insertId;

    // 3. 각 강좌에 대한 후속 작업 처리 (Promise.all로 병렬 실행)
    const tasks = courseIds.map((courseId) => {
      const course = coursesToBuy.find((c) => c.idx === courseId);
      const price_at_purchase = course.discount_price ?? course.price;

      return Promise.all([
        // 3-1. payment_items에 항목 추가
        connection.query(
          "INSERT INTO payment_items (payment_idx, course_idx, price_at_purchase) VALUES (?, ?, ?)",
          [newPaymentId, courseId, price_at_purchase]
        ),
        // 3-2. enrollments에 수강 등록
        connection.query(
          "INSERT INTO enrollments (user_idx, course_idx) VALUES (?, ?)",
          [user_idx, courseId]
        ),
        // 3-3. courses의 수강생 수 증가
        connection.query(
          "UPDATE courses SET enrollment_count = enrollment_count + 1 WHERE idx = ?",
          [courseId]
        ),
        // 3-4. carts에서 해당 강좌 삭제
        connection.query(
          "DELETE FROM carts WHERE user_idx = ? AND course_idx = ?",
          [user_idx, courseId]
        ),
      ]);
    });

    await Promise.all(tasks);

    // 4. 모든 작업 성공 시 커밋
    await connection.commit();

    res
      .status(201)
      .json({ message: "결제가 완료되었습니다. 수강 목록에서 확인하세요." });
  } catch (error) {
    await connection.rollback();
    // 'ER_DUP_ENTRY'는 이미 수강 중인 강좌를 다시 등록하려 할 때 발생할 수 있습니다.
    if (error.code === "ER_DUP_ENTRY") {
      return res
        .status(409)
        .json({ message: "이미 수강 중인 강좌가 포함되어 있습니다." });
    }
    console.error("결제 처리 오류:", error);
    res.status(500).json({ message: "서버 오류" });
  } finally {
    connection.release();
  }
});

module.exports = router;
