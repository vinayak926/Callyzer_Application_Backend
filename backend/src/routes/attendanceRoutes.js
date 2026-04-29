const express = require("express");
const {
    punchIn,
    punchOut,
    getTodayStatus,
    getMyHistory,
    getAllAttendance,
    exportAttendance
} = require("../controllers/attendanceController");

const protect = require("../middlewares/authMiddleware");
const { hrOnly } = require("../middlewares/hrMiddleware");

const router = express.Router();

// All routes require a valid JWT
router.use(protect);

// ── Employee routes (any logged-in user) ─────────────────────
router.post("/punch-in", punchIn);
router.post("/punch-out", punchOut);
router.get("/today", getTodayStatus);
router.get("/history", getMyHistory);
router.get("/export", protect, hrOnly, exportAttendance);

// ── HR-only: view all attendance ─────────────────────────────
router.get("/all", hrOnly, getAllAttendance);

module.exports = router;