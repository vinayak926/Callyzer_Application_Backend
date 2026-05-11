const express = require("express");
const {
    getReports,
    exportReport,
    getSummary,          
    getHourlyReport,     
    getAgentReport,      
    getDailyTeamReport, 
    getMyCallLogs,
    getSalespersonReport,
    getMySalespersons,
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

// ── NEW: Salesperson — own report ────────────
// GET /api/reports/my-calllogs?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
router.get("/my-calllogs", getMyCallLogs);

// ── NEW: Business User — team list ───────────
// GET /api/reports/my-salespersons
router.get("/my-salespersons", getMySalespersons);

// ── NEW: Business User — specific salesperson ─
// GET /api/reports/salesperson/:id?fromDate=YYYY-MM-DD&toDate=YYYY-MM-DD
router.get("/salesperson/:id", getSalespersonReport);

module.exports = router;