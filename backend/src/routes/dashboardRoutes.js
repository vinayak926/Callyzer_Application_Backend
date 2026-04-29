const express = require("express");
const { getDashboardStats } = require("../controllers/dashboardController");
const protect = require("../middlewares/authMiddleware");

const router = express.Router();

// All routes require authentication
router.use(protect);

// Dashboard stats for logged-in user
router.get("/stats", getDashboardStats);

module.exports = router;