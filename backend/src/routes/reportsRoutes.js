const express = require("express");
const { getReports, exportReport } = require("../controllers/reportsController");
const protect = require("../middlewares/authMiddleware");

const router = express.Router();

// All routes require authentication
router.use(protect);

// Reports data
router.get("/", getReports);
router.get("/export", exportReport);

module.exports = router;