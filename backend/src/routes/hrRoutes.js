const express = require("express");
const {
    getHrStats,
    getRecentEmployees,
    getAllEmployees,
    getEmployeeById,
    updateHrRecord,
    getAllLeaves,
    applyLeave,
    actionLeave,
    getMyLeaves,
    applyMyLeave,
    markAttendance,
    getAttendance,
    getHrProfile,
    updateHrProfile,
} = require("../controllers/hrController");

const protect = require("../middlewares/authMiddleware");
const { hrOnly } = require("../middlewares/hrMiddleware");

const router = express.Router();

// All HR routes require valid JWT
router.use(protect);

// ── Employee self-service leave routes (any logged-in user) ───
router.get("/my-leaves", getMyLeaves);
router.post("/my-leaves", applyMyLeave);

// ── HR-only routes below ──────────────────────────────────────
router.use(hrOnly);

// ── HR Profile ────────────────────────────────────────────────
router.get("/profile", getHrProfile);
router.put("/profile", updateHrProfile);

// ── Stats & Overview ──────────────────────────────────────────
router.get("/stats", getHrStats);
router.get("/recent-employees", getRecentEmployees);

// ── Employee Management ───────────────────────────────────────
router.get("/employees", getAllEmployees);
router.get("/employees/:id", getEmployeeById);
router.put("/employees/:id/hr-record", updateHrRecord);

// ── Leave Management ──────────────────────────────────────────
router.get("/leaves", getAllLeaves);
router.post("/employees/:id/leave", applyLeave);
router.patch("/leaves/:hrRecordId/:leaveId/action", actionLeave);

// ── Attendance ────────────────────────────────────────────────
router.post("/employees/:id/attendance", markAttendance);
router.get("/employees/:id/attendance", getAttendance);

module.exports = router;