const User = require("../models/User");
const bcrypt = require("bcryptjs");

// ══════════════════════════════════════════════════════════════
//  MANAGER DASHBOARD STATS  →  GET /api/manager/stats
//  Manager views stats for agents and team leaders
// ══════════════════════════════════════════════════════════════
exports.getManagerStats = async (req, res) => {
    try {
        // Manager oversees agents and team leaders
        const teamRoles = ["agent", "team_leader"];

        const totalTeamMembers = await User.countDocuments({ role: { $in: teamRoles } });
        const activeMembers = await User.countDocuments({
            role: { $in: teamRoles },
            isActive: true,
        });
        const inactiveMembers = await User.countDocuments({
            role: { $in: teamRoles },
            isActive: false,
        });

        // New members joined this week
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const newMembersThisWeek = await User.countDocuments({
            role: { $in: teamRoles },
            createdAt: { $gte: sevenDaysAgo },
        });

        // Active today (logged in within last 24 hours)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const todayActive = await User.countDocuments({
            role: { $in: teamRoles },
            lastLogin: { $gte: oneDayAgo },
        });

        // Role-wise count
        const agentCount = await User.countDocuments({ role: "agent" });
        const teamLeaderCount = await User.countDocuments({ role: "team_leader" });

        res.json({
            totalTeamMembers,
            activeMembers,
            inactiveMembers,
            newMembersThisWeek,
            todayActive,
            roleCounts: {
                agent: agentCount,
                team_leader: teamLeaderCount,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  TEAM MEMBERS LIST  →  GET /api/manager/team
//  Manager can only view agents and team leaders
// ══════════════════════════════════════════════════════════════
exports.getTeamMembers = async (req, res) => {
    try {
        const { role, isActive, search, page = 1, limit = 10 } = req.query;

        // Manager can only manage these roles
        const allowedRoles = ["agent", "team_leader"];

        // const filter = { role: { $in: allowedRoles } };
        const filter = {
            role: { $in: allowedRoles },
            managerId: req.user._id   
        };

        // Role filter (agent or team_leader)
        if (role && allowedRoles.includes(role)) {
            filter.role = role;
        }

        if (isActive !== undefined) {
            filter.isActive = isActive === "true";
        }

        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { email: { $regex: search, $options: "i" } },
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const total = await User.countDocuments(filter);
        const members = await User.find(filter)
            .select("-password")
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit));

        res.json({
            members,
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
//  SINGLE MEMBER  →  GET /api/manager/team/:id
// ══════════════════════════════════════════════════════════════
exports.getMemberById = async (req, res) => {
    try {
        const member = await User.findById(req.params.id).select("-password");
        if (!member) return res.status(404).json({ message: "Member not found" });

        // Manager can only view agents and team leaders
        const allowed = ["agent", "team_leader"];
        if (!allowed.includes(member.role)) {
            return res.status(403).json({ message: "Access denied for this role" });
        }

        res.json({ member });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  CREATE TEAM MEMBER  →  POST /api/manager/team
//  Manager can only create agents or team leaders
// ══════════════════════════════════════════════════════════════
exports.createTeamMember = async (req, res) => {
    try {
        const { name, email, password, role, phone } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ message: "Name, email, and password are required" });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        // Manager can only create these roles
        const allowedRoles = ["agent", "team_leader"];
        if (role && !allowedRoles.includes(role)) {
            return res.status(403).json({
                message: "Manager can only create agents or team leaders",
            });
        }

        const exists = await User.findOne({ email: email.toLowerCase().trim() });
        if (exists) {
            return res.status(400).json({ message: "Email already registered" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const member = await User.create({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            role: role || "agent",
            phone: phone || "",
            managerId: req.user._id,
        });

        res.status(201).json({
            message: "Team member created successfully",
            member: {
                id: member._id,
                name: member.name,
                email: member.email,
                role: member.role,
                phone: member.phone,
                isActive: member.isActive,
                createdAt: member.createdAt,
            },
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(400).json({ message: "Email already registered" });
        }
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  UPDATE TEAM MEMBER  →  PUT /api/manager/team/:id
//  Manager can update agents and team leaders
// ══════════════════════════════════════════════════════════════
exports.updateTeamMember = async (req, res) => {
    try {
        const { name, email, role, phone } = req.body;

        const member = await User.findById(req.params.id);
        if (!member) return res.status(404).json({ message: "Member not found" });

        // Only agents and team leaders can be updated
        const allowed = ["agent", "team_leader"];
        if (!allowed.includes(member.role)) {
            return res.status(403).json({ message: "You do not have permission to update this member" });
        }

        // Role must also be within allowed values
        if (role && !allowed.includes(role)) {
            return res.status(403).json({
                message: "Manager can only assign agent or team_leader roles",
            });
        }

        if (name) member.name = name.trim();
        if (email) member.email = email.toLowerCase().trim();
        if (role) member.role = role;
        if (phone !== undefined) member.phone = phone;

        await member.save();

        res.json({
            message: "Member updated successfully",
            member: {
                id: member._id,
                name: member.name,
                email: member.email,
                role: member.role,
                phone: member.phone,
                isActive: member.isActive,
            },
        });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  TOGGLE MEMBER STATUS  →  PATCH /api/manager/team/:id/toggle-status
// ══════════════════════════════════════════════════════════════
exports.toggleMemberStatus = async (req, res) => {
    try {
        const member = await User.findById(req.params.id);
        if (!member) return res.status(404).json({ message: "Member not found" });

        // Only agents and team leaders can have their status toggled
        const allowed = ["agent", "team_leader"];
        if (!allowed.includes(member.role)) {
            return res.status(403).json({
                message: "You do not have permission to change this member's status",
            });
        }

        // Cannot deactivate your own account
        if (member._id.toString() === req.user) {
            return res.status(400).json({ message: "You cannot deactivate your own account" });
        }

        member.isActive = !member.isActive;
        await member.save();

        res.json({
            message: `Member ${member.isActive ? "activated" : "deactivated"} successfully`,
            isActive: member.isActive,
        });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  RESET MEMBER PASSWORD  →  PATCH /api/manager/team/:id/reset-password
// ══════════════════════════════════════════════════════════════
exports.resetMemberPassword = async (req, res) => {
    try {
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        }

        const member = await User.findById(req.params.id);
        if (!member) return res.status(404).json({ message: "Member not found" });

        const allowed = ["agent", "team_leader"];
        if (!allowed.includes(member.role)) {
            return res.status(403).json({
                message: "You do not have permission to reset this member's password",
            });
        }

        member.password = await bcrypt.hash(newPassword, 12);
        await member.save();

        res.json({ message: "Password reset successfully" });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  RECENT TEAM MEMBERS  →  GET /api/manager/recent-members
// ══════════════════════════════════════════════════════════════
exports.getRecentMembers = async (req, res) => {
    try {
        const members = await User.find({ role: { $in: ["agent", "team_leader"] } })
            .select("-password")
            .sort({ createdAt: -1 })
            .limit(5);

        res.json({ members });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  MANAGER PROFILE  →  GET /api/manager/profile
// ══════════════════════════════════════════════════════════════
exports.getManagerProfile = async (req, res) => {
    try {
        const manager = await User.findById(req.user).select("-password");
        if (!manager) return res.status(404).json({ message: "Manager not found" });
        res.json({ manager });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════════
//  UPDATE MANAGER PROFILE  →  PUT /api/manager/profile
// ══════════════════════════════════════════════════════════════
exports.updateManagerProfile = async (req, res) => {
    try {
        const { name, phone } = req.body;
        const manager = await User.findById(req.user);
        if (!manager) return res.status(404).json({ message: "Manager not found" });

        if (name) manager.name = name.trim();
        if (phone !== undefined) manager.phone = phone;

        await manager.save();

        res.json({
            message: "Profile updated successfully",
            manager: {
                id: manager._id,
                name: manager.name,
                email: manager.email,
                role: manager.role,
                phone: manager.phone,
            },
        });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};
