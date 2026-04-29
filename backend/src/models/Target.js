const mongoose = require("mongoose");

const targetSchema = new mongoose.Schema({
    agent: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User"
    },
    period: {
        type: String,
        enum: ["daily", "weekly", "monthly"],
        default: "daily"
    },
    targetCalls: {
        type: Number,
        required: true,
        default: 0
    },
    year: { type: Number, required: true },
    month: { type: Number, required: true },  // 1-12
    day: { type: Number },  // for daily targets
    
    // Progress will be calculated dynamically
}, { timestamps: true });

// Unique constraint: one target per agent per period
targetSchema.index({ agent: 1, period: 1, year: 1, month: 1, day: 1 }, { unique: true });

module.exports = mongoose.model("Target", targetSchema);