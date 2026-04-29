const CallLog = require("../models/CallLog");
const { emitNewCall } = require('../socket');
const User = require("../models/User");


// ── Helper: convert duration seconds to "Xm Ys" format ──
const formatDuration = (seconds) => {
    if (!seconds || seconds === 0) return "0s";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s}s`;
    return s === 0 ? `${m}m` : `${m}m ${s}s`;
};

// ─────────────────────────────────────────────────────────
// GET /api/calls
// ─────────────────────────────────────────────────────────
exports.getCallLogs = async (req, res) => {
    try {
        const {
            page = 1,
            limit = 20,
            search = "",
            callType,
            callStatus,
            dateFrom,
            dateTo,
            sortField = "calledAt",
            sortDir = "desc",
        } = req.query;

        // const query = { agent: req.user._id };
        const userRole = req.user.role;
        const query = {};


        if (["admin", "super_admin"].includes(userRole)) {
            if (req.query.agentId) query.agent = req.query.agentId;
            // koi filter nahi — sab dikhega
        } else if (userRole === "manager") {
            // Manager: agar agentId diya hai toh us agent ke calls
            if (req.query.agentId) {
                query.agent = req.query.agentId;
            } else {
                // ✅ AgentId nahi diya toh manager ki team ke SAB agents ke calls
                const teamMembers = await User.find({
                    managerId: req.user._id,
                    role: { $in: ["agent", "team_leader"] }
                }).select("_id");
                const teamIds = teamMembers.map(m => m._id);
                query.agent = { $in: teamIds };
            }
        } else if (userRole === "business_user") {
            if (req.query.agentId) {
                query.agent = req.query.agentId;
            } else {
                const teamMembers = await User.find({
                    businessUserId: req.user._id,
                    role: "salesperson"
                }).select("_id");
                const teamIds = teamMembers.map(m => m._id);
                
                if (teamIds.length === 0) {
                    // ✅ Koi salesperson assign nahi — empty result do, saare calls mat dikhao
                    return res.json({
                        logs: [],
                        pagination: { total: 0, page: 1, pages: 0 }
                    });
                }
                query.agent = { $in: teamIds };  // ✅ Sirf team ke calls
            }
        } else if (userRole === "salesperson") {
            // Sirf apne khud ke calls
            query.agent = req.user._id;
        } else {
            query.agent = req.user._id;
        }

        if (search.trim()) {
            query.$or = [
                { customerName: { $regex: search.trim(), $options: "i" } },
                { customerNumber: { $regex: search.trim(), $options: "i" } },
            ];
        }

        if (callType && callType !== "All") query.callType = callType;
        if (callStatus && callStatus !== "All") query.callStatus = callStatus;

        if (dateFrom || dateTo) {
            query.calledAt = {};
            if (dateFrom) query.calledAt.$gte = new Date(dateFrom);
            if (dateTo) {
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                query.calledAt.$lte = end;
            }
        }

        const sortOrder = sortDir === "asc" ? 1 : -1;
        const sortObj = { [sortField]: sortOrder };

        const total = await CallLog.countDocuments(query);
        const calls = await CallLog.find(query)
            .sort(sortObj)
            .skip((page - 1) * limit)
            .limit(Number(limit))
            .populate("agent", "name email role")
            .lean();

        const logs = calls.map((c) => ({
            _id: c._id,
            customerName: c.customerName || "Unknown",
            customerNumber: c.customerNumber,
            callType: c.callType,
            callStatus: c.callStatus,
            durationSeconds: c.durationSeconds,
            calledAt: c.calledAt,
            notes: c.notes,
            agent: c.agent,
            disposition: c.disposition || "",
            followUpDate: c.followUpDate || null,
            followUpNotes: c.followUpNotes || "",
        }));

        res.json({
            logs,
            pagination: {
                total,
                page: Number(page),
                pages: Math.ceil(total / limit),
            },
        });
    } catch (err) {
        console.error("getCallLogs error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ─────────────────────────────────────────────────────────
// POST /api/calls (Modified with Socket.io)
// ─────────────────────────────────────────────────────────
exports.createCallLog = async (req, res) => {
    try {
        const {
            customerName,
            customerNumber,
            callType,
            callStatus,
            durationSeconds,
            notes,
            calledAt,
        } = req.body;

        console.log("Creating call log for user:", req.user._id, req.user.name);

        if (!customerNumber) {
            return res.status(400).json({ message: "Phone number is required" });
        }
        if (!callType || !["Incoming", "Outgoing"].includes(callType)) {
            return res.status(400).json({ message: "Valid call type required: Incoming or Outgoing" });
        }

        const callLog = await CallLog.create({
            agent: req.user._id,
            customerName: customerName || "",
            customerNumber,
            callType,
            callStatus: callStatus || "Connected",
            durationSeconds: Number(durationSeconds) || 0,
            notes: notes || "",
            calledAt: calledAt ? new Date(calledAt) : new Date(),
            disposition: req.body.disposition || "",           // ✅ ADD THIS
            followUpDate: req.body.followUpDate ? new Date(req.body.followUpDate) : null,  // ✅ ADD THIS
            followUpNotes: req.body.followUpNotes || "",
        });

        // Populate agent details for real-time notification
        const populatedCall = await CallLog.findById(callLog._id)
            .populate("agent", "name email role");

        // ── NEW: Emit real-time event ──────────────────────────
        const callData = {
            _id: populatedCall._id,
            customerName: populatedCall.customerName || "Unknown",
            customerNumber: populatedCall.customerNumber,
            callType: populatedCall.callType,
            callStatus: populatedCall.callStatus,
            durationSeconds: populatedCall.durationSeconds,
            duration: formatDurationForSocket(populatedCall.durationSeconds),
            calledAt: populatedCall.calledAt,
            timeAgo: getTimeAgo(populatedCall.calledAt),
            agent: {
                id: populatedCall.agent._id,
                name: populatedCall.agent.name,
                role: populatedCall.agent.role
            }
        };

        // Broadcast to all admins and managers
        emitNewCall(callData, req.user._id, req.user.role);

        res.status(201).json({
            message: "Call log saved successfully ✅",
            call: {
                _id: callLog._id,
                customerName: callLog.customerName || "Unknown",
                customerNumber: callLog.customerNumber,
                callType: callLog.callType,
                callStatus: callLog.callStatus,
                durationSeconds: callLog.durationSeconds,
                calledAt: callLog.calledAt,
                notes: callLog.notes,
            },
        });
    } catch (err) {
        console.error("createCallLog error:", err);
        if (err.name === "ValidationError") {
            return res.status(400).json({
                message: "Validation failed",
                errors: Object.values(err.errors).map(e => e.message)
            });
        }
        res.status(500).json({ message: "Failed to save call log" });
    }
};

// Helper functions for socket
function formatDurationForSocket(seconds) {
    if (!seconds || seconds === 0) return "0s";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
}

function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - new Date(date);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    return new Date(date).toLocaleDateString();
}

// ─────────────────────────────────────────────────────────
// PUT /api/calls/:id
// ─────────────────────────────────────────────────────────
exports.updateCallLog = async (req, res) => {
    try {
        const call = await CallLog.findOne({
            _id: req.params.id,
            agent: req.user._id,
        });

        if (!call) return res.status(404).json({ message: "Call log not found" });

        const allowed = ["notes", "customerName", "callType", "callStatus", "durationSeconds", "calledAt", "disposition", "followUpDate", "followUpNotes"];
        allowed.forEach((field) => {
            if (req.body[field] !== undefined) call[field] = req.body[field];
        });

        await call.save();
        res.json({ message: "Call log updated successfully ✅" });
    } catch (err) {
        console.error("updateCallLog error:", err);
        res.status(500).json({ message: "Failed to update call log" });
    }
};



// ─────────────────────────────────────────────────────────
// GET /api/calls/stats
// ─────────────────────────────────────────────────────────
exports.getCallStats = async (req, res) => {
    try {
        const userRole = req.user.role;
        const userId = req.user._id;

        let agentFilter = {};

        // ── Role-based filter for stats ─────────────────────
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
                } else {
                    // No team members → return zeros
                    return res.json({
                        total: 0,
                        todayCalls: 0,
                        connected: 0,
                        missed: 0,
                        incoming: 0,
                        outgoing: 0,
                        connectRate: 0,
                    });
                }
            }
        }
        else if (userRole === "business_user") {
            if (req.query.agentId) {
                agentFilter.agent = req.query.agentId;
            } else {
                const teamMembers = await User.find({
                    businessUserId: userId,
                    role: "salesperson"
                }).select("_id");
                const teamIds = teamMembers.map(m => m._id);
                if (teamIds.length > 0) {
                    agentFilter.agent = { $in: teamIds };
                } else {
                    return res.json({ total: 0, todayCalls: 0, connected: 0, 
                        missed: 0, incoming: 0, outgoing: 0, connectRate: 0 });
                }
            }

        } 
        else {

            agentFilter.agent = userId;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const [total, todayCalls, connected, missed, incoming, outgoing] =
            await Promise.all([
                CallLog.countDocuments(agentFilter),
                CallLog.countDocuments({ ...agentFilter, calledAt: { $gte: today } }),
                CallLog.countDocuments({ ...agentFilter, callStatus: "Connected" }),
                CallLog.countDocuments({ ...agentFilter, callStatus: "Missed" }),
                CallLog.countDocuments({ ...agentFilter, callType: "Incoming" }),
                CallLog.countDocuments({ ...agentFilter, callType: "Outgoing" }),
            ]);

        const connectRate = total > 0 ? Math.round((connected / total) * 100) : 0;

        res.json({
            total,
            todayCalls,
            connected,
            missed,
            incoming,
            outgoing,
            connectRate,
        });
    } catch (err) {
        console.error("getCallStats error:", err);
        res.status(500).json({ message: "Failed to load stats" });
    }
};

// ─────────────────────────────────────────────────────────
// DELETE /api/calls/:id
// ─────────────────────────────────────────────────────────
exports.deleteCallLog = async (req, res) => {
    try {
        const call = await CallLog.findOneAndDelete({
            _id: req.params.id,
            agent: req.user._id,
        });

        if (!call) return res.status(404).json({ message: "Call log not found" });

        res.json({ message: "Call log deleted successfully" });
    } catch (err) {
        console.error("deleteCallLog error:", err);
        res.status(500).json({ message: "Failed to delete call log" });
    }
};

// exports.bulkImportCalls = async (req, res) => {
//     try {
//         const calls = req.body.calls; // Array of call objects

//         if (!calls || !calls.length) {
//             return res.status(400).json({ message: "No calls data provided" });
//         }

//         const createdCalls = [];
//         for (const call of calls) {
//             const newCall = await CallLog.create({
//                 agent: req.user._id,
//                 customerName: call.customerName || "Unknown",
//                 customerNumber: call.customerNumber,
//                 callType: call.callType || "Outgoing",
//                 callStatus: call.callStatus || "Connected",
//                 durationSeconds: Number(call.durationSeconds) || 0,
//                 calledAt: call.calledAt ? new Date(call.calledAt) : new Date(),
//                 notes: call.notes || "",
//                 disposition: call.disposition || "",
//                 followUpDate: call.followUpDate ? new Date(call.followUpDate) : null,
//                 followUpNotes: call.followUpNotes || ""
//             });
//             createdCalls.push(newCall);
//         }

//         res.json({
//             message: `Successfully imported ${createdCalls.length} calls`,
//             count: createdCalls.length
//         });
//     } catch (err) {
//         console.error("bulkImport error:", err);
//         res.status(500).json({ message: "Import failed" });
//     }
// };

// ✅ NEW CODE:
exports.bulkImportCalls = async (req, res) => {
    try {
        const calls = req.body.calls;

        if (!calls || !calls.length) {
            return res.status(400).json({ message: "No calls data provided" });
        }

        // ── callType normalize: device se "Missed","Voicemail","Rejected","Blocked" 
        //    aate hain jo DB enum mein nahi hain — inhe map karo
        const normalizeCallType = (rawType) => {
            if (rawType === "Incoming") return "Incoming";
            if (rawType === "Outgoing") return "Outgoing";
            // Missed/Voicemail = Incoming call thi jo connected nahi hui
            if (["Missed", "Voicemail"].includes(rawType)) return "Incoming";
            // Rejected/Blocked = bhi incoming thi
            if (["Rejected", "Blocked"].includes(rawType)) return "Incoming";
            return "Outgoing"; // default
        };

        // ── callStatus normalize
        const normalizeCallStatus = (rawType, durationSeconds) => {
            if (rawType === "Missed" || rawType === "Voicemail") return "Missed";
            if (rawType === "Rejected" || rawType === "Blocked") return "Rejected";
            if (durationSeconds === 0) return "Missed";
            return "Connected";
        };

        // ── Duplicate check: same agent + same number + same time already saved?
        const existingCalls = await CallLog.find({
            agent: req.user._id,
            calledAt: {
                $gte: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) // last 8 days
            }
        }).select("customerNumber calledAt").lean();

        // Set of "number_timestamp" for fast lookup
        const existingSet = new Set(
            existingCalls.map(c => `${c.customerNumber}_${new Date(c.calledAt).getTime()}`)
        );

        const createdCalls = [];
        const skipped = [];

        for (const call of calls) {
            const rawType = call.callType || "Outgoing";
            const duration = Number(call.durationSeconds) || 0;
            const calledAtDate = call.calledAt ? new Date(call.calledAt) : new Date();
            const phone = (call.customerNumber || "").trim();

            if (!phone) continue; // phone number nahi toh skip

            // Duplicate skip
            const key = `${phone}_${calledAtDate.getTime()}`;
            if (existingSet.has(key)) {
                skipped.push(key);
                continue;
            }

            const newCall = await CallLog.create({
                agent: req.user._id,
                customerName: call.customerName || "Unknown",
                customerNumber: phone,
                callType: normalizeCallType(rawType),       // ✅ Fixed
                callStatus: normalizeCallStatus(rawType, duration), // ✅ Fixed
                durationSeconds: duration,
                calledAt: calledAtDate,
                notes: call.notes || "",
                disposition: call.disposition || "",
                followUpDate: call.followUpDate ? new Date(call.followUpDate) : null,
                followUpNotes: call.followUpNotes || ""
            });
            createdCalls.push(newCall);
            existingSet.add(key); // prevent same-batch duplicates
        }

        console.log(`[BulkImport] Agent: ${req.user._id} | Saved: ${createdCalls.length} | Skipped (dup): ${skipped.length}`);

        res.json({
            success: true,
            message: `Successfully imported ${createdCalls.length} calls`,
            count: createdCalls.length,         // ✅ frontend ke liye
            imported: createdCalls.length,      // ✅ callLogService.js check karta hai
            skipped: skipped.length
        });
    } catch (err) {
        console.error("bulkImport error:", err);
        res.status(500).json({ success: false, message: "Import failed", error: err.message });
    }
};
// ─────────────────────────────────────────────────────────
// GET /api/calls/follow-ups  — agent ke pending follow-ups
// ─────────────────────────────────────────────────────────
exports.getPendingFollowUps = async (req, res) => {
    try {
        const now = new Date();
        const calls = await CallLog.find({
            agent: req.user._id,
            followUpDate: { $lte: now },
            disposition: "Follow-up",
        })
            .sort({ followUpDate: 1 })
            .limit(20)
            .lean();

        res.json({ count: calls.length, followUps: calls });
    } catch (err) {
        console.error("getPendingFollowUps error:", err);
        res.status(500).json({ message: "Failed to fetch follow-ups" });
    }
};
// ─────────────────────────────────────────────────────────
// GET /api/calls/leaderboard?period=weekly|monthly
// ─────────────────────────────────────────────────────────
exports.getLeaderboard = async (req, res) => {
    try {
        const { period = 'weekly' } = req.query;
        const now = new Date();
        let startDate;

        if (period === 'weekly') {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 6);
            startDate.setHours(0, 0, 0, 0);
        } else {
            // monthly = last 30 days
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 29);
            startDate.setHours(0, 0, 0, 0);
        }

        const agentUsers = await User.find({
            role: { $in: ['agent', 'team_leader', 'salesperson'] }  // ← salesperson ADD
        }).select('_id');
        const agentIds = agentUsers.map(u => u._id);

        const results = await CallLog.aggregate([
            {
                $match: {
                    calledAt: { $gte: startDate },
                    callStatus: "Connected",
                    agent: { $in: agentIds }
                }
            },
            {
                $group: {
                    _id: "$agent",
                    totalCalls: { $sum: 1 },
                    totalDuration: { $sum: "$durationSeconds" },
                    salesDone: {
                        $sum: { $cond: [{ $eq: ["$disposition", "Sale Done"] }, 1, 0] }
                    }
                }
            },
            { $sort: { totalCalls: -1 } },
            { $limit: 10 },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "agentInfo"
                }
            },
            { $unwind: "$agentInfo" },
            {
                $project: {
                    agentName: "$agentInfo.name",
                    agentEmail: "$agentInfo.email",
                    totalCalls: 1,
                    totalDuration: 1,
                    salesDone: 1
                }
            }
        ]);

        res.json({ period, startDate, leaderboard: results });
    } catch (err) {
        console.error("getLeaderboard error:", err);
        res.status(500).json({ message: "Failed to fetch leaderboard" });
    }
};

// ─────────────────────────────────────────────────────────
// GET /api/calls/team-stats
// Business User ke liye — apni team ke salespersons ka data
// ─────────────────────────────────────────────────────────
exports.getTeamCallStats = async (req, res) => {
    try {
        // Step 1: Business User ki team ke salespersons dhundo
        const teamMembers = await User.find({
            businessUserId: req.user._id,
            role: "salesperson"
        }).select("_id name email");

        if (teamMembers.length === 0) {
            return res.json({
                summary: { totalCalls: 0, connectedCalls: 0, missedCalls: 0, avgDuration: 0 },
                agents: []
            });
        }

        const teamIds = teamMembers.map(m => m._id);

        // Step 2: Aaj ki date
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Step 3: Team ke aaj ke calls
        const allCalls = await CallLog.find({
            agent: { $in: teamIds },
            calledAt: { $gte: today }
        }).lean();

        const totalCalls     = allCalls.length;
        const connectedCalls = allCalls.filter(c => c.callStatus === "Connected").length;
        const missedCalls    = allCalls.filter(c => c.callStatus === "Missed").length;
        const totalDuration  = allCalls.reduce((sum, c) => sum + (c.durationSeconds || 0), 0);
        const avgDuration    = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

        // Step 4: Har agent ka breakdown
        const agents = teamMembers.map(member => {
            const memberCalls     = allCalls.filter(c => c.agent.toString() === member._id.toString());
            const connectedCnt    = memberCalls.filter(c => c.callStatus === "Connected").length;
            return {
                _id:            member._id,
                name:           member.name,
                email:          member.email,
                totalCalls:     memberCalls.length,
                connectedCalls: connectedCnt,
                missedCalls:    memberCalls.filter(c => c.callStatus === "Missed").length,
            };
        }).sort((a, b) => b.totalCalls - a.totalCalls); // Top performer pehle

        res.json({
            summary: { totalCalls, connectedCalls, missedCalls, avgDuration },
            agents
        });

    } catch (err) {
        console.error("getTeamCallStats error:", err);
        res.status(500).json({ message: "Server error" });
    }
};


// ══════════════════════════════════════════════
//  HOURLY BREAKDOWN  →  GET /api/calls/hourly
//  Query params: date (YYYY-MM-DD), agentId (optional)
// ══════════════════════════════════════════════
exports.getHourlyBreakdown = async (req, res) => {
  try {
    const { date, agentId } = req.query;
    const targetDate = date || new Date().toISOString().split("T")[0];

    // Date range: full day
    const dayStart = new Date(targetDate + "T00:00:00.000Z");
    const dayEnd   = new Date(targetDate + "T23:59:59.999Z");

    // Filter build karo
    const filter = {
      calledAt: { $gte: dayStart, $lte: dayEnd },
    };

    // Role check — business_user apni team dekhe, salesperson sirf apna
    if (req.user.role === "salesperson") {
        filter.agent = req.user._id;           // ← userId → agent
        } else if (req.user.role === "business_user") {
        if (agentId) {
            filter.agent = agentId;              // ← userId → agent
        } else {
            const teamMembers = await User.find({
            businessUserId: req.user._id,
            role: "salesperson",
            }).select("_id");
            const ids = teamMembers.map((u) => u._id);
            filter.agent = { $in: ids };         // ← userId → agent
        }
        }
    // super_admin — koi filter nahi, sab dikhta hai

    const calls = await require("../models/CallLog")
      .find(filter)
      .select("calledAt callStatus durationSeconds callType")
      .lean();

    // 0–23 hours ke liye buckets banao
    const hours = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      label: h === 0 ? "12am"
           : h < 12  ? `${h}am`
           : h === 12 ? "12pm"
           : `${h - 12}pm`,
      total: 0,
      connected: 0,
      missed: 0,
      rejected: 0,
      totalDuration: 0,
    }));

    calls.forEach((call) => {
      const h = new Date(call.calledAt).getHours();
      if (h >= 0 && h < 24) {
        hours[h].total++;
        if (call.callStatus === "Connected") {
          hours[h].connected++;
          hours[h].totalDuration += call.durationSeconds || 0;
        } else if (call.callStatus === "Missed")    hours[h].missed++;
        else if (call.callStatus === "Rejected")    hours[h].rejected++;
      }
    });

    // Work hours sirf return karo (8am–9pm) — empty hours bhi include hain
    const workHours = hours.filter((h) => h.hour >= 8 && h.hour <= 21);

    res.json({
      date: targetDate,
      totalCalls: calls.length,
      workHours,
      allHours: hours,
      peakHour: hours.reduce((max, h) => (h.total > max.total ? h : max), hours[0]),
    });
  } catch (err) {
    console.error("getHourlyBreakdown error:", err);
    res.status(500).json({ message: "Server error" });
  }
};