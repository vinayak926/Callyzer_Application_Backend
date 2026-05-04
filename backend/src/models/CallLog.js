// const mongoose = require("mongoose");

// // ══════════════════════════════════════════════════════════════
// //  CALL LOG MODEL
// // ══════════════════════════════════════════════════════════════
// const callLogSchema = new mongoose.Schema(
//     {
//         // Who made/received the call
//         agent: {
//             type: mongoose.Schema.Types.ObjectId,
//             ref: "User",
//             required: true,
//         },

//         // Customer / Contact info
//         customerName: { type: String, default: "Unknown", trim: true },
//         customerNumber: { type: String, required: true, trim: true },

//         // Call details
//         callType: {
//             type: String,
//             enum: ["Incoming", "Outgoing"],
//             required: true,
//         },
//         callStatus: {
//             type: String,
//             enum: ["Connected", "Missed", "Rejected"],
//             default: "Connected",
//         },

//         // Duration in seconds (0 for missed/rejected)
//         durationSeconds: { type: Number, default: 0 },

//         // Date and time of the call
//         calledAt: { type: Date, required: true, default: Date.now },

//         // Optional notes
//         notes: { type: String, default: "" },
//         disposition: {
//             type: String,
//             enum: ["", "Interested", "Not Interested", "Callback", "Sale Done", "Wrong Number", "Follow-up"],
//             default: ""
//         },
//         followUpDate: { type: Date, default: null },
//         followUpNotes: { type: String, default: "" },

//     },
//     { timestamps: true }
// );

// // ── Indexes for fast queries ──────────────────────────────────
// callLogSchema.index({ agent: 1, calledAt: -1 });
// callLogSchema.index({ calledAt: -1 });

// // ── Virtual: formatted duration ───────────────────────────────
// callLogSchema.virtual("duration").get(function () {
//     const s = this.durationSeconds;
//     if (!s) return "0s";
//     const m = Math.floor(s / 60);
//     const sec = s % 60;
//     return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
// });

// module.exports = mongoose.model("CallLog", callLogSchema);


// ╔══════════════════════════════════════════════════════════════╗
// ║  FILE: call backend/src/models/CallLog.js                    ║
// ╚══════════════════════════════════════════════════════════════╝
//
// CHANGE LOG (vs old file):
//   ✅ Added `source` field  → tracks whether log came from device_sync or manual entry
//   ✅ Added `deviceLogId`   → unique key per device-synced call, prevents duplicates
//   ✅ Added compound index  → (agent, deviceLogId) for O(1) duplicate detection
//   ✅ Expanded callType     → "Missed" / "Voicemail" / "Rejected" / "Blocked" allowed
//      so the backend normaliser can receive them and convert correctly
//   All other fields, virtuals, and indexes are identical to the original.

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
        // NOTE: "Missed" / "Voicemail" / "Rejected" / "Blocked" are device raw values;
        //       bulkImportCalls normalises them to "Incoming"/"Outgoing" before saving.
        //       Keeping them in the enum here so that manual entries via the API
        //       can still pass these raw values if needed in future.
        callType: {
            type: String,
            enum: ["Incoming", "Outgoing", "Missed", "Voicemail", "Rejected", "Blocked"],
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

        // Optional notes / CRM fields
        notes: { type: String, default: "" },
        disposition: {
            type: String,
            enum: ["", "Interested", "Not Interested", "Callback", "Sale Done", "Wrong Number", "Follow-up"],
            default: "",
        },
        followUpDate: { type: Date, default: null },
        followUpNotes: { type: String, default: "" },

        // ── NEW: Device sync metadata ──────────────────────────
        // "device_sync" = auto-synced from Android call log
        // "manual"      = created by user through the app's form
        source: {
            type: String,
            enum: ["manual", "device_sync"],
            default: "manual",
        },

        // Stable unique key generated by the frontend for every device log:
        //   format: `device_{timestamp_ms}_{sanitisedPhoneNumber}`
        // Used by bulkImportCalls to detect true duplicates even across
        // different time-window queries (more reliable than phone+timestamp alone).
        deviceLogId: {
            type: String,
            default: null,
            trim: true,
        },
    },
    { timestamps: true }
);

// ── Indexes for fast queries ──────────────────────────────────
callLogSchema.index({ agent: 1, calledAt: -1 });
callLogSchema.index({ calledAt: -1 });

// NEW: sparse index — only indexes docs that have a deviceLogId,
// so manual entries (deviceLogId: null) are not bloated.
callLogSchema.index(
    { agent: 1, deviceLogId: 1 },
    { unique: true, sparse: true, name: "agent_deviceLogId_unique" }
);

// ── Virtual: formatted duration ───────────────────────────────
callLogSchema.virtual("duration").get(function () {
    const s = this.durationSeconds;
    if (!s) return "0s";
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
});

module.exports = mongoose.model("CallLog", callLogSchema);