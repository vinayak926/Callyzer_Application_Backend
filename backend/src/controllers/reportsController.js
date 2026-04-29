const CallLog = require("../models/CallLog");
const User = require("../models/User");

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
                : getAgentPerformance(finalFilter),
        ]);

        res.json({ summary, monthlySummary, weeklyTrend, callDistribution, agentPerformance });
    } catch (err) {
        console.error("getReports error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

exports.exportReport = async (req, res) => {
    try {
        const { format = "csv", range, startDate, endDate, agentId } = req.query;
        const userId = req.user._id;
        const userRole = req.user.role;

        // Build filters
        let dateFilter = {};
        const dateRange = getDateRange(range, startDate, endDate);
        if (dateRange) dateFilter.calledAt = dateRange;

        let agentFilter = {};
        if (["admin", "super_admin", "manager"].includes(userRole)) {
            if (agentId) agentFilter.agent = agentId;
        } else {
            agentFilter.agent = userId;
        }

        const finalFilter = { ...dateFilter, ...agentFilter };

        // Get all calls for export
        const calls = await CallLog.find(finalFilter)
            .sort({ calledAt: -1 })
            .populate("agent", "name email")
            .lean();

        if (format === "csv") {
            const csvData = convertToCSV(calls);
            
            // ✅ CRITICAL: Set correct headers for CSV download
            res.setHeader("Content-Type", "text/csv; charset=utf-8");
            res.setHeader("Content-Disposition", `attachment; filename=callyzer-report-${Date.now()}.csv`);
            res.setHeader("Cache-Control", "no-cache");
            return res.send(csvData);
        }

        // JSON format
        const summary = await getSummaryCards(finalFilter);
        res.json({ summary, calls, total: calls.length });

    } catch (err) {
        console.error("exportReport error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ──────────────────────────────────────────────────────────────
// Helper Functions
// ──────────────────────────────────────────────────────────────

function getDateRange(range, startDate, endDate) {
    if (startDate && endDate) {
        return {
            $gte: new Date(startDate),
            $lte: new Date(endDate)
        };
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (range) {
        case "today":
            return { $gte: today, $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
        case "yesterday":
            const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
            return { $gte: yesterday, $lt: today };
        case "week":
            const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
            return { $gte: weekAgo };
        case "month":
            const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
            return { $gte: monthAgo };
        case "quarter":
            const quarterAgo = new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000);
            return { $gte: quarterAgo };
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

        summary.push({
            month: months[month],
            total,
            connected,
            missed
        });
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
            duration: avgDurationAgg[0]?.avg ? Math.round(avgDurationAgg[0].avg / 60 * 10) / 10 : 0
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
        { name: "Missed", value: missed, color: "#f43f5e", percent: total > 0 ? Math.round((missed / total) * 100) : 0 }
    ];
}

async function getAgentPerformance(filter) {
    const agents = await User.find({ role: { $in: ["agent", "team_leader"] } })
        .select("name email role");

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

        const avgDurationSeconds = avgDurationAgg[0]?.avg || 0;
        const avgMinutes = Math.floor(avgDurationSeconds / 60);
        const avgSeconds = Math.round(avgDurationSeconds % 60);
        const avgDuration = avgMinutes > 0 ? `${avgMinutes}m ${avgSeconds}s` : `${avgSeconds}s`;

        const rate = total > 0 ? Math.round((connected / total) * 100) : 0;

        performance.push({
            _id: agent._id,
            name: agent.name,
            email: agent.email,
            role: agent.role,
            calls: total,
            connected,
            missed,
            avgDuration,
            rate,
            avatar: getInitials(agent.name)
        });
    }

    return performance.sort((a, b) => b.calls - a.calls);
}

// ✅ FIXED: Added 'user' parameter
async function getSingleAgentPerformance(agentId, filter, user) {
    const agentFilter = { ...filter, agent: agentId };

    const total = await CallLog.countDocuments(agentFilter);
    const connected = await CallLog.countDocuments({ ...agentFilter, callStatus: "Connected" });
    const missed = await CallLog.countDocuments({ ...agentFilter, callStatus: "Missed" });

    const avgDurationAgg = await CallLog.aggregate([
        { $match: agentFilter },
        { $group: { _id: null, avg: { $avg: "$durationSeconds" } } }
    ]);

    const avgDurationSeconds = avgDurationAgg[0]?.avg || 0;
    const avgMinutes = Math.floor(avgDurationSeconds / 60);
    const avgSeconds = Math.round(avgDurationSeconds % 60);
    const avgDuration = avgMinutes > 0 ? `${avgMinutes}m ${avgSeconds}s` : `${avgSeconds}s`;

    const rate = total > 0 ? Math.round((connected / total) * 100) : 0;

    return [{
        name: user.name,  // ✅ Fixed: using user parameter
        calls: total,
        connected,
        missed,
        avgDuration,
        rate,
        avatar: getInitials(user.name)
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
    const avgDurationSeconds = avgDurationAgg[0]?.avg || 0;
    const avgMinutes = Math.floor(avgDurationSeconds / 60);
    const avgSeconds = Math.round(avgDurationSeconds % 60);
    const avgDuration = avgMinutes > 0 ? `${avgMinutes}m ${avgSeconds}s` : `${avgSeconds}s`;

    // Calculate percentage change (compare with previous period)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const previousFilter = { ...filter, calledAt: { $lt: thirtyDaysAgo } };
    const previousTotal = await CallLog.countDocuments(previousFilter);
    const change = previousTotal > 0 ? Math.round(((total - previousTotal) / previousTotal) * 100) : 0;

    return [
        { title: "Total Calls", value: total.toLocaleString(), change: `${change >= 0 ? "+" : ""}${change}%`, up: change >= 0 },
        {
            title: "Connected Calls", value: connected.toLocaleString(),
            change: `+${total > 0 ? Math.round((connected / total) * 100) : 0}%`, up: true
        },
        {
            title: "Missed Calls", value: missed.toLocaleString(),
            change: `-${total > 0 ? Math.round((missed / total) * 100) : 0}%`, up: false
        }, ,
        { title: "Avg Duration", value: avgDuration, change: "+0m 42s", up: true }
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
        call.notes || ""
    ]);

    return [headers, ...rows].map(row => row.join(",")).join("\n");
}