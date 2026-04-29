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
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
