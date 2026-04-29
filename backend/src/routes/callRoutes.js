const express = require("express");
const {
    getCallLogs,
    createCallLog,
    updateCallLog,
    deleteCallLog,
    getCallStats,
    bulkImportCalls,
    getPendingFollowUps,
    getLeaderboard,
    getTeamCallStats,
    getHourlyBreakdown,          
} = require("../controllers/callController");


const protect = require("../middlewares/authMiddleware");

const router = express.Router();

// All routes require authentication
router.use(protect);

// Stats
router.get("/stats", getCallStats);

// CRUD
router.get("/", getCallLogs);
router.post("/", createCallLog);
router.put("/:id", updateCallLog);
router.delete("/:id", deleteCallLog);
router.post("/bulk-import", bulkImportCalls);
router.get("/follow-ups", getPendingFollowUps);
router.get("/leaderboard", getLeaderboard);
router.get("/team-stats", getTeamCallStats);

router.get("/hourly", getHourlyBreakdown);

module.exports = router;
