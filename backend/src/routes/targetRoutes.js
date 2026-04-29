const express = require("express");
const {
    setTarget,
    getMyProgress,
    getTeamProgress
} = require("../controllers/targetController");
const protect = require("../middlewares/authMiddleware");
const { adminOnly } = require("../middlewares/adminMiddleware");
const { managerOnly } = require("../middlewares/managerMiddleware");

const router = express.Router();

router.use(protect);

// Agent routes
router.get("/my-progress", getMyProgress);

// Manager/Admin routes
router.post("/", adminOnly, setTarget);  // Admin can set for anyone
router.post("/manager", managerOnly, setTarget);  // Manager can set for their team
router.get("/team-progress", managerOnly, getTeamProgress);

module.exports = router;