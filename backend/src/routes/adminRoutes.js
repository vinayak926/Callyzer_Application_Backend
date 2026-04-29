const express = require("express");
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  toggleUserStatus,
  resetUserPassword,
  deleteUser,
  getAdminStats,
  getRecentUsers,
  assignToBusinessUser,   // ← add karo
  getBusinessUsers, 
  getPendingApprovals, approveUser, rejectUser,
  getSettings, updateSettings,
} = require("../controllers/adminController");

const protect = require("../middlewares/authMiddleware");
const { adminOnly, superAdminOnly } = require("../middlewares/adminMiddleware");

const router = express.Router();

// All admin routes require: 1) valid JWT, 2) admin or super_admin role
router.use(protect);
router.use(adminOnly);

// ── Stats & Overview ──────────────────────────────────────
router.get("/stats", getAdminStats);
router.get("/recent-users", getRecentUsers);

// ── User Management ───────────────────────────────────────
router.get("/users", getAllUsers);
router.get("/users/:id", getUserById);
router.post("/users", createUser);
router.put("/users/:id", updateUser);
router.patch("/users/:id/toggle-status", toggleUserStatus);
router.patch("/users/:id/reset-password", resetUserPassword);

// Delete - super_admin only
router.delete("/users/:id", superAdminOnly, deleteUser);

// router.put("/users/:id/assign", assignToBusinessUser);
// router.get("/business-users", getBusinessUsers);

router.get("/pending-approvals", getPendingApprovals);
router.patch("/users/:id/approve", approveUser);
router.patch("/users/:id/reject", rejectUser);

router.get("/settings", getSettings);
router.put("/settings", updateSettings);

module.exports = router;
