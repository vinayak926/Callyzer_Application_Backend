const mongoose = require("mongoose");

// ══════════════════════════════════════════════════════════════
//  HR RECORD MODEL
//  Stores HR data for each employee — attendance, leave, salary
// ══════════════════════════════════════════════════════════════

const leaveSchema = new mongoose.Schema(
    {
        leaveType: {
            type: String,
            enum: ["sick", "casual", "earned", "unpaid"],
            required: true,
        },
        fromDate: { type: Date, required: true },
        toDate: { type: Date, required: true },
        days: { type: Number, required: true },
        reason: { type: String, default: "" },
        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
        },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        approvedAt: { type: Date },
        remarks: { type: String, default: "" },
    },
    { timestamps: true }
);

const attendanceSchema = new mongoose.Schema(
    {
        date: { type: Date, required: true },
        checkIn: { type: String, default: "" },   // e.g. "09:15"
        checkOut: { type: String, default: "" },  // e.g. "18:30"
        status: {
            type: String,
            enum: ["present", "absent", "half_day", "work_from_home", "holiday"],
            default: "present",
        },
        hoursWorked: { type: Number, default: 0 },
        remarks: { type: String, default: "" },
    },
    { _id: false }
);

const hrRecordSchema = new mongoose.Schema(
    {
        employee: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true,
        },

        // ── Employment Info ───────────────────────────────────
        department: { type: String, default: "" },
        designation: { type: String, default: "" },
        joiningDate: { type: Date },
        employmentType: {
            type: String,
            enum: ["full_time", "part_time", "contract", "intern"],
            default: "full_time",
        },

        // ── Salary ────────────────────────────────────────────
        salary: {
            basic: { type: Number, default: 0 },
            hra: { type: Number, default: 0 },
            allowance: { type: Number, default: 0 },
            deduction: { type: Number, default: 0 },
        },

        // ── Leave Balance ─────────────────────────────────────
        leaveBalance: {
            sick: { type: Number, default: 12 },
            casual: { type: Number, default: 12 },
            earned: { type: Number, default: 15 },
        },

        // ── Leave Requests ────────────────────────────────────
        leaveRequests: [leaveSchema],

        // ── Attendance ────────────────────────────────────────
        attendance: [attendanceSchema],

        // ── Emergency Contact ─────────────────────────────────
        emergencyContact: {
            name: { type: String, default: "" },
            relation: { type: String, default: "" },
            phone: { type: String, default: "" },
        },

        // ── Documents ─────────────────────────────────────────
        documents: [
            {
                docType: { type: String },   // e.g. "aadhar", "pan", "offer_letter"
                docName: { type: String },
                url: { type: String },
                uploadedAt: { type: Date, default: Date.now },
            },
        ],

        notes: { type: String, default: "" },
    },
    { timestamps: true }
);

// ── Virtual: Total Salary ─────────────────────────────────────
hrRecordSchema.virtual("totalSalary").get(function () {
    const s = this.salary;
    return s.basic + s.hra + s.allowance - s.deduction;
});

module.exports = mongoose.model("HrRecord", hrRecordSchema);
