const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: {
      type: String,
      enum: ["super_admin", "business_user", "salesperson"],
      default: "business_user",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "approved",
      // business_user self-register → pending
      // salesperson (BU se create hota) → approved
      // super_admin → always approved
    },
    businessUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isActive: { type: Boolean, default: true },
    phone: { type: String, default: "" },
    avatar: { type: String, default: "" },
    lastLogin: { type: Date },
    // User.js mein — lastLogin ke baad add karo:
    managerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,   // Koi manager assign nahi hai to null
    },

    extensionToken: {
      type: String,
      default: null,
      index: true,
    },
    extensionTokenExpiresAt: {
      type: Date,
      default: null,
    },
    fcmTokens: [
      {
        token:      { type: String },
        deviceName: { type: String, default: 'Android' },
        addedAt:    { type: Date,   default: Date.now },
      }
    ],

    subscriptionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subscription', default: null },
    planId:{ type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
    trialStartedAt: { type: Date, default: null },

  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
