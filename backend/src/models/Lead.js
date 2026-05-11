const mongoose = require("mongoose");

// ── Follow-up History Sub-document ───────────────────────────
const followUpSchema = new mongoose.Schema(
  {
    description: { type: String, default: "" },
    followUpDate: { type: Date, default: null },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// ── Lead Schema ───────────────────────────────────────────────
const leadSchema = new mongoose.Schema(
  {
    // Owning business account
    businessUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // Optionally assigned to a specific salesperson
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // Core lead fields
    customerName: { type: String, required: true, trim: true },
    mobileNumber: { type: String, required: true, trim: true },
    courseName: { type: String, default: "", trim: true },   // Course / Product name
    leadSource: { type: String, default: "", trim: true },   // e.g. Facebook, Walk-in, Referral

    // Status with three fixed options
    status: {
      type: String,
      enum: ["Interested", "Not Interested", "DNP"],
      default: "Interested",
    },

    // Latest follow-up fields (denormalised for quick list view)
    followUpDescription: { type: String, default: "" },
    followUpDate: { type: Date, default: null },

    // Full follow-up history
    followUpHistory: [followUpSchema],

    // How the lead was created
    source: {
      type: String,
      enum: ["manual", "csv", "excel"],
      default: "manual",
    },
  },
  { timestamps: true }   // createdAt = auto timestamp
);

// ── Indexes ───────────────────────────────────────────────────
leadSchema.index({ businessUserId: 1, createdAt: -1 });
leadSchema.index({ assignedTo: 1, status: 1 });
leadSchema.index({ mobileNumber: 1, businessUserId: 1 });

module.exports = mongoose.model("Lead", leadSchema);