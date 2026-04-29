const Target = require("../models/Target");
const CallLog = require("../models/CallLog");
const User = require("../models/User");

// ─────────────────────────────────────────────────────────
// Set Target (Manager/Admin)
// POST /api/targets
// ─────────────────────────────────────────────────────────
exports.setTarget = async (req, res) => {
    try {
        const { agentId, period, targetCalls, year, month, day } = req.body;
        
        if (!agentId || !period || !targetCalls || !year || !month) {
            return res.status(400).json({ message: "Missing required fields" });
        }
        
        // Check if agent exists
        const agent = await User.findById(agentId);
        if (!agent || !["agent", "team_leader"].includes(agent.role)) {
            return res.status(404).json({ message: "Agent not found" });
        }
        
        // Check permission (only manager/admin can set targets)
        const userRole = req.user.role;
        if (userRole === "manager") {
            // Manager can only set targets for their own agents
            const isMyAgent = agent.managerId && agent.managerId.toString() === req.user._id.toString();
            if (!isMyAgent && agent.managerId) {
                return res.status(403).json({ message: "You can only set targets for your own team members" });
            }
        }
        
        const filter = { agent: agentId, period, year, month };
        if (period === "daily" && day) filter.day = day;
        
        let target = await Target.findOne(filter);
        
        if (target) {
            // Update existing
            target.targetCalls = targetCalls;
            await target.save();
        } else {
            // Create new
            target = await Target.create({
                agent: agentId,
                manager: req.user._id,
                period,
                targetCalls,
                year,
                month,
                day: period === "daily" ? day : undefined
            });
        }
        
        res.json({ message: "Target set successfully", target });
    } catch (err) {
        console.error("setTarget error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ─────────────────────────────────────────────────────────
// Get Agent's Target & Progress
// GET /api/targets/my-progress
// ─────────────────────────────────────────────────────────
exports.getMyProgress = async (req, res) => {
    try {
        const agentId = req.user._id;
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        
        // Get daily target
        let dailyTarget = await Target.findOne({
            agent: agentId,
            period: "daily",
            year,
            month,
            day
        });
        
        // Get monthly target
        let monthlyTarget = await Target.findOne({
            agent: agentId,
            period: "monthly",
            year,
            month
        });
        
        // Calculate today's calls
        const todayStart = new Date(year, month - 1, day);
        const todayEnd = new Date(year, month - 1, day + 1);
        const todayCalls = await CallLog.countDocuments({
            agent: agentId,
            calledAt: { $gte: todayStart, $lt: todayEnd }
        });
        
        // Calculate this month's calls
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0);
        const monthCalls = await CallLog.countDocuments({
            agent: agentId,
            calledAt: { $gte: monthStart, $lte: monthEnd }
        });
        
        res.json({
            daily: {
                target: dailyTarget?.targetCalls || 0,
                achieved: todayCalls,
                percentage: dailyTarget?.targetCalls ? Math.round((todayCalls / dailyTarget.targetCalls) * 100) : 0
            },
            monthly: {
                target: monthlyTarget?.targetCalls || 0,
                achieved: monthCalls,
                percentage: monthlyTarget?.targetCalls ? Math.round((monthCalls / monthlyTarget.targetCalls) * 100) : 0
            }
        });
    } catch (err) {
        console.error("getMyProgress error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ─────────────────────────────────────────────────────────
// Get Team Progress (Manager/Admin)
// GET /api/targets/team-progress
// ─────────────────────────────────────────────────────────
exports.getTeamProgress = async (req, res) => {
    try {
        const userRole = req.user.role;
        let query = {};
        
        if (userRole === "manager") {
            query.managerId = req.user._id;
        } else if (["admin", "super_admin"].includes(userRole)) {
            query.role = { $in: ["agent", "team_leader"] };
        } else {
            return res.status(403).json({ message: "Access denied" });
        }
        
        const agents = await User.find(query).select("_id name email role");
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0);
        const currentWeek = getWeekNumber(now);
        
        const teamProgress = [];
        
        for (const agent of agents) {
            // Monthly target
            const monthlyTarget = await Target.findOne({
                agent: agent._id,
                period: "monthly",
                year,
                month
            });
            
            // Weekly target
            const weeklyTarget = await Target.findOne({
                agent: agent._id,
                period: "weekly",
                year,
                month: currentWeek
            });
            
            // Daily target
            const dailyTarget = await Target.findOne({
                agent: agent._id,
                period: "daily",
                year,
                month,
                day: now.getDate()
            });
            
            const monthCalls = await CallLog.countDocuments({
                agent: agent._id,
                calledAt: { $gte: monthStart, $lte: monthEnd }
            });
            
            // Get weekly calls
            const { start: weekStart, end: weekEnd } = getWeekRange(year, currentWeek);
            const weekCalls = await CallLog.countDocuments({
                agent: agent._id,
                calledAt: { $gte: weekStart, $lte: weekEnd }
            });
            
            // Get today's calls
            const todayStart = new Date(year, month - 1, now.getDate());
            const todayEnd = new Date(year, month - 1, now.getDate() + 1);
            const todayCalls = await CallLog.countDocuments({
                agent: agent._id,
                calledAt: { $gte: todayStart, $lt: todayEnd }
            });
            
            teamProgress.push({
                agentId: agent._id,
                name: agent.name,
                role: agent.role,
                monthly: {
                    target: monthlyTarget?.targetCalls || 0,
                    achieved: monthCalls,
                    percentage: monthlyTarget?.targetCalls ? Math.round((monthCalls / monthlyTarget.targetCalls) * 100) : 0
                },
                weekly: {
                    target: weeklyTarget?.targetCalls || 0,
                    achieved: weekCalls,
                    percentage: weeklyTarget?.targetCalls ? Math.round((weekCalls / weeklyTarget.targetCalls) * 100) : 0
                },
                daily: {
                    target: dailyTarget?.targetCalls || 0,
                    achieved: todayCalls,
                    percentage: dailyTarget?.targetCalls ? Math.round((todayCalls / dailyTarget.targetCalls) * 100) : 0
                }
            });
        }
        
        res.json({ teamProgress });
    } catch (err) {
        console.error("getTeamProgress error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ─────────────────────────────────────────────────────────
// Get Weekly Progress for an agent
// ─────────────────────────────────────────────────────────
const getWeekNumber = (date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
};

const getWeekRange = (year, weekNumber) => {
    const start = new Date(year, 0, 1 + (weekNumber - 1) * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
};