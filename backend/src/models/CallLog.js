const mongoose = require("mongoose");

// ══════════════════════════════════════════════════════════════
//  CALL LOG MODEL
// ══════════════════════════════════════════════════════════════
const callLogSchema = new mongoose.Schema(
    {
        // Who made/received the call
        agent: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        // Customer / Contact info
        customerName: { type: String, default: "Unknown", trim: true },
        customerNumber: { type: String, required: true, trim: true },

        // Call details
        callType: {
            type: String,
            enum: ["Incoming", "Outgoing"],
            required: true,
        },
        callStatus: {
            type: String,
            enum: ["Connected", "Missed", "Rejected"],
            default: "Connected",
        },

        // Duration in seconds (0 for missed/rejected)
        durationSeconds: { type: Number, default: 0 },

        // Date and time of the call
        calledAt: { type: Date, required: true, default: Date.now },

        // Optional notes
        notes: { type: String, default: "" },
        disposition: {
            type: String,
            enum: ["", "Interested", "Not Interested", "Callback", "Sale Done", "Wrong Number", "Follow-up"],
            default: ""
        },
        followUpDate: { type: Date, default: null },
        followUpNotes: { type: String, default: "" },

    },
    { timestamps: true }
);

// ── Indexes for fast queries ──────────────────────────────────
callLogSchema.index({ agent: 1, calledAt: -1 });
callLogSchema.index({ calledAt: -1 });

// ── Virtual: formatted duration ───────────────────────────────
callLogSchema.virtual("duration").get(function () {
    const s = this.durationSeconds;
    if (!s) return "0s";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
});

module.exports = mongoose.model("CallLog", callLogSchema);
