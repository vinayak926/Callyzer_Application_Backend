const Attendance = require("../models/Attendance");

// ── Helper: get IST date string "YYYY-MM-DD" ─────────────────
const getISTDateString = () => {
    const now = new Date();
    // IST = UTC + 5:30
    const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
    return ist.toISOString().slice(0, 10);
};

// ── PUNCH IN ─────────────────────────────────────────────────
// POST /api/attendance/punch-in
exports.punchIn = async (req, res) => {
    try {
        const employeeId = req.user._id;
        const today = getISTDateString();

        // Block duplicate punch-in on same day
        const existing = await Attendance.findOne({ employee: employeeId, date: today });
        if (existing && existing.punchIn?.time) {
            return res.status(400).json({
                message: "Already punched in today",
                record: existing,
            });
        }

        const { latitude, longitude, accuracy, address } = req.body;

        const location =
            latitude && longitude
                ? { latitude, longitude, accuracy: accuracy || null, address: address || "" }
                : null;

        let record;
        if (existing) {
            // Record exists but no punch-in yet (edge case)
            existing.punchIn = { time: new Date(), location };
            record = await existing.save();
        } else {
            record = await Attendance.create({
                employee: employeeId,
                date: today,
                punchIn: { time: new Date(), location },
                status: "present",
            });
        }

        res.status(201).json({ message: "Punch In successful", record });
    } catch (err) {
        console.error("punchIn error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ── PUNCH OUT ────────────────────────────────────────────────
// POST /api/attendance/punch-out
exports.punchOut = async (req, res) => {
    try {
        const employeeId = req.user._id;
        const today = getISTDateString();

        const record = await Attendance.findOne({ employee: employeeId, date: today });
        if (!record || !record.punchIn?.time) {
            return res.status(400).json({ message: "You haven't punched in today" });
        }
        if (record.punchOut?.time) {
            return res.status(400).json({ message: "Already punched out today", record });
        }

        const { latitude, longitude, accuracy, address } = req.body;

        const location =
            latitude && longitude
                ? { latitude, longitude, accuracy: accuracy || null, address: address || "" }
                : null;

        const punchOutTime = new Date();
        const hoursWorked =
            (punchOutTime - record.punchIn.time) / (1000 * 60 * 60);

        record.punchOut = { time: punchOutTime, location };
        record.hoursWorked = parseFloat(hoursWorked.toFixed(2));
        record.status = hoursWorked >= 4 ? "present" : "half_day";

        await record.save();

        res.json({ message: "Punch Out successful", record });
    } catch (err) {
        console.error("punchOut error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ── TODAY STATUS ─────────────────────────────────────────────
// GET /api/attendance/today
exports.getTodayStatus = async (req, res) => {
    try {
        const today = getISTDateString();
        const record = await Attendance.findOne({
            employee: req.user._id,
            date: today,
        });
        res.json({ record: record || null, today });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ── MY HISTORY ───────────────────────────────────────────────
// GET /api/attendance/history?month=2026-04
exports.getMyHistory = async (req, res) => {
    try {
        const { month } = req.query; // e.g. "2026-04"
        const query = { employee: req.user._id };

        if (month) {
            query.date = { $gte: `${month}-01`, $lte: `${month}-31` };
        }

        const records = await Attendance.find(query).sort({ date: -1 }).limit(60);
        res.json({ records });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ── HR: ALL EMPLOYEE ATTENDANCE ──────────────────────────────
// GET /api/attendance/all?date=2026-04-07
exports.getAllAttendance = async (req, res) => {
    try {
        const { date, month } = req.query;
        const query = {};

        if (date) query.date = date;
        else if (month) query.date = { $gte: `${month}-01`, $lte: `${month}-31` };

        const records = await Attendance.find(query)
            .populate("employee", "name email role phone")
            .sort({ date: -1, "punchIn.time": -1 })
            .limit(200);

        res.json({ records });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};


// Add at the end of file
exports.exportAttendance = async (req, res) => {
    try {
        const { month, employeeId } = req.query;
        const query = {};
        
        if (month) query.date = { $gte: `${month}-01`, $lte: `${month}-31` };
        if (employeeId) query.employee = employeeId;
        
        const records = await Attendance.find(query)
            .populate("employee", "name email role")
            .sort({ date: -1 });
        
        // Convert to CSV
        const headers = ["Date", "Employee Name", "Email", "Role", "Punch In", "Punch Out", "Hours Worked", "Status"];
        const rows = records.map(r => [
            r.date,
            r.employee?.name || "Unknown",
            r.employee?.email || "",
            r.employee?.role || "",
            r.punchIn?.time ? new Date(r.punchIn.time).toLocaleTimeString() : "-",
            r.punchOut?.time ? new Date(r.punchOut.time).toLocaleTimeString() : "-",
            r.hoursWorked || 0,
            r.status
        ]);
        
        const csv = [headers, ...rows].map(row => row.join(",")).join("\n");
        
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", `attachment; filename=attendance-${month || "all"}.csv`);
        res.send(csv);
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};