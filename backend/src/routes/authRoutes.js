const express = require("express");
const { register, login, getMe, changePassword } = require("../controllers/authController");
const protect = require("../middlewares/authMiddleware");

const router = express.Router();

// Public routes
router.post("/register", register);
router.post("/login", login);

// Protected routes (token required)
router.get("/me", protect, getMe);
router.put("/change-password", protect, changePassword);

module.exports = router;
