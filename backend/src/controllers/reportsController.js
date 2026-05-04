// const CallLog = require("../models/CallLog");
// const User = require("../models/User");

// exports.getReports = async (req, res) => {
//     try {
//         const { range, startDate, endDate, agentId } = req.query;
//         const userId = req.user._id;
//         const userRole = req.user.role;

//         let dateFilter = {};
//         const dateRange = getDateRange(range, startDate, endDate);
//         if (dateRange) dateFilter.calledAt = dateRange;

//         let agentFilter = {};
//         if (["admin", "super_admin"].includes(userRole)) {
//             if (agentId) agentFilter.agent = agentId;
//         } else if (userRole === "manager") {
//             if (agentId) {
//                 agentFilter.agent = agentId;
//             } else {
//                 const teamMembers = await User.find({
//                     managerId: userId,
//                     role: { $in: ["agent", "team_leader"] }
//                 }).select("_id");
//                 agentFilter.agent = { $in: teamMembers.map(m => m._id) };
//             }
//         } else {
//             agentFilter.agent = userId;
//         }

//         const finalFilter = { ...dateFilter, ...agentFilter };

//         const [summary, monthlySummary, weeklyTrend, callDistribution, agentPerformance] = await Promise.all([
//             getSummaryCards(finalFilter),
//             getMonthlySummary(finalFilter),
//             getWeeklyTrend(finalFilter),
//             getCallDistribution(finalFilter),
//             agentId
//                 ? getSingleAgentPerformance(agentId, finalFilter, req.user)
//                 : getAgentPerformance(finalFilter),
//         ]);

//         res.json({ summary, monthlySummary, weeklyTrend, callDistribution, agentPerformance });
//     } catch (err) {
//         console.error("getReports error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };

// exports.exportReport = async (req, res) => {
//     try {
//         const { format = "csv", range, startDate, endDate, agentId } = req.query;
//         const userId = req.user._id;
//         const userRole = req.user.role;

//         // Build filters
//         let dateFilter = {};
//         const dateRange = getDateRange(range, startDate, endDate);
//         if (dateRange) dateFilter.calledAt = dateRange;

//         let agentFilter = {};
//         if (["admin", "super_admin", "manager"].includes(userRole)) {
//             if (agentId) agentFilter.agent = agentId;
//         } else {
//             agentFilter.agent = userId;
//         }

//         const finalFilter = { ...dateFilter, ...agentFilter };

//         // Get all calls for export
//         const calls = await CallLog.find(finalFilter)
//             .sort({ calledAt: -1 })
//             .populate("agent", "name email")
//             .lean();

//         if (format === "csv") {
//             const csvData = convertToCSV(calls);
            
//             // ✅ CRITICAL: Set correct headers for CSV download
//             res.setHeader("Content-Type", "text/csv; charset=utf-8");
//             res.setHeader("Content-Disposition", `attachment; filename=callyzer-report-${Date.now()}.csv`);
//             res.setHeader("Cache-Control", "no-cache");
//             return res.send(csvData);
//         }

//         // JSON format
//         const summary = await getSummaryCards(finalFilter);
//         res.json({ summary, calls, total: calls.length });

//     } catch (err) {
//         console.error("exportReport error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };

// // ──────────────────────────────────────────────────────────────
// // Helper Functions
// // ──────────────────────────────────────────────────────────────

// function getDateRange(range, startDate, endDate) {
//     if (startDate && endDate) {
//         return {
//             $gte: new Date(startDate),
//             $lte: new Date(endDate)
//         };
//     }

//     const now = new Date();
//     const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

//     switch (range) {
//         case "today":
//             return { $gte: today, $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
//         case "yesterday":
//             const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
//             return { $gte: yesterday, $lt: today };
//         case "week":
//             const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
//             return { $gte: weekAgo };
//         case "month":
//             const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
//             return { $gte: monthAgo };
//         case "quarter":
//             const quarterAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
//             return { $gte: quarterAgo };
//         default:
//             return null;
//     }
// }

// async function getMonthlySummary(filter) {
//     const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
//     const summary = [];

//     for (let i = 5; i >= 0; i--) {
//         const date = new Date();
//         date.setMonth(date.getMonth() - i);
//         const month = date.getMonth();
//         const year = date.getFullYear();

//         const start = new Date(year, month, 1);
//         const end = new Date(year, month + 1, 0);

//         const monthFilter = { ...filter, calledAt: { $gte: start, $lte: end } };

//         const total = await CallLog.countDocuments(monthFilter);
//         const connected = await CallLog.countDocuments({ ...monthFilter, callStatus: "Connected" });
//         const missed = await CallLog.countDocuments({ ...monthFilter, callStatus: "Missed" });

//         summary.push({
//             month: months[month],
//             total,
//             connected,
//             missed
//         });
//     }

//     return summary;
// }

// async function getWeeklyTrend(filter) {
//     const trend = [];

//     for (let i = 6; i >= 0; i--) {
//         const date = new Date();
//         date.setDate(date.getDate() - i);
//         date.setHours(0, 0, 0, 0);

//         const nextDate = new Date(date);
//         nextDate.setDate(nextDate.getDate() + 1);

//         const weekFilter = { ...filter, calledAt: { $gte: date, $lt: nextDate } };

//         const calls = await CallLog.countDocuments(weekFilter);
//         const avgDurationAgg = await CallLog.aggregate([
//             { $match: weekFilter },
//             { $group: { _id: null, avg: { $avg: "$durationSeconds" } } }
//         ]);

//         trend.push({
//             week: `Wk ${Math.ceil((date.getDate() + (date.getDay() + 1)) / 7)}`,
//             calls,
//             duration: avgDurationAgg[0]?.avg ? Math.round(avgDurationAgg[0].avg / 60 * 10) / 10 : 0
//         });
//     }

//     return trend;
// }

// async function getCallDistribution(filter) {
//     const incoming = await CallLog.countDocuments({ ...filter, callType: "Incoming" });
//     const outgoing = await CallLog.countDocuments({ ...filter, callType: "Outgoing" });
//     const missed = await CallLog.countDocuments({ ...filter, callStatus: "Missed" });

//     const total = incoming + outgoing + missed;

//     return [
//         { name: "Incoming", value: incoming, color: "#3b82f6", percent: total > 0 ? Math.round((incoming / total) * 100) : 0 },
//         { name: "Outgoing", value: outgoing, color: "#8b5cf6", percent: total > 0 ? Math.round((outgoing / total) * 100) : 0 },
//         { name: "Missed", value: missed, color: "#f43f5e", percent: total > 0 ? Math.round((missed / total) * 100) : 0 }
//     ];
// }

// async function getAgentPerformance(filter) {
//     const agents = await User.find({ role: { $in: ["agent", "team_leader"] } })
//         .select("name email role");

//     const performance = [];

//     for (const agent of agents) {
//         const agentFilter = { ...filter, agent: agent._id };

//         const total = await CallLog.countDocuments(agentFilter);
//         const connected = await CallLog.countDocuments({ ...agentFilter, callStatus: "Connected" });
//         const missed = await CallLog.countDocuments({ ...agentFilter, callStatus: "Missed" });

//         const avgDurationAgg = await CallLog.aggregate([
//             { $match: agentFilter },
//             { $group: { _id: null, avg: { $avg: "$durationSeconds" } } }
//         ]);

//         const avgDurationSeconds = avgDurationAgg[0]?.avg || 0;
//         const avgMinutes = Math.floor(avgDurationSeconds / 60);
//         const avgSeconds = Math.round(avgDurationSeconds % 60);
//         const avgDuration = avgMinutes > 0 ? `${avgMinutes}m ${avgSeconds}s` : `${avgSeconds}s`;

//         const rate = total > 0 ? Math.round((connected / total) * 100) : 0;

//         performance.push({
//             _id: agent._id,
//             name: agent.name,
//             email: agent.email,
//             role: agent.role,
//             calls: total,
//             connected,
//             missed,
//             avgDuration,
//             rate,
//             avatar: getInitials(agent.name)
//         });
//     }

//     return performance.sort((a, b) => b.calls - a.calls);
// }

// // ✅ FIXED: Added 'user' parameter
// async function getSingleAgentPerformance(agentId, filter, user) {
//     const agentFilter = { ...filter, agent: agentId };

//     const total = await CallLog.countDocuments(agentFilter);
//     const connected = await CallLog.countDocuments({ ...agentFilter, callStatus: "Connected" });
//     const missed = await CallLog.countDocuments({ ...agentFilter, callStatus: "Missed" });

//     const avgDurationAgg = await CallLog.aggregate([
//         { $match: agentFilter },
//         { $group: { _id: null, avg: { $avg: "$durationSeconds" } } }
//     ]);

//     const avgDurationSeconds = avgDurationAgg[0]?.avg || 0;
//     const avgMinutes = Math.floor(avgDurationSeconds / 60);
//     const avgSeconds = Math.round(avgDurationSeconds % 60);
//     const avgDuration = avgMinutes > 0 ? `${avgMinutes}m ${avgSeconds}s` : `${avgSeconds}s`;

//     const rate = total > 0 ? Math.round((connected / total) * 100) : 0;

//     return [{
//         name: user.name,  // ✅ Fixed: using user parameter
//         calls: total,
//         connected,
//         missed,
//         avgDuration,
//         rate,
//         avatar: getInitials(user.name)
//     }];
// }

// async function getSummaryCards(filter) {
//     const total = await CallLog.countDocuments(filter);
//     const connected = await CallLog.countDocuments({ ...filter, callStatus: "Connected" });
//     const missed = await CallLog.countDocuments({ ...filter, callStatus: "Missed" });

//     const avgDurationAgg = await CallLog.aggregate([
//         { $match: filter },
//         { $group: { _id: null, avg: { $avg: "$durationSeconds" } } }
//     ]);
//     const avgDurationSeconds = avgDurationAgg[0]?.avg || 0;
//     const avgMinutes = Math.floor(avgDurationSeconds / 60);
//     const avgSeconds = Math.round(avgDurationSeconds % 60);
//     const avgDuration = avgMinutes > 0 ? `${avgMinutes}m ${avgSeconds}s` : `${avgSeconds}s`;

//     // Calculate percentage change (compare with previous period)
//     const thirtyDaysAgo = new Date();
//     thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
//     const previousFilter = { ...filter, calledAt: { $lt: thirtyDaysAgo } };
//     const previousTotal = await CallLog.countDocuments(previousFilter);
//     const change = previousTotal > 0 ? Math.round(((total - previousTotal) / previousTotal) * 100) : 0;

//     return [
//         { title: "Total Calls", value: total.toLocaleString(), change: `${change >= 0 ? "+" : ""}${change}%`, up: change >= 0 },
//         {
//             title: "Connected Calls", value: connected.toLocaleString(),
//             change: `+${total > 0 ? Math.round((connected / total) * 100) : 0}%`, up: true
//         },
//         {
//             title: "Missed Calls", value: missed.toLocaleString(),
//             change: `-${total > 0 ? Math.round((missed / total) * 100) : 0}%`, up: false
//         }, ,
//         { title: "Avg Duration", value: avgDuration, change: "+0m 42s", up: true }
//     ];
// }

// function getInitials(name) {
//     if (!name) return "U";
//     return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
// }

// function convertToCSV(calls) {
//     const headers = ["Date", "Customer Name", "Phone", "Type", "Status", "Duration (sec)", "Agent", "Notes"];
//     const rows = calls.map(call => [
//         new Date(call.calledAt).toLocaleDateString("en-IN"),
//         call.customerName || "Unknown",
//         call.customerNumber,
//         call.callType,
//         call.callStatus,
//         call.durationSeconds,
//         call.agent?.name || "Unknown",
//         call.notes || ""
//     ]);

//     return [headers, ...rows].map(row => row.join(",")).join("\n");
// }


const CallLog = require("../models/CallLog");
const User = require("../models/User");

// ══════════════════════════════════════════════════════════
//  GET /api/reports  —  Main reports (unchanged)
// ══════════════════════════════════════════════════════════
exports.getReports = async (req, res) => {
    try {
        const { range, startDate, endDate, agentId } = req.query;
        const userId = req.user._id;
        const userRole = req.user.role;

        let dateFilter = {};
        const dateRange = getDateRange(range, startDate, endDate);
        if (dateRange) dateFilter.calledAt = dateRange;

        let agentFilter = {};
        if (["admin", "super_admin"].includes(userRole)) {
            if (agentId) agentFilter.agent = agentId;
        } else if (userRole === "manager") {
            if (agentId) {
                agentFilter.agent = agentId;
            } else {
                const teamMembers = await User.find({
                    managerId: userId,
                    role: { $in: ["agent", "team_leader"] }
                }).select("_id");
                agentFilter.agent = { $in: teamMembers.map(m => m._id) };
            }
        } else if (userRole === "business_user") {
            if (agentId) {
                agentFilter.agent = agentId;
            } else {
                const teamMembers = await User.find({
                    businessUserId: userId,
                    role: "salesperson"
                }).select("_id");
                agentFilter.agent = { $in: teamMembers.map(m => m._id) };
            }
        } else {
            agentFilter.agent = userId;
        }

        const finalFilter = { ...dateFilter, ...agentFilter };

        const [summary, monthlySummary, weeklyTrend, callDistribution, agentPerformance] = await Promise.all([
            getSummaryCards(finalFilter),
            getMonthlySummary(finalFilter),
            getWeeklyTrend(finalFilter),
            getCallDistribution(finalFilter),
            agentId
                ? getSingleAgentPerformance(agentId, finalFilter, req.user)
                : getAgentPerformance(finalFilter, userRole, userId),
        ]);

        res.json({ summary, monthlySummary, weeklyTrend, callDistribution, agentPerformance });
    } catch (err) {
        console.error("getReports error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════
//  GET /api/reports/export  —  CSV/JSON export (unchanged)
// ══════════════════════════════════════════════════════════
exports.exportReport = async (req, res) => {
    try {
        const { format = "csv", range, startDate, endDate, agentId } = req.query;
        const userId = req.user._id;
        const userRole = req.user.role;

        let dateFilter = {};
        const dateRange = getDateRange(range, startDate, endDate);
        if (dateRange) dateFilter.calledAt = dateRange;

        let agentFilter = {};
        if (["admin", "super_admin", "manager"].includes(userRole)) {
            if (agentId) agentFilter.agent = agentId;
        } else if (userRole === "business_user") {
            if (agentId) {
                agentFilter.agent = agentId;
            } else {
                const teamMembers = await User.find({
                    businessUserId: userId,
                    role: "salesperson"
                }).select("_id");
                agentFilter.agent = { $in: teamMembers.map(m => m._id) };
            }
        } else {
            agentFilter.agent = userId;
        }

        const finalFilter = { ...dateFilter, ...agentFilter };

        const calls = await CallLog.find(finalFilter)
            .sort({ calledAt: -1 })
            .populate("agent", "name email")
            .lean();

        if (format === "csv") {
            const csvData = convertToCSV(calls);
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename=callyzer-report-${Date.now()}.csv`);
            res.setHeader("Cache-Control", "no-cache");
            return res.send(csvData);
        }

        const summary = await getSummaryCards(finalFilter);
        res.json({ summary, calls, total: calls.length });

    } catch (err) {
        console.error("exportReport error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════
//  NEW — GET /api/reports/summary?period=today|week|month
//  Quick summary cards — role-based filtering
// ══════════════════════════════════════════════════════════
exports.getSummary = async (req, res) => {
    try {
        const { period = "today" } = req.query;
        const userId = req.user._id;
        const userRole = req.user.role;

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        let startDate;
        if (period === "today") startDate = today;
        else if (period === "week") startDate = new Date(today.getTime() - 7 * 86400000);
        else if (period === "month") startDate = new Date(today.getTime() - 30 * 86400000);
        else startDate = today;

        // Role ke hisaab se agent filter
        let agentFilter = {};
        if (userRole === "salesperson") {
            agentFilter.agent = userId;
        } else if (userRole === "business_user") {
            const team = await User.find({
                businessUserId: userId,
                role: "salesperson"
            }).select("_id").lean();
            agentFilter.agent = { $in: team.map(m => m._id) };
        }
        // super_admin — no filter, sees all

        const filter = {
            ...agentFilter,
            calledAt: { $gte: startDate, $lte: now },
        };

        const total = await CallLog.countDocuments(filter);
        const connected = await CallLog.countDocuments({ ...filter, callStatus: "Connected" });
        const missed = await CallLog.countDocuments({ ...filter, callStatus: "Missed" });
        const rejected = await CallLog.countDocuments({ ...filter, callStatus: "Rejected" });

        const durationAgg = await CallLog.aggregate([
            { $match: filter },
            { $group: { _id: null, total: { $sum: "$durationSeconds" }, avg: { $avg: "$durationSeconds" } } },
        ]);

        const totalDurationSec = durationAgg[0]?.total || 0;
        const avgDurationSec = durationAgg[0]?.avg || 0;

        res.json({
            period,
            total,
            connected,
            missed,
            rejected,
            connectRate: total > 0 ? Math.round((connected / total) * 100) : 0,
            totalDuration: fmt(totalDurationSec),
            avgDuration: fmt(avgDurationSec),
        });
    } catch (err) {
        console.error("getSummary error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════
//  NEW — GET /api/reports/hourly?date=YYYY-MM-DD&agentId=
//  Hourly breakdown for a date — for ReportsScreen chart
// ══════════════════════════════════════════════════════════
exports.getHourlyReport = async (req, res) => {
    try {
        const { date, agentId } = req.query;
        const userId = req.user._id;
        const userRole = req.user.role;
        const targetDate = date || new Date().toISOString().split("T")[0];

        const dayStart = new Date(targetDate + "T00:00:00.000Z");
        const dayEnd = new Date(targetDate + "T23:59:59.999Z");

        let agentFilter = {};
        if (userRole === "salesperson") {
            agentFilter.agent = userId;
        } else if (userRole === "business_user") {
            if (agentId) {
                agentFilter.agent = agentId;
            } else {
                const team = await User.find({
                    businessUserId: userId,
                    role: "salesperson"
                }).select("_id").lean();
                agentFilter.agent = { $in: team.map(m => m._id) };
            }
        } else if (userRole === "super_admin" && agentId) {
            agentFilter.agent = agentId;
        }

        const filter = { ...agentFilter, calledAt: { $gte: dayStart, $lte: dayEnd } };

        const calls = await CallLog.find(filter)
            .select("calledAt callStatus durationSeconds callType")
            .lean();

        const hours = Array.from({ length: 24 }, (_, h) => ({
            hour: h,
            label: h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`,
            total: 0, connected: 0, missed: 0, rejected: 0, totalDuration: 0,
        }));

        calls.forEach((c) => {
            const h = new Date(c.calledAt).getHours();
            hours[h].total++;
            if (c.callStatus === "Connected") {
                hours[h].connected++;
                hours[h].totalDuration += c.durationSeconds || 0;
            } else if (c.callStatus === "Missed") hours[h].missed++;
            else if (c.callStatus === "Rejected") hours[h].rejected++;
        });

        const workHours = hours.filter(h => h.hour >= 8 && h.hour <= 21);
        const peakHour = workHours.reduce(
            (max, h) => (h.total > max.total ? h : max),
            workHours[0]
        );

        res.json({ date: targetDate, totalCalls: calls.length, workHours, peakHour });
    } catch (err) {
        console.error("getHourlyReport error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════
//  NEW — GET /api/reports/agent/:id?range=today|week|month
//  Ek specific salesperson ka full report
// ══════════════════════════════════════════════════════════
exports.getAgentReport = async (req, res) => {
    try {
        const { id } = req.params;
        const { range = "month" } = req.query;
        const userRole = req.user.role;
        const userId = req.user._id;

        // Permission check — business_user sirf apni team ka dekhe
        if (userRole === "business_user") {
            const belongs = await User.findOne({
                _id: id,
                businessUserId: userId,
                role: "salesperson",
            });
            if (!belongs) return res.status(403).json({ message: "Access denied" });
        }

        const agent = await User.findById(id).select("-password").lean();
        if (!agent) return res.status(404).json({ message: "Agent not found" });

        // Date range
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let startDate;
        if (range === "today") startDate = today;
        else if (range === "week") startDate = new Date(today.getTime() - 7 * 86400000);
        else if (range === "month") startDate = new Date(today.getTime() - 30 * 86400000);
        else startDate = new Date(today.getTime() - 30 * 86400000);

        const filter = { agent: id, calledAt: { $gte: startDate, $lte: now } };

        const total = await CallLog.countDocuments(filter);
        const connected = await CallLog.countDocuments({ ...filter, callStatus: "Connected" });
        const missed = await CallLog.countDocuments({ ...filter, callStatus: "Missed" });
        const rejected = await CallLog.countDocuments({ ...filter, callStatus: "Rejected" });

        const durationAgg = await CallLog.aggregate([
            { $match: filter },
            { $group: { _id: null, avg: { $avg: "$durationSeconds" }, total: { $sum: "$durationSeconds" } } },
        ]);

        // Last 10 calls
        const recentCalls = await CallLog.find(filter)
            .sort({ calledAt: -1 })
            .limit(10)
            .select("customerName customerNumber callType callStatus durationSeconds calledAt notes disposition followUpDate")
            .lean();

        res.json({
            agent: {
                id: agent._id,
                name: agent.name,
                email: agent.email,
                phone: agent.phone,
            },
            stats: {
                total,
                connected,
                missed,
                rejected,
                connectRate: total > 0 ? Math.round((connected / total) * 100) : 0,
                avgDuration: fmt(durationAgg[0]?.avg || 0),
                totalDuration: fmt(durationAgg[0]?.total || 0),
            },
            recentCalls,
            range,
        });
    } catch (err) {
        console.error("getAgentReport error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════
//  NEW — GET /api/reports/daily-team?date=YYYY-MM-DD
//  Poori team ki ek din ki activity — Business User / Admin
// ══════════════════════════════════════════════════════════
exports.getDailyTeamReport = async (req, res) => {
    try {
        const { date } = req.query;
        const userId = req.user._id;
        const userRole = req.user.role;

        const targetDate = date || new Date().toISOString().split("T")[0];
        const dayStart = new Date(targetDate + "T00:00:00.000Z");
        const dayEnd = new Date(targetDate + "T23:59:59.999Z");

        // Team members fetch
        let teamMembers;
        if (userRole === "business_user") {
            teamMembers = await User.find({
                businessUserId: userId,
                role: "salesperson",
                isActive: true,
            }).select("_id name email phone").lean();
        } else if (userRole === "super_admin") {
            teamMembers = await User.find({
                role: "salesperson",
                isActive: true,
            }).select("_id name email phone").lean();
        } else {
            return res.status(403).json({ message: "Access denied" });
        }

        // Har member ki stats ek saath
        const memberStats = await Promise.all(
            teamMembers.map(async (member) => {
                const filter = {
                    agent: member._id,
                    calledAt: { $gte: dayStart, $lte: dayEnd },
                };

                const total = await CallLog.countDocuments(filter);
                const connected = await CallLog.countDocuments({ ...filter, callStatus: "Connected" });
                const missed = await CallLog.countDocuments({ ...filter, callStatus: "Missed" });

                const durAgg = await CallLog.aggregate([
                    { $match: filter },
                    { $group: { _id: null, total: { $sum: "$durationSeconds" }, avg: { $avg: "$durationSeconds" } } },
                ]);

                return {
                    salesperson: {
                        id: member._id,
                        name: member.name,
                        email: member.email,
                        phone: member.phone,
                    },
                    total,
                    connected,
                    missed,
                    connectRate: total > 0 ? Math.round((connected / total) * 100) : 0,
                    totalTalkTime: fmt(durAgg[0]?.total || 0),
                    avgDuration: fmt(durAgg[0]?.avg || 0),
                };
            })
        );

        // Sort: sabse zyada calls wala pehle
        memberStats.sort((a, b) => b.total - a.total);

        // Team-level totals
        const teamTotal = memberStats.reduce((s, m) => s + m.total, 0);
        const teamConnected = memberStats.reduce((s, m) => s + m.connected, 0);
        const teamMissed = memberStats.reduce((s, m) => s + m.missed, 0);

        res.json({
            date: targetDate,
            teamSummary: {
                totalCalls: teamTotal,
                connected: teamConnected,
                missed: teamMissed,
                connectRate: teamTotal > 0 ? Math.round((teamConnected / teamTotal) * 100) : 0,
                totalMembers: teamMembers.length,
                activeMembers: memberStats.filter(m => m.total > 0).length,
            },
            members: memberStats,
        });
    } catch (err) {
        console.error("getDailyTeamReport error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ══════════════════════════════════════════════════════════
//  HELPER FUNCTIONS
// ══════════════════════════════════════════════════════════

// Duration seconds → "Xm Ys" string
function fmt(sec) {
    if (!sec || sec === 0) return "0s";
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    if (m === 0) return `${s}s`;
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function getDateRange(range, startDate, endDate) {
    if (startDate && endDate) {
        return { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (range) {
        case "today":
            return { $gte: today, $lt: new Date(today.getTime() + 86400000) };
        case "yesterday":
            const yesterday = new Date(today.getTime() - 86400000);
            return { $gte: yesterday, $lt: today };
        case "week":
            return { $gte: new Date(today.getTime() - 7 * 86400000) };
        case "month":
            return { $gte: new Date(today.getTime() - 30 * 86400000) };
        case "quarter":
            return { $gte: new Date(today.getTime() - 90 * 86400000) };
        default:
            return null;
    }
}

async function getMonthlySummary(filter) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const summary = [];

    for (let i = 5; i >= 0; i--) {
        const date = new Date();
        date.setMonth(date.getMonth() - i);
        const month = date.getMonth();
        const year = date.getFullYear();

        const start = new Date(year, month, 1);
        const end = new Date(year, month + 1, 0);
        const monthFilter = { ...filter, calledAt: { $gte: start, $lte: end } };

        const total = await CallLog.countDocuments(monthFilter);
        const connected = await CallLog.countDocuments({ ...monthFilter, callStatus: "Connected" });
        const missed = await CallLog.countDocuments({ ...monthFilter, callStatus: "Missed" });

        summary.push({ month: months[month], total, connected, missed });
    }

    return summary;
}

async function getWeeklyTrend(filter) {
    const trend = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        date.setHours(0, 0, 0, 0);

        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + 1);

        const weekFilter = { ...filter, calledAt: { $gte: date, $lt: nextDate } };
        const calls = await CallLog.countDocuments(weekFilter);

        const avgDurationAgg = await CallLog.aggregate([
            { $match: weekFilter },
            { $group: { _id: null, avg: { $avg: "$durationSeconds" } } }
        ]);

        trend.push({
            week: `Wk ${Math.ceil((date.getDate() + (date.getDay() + 1)) / 7)}`,
            calls,
            duration: avgDurationAgg[0]?.avg
                ? Math.round(avgDurationAgg[0].avg / 60 * 10) / 10
                : 0,
        });
    }

    return trend;
}

async function getCallDistribution(filter) {
    const incoming = await CallLog.countDocuments({ ...filter, callType: "Incoming" });
    const outgoing = await CallLog.countDocuments({ ...filter, callType: "Outgoing" });
    const missed = await CallLog.countDocuments({ ...filter, callStatus: "Missed" });
    const total = incoming + outgoing + missed;

    return [
        { name: "Incoming", value: incoming, color: "#3b82f6", percent: total > 0 ? Math.round((incoming / total) * 100) : 0 },
        { name: "Outgoing", value: outgoing, color: "#8b5cf6", percent: total > 0 ? Math.round((outgoing / total) * 100) : 0 },
        { name: "Missed", value: missed, color: "#f43f5e", percent: total > 0 ? Math.round((missed / total) * 100) : 0 },
    ];
}

// Updated: salesperson role support added
async function getAgentPerformance(filter, userRole, userId) {
    let agents;

    if (userRole === "business_user") {
        agents = await User.find({
            businessUserId: userId,
            role: "salesperson",
        }).select("name email role").lean();
    } else if (userRole === "super_admin") {
        agents = await User.find({
            role: "salesperson",
        }).select("name email role").lean();
    } else {
        // Old roles fallback
        agents = await User.find({
            role: { $in: ["agent", "team_leader", "salesperson"] },
        }).select("name email role").lean();
    }

    const performance = [];

    for (const agent of agents) {
        const agentFilter = { ...filter, agent: agent._id };

        const total = await CallLog.countDocuments(agentFilter);
        const connected = await CallLog.countDocuments({ ...agentFilter, callStatus: "Connected" });
        const missed = await CallLog.countDocuments({ ...agentFilter, callStatus: "Missed" });

        const avgDurationAgg = await CallLog.aggregate([
            { $match: agentFilter },
            { $group: { _id: null, avg: { $avg: "$durationSeconds" } } }
        ]);

        performance.push({
            _id: agent._id,
            name: agent.name,
            email: agent.email,
            role: agent.role,
            calls: total,
            connected,
            missed,
            avgDuration: fmt(avgDurationAgg[0]?.avg || 0),
            rate: total > 0 ? Math.round((connected / total) * 100) : 0,
            avatar: getInitials(agent.name),
        });
    }

    return performance.sort((a, b) => b.calls - a.calls);
}

async function getSingleAgentPerformance(agentId, filter, user) {
    const agentFilter = { ...filter, agent: agentId };

    const total = await CallLog.countDocuments(agentFilter);
    const connected = await CallLog.countDocuments({ ...agentFilter, callStatus: "Connected" });
    const missed = await CallLog.countDocuments({ ...agentFilter, callStatus: "Missed" });

    const avgDurationAgg = await CallLog.aggregate([
        { $match: agentFilter },
        { $group: { _id: null, avg: { $avg: "$durationSeconds" } } }
    ]);

    return [{
        name: user.name,
        calls: total,
        connected,
        missed,
        avgDuration: fmt(avgDurationAgg[0]?.avg || 0),
        rate: total > 0 ? Math.round((connected / total) * 100) : 0,
        avatar: getInitials(user.name),
    }];
}

async function getSummaryCards(filter) {
    const total = await CallLog.countDocuments(filter);
    const connected = await CallLog.countDocuments({ ...filter, callStatus: "Connected" });
    const missed = await CallLog.countDocuments({ ...filter, callStatus: "Missed" });

    const avgDurationAgg = await CallLog.aggregate([
        { $match: filter },
        { $group: { _id: null, avg: { $avg: "$durationSeconds" } } }
    ]);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const previousTotal = await CallLog.countDocuments({ ...filter, calledAt: { $lt: thirtyDaysAgo } });
    const change = previousTotal > 0 ? Math.round(((total - previousTotal) / previousTotal) * 100) : 0;

    return [
        {
            title: "Total Calls",
            value: total.toLocaleString(),
            change: `${change >= 0 ? "+" : ""}${change}%`,
            up: change >= 0,
        },
        {
            title: "Connected Calls",
            value: connected.toLocaleString(),
            change: `+${total > 0 ? Math.round((connected / total) * 100) : 0}%`,
            up: true,
        },
        {
            title: "Missed Calls",
            value: missed.toLocaleString(),
            change: `-${total > 0 ? Math.round((missed / total) * 100) : 0}%`,
            up: false,
        },
        {
            title: "Avg Duration",
            value: fmt(avgDurationAgg[0]?.avg || 0),
            change: "+0m 42s",
            up: true,
        },
    ];
}

function getInitials(name) {
    if (!name) return "U";
    return name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase();
}

function convertToCSV(calls) {
    const headers = ["Date", "Customer Name", "Phone", "Type", "Status", "Duration (sec)", "Agent", "Notes"];
    const rows = calls.map(call => [
        new Date(call.calledAt).toLocaleDateString("en-IN"),
        call.customerName || "Unknown",
        call.customerNumber,
        call.callType,
        call.callStatus,
        call.durationSeconds,
        call.agent?.name || "Unknown",
        call.notes || "",
    ]);
    return [headers, ...rows].map(row => row.join(",")).join("\n");
}