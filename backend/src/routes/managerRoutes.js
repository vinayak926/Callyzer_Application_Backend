const express = require("express");
const {
    getManagerStats,
    getTeamMembers,
    getMemberById,
    createTeamMember,
    updateTeamMember,
    toggleMemberStatus,
    resetMemberPassword,
    getRecentMembers,
    getManagerProfile,
    updateManagerProfile,
} = require("../controllers/managerController");

const protect = require("../middlewares/authMiddleware");
const { managerOnly } = require("../middlewares/managerMiddleware");

const router = express.Router();

// All manager routes require: 1) valid JWT, 2) manager/admin/super_admin role
router.use(protect);
router.use(managerOnly);

// ── Manager Profile ───────────────────────────────────────────
router.get("/profile", getManagerProfile);
router.put("/profile", updateManagerProfile);

// ── Stats & Overview ──────────────────────────────────────────
router.get("/stats", getManagerStats);
router.get("/recent-members", getRecentMembers);

// ── Team Member Management ────────────────────────────────────
router.get("/team", getTeamMembers);
router.get("/team/:id", getMemberById);
router.post("/team", createTeamMember);
router.put("/team/:id", updateTeamMember);
router.patch("/team/:id/toggle-status", toggleMemberStatus);
router.patch("/team/:id/reset-password", resetMemberPassword);

module.exports = router;