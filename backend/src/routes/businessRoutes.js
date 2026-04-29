const express = require("express");
const {
  getMyTeam,
  createSalesperson,
  updateSalesperson,
  toggleSalespersonStatus,
  resetSalespersonPassword,
  getBusinessDashboard, 
} = require("../controllers/businessController");

const protect = require("../middlewares/authMiddleware");
const businessOnly = require("../middlewares/businessMiddleware");

const router = express.Router();

// Sabhi routes ke liye: JWT + business_user role required
router.use(protect);
router.use(businessOnly);

// ── Team Management ───────────────────────────────────────
router.get("/team", getMyTeam);                                               // GET  /api/business/team
router.post("/salespersons", createSalesperson);                              // POST /api/business/salespersons
router.put("/salespersons/:id", updateSalesperson);                           // PUT  /api/business/salespersons/:id
router.patch("/salespersons/:id/toggle-status", toggleSalespersonStatus);    // PATCH /api/business/salespersons/:id/toggle-status
router.patch("/salespersons/:id/reset-password", resetSalespersonPassword);  // PATCH /api/business/salespersons/:id/reset-password

router.get("/dashboard", getBusinessDashboard);

module.exports = router;