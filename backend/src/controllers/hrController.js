const User = require("../models/User");
const HrRecord = require("../models/HrRecord");

// ══════════════════════════════════════════════════════════════
//  HELPER — ensure every employee has an HrRecord
// ══════════════════════════════════════════════════════════════
const ensureRecord = async (employeeId) => {
    let record = await HrRecord.findOne({ employee: employeeId });
    if (!record) {
        record = await HrRecord.create({ employee: employeeId });
    }
    return record;
};

// ══════════════════════════════════════════════════════════════
//  HR DASHBOARD STATS  →  GET /api/hr/stats
// ══════════════════════════════════════════════════════════════
exports.getHrStats = async (req, res) => {
    try {
        const employeeRoles = ["agent", "team_leader", "manager", "employee"];

        const totalEmployees = await User.countDocuments({ role: { $in: employeeRoles } });
        const activeEmployees = await User.countDocuments({ role: { $in: employeeRoles }, isActive: true });
        const inactiveEmployees = await User.countDocuments({ role: { $in: employeeRoles }, isActive: false });

        // Joined this week
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const newThisWeek = await User.countDocuments({
            role: { $in: employeeRoles },
            createdAt: { $gte: sevenDaysAgo },
        });

        // Pending leave requests
        const hrRecords = await HrRecord.find({});
        let pendingLeaves = 0;
        let approvedLeaves = 0;
        let rejectedLeaves = 0;

        hrRecords.forEach((rec) => {
            rec.leaveRequests.forEach((lr) => {
                if (lr.status === "pending") pendingLeaves++;
                if (lr.status === "approved") approvedLeaves++;
                if (lr.status === "rejected") rejectedLeaves++;
            });
        });

        // Role-wise count
        const agentCount = await User.countDocuments({ role: "agent" });
        const teamLeaderCount = await User.countDocuments({ role: "team_leader" });
        const managerCount = await User.countDocuments({ role: "manager" });

        res.json({
            totalEmployees,
            activeEmployees,
            inactiveEmployees,
            newThisWeek,
            pendingLeaves,
            approvedLeaves,
            rejectedLeaves,
            roleCounts: {
                agent: agentCount,
                team_leader: teamLeaderCount,
                manager: managerCount,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  RECENT EMPLOYEES  →  GET /api/hr/recent-employees
// ══════════════════════════════════════════════════════════════
exports.getRecentEmployees = async (req, res) => {
    try {
        const employees = await User.find({
            role: { $in: ["agent", "team_leader", "manager"] },
        })
            .select("-password")
            .sort({ createdAt: -1 })
            .limit(5);

        res.json({ employees });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  ALL EMPLOYEES  →  GET /api/hr/employees
// ══════════════════════════════════════════════════════════════
exports.getAllEmployees = async (req, res) => {
    try {
        const { role, isActive, search, page = 1, limit = 10 } = req.query;

        const allowedRoles = ["agent", "team_leader", "manager", "employee"];
        const filter = { role: { $in: allowedRoles } };

        if (role && allowedRoles.includes(role)) filter.role = role;
        if (isActive !== undefined) filter.isActive = isActive === "true";
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const total = await User.countDocuments(filter);
        const employees = await User.find(filter)
            .select("-password")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit));

        // Attach HR record for each employee
        const employeeIds = employees.map((e) => e._id);
        const hrRecords = await HrRecord.find({ employee: { $in: employeeIds } });
        const hrMap = {};
        hrRecords.forEach((r) => { hrMap[r.employee.toString()] = r; });

        const result = employees.map((emp) => ({
            ...emp.toObject(),
            hrRecord: hrMap[emp._id.toString()] || null,
        }));

        res.json({
            employees: result,
            pagination: {
                total,
                page: Number(page),
                limit: Number(limit),
                pages: Math.ceil(total / Number(limit)),
            },
        });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  SINGLE EMPLOYEE  →  GET /api/hr/employees/:id
// ══════════════════════════════════════════════════════════════
exports.getEmployeeById = async (req, res) => {
    try {
        const employee = await User.findById(req.params.id).select("-password");
        if (!employee) return res.status(404).json({ message: "Employee not found" });

        const allowed = ["agent", "team_leader", "manager", "employee"];
        if (!allowed.includes(employee.role)) {
            return res.status(403).json({ message: "Access denied for this role" });
        }

        const hrRecord = await ensureRecord(employee._id);

        res.json({ employee, hrRecord });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  UPDATE HR RECORD  →  PUT /api/hr/employees/:id/hr-record
//  Update department, designation, salary, employment type
// ══════════════════════════════════════════════════════════════
exports.updateHrRecord = async (req, res) => {
    try {
        const employee = await User.findById(req.params.id);
        if (!employee) return res.status(404).json({ message: "Employee not found" });

        const allowed = ["agent", "team_leader", "manager", "employee"];
        if (!allowed.includes(employee.role)) {
            return res.status(403).json({ message: "Access denied" });
        }

        const {
            department, designation, joiningDate, employmentType,
            salary, leaveBalance, emergencyContact, notes,
        } = req.body;

        const hrRecord = await ensureRecord(employee._id);

        if (department) hrRecord.department = department;
        if (designation) hrRecord.designation = designation;
        if (joiningDate) hrRecord.joiningDate = new Date(joiningDate);
        if (employmentType) hrRecord.employmentType = employmentType;
        if (notes !== undefined) hrRecord.notes = notes;

        if (salary) {
            hrRecord.salary.basic = salary.basic ?? hrRecord.salary.basic;
            hrRecord.salary.hra = salary.hra ?? hrRecord.salary.hra;
            hrRecord.salary.allowance = salary.allowance ?? hrRecord.salary.allowance;
            hrRecord.salary.deduction = salary.deduction ?? hrRecord.salary.deduction;
        }

        if (leaveBalance) {
            hrRecord.leaveBalance.sick = leaveBalance.sick ?? hrRecord.leaveBalance.sick;
            hrRecord.leaveBalance.casual = leaveBalance.casual ?? hrRecord.leaveBalance.casual;
            hrRecord.leaveBalance.earned = leaveBalance.earned ?? hrRecord.leaveBalance.earned;
        }

        if (emergencyContact) {
            hrRecord.emergencyContact.name = emergencyContact.name ?? hrRecord.emergencyContact.name;
            hrRecord.emergencyContact.relation = emergencyContact.relation ?? hrRecord.emergencyContact.relation;
            hrRecord.emergencyContact.phone = emergencyContact.phone ?? hrRecord.emergencyContact.phone;
        }

        await hrRecord.save();
        res.json({ message: "HR record updated successfully", hrRecord });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  LEAVE REQUESTS LIST  →  GET /api/hr/leaves
//  All pending / all leave requests
// ══════════════════════════════════════════════════════════════
exports.getAllLeaves = async (req, res) => {
    try {
        const { status, leaveType, employeeName, fromDate, toDate, search } = req.query;

        const hrRecords = await HrRecord.find({}).populate("employee", "name email role");

        const leaves = [];
        hrRecords.forEach((rec) => {
            if (!rec.employee) return;
            const nameQuery = (employeeName || search || "").toLowerCase();
            if (nameQuery && !rec.employee.name.toLowerCase().includes(nameQuery)) return;

            rec.leaveRequests.forEach((lr) => {
                if (status && lr.status !== status) return;
                if (leaveType && lr.leaveType !== leaveType) return;
                if (fromDate && new Date(lr.toDate) < new Date(fromDate)) return;
                if (toDate && new Date(lr.fromDate) > new Date(toDate)) return;

                leaves.push({
                    _id: lr._id,
                    leaveType: lr.leaveType,
                    fromDate: lr.fromDate,
                    toDate: lr.toDate,
                    days: lr.days,
                    reason: lr.reason,
                    status: lr.status,
                    remarks: lr.remarks,
                    approvedBy: lr.approvedBy,
                    approvedAt: lr.approvedAt,
                    createdAt: lr.createdAt,
                    employee: {
                        _id: rec.employee._id,
                        name: rec.employee.name,
                        email: rec.employee.email,
                        role: rec.employee.role,
                    },
                    hrRecordId: rec._id,
                });
            });
        });

        leaves.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({ leaves, total: leaves.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  EMPLOYEE: GET MY LEAVES  →  GET /api/hr/my-leaves
// ══════════════════════════════════════════════════════════════
exports.getMyLeaves = async (req, res) => {
    try {
        const hrRecord = await HrRecord.findOne({ employee: req.user._id });
        if (!hrRecord) return res.json({ leaves: [], leaveBalance: { sick: 12, casual: 12, earned: 15 } });

        const leaves = hrRecord.leaveRequests
            .slice()
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        res.json({ leaves, leaveBalance: hrRecord.leaveBalance });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  EMPLOYEE: APPLY MY LEAVE  →  POST /api/hr/my-leaves
// ══════════════════════════════════════════════════════════════
exports.applyMyLeave = async (req, res) => {
    try {
        const { leaveType, fromDate, toDate, reason } = req.body;

        if (!leaveType || !fromDate || !toDate) {
            return res.status(400).json({ message: "leaveType, fromDate, and toDate are required" });
        }

        const from = new Date(fromDate);
        const to = new Date(toDate);
        if (to < from) return res.status(400).json({ message: "toDate must be >= fromDate" });

        // Calculate business days
        let days = 0;
        const cur = new Date(from);
        while (cur <= to) {
            const dow = cur.getDay();
            if (dow !== 0 && dow !== 6) days++;
            cur.setDate(cur.getDate() + 1);
        }
        if (days === 0) days = 1;

        const hrRecord = await ensureRecord(req.user._id);

        hrRecord.leaveRequests.push({
            leaveType,
            fromDate: from,
            toDate: to,
            days,
            reason: reason || "",
            status: "pending",
        });

        await hrRecord.save();
        res.status(201).json({ message: "Leave applied successfully" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  APPLY LEAVE (by HR on behalf of employee)  →  POST /api/hr/employees/:id/leave
// ══════════════════════════════════════════════════════════════
exports.applyLeave = async (req, res) => {
    try {
        const { leaveType, fromDate, toDate, days, reason } = req.body;

        if (!leaveType || !fromDate || !toDate || !days) {
            return res.status(400).json({ message: "leaveType, fromDate, toDate, and days are required" });
        }

        const employee = await User.findById(req.params.id);
        if (!employee) return res.status(404).json({ message: "Employee not found" });

        const hrRecord = await ensureRecord(employee._id);

        hrRecord.leaveRequests.push({
            leaveType,
            fromDate: new Date(fromDate),
            toDate: new Date(toDate),
            days: Number(days),
            reason: reason || "",
            status: "pending",
        });

        await hrRecord.save();
        res.status(201).json({ message: "Leave applied successfully", hrRecord });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  APPROVE / REJECT LEAVE  →  PATCH /api/hr/leaves/:hrRecordId/:leaveId/action
// ══════════════════════════════════════════════════════════════
exports.actionLeave = async (req, res) => {
    try {
        const { action, remarks } = req.body; // action: "approved" | "rejected"

        if (!["approved", "rejected"].includes(action)) {
            return res.status(400).json({ message: "action must be 'approved' or 'rejected'" });
        }

        const hrRecord = await HrRecord.findById(req.params.hrRecordId);
        if (!hrRecord) return res.status(404).json({ message: "HR record not found" });

        const leave = hrRecord.leaveRequests.id(req.params.leaveId);
        if (!leave) return res.status(404).json({ message: "Leave request not found" });

        if (leave.status !== "pending") {
            return res.status(400).json({ message: "Leave has already been actioned" });
        }

        leave.status = action;
        leave.approvedBy = req.user;
        leave.approvedAt = new Date();
        leave.remarks = remarks || "";

        // If approved, deduct from leave balance
        if (action === "approved") {
            const balanceKey = leave.leaveType; // sick | casual | earned
            if (hrRecord.leaveBalance[balanceKey] !== undefined) {
                hrRecord.leaveBalance[balanceKey] = Math.max(
                    0,
                    hrRecord.leaveBalance[balanceKey] - leave.days
                );
            }
        }

        await hrRecord.save();
        res.json({ message: `Leave ${action} successfully`, leave });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  MARK / UPDATE ATTENDANCE  →  POST /api/hr/employees/:id/attendance
// ══════════════════════════════════════════════════════════════
exports.markAttendance = async (req, res) => {
    try {
        const { date, checkIn, checkOut, status, hoursWorked, remarks } = req.body;

        if (!date || !status) {
            return res.status(400).json({ message: "date and status are required" });
        }

        const employee = await User.findById(req.params.id);
        if (!employee) return res.status(404).json({ message: "Employee not found" });

        const hrRecord = await ensureRecord(employee._id);
        const targetDate = new Date(date);
        targetDate.setHours(0, 0, 0, 0);

        // Check if attendance already marked for this date
        const existing = hrRecord.attendance.find((a) => {
            const d = new Date(a.date);
            d.setHours(0, 0, 0, 0);
            return d.getTime() === targetDate.getTime();
        });

        if (existing) {
            existing.checkIn = checkIn ?? existing.checkIn;
            existing.checkOut = checkOut ?? existing.checkOut;
            existing.status = status ?? existing.status;
            existing.hoursWorked = hoursWorked ?? existing.hoursWorked;
            existing.remarks = remarks ?? existing.remarks;
        } else {
            hrRecord.attendance.push({
                date: targetDate,
                checkIn: checkIn || "",
                checkOut: checkOut || "",
                status: status || "present",
                hoursWorked: hoursWorked || 0,
                remarks: remarks || "",
            });
        }

        await hrRecord.save();
        res.json({ message: "Attendance marked successfully", hrRecord });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  GET ATTENDANCE  →  GET /api/hr/employees/:id/attendance
//  Supports month/year filter
// ══════════════════════════════════════════════════════════════
exports.getAttendance = async (req, res) => {
    try {
        const { month, year } = req.query; // month: 1-12, year: e.g. 2025

        const employee = await User.findById(req.params.id).select("-password");
        if (!employee) return res.status(404).json({ message: "Employee not found" });

        const hrRecord = await HrRecord.findOne({ employee: req.params.id });
        if (!hrRecord) return res.json({ employee, attendance: [] });

        let attendance = hrRecord.attendance;

        if (month && year) {
            attendance = attendance.filter((a) => {
                const d = new Date(a.date);
                return d.getMonth() + 1 === Number(month) && d.getFullYear() === Number(year);
            });
        }

        attendance.sort((a, b) => new Date(b.date) - new Date(a.date));

        res.json({ employee, attendance });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  HR PROFILE  →  GET /api/hr/profile
// ══════════════════════════════════════════════════════════════
exports.getHrProfile = async (req, res) => {
    try {
        const hr = await User.findById(req.user).select("-password");
        if (!hr) return res.status(404).json({ message: "HR user not found" });
        res.json({ hr });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  UPDATE HR PROFILE  →  PUT /api/hr/profile
// ══════════════════════════════════════════════════════════════
exports.updateHrProfile = async (req, res) => {
    try {
        const { name, phone } = req.body;
        const hr = await User.findById(req.user);
        if (!hr) return res.status(404).json({ message: "HR user not found" });

        if (name) hr.name = name.trim();
        if (phone !== undefined) hr.phone = phone;

        await hr.save();
        res.json({
            message: "Profile updated successfully",
            hr: { id: hr._id, name: hr.name, email: hr.email, role: hr.role, phone: hr.phone },
        });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};
