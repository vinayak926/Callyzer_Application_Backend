const CallLog = require("../models/CallLog");
const User = require("../models/User");

// ──────────────────────────────────────────────────────────────
// GET /api/dashboard/stats
// Get all dashboard data for logged-in user (agent/employee)
// ──────────────────────────────────────────────────────────────
exports.getDashboardStats = async (req, res) => {
    try {
        const userId = req.user._id;
        const userRole = req.user.role;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        // ── Build agent filter based on role ─────────────────
        let agentFilter = {};

        if (["admin", "super_admin"].includes(userRole)) {
           
            if (req.query.agentId) {
                agentFilter.agent = req.query.agentId;
            }
        }
        else if (userRole === "manager") {
            
            if (req.query.agentId) {
                agentFilter.agent = req.query.agentId;
            } else {
                const teamMembers = await User.find({
                    managerId: userId,
                    role: { $in: ["agent", "team_leader"] }
                }).select("_id");
                const teamIds = teamMembers.map(m => m._id);
                if (teamIds.length > 0) {
                    agentFilter.agent = { $in: teamIds };
                }
            }
        }
        else {
           
            agentFilter.agent = userId;
        }

        // ── Summary Stats ─────────────────────────────────────
        const totalCalls = await CallLog.countDocuments(agentFilter);
        const todayCalls = await CallLog.countDocuments({
            ...agentFilter,
            calledAt: { $gte: today }
        });

        const incomingCalls = await CallLog.countDocuments({
            ...agentFilter,
            callType: "Incoming"
        });

        const outgoingCalls = await CallLog.countDocuments({
            ...agentFilter,
            callType: "Outgoing"
        });

        const missedCalls = await CallLog.countDocuments({
            ...agentFilter,
            callStatus: "Missed"
        });

        const connectedCalls = await CallLog.countDocuments({
            ...agentFilter,
            callStatus: "Connected"
        });

        // Average duration
        const avgDurationAgg = await CallLog.aggregate([
            { $match: { ...agentFilter, durationSeconds: { $gt: 0 } } },
            { $group: { _id: null, avgDuration: { $avg: "$durationSeconds" } } }
        ]);
        const avgDurationSeconds = avgDurationAgg[0]?.avgDuration || 0;
        const avgMinutes = Math.floor(avgDurationSeconds / 60);
        const avgSeconds = Math.round(avgDurationSeconds % 60);
        const avgDurationFormatted = avgMinutes > 0 ? `${avgMinutes}m ${avgSeconds}s` : `${avgSeconds}s`;

        // Connect rate
        const connectRate = totalCalls > 0
            ? Math.round((connectedCalls / totalCalls) * 100)
            : 0;

        // ── Weekly Trend (last 7 days) ────────────────────────
        const weeklyTrend = [];
        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);

            const nextDate = new Date(date);
            nextDate.setDate(nextDate.getDate() + 1);

            const dayFilter = { ...agentFilter, calledAt: { $gte: date, $lt: nextDate } };

            const dayTotal = await CallLog.countDocuments(dayFilter);
            const dayIncoming = await CallLog.countDocuments({ ...dayFilter, callType: "Incoming" });
            const dayOutgoing = await CallLog.countDocuments({ ...dayFilter, callType: "Outgoing" });
            const dayMissed = await CallLog.countDocuments({ ...dayFilter, callStatus: "Missed" });

            weeklyTrend.push({
                day: dayNames[date.getDay()],
                total: dayTotal,
                incoming: dayIncoming,
                outgoing: dayOutgoing,
                missed: dayMissed
            });
        }

        // ── Recent Calls (last 10) ───────────────────────────
        const recentCalls = await CallLog.find(agentFilter)
            .sort({ calledAt: -1 })
            .limit(10)
            .populate("agent", "name email")
            .lean();

        const formattedRecentCalls = recentCalls.map(call => ({
            _id: call._id,
            name: call.customerName || "Unknown",
            number: call.customerNumber,
            type: call.callType,
            duration: formatDuration(call.durationSeconds),
            status: call.callStatus,
            time: formatTime(call.calledAt),
            avatar: getInitials(call.customerName || "U")
        }));

        // ── Top Agents (for admin/manager/team-leader) ─────────────────────
        let topAgents = [];

        if (["admin", "super_admin", "manager", "team_leader"].includes(userRole)) {
            // Get all agents under this user
            let agentIds = [];

            if (userRole === "manager") {
               
                const teamMembers = await User.find({
                    managerId: userId,
                    role: { $in: ["agent", "team_leader"] }
                }).select("_id name");
                agentIds = teamMembers;
            }
            else if (userRole === "team_leader") {
                
                const teamMembers = await User.find({
                    teamLeaderId: userId,
                    role: "agent"
                }).select("_id name");
                agentIds = teamMembers;
            }
            else {
                
                const allAgents = await User.find({
                    role: { $in: ["agent", "team_leader"] }
                }).select("_id name");
                agentIds = allAgents;
            }

            // Calculate performance for each agent
            const agentPerformance = [];
            for (const agent of agentIds) {
                const agentCallFilter = { agent: agent._id };

                const total = await CallLog.countDocuments(agentCallFilter);
                const connected = await CallLog.countDocuments({ ...agentCallFilter, callStatus: "Connected" });
                const missed = await CallLog.countDocuments({ ...agentCallFilter, callStatus: "Missed" });

                const rate = total > 0 ? Math.round((connected / total) * 100) : 0;

                // Get today's calls for this agent
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayCalls = await CallLog.countDocuments({
                    agent: agent._id,
                    calledAt: { $gte: today }
                });

                agentPerformance.push({
                    _id: agent._id,
                    name: agent.name,
                    calls: total,
                    connected: connected,
                    missed: missed,
                    todayCalls: todayCalls,
                    rate: rate,
                    avatar: getInitials(agent.name),
                    color: getAvatarColor(agent._id)
                });
            }

            // Sort by connected calls and take top 5
            topAgents = agentPerformance
                .sort((a, b) => b.connected - a.connected)
                .slice(0, 5);
        }
        // For agent role, show top agents from their team or empty
        else if (userRole === "agent") {
            // Agent can see top agents from their team (if they have a manager)
            const agent = await User.findById(userId).select("managerId");
            if (agent.managerId) {
                const teamMembers = await User.find({
                    managerId: agent.managerId,
                    role: { $in: ["agent", "team_leader"] }
                }).select("_id name");

                const agentPerformance = [];
                for (const member of teamMembers) {
                    const agentCallFilter = { agent: member._id };
                    const total = await CallLog.countDocuments(agentCallFilter);
                    const connected = await CallLog.countDocuments({ ...agentCallFilter, callStatus: "Connected" });
                    const rate = total > 0 ? Math.round((connected / total) * 100) : 0;

                    agentPerformance.push({
                        _id: member._id,
                        name: member.name,
                        calls: total,
                        connected: connected,
                        rate: rate,
                        avatar: getInitials(member.name),
                        color: getAvatarColor(member._id)
                    });
                }

                topAgents = agentPerformance
                    .sort((a, b) => b.connected - a.connected)
                    .slice(0, 5);
            }
        }

        // ── Response ─────────────────────────────────────────
        res.json({
            success: true,
            summary: {
                totalCalls,
                todayCalls,
                incomingCalls,
                outgoingCalls,
                missedCalls,
                connectedCalls,
                avgDuration: avgDurationFormatted,
                avgDurationSeconds,
                connectRate
            },
            weeklyTrend,
            recentCalls: formattedRecentCalls,
            topAgents,
            user: {
                name: req.user.name,
                role: req.user.role
            }
        });

    } catch (err) {
        console.error("getDashboardStats error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ──────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────
function formatDuration(seconds) {
    if (!seconds || seconds === 0) return "0s";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

function formatTime(date) {
    if (!date) return "";
    return new Date(date).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
    });
}

function getInitials(name) {
    if (!name || name === "Unknown") return "U";
    return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function getAvatarColor(id) {
    const colors = ["bg-blue-500", "bg-violet-500", "bg-emerald-500", "bg-rose-500", "bg-amber-500", "bg-cyan-500"];
    const hash = id.toString().split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return colors[hash % colors.length];
}