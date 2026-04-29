const User = require("../models/User");
const bcrypt = require("bcryptjs");

// ══════════════════════════════════════════════
//  GET MY TEAM  →  GET /api/business/team
//  Business User apni team ke salespersons dekhta hai
// ══════════════════════════════════════════════
exports.getMyTeam = async (req, res) => {
  try {
    const businessUserId = req.user._id;

    const salespersons = await User.find({
      role: "salesperson",
      businessUserId: businessUserId,
    })
      .select("-password")
      .sort({ createdAt: -1 });

    res.json({ salespersons, count: salespersons.length });
  } catch (err) {
    console.error("getMyTeam error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ══════════════════════════════════════════════
//  CREATE SALESPERSON  →  POST /api/business/salespersons
//  Business User apne liye salesperson banata hai
// ══════════════════════════════════════════════
exports.createSalesperson = async (req, res) => {
  try {
    const businessUserId = req.user._id;
    const { name, email, password, phone } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Email already exists check
    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) {
      return res.status(400).json({ message: "Email already registered" });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const salesperson = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: "salesperson",
      status: "approved",          // Direct approved — no admin approval needed
      businessUserId: businessUserId, // Auto-assign to this Business User
      phone: phone || "",
      isActive: true,
    });

    res.status(201).json({
      message: "Salesperson created successfully",
      user: {
        id: salesperson._id,
        name: salesperson.name,
        email: salesperson.email,
        role: salesperson.role,
        phone: salesperson.phone,
        isActive: salesperson.isActive,
        businessUserId: salesperson.businessUserId,
        createdAt: salesperson.createdAt,
      },
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ message: "Email already registered" });
    }
    console.error("createSalesperson error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ══════════════════════════════════════════════
//  UPDATE SALESPERSON  →  PUT /api/business/salespersons/:id
//  Business User apne salesperson ki details update karta hai
// ══════════════════════════════════════════════
exports.updateSalesperson = async (req, res) => {
  try {
    const businessUserId = req.user._id;
    const { id } = req.params;
    const { name, phone, password } = req.body;

    // Check ki ye salesperson is BU ka hi hai
    const salesperson = await User.findOne({
      _id: id,
      businessUserId: businessUserId,
      role: "salesperson",
    });
    if (!salesperson) {
      return res.status(404).json({ message: "Salesperson not found in your team" });
    }

    if (name) salesperson.name = name.trim();
    if (phone !== undefined) salesperson.phone = phone;
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters" });
      }
      salesperson.password = await bcrypt.hash(password, 12);
    }

    await salesperson.save();

    res.json({
      message: "Salesperson updated successfully",
      user: {
        id: salesperson._id,
        name: salesperson.name,
        email: salesperson.email,
        phone: salesperson.phone,
        isActive: salesperson.isActive,
      },
    });
  } catch (err) {
    console.error("updateSalesperson error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ══════════════════════════════════════════════
//  TOGGLE STATUS  →  PATCH /api/business/salespersons/:id/toggle-status
// ══════════════════════════════════════════════
exports.toggleSalespersonStatus = async (req, res) => {
  try {
    const businessUserId = req.user._id;
    const { id } = req.params;

    const salesperson = await User.findOne({
      _id: id,
      businessUserId: businessUserId,
      role: "salesperson",
    });
    if (!salesperson) {
      return res.status(404).json({ message: "Salesperson not found in your team" });
    }

    salesperson.isActive = !salesperson.isActive;
    await salesperson.save();

    res.json({
      message: `Salesperson ${salesperson.isActive ? "activated" : "deactivated"} successfully`,
      isActive: salesperson.isActive,
    });
  } catch (err) {
    console.error("toggleSalespersonStatus error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ══════════════════════════════════════════════
//  RESET PASSWORD  →  PATCH /api/business/salespersons/:id/reset-password
// ══════════════════════════════════════════════
exports.resetSalespersonPassword = async (req, res) => {
  try {
    const businessUserId = req.user._id;
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const salesperson = await User.findOne({
      _id: id,
      businessUserId: businessUserId,
      role: "salesperson",
    });
    if (!salesperson) {
      return res.status(404).json({ message: "Salesperson not found in your team" });
    }

    salesperson.password = await bcrypt.hash(newPassword, 12);
    await salesperson.save();

    res.json({ message: "Password reset successfully" });
  } catch (err) {
    console.error("resetSalespersonPassword error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ══════════════════════════════════════════════
//  BUSINESS DASHBOARD  →  GET /api/business/dashboard
// ══════════════════════════════════════════════
exports.getBusinessDashboard = async (req, res) => {
  try {
    const CallLog = require("../models/CallLog");
    const businessUserId = req.user._id;

    // Apni team ke salespersons
    const teamMembers = await User.find({
      businessUserId: businessUserId,
      role: "salesperson",
      isActive: true,
    }).select("_id name email");

    if (teamMembers.length === 0) {
      return res.json({
        summary: { totalCalls: 0, connectedCalls: 0, missedCalls: 0, avgDuration: 0, connectRate: 0 },
        agents: [],
        topPerformer: null,
      });
    }

    const teamIds = teamMembers.map((m) => m._id);

    // Aaj ki date
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Team ke aaj ke calls
    const allCalls = await CallLog.find({
      agent: { $in: teamIds },
      calledAt: { $gte: today },
    }).lean();

    const totalCalls     = allCalls.length;
    const connectedCalls = allCalls.filter((c) => c.callStatus === "Connected").length;
    const missedCalls    = allCalls.filter((c) => c.callStatus === "Missed").length;
    const totalDuration  = allCalls.reduce((s, c) => s + (c.durationSeconds || 0), 0);
    const avgDuration    = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;
    const connectRate    = totalCalls > 0 ? Math.round((connectedCalls / totalCalls) * 100) : 0;

    // Har agent ka breakdown
    const agents = teamMembers.map((member) => {
      const memberCalls = allCalls.filter(
        (c) => c.agent.toString() === member._id.toString()
      );
      const connected = memberCalls.filter((c) => c.callStatus === "Connected").length;
      const missed    = memberCalls.filter((c) => c.callStatus === "Missed").length;
      return {
        _id:            member._id,
        name:           member.name,
        email:          member.email,
        totalCalls:     memberCalls.length,
        connectedCalls: connected,
        missedCalls:    missed,
        connectRate:    memberCalls.length > 0
                          ? Math.round((connected / memberCalls.length) * 100)
                          : 0,
      };
    }).sort((a, b) => b.totalCalls - a.totalCalls);

    const topPerformer = agents.length > 0 ? agents[0] : null;

    res.json({
      summary: { totalCalls, connectedCalls, missedCalls, avgDuration, connectRate },
      agents,
      topPerformer,
      teamSize: teamMembers.length,
    });
  } catch (err) {
    console.error("getBusinessDashboard error:", err);
    res.status(500).json({ message: "Server error" });
  }
};