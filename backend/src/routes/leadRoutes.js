const express = require("express");
const {
  getLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  importLeads,
  addFollowUp,
  getLeadStats,
  getWorkedLeads,
} = require("../controllers/leadController");

const protect = require("../middlewares/authMiddleware");

const router = express.Router();

router.use(protect);

// ⚠️ IMPORTANT: /stats aur /import HAMESHA /:id se PEHLE likhna hai
// Warna Express "stats" aur "import" ko /:id ki value samajh leta hai

router.get("/stats",         getLeadStats);   // GET    /api/leads/stats
router.get("/worked",        getWorkedLeads);   // ✅ NAYA ROUTE
router.post("/import",       importLeads);    // POST   /api/leads/import

router.get("/",              getLeads);       // GET    /api/leads
router.post("/",             createLead);     // POST   /api/leads
router.get("/:id",           getLeadById);    // GET    /api/leads/:id
router.put("/:id",           updateLead);     // PUT    /api/leads/:id
router.delete("/:id",        deleteLead);     // DELETE /api/leads/:id
router.post("/:id/followup", addFollowUp);    // POST   /api/leads/:id/followup

module.exports = router;