const express = require("express");
const {
    getReports,
    exportReport,
    getSummary,          
    getHourlyReport,     
    getAgentReport,      
    getDailyTeamReport, 
} = require("../controllers/reportsController");

const protect = require("../middlewares/authMiddleware");

const router = express.Router();

router.use(protect);

// ── Purane routes (change nahi) ───────────────
router.get("/", getReports);
router.get("/export", exportReport);

// ── Naye routes ───────────────────────────────
router.get("/summary", getSummary);             // GET /api/reports/summary?period=today
router.get("/hourly", getHourlyReport);          // GET /api/reports/hourly?date=2026-04-30
router.get("/agent/:id", getAgentReport);        // GET /api/reports/agent/:id?range=week
router.get("/daily-team", getDailyTeamReport);   // GET /api/reports/daily-team?date=2026-04-30

module.exports = router;