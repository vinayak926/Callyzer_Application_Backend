const mongoose = require("mongoose");

// ══════════════════════════════════════════════════════════════
//  ATTENDANCE MODEL  —  Employee Punch In / Punch Out
//  Stores daily attendance with GPS location tracking
// ══════════════════════════════════════════════════════════════

const locationSchema = new mongoose.Schema(
    {
        latitude: { type: Number },
        longitude: { type: Number },
        accuracy: { type: Number },       // metres
        address: { type: String, default: "" }, // reverse-geocoded label
    },
    { _id: false }
);

const attendanceSchema = new mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        date: { type: String, required: true }, // "YYYY-MM-DD"  (IST local date)

        // ── Punch In ────────────────────────────────────────────
        punchIn: {
            time: { type: Date },            // full UTC timestamp
            location: locationSchema,
        },

        // ── Punch Out ───────────────────────────────────────────
        punchOut: {
            time: { type: Date },
            location: locationSchema,
        },

        // ── Computed ────────────────────────────────────────────
        hoursWorked: { type: Number, default: 0 }, // decimal hours
        status: {
            type: String,
            enum: ["present", "half_day", "absent"],
            default: "present",
        },

        notes: { type: String, default: "" },
    },
    { timestamps: true }
);

// One record per employee per day
attendanceSchema.index({ employee: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);