const mongoose = require("mongoose");

// Ye collection mein sirf EK document hoga (singleton)
const settingsSchema = new mongoose.Schema(
  {
    companyName: { type: String, default: "Callyzer" },
    workStartTime: { type: String, default: "09:00" },
    workEndTime: { type: String, default: "18:00" },

    // ── Feature Toggles ────────────────────────────────────
    allowBusinessUserRegistration: { type: Boolean, default: true },
    requireAdminApproval: { type: Boolean, default: true },
    callRecordingsEnabled: { type: Boolean, default: false },
    leaderboardVisible: { type: Boolean, default: true },
    autoLogoutMinutes: { type: Number, default: 30 },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Settings", settingsSchema);