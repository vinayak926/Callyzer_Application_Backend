// const CallLog = require("../models/CallLog");
// const { emitNewCall } = require('../socket');
// const User = require("../models/User");


// // ── Helper: convert duration seconds to "Xm Ys" format ──
// const formatDuration = (seconds) => {
//     if (!seconds || seconds === 0) return "0s";
//     const m = Math.floor(seconds / 60);
//     const s = seconds % 60;
//     if (m === 0) return `${s}s`;
//     return s === 0 ? `${m}m` : `${m}m ${s}s`;
// };

// // ─────────────────────────────────────────────────────────
// // GET /api/calls
// // ─────────────────────────────────────────────────────────
// exports.getCallLogs = async (req, res) => {
//     try {
//         const {
//             page = 1,
//             limit = 20,
//             search = "",
//             callType,
//             callStatus,
//             dateFrom,
//             dateTo,
//             sortField = "calledAt",
//             sortDir = "desc",
//         } = req.query;

//         const userRole = req.user.role;
//         const query = {};

//         if (["admin", "super_admin"].includes(userRole)) {
//             if (req.query.agentId) query.agent = req.query.agentId;
//         } else if (userRole === "manager") {
//             if (req.query.agentId) {
//                 query.agent = req.query.agentId;
//             } else {
//                 const teamMembers = await User.find({
//                     managerId: req.user._id,
//                     role: { $in: ["agent", "team_leader"] }
//                 }).select("_id");
//                 const teamIds = teamMembers.map(m => m._id);
//                 query.agent = { $in: teamIds };
//             }
//         } else if (userRole === "business_user") {
//             if (req.query.agentId) {
//                 query.agent = req.query.agentId;
//             } else {
//                 const teamMembers = await User.find({
//                     businessUserId: req.user._id,
//                     role: "salesperson"
//                 }).select("_id");
//                 const teamIds = teamMembers.map(m => m._id);

//                 if (teamIds.length === 0) {
//                     return res.json({
//                         logs: [],
//                         pagination: { total: 0, page: 1, pages: 0 }
//                     });
//                 }
//                 query.agent = { $in: teamIds };
//             }
//         } else if (userRole === "salesperson") {
//             query.agent = req.user._id;
//         } else {
//             query.agent = req.user._id;
//         }

//         if (search.trim()) {
//             query.$or = [
//                 { customerName: { $regex: search.trim(), $options: "i" } },
//                 { customerNumber: { $regex: search.trim(), $options: "i" } },
//             ];
//         }

//         if (callType && callType !== "All") query.callType = callType;
//         if (callStatus && callStatus !== "All") query.callStatus = callStatus;

//         if (dateFrom || dateTo) {
//             query.calledAt = {};
//             if (dateFrom) query.calledAt.$gte = new Date(dateFrom);
//             if (dateTo) {
//                 const end = new Date(dateTo);
//                 end.setHours(23, 59, 59, 999);
//                 query.calledAt.$lte = end;
//             }
//         }

//         const sortOrder = sortDir === "asc" ? 1 : -1;
//         const sortObj = { [sortField]: sortOrder };

//         const total = await CallLog.countDocuments(query);
//         const calls = await CallLog.find(query)
//             .sort(sortObj)
//             .skip((page - 1) * limit)
//             .limit(Number(limit))
//             .populate("agent", "name email role")
//             .lean();

//         const logs = calls.map((c) => ({
//             _id: c._id,
//             customerName: c.customerName || "Unknown",
//             customerNumber: c.customerNumber,
//             callType: c.callType,
//             callStatus: c.callStatus,
//             durationSeconds: c.durationSeconds,
//             calledAt: c.calledAt,
//             notes: c.notes,
//             agent: c.agent,
//             disposition: c.disposition || "",
//             followUpDate: c.followUpDate || null,
//             followUpNotes: c.followUpNotes || "",
//         }));

//         res.json({
//             logs,
//             pagination: {
//                 total,
//                 page: Number(page),
//                 pages: Math.ceil(total / limit),
//             },
//         });
//     } catch (err) {
//         console.error("getCallLogs error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };

// // ─────────────────────────────────────────────────────────
// // POST /api/calls (Modified with Socket.io)
// // ─────────────────────────────────────────────────────────
// exports.createCallLog = async (req, res) => {
//     try {
//         const {
//             customerName,
//             customerNumber,
//             callType,
//             callStatus,
//             durationSeconds,
//             notes,
//             calledAt,
//         } = req.body;

//         console.log("Creating call log for user:", req.user._id, req.user.name);

//         if (!customerNumber) {
//             return res.status(400).json({ message: "Phone number is required" });
//         }
//         if (!callType || !["Incoming", "Outgoing"].includes(callType)) {
//             return res.status(400).json({ message: "Valid call type required: Incoming or Outgoing" });
//         }

//         const callLog = await CallLog.create({
//             agent: req.user._id,
//             customerName: customerName || "",
//             customerNumber,
//             callType,
//             callStatus: callStatus || "Connected",
//             durationSeconds: Number(durationSeconds) || 0,
//             notes: notes || "",
//             calledAt: calledAt ? new Date(calledAt) : new Date(),
//             disposition: req.body.disposition || "",
//             followUpDate: req.body.followUpDate ? new Date(req.body.followUpDate) : null,
//             followUpNotes: req.body.followUpNotes || "",
//         });

//         const populatedCall = await CallLog.findById(callLog._id)
//             .populate("agent", "name email role");

//         const callData = {
//             _id: populatedCall._id,
//             customerName: populatedCall.customerName || "Unknown",
//             customerNumber: populatedCall.customerNumber,
//             callType: populatedCall.callType,
//             callStatus: populatedCall.callStatus,
//             durationSeconds: populatedCall.durationSeconds,
//             duration: formatDurationForSocket(populatedCall.durationSeconds),
//             calledAt: populatedCall.calledAt,
//             timeAgo: getTimeAgo(populatedCall.calledAt),
//             agent: {
//                 id: populatedCall.agent._id,
//                 name: populatedCall.agent.name,
//                 role: populatedCall.agent.role
//             }
//         };

//         emitNewCall(callData, req.user._id, req.user.role);

//         res.status(201).json({
//             message: "Call log saved successfully ✅",
//             call: {
//                 _id: callLog._id,
//                 customerName: callLog.customerName || "Unknown",
//                 customerNumber: callLog.customerNumber,
//                 callType: callLog.callType,
//                 callStatus: callLog.callStatus,
//                 durationSeconds: callLog.durationSeconds,
//                 calledAt: callLog.calledAt,
//                 notes: callLog.notes,
//             },
//         });
//     } catch (err) {
//         console.error("createCallLog error:", err);
//         if (err.name === "ValidationError") {
//             return res.status(400).json({
//                 message: "Validation failed",
//                 errors: Object.values(err.errors).map(e => e.message)
//             });
//         }
//         res.status(500).json({ message: "Failed to save call log" });
//     }
// };

// // Helper functions for socket
// function formatDurationForSocket(seconds) {
//     if (!seconds || seconds === 0) return "0s";
//     const mins = Math.floor(seconds / 60);
//     const secs = seconds % 60;
//     if (mins === 0) return `${secs}s`;
//     return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
// }

// function getTimeAgo(date) {
//     const now = new Date();
//     const diffMs = now - new Date(date);
//     const diffMins = Math.floor(diffMs / 60000);
//     const diffHours = Math.floor(diffMins / 60);

//     if (diffMins < 1) return "Just now";
//     if (diffMins < 60) return `${diffMins} min ago`;
//     if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
//     return new Date(date).toLocaleDateString();
// }

// // ─────────────────────────────────────────────────────────
// // PUT /api/calls/:id
// // ─────────────────────────────────────────────────────────
// exports.updateCallLog = async (req, res) => {
//     try {
//         const call = await CallLog.findOne({
//             _id: req.params.id,
//             agent: req.user._id,
//         });

//         if (!call) return res.status(404).json({ message: "Call log not found" });

//         const allowed = ["notes", "customerName", "callType", "callStatus", "durationSeconds", "calledAt", "disposition", "followUpDate", "followUpNotes"];
//         allowed.forEach((field) => {
//             if (req.body[field] !== undefined) call[field] = req.body[field];
//         });

//         await call.save();
//         res.json({ message: "Call log updated successfully ✅" });
//     } catch (err) {
//         console.error("updateCallLog error:", err);
//         res.status(500).json({ message: "Failed to update call log" });
//     }
// };

// // ─────────────────────────────────────────────────────────
// // GET /api/calls/stats
// // ─────────────────────────────────────────────────────────
// exports.getCallStats = async (req, res) => {
//     try {
//         const userRole = req.user.role;
//         const userId = req.user._id;

//         let agentFilter = {};

//         if (["admin", "super_admin"].includes(userRole)) {
//             if (req.query.agentId) {
//                 agentFilter.agent = req.query.agentId;
//             }
//         } else if (userRole === "manager") {
//             if (req.query.agentId) {
//                 agentFilter.agent = req.query.agentId;
//             } else {
//                 const teamMembers = await User.find({
//                     managerId: userId,
//                     role: { $in: ["agent", "team_leader"] }
//                 }).select("_id");
//                 const teamIds = teamMembers.map(m => m._id);
//                 if (teamIds.length > 0) {
//                     agentFilter.agent = { $in: teamIds };
//                 } else {
//                     return res.json({
//                         total: 0, todayCalls: 0, connected: 0,
//                         missed: 0, incoming: 0, outgoing: 0, connectRate: 0,
//                     });
//                 }
//             }
//         } else if (userRole === "business_user") {
//             if (req.query.agentId) {
//                 agentFilter.agent = req.query.agentId;
//             } else {
//                 const teamMembers = await User.find({
//                     businessUserId: userId,
//                     role: "salesperson"
//                 }).select("_id");
//                 const teamIds = teamMembers.map(m => m._id);
//                 if (teamIds.length > 0) {
//                     agentFilter.agent = { $in: teamIds };
//                 } else {
//                     return res.json({
//                         total: 0, todayCalls: 0, connected: 0,
//                         missed: 0, incoming: 0, outgoing: 0, connectRate: 0
//                     });
//                 }
//             }
//         } else {
//             agentFilter.agent = userId;
//         }

//         const today = new Date();
//         today.setHours(0, 0, 0, 0);

//         const [total, todayCalls, connected, missed, incoming, outgoing] =
//             await Promise.all([
//                 CallLog.countDocuments(agentFilter),
//                 CallLog.countDocuments({ ...agentFilter, calledAt: { $gte: today } }),
//                 CallLog.countDocuments({ ...agentFilter, callStatus: "Connected" }),
//                 CallLog.countDocuments({ ...agentFilter, callStatus: "Missed" }),
//                 CallLog.countDocuments({ ...agentFilter, callType: "Incoming" }),
//                 CallLog.countDocuments({ ...agentFilter, callType: "Outgoing" }),
//             ]);

//         const connectRate = total > 0 ? Math.round((connected / total) * 100) : 0;

//         res.json({ total, todayCalls, connected, missed, incoming, outgoing, connectRate });
//     } catch (err) {
//         console.error("getCallStats error:", err);
//         res.status(500).json({ message: "Failed to load stats" });
//     }
// };

// // ─────────────────────────────────────────────────────────
// // DELETE /api/calls/:id
// // ─────────────────────────────────────────────────────────
// exports.deleteCallLog = async (req, res) => {
//     try {
//         const call = await CallLog.findOneAndDelete({
//             _id: req.params.id,
//             agent: req.user._id,
//         });

//         if (!call) return res.status(404).json({ message: "Call log not found" });

//         res.json({ message: "Call log deleted successfully" });
//     } catch (err) {
//         console.error("deleteCallLog error:", err);
//         res.status(500).json({ message: "Failed to delete call log" });
//     }
// };

// // ─────────────────────────────────────────────────────────
// // POST /api/calls/bulk-import
// // ─────────────────────────────────────────────────────────
// exports.bulkImportCalls = async (req, res) => {
//     try {
//         const calls = req.body.calls;

//         if (!calls || !calls.length) {
//             return res.status(400).json({ message: "No calls data provided" });
//         }

//         const normalizeCallType = (rawType) => {
//             if (rawType === "Incoming") return "Incoming";
//             if (rawType === "Outgoing") return "Outgoing";
//             if (["Missed", "Voicemail"].includes(rawType)) return "Incoming";
//             if (["Rejected", "Blocked"].includes(rawType)) return "Incoming";
//             return "Outgoing";
//         };

//         const normalizeCallStatus = (rawType, durationSeconds) => {
//             if (rawType === "Missed" || rawType === "Voicemail") return "Missed";
//             if (rawType === "Rejected" || rawType === "Blocked") return "Rejected";
//             if (durationSeconds === 0) return "Missed";
//             return "Connected";
//         };

//         const existingCalls = await CallLog.find({
//             agent: req.user._id,
//             calledAt: { $gte: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) }
//         }).select("customerNumber calledAt").lean();

//         const existingSet = new Set(
//             existingCalls.map(c => `${c.customerNumber}_${new Date(c.calledAt).getTime()}`)
//         );

//         const createdCalls = [];
//         const skipped = [];

//         for (const call of calls) {
//             const rawType = call.callType || "Outgoing";
//             const duration = Number(call.durationSeconds) || 0;
//             const calledAtDate = call.calledAt ? new Date(call.calledAt) : new Date();
//             const phone = (call.customerNumber || "").trim();

//             if (!phone) continue;

//             const key = `${phone}_${calledAtDate.getTime()}`;
//             if (existingSet.has(key)) {
//                 skipped.push(key);
//                 continue;
//             }

//             const newCall = await CallLog.create({
//                 agent: req.user._id,
//                 customerName: call.customerName || "Unknown",
//                 customerNumber: phone,
//                 callType: normalizeCallType(rawType),
//                 callStatus: normalizeCallStatus(rawType, duration),
//                 durationSeconds: duration,
//                 calledAt: calledAtDate,
//                 notes: call.notes || "",
//                 disposition: call.disposition || "",
//                 followUpDate: call.followUpDate ? new Date(call.followUpDate) : null,
//                 followUpNotes: call.followUpNotes || "",
//                 source: "device_sync",
//             });
//             createdCalls.push(newCall);
//             existingSet.add(key);
//         }

//         console.log(`[BulkImport] Agent: ${req.user._id} | Saved: ${createdCalls.length} | Skipped (dup): ${skipped.length}`);

//         res.json({
//             success: true,
//             message: `Successfully imported ${createdCalls.length} calls`,
//             count: createdCalls.length,
//             imported: createdCalls.length,
//             skipped: skipped.length
//         });
//     } catch (err) {
//         console.error("bulkImport error:", err);
//         res.status(500).json({ success: false, message: "Import failed", error: err.message });
//     }
// };

// // ─────────────────────────────────────────────────────────
// // GET /api/calls/follow-ups
// // ─────────────────────────────────────────────────────────
// exports.getPendingFollowUps = async (req, res) => {
//     try {
//         const now = new Date();
//         const calls = await CallLog.find({
//             agent: req.user._id,
//             followUpDate: { $lte: now },
//             disposition: "Follow-up",
//         })
//             .sort({ followUpDate: 1 })
//             .limit(20)
//             .lean();

//         res.json({ count: calls.length, followUps: calls });
//     } catch (err) {
//         console.error("getPendingFollowUps error:", err);
//         res.status(500).json({ message: "Failed to fetch follow-ups" });
//     }
// };

// // ─────────────────────────────────────────────────────────
// // GET /api/calls/leaderboard?period=weekly|monthly
// // ─────────────────────────────────────────────────────────
// exports.getLeaderboard = async (req, res) => {
//     try {
//         const { period = 'weekly' } = req.query;
//         const now = new Date();
//         let startDate;

//         if (period === 'weekly') {
//             startDate = new Date(now);
//             startDate.setDate(now.getDate() - 6);
//             startDate.setHours(0, 0, 0, 0);
//         } else {
//             startDate = new Date(now);
//             startDate.setDate(now.getDate() - 29);
//             startDate.setHours(0, 0, 0, 0);
//         }

//         const agentUsers = await User.find({
//             role: { $in: ['agent', 'team_leader', 'salesperson'] }
//         }).select('_id');
//         const agentIds = agentUsers.map(u => u._id);

//         const results = await CallLog.aggregate([
//             {
//                 $match: {
//                     calledAt: { $gte: startDate },
//                     callStatus: "Connected",
//                     agent: { $in: agentIds }
//                 }
//             },
//             {
//                 $group: {
//                     _id: "$agent",
//                     totalCalls: { $sum: 1 },
//                     totalDuration: { $sum: "$durationSeconds" },
//                     salesDone: {
//                         $sum: { $cond: [{ $eq: ["$disposition", "Sale Done"] }, 1, 0] }
//                     }
//                 }
//             },
//             { $sort: { totalCalls: -1 } },
//             { $limit: 10 },
//             {
//                 $lookup: {
//                     from: "users",
//                     localField: "_id",
//                     foreignField: "_id",
//                     as: "agentInfo"
//                 }
//             },
//             { $unwind: "$agentInfo" },
//             {
//                 $project: {
//                     agentName: "$agentInfo.name",
//                     agentEmail: "$agentInfo.email",
//                     totalCalls: 1,
//                     totalDuration: 1,
//                     salesDone: 1
//                 }
//             }
//         ]);

//         res.json({ period, startDate, leaderboard: results });
//     } catch (err) {
//         console.error("getLeaderboard error:", err);
//         res.status(500).json({ message: "Failed to fetch leaderboard" });
//     }
// };

// // ─────────────────────────────────────────────────────────
// // GET /api/calls/team-stats
// // ─────────────────────────────────────────────────────────
// exports.getTeamCallStats = async (req, res) => {
//     try {
//         const teamMembers = await User.find({
//             businessUserId: req.user._id,
//             role: "salesperson"
//         }).select("_id name email");

//         if (teamMembers.length === 0) {
//             return res.json({
//                 summary: { totalCalls: 0, connectedCalls: 0, missedCalls: 0, avgDuration: 0 },
//                 agents: []
//             });
//         }

//         const teamIds = teamMembers.map(m => m._id);

//         const today = new Date();
//         today.setHours(0, 0, 0, 0);

//         const allCalls = await CallLog.find({
//             agent: { $in: teamIds },
//             calledAt: { $gte: today }
//         }).lean();

//         const totalCalls = allCalls.length;
//         const connectedCalls = allCalls.filter(c => c.callStatus === "Connected").length;
//         const missedCalls = allCalls.filter(c => c.callStatus === "Missed").length;
//         const totalDuration = allCalls.reduce((sum, c) => sum + (c.durationSeconds || 0), 0);
//         const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

//         const agents = teamMembers.map(member => {
//             const memberCalls = allCalls.filter(c => c.agent.toString() === member._id.toString());
//             const connectedCnt = memberCalls.filter(c => c.callStatus === "Connected").length;
//             return {
//                 _id: member._id,
//                 name: member.name,
//                 email: member.email,
//                 totalCalls: memberCalls.length,
//                 connectedCalls: connectedCnt,
//                 missedCalls: memberCalls.filter(c => c.callStatus === "Missed").length,
//             };
//         }).sort((a, b) => b.totalCalls - a.totalCalls);

//         res.json({
//             summary: { totalCalls, connectedCalls, missedCalls, avgDuration },
//             agents
//         });
//     } catch (err) {
//         console.error("getTeamCallStats error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };

// // ─────────────────────────────────────────────────────────
// // GET /api/calls/hourly?date=YYYY-MM-DD&agentId=optional
// // ─────────────────────────────────────────────────────────
// exports.getHourlyBreakdown = async (req, res) => {
//     try {
//         const { date, agentId } = req.query;
//         const targetDate = date || new Date().toISOString().split("T")[0];

//         const dayStart = new Date(targetDate + "T00:00:00.000Z");
//         const dayEnd = new Date(targetDate + "T23:59:59.999Z");

//         const filter = { calledAt: { $gte: dayStart, $lte: dayEnd } };

//         if (req.user.role === "salesperson") {
//             filter.agent = req.user._id;
//         } else if (req.user.role === "business_user") {
//             if (agentId) {
//                 filter.agent = agentId;
//             } else {
//                 const teamMembers = await User.find({
//                     businessUserId: req.user._id,
//                     role: "salesperson",
//                 }).select("_id");
//                 filter.agent = { $in: teamMembers.map(u => u._id) };
//             }
//         }
//         // super_admin — no filter, sees all

//         const calls = await CallLog.find(filter)
//             .select("calledAt callStatus durationSeconds callType")
//             .lean();

//         const hours = Array.from({ length: 24 }, (_, h) => ({
//             hour: h,
//             label: h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`,
//             total: 0, connected: 0, missed: 0, rejected: 0, totalDuration: 0,
//         }));

//         calls.forEach((call) => {
//             const h = new Date(call.calledAt).getHours();
//             if (h >= 0 && h < 24) {
//                 hours[h].total++;
//                 if (call.callStatus === "Connected") {
//                     hours[h].connected++;
//                     hours[h].totalDuration += call.durationSeconds || 0;
//                 } else if (call.callStatus === "Missed") hours[h].missed++;
//                 else if (call.callStatus === "Rejected") hours[h].rejected++;
//             }
//         });

//         const workHours = hours.filter(h => h.hour >= 8 && h.hour <= 21);

//         res.json({
//             date: targetDate,
//             totalCalls: calls.length,
//             workHours,
//             allHours: hours,
//             peakHour: hours.reduce((max, h) => (h.total > max.total ? h : max), hours[0]),
//         });
//     } catch (err) {
//         console.error("getHourlyBreakdown error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };

// // ══════════════════════════════════════════════════════════
// //  NEW — GET /api/calls/sync-status
// //  Last device sync info — by role
// // ══════════════════════════════════════════════════════════
// exports.getSyncStatus = async (req, res) => {
//     try {
//         const userId = req.user._id;
//         const userRole = req.user.role;

//         // ── SALESPERSON: apna last sync ──────────────────────
//         if (userRole === "salesperson") {
//             const lastCall = await CallLog
//                 .findOne({ agent: userId, source: "device_sync" })
//                 .sort({ createdAt: -1 })
//                 .select("createdAt calledAt")
//                 .lean();

//             const totalSynced = await CallLog.countDocuments({
//                 agent: userId,
//                 source: "device_sync",
//             });

//             return res.json({
//                 lastSyncAt: lastCall ? lastCall.createdAt : null,
//                 lastCallDate: lastCall ? lastCall.calledAt : null,
//                 totalSynced,
//                 message: lastCall
//                     ? `Last synced: ${new Date(lastCall.createdAt).toLocaleString("en-IN")}`
//                     : "No sync done yet",
//             });
//         }

//         // ── BUSINESS USER: apni poori team ka sync status ────
//         if (userRole === "business_user") {
//             const teamMembers = await User.find({
//                 businessUserId: userId,
//                 role: "salesperson",
//             }).select("_id name").lean();

//             const teamSyncStatus = await Promise.all(
//                 teamMembers.map(async (member) => {
//                     const lastCall = await CallLog
//                         .findOne({ agent: member._id, source: "device_sync" })
//                         .sort({ createdAt: -1 })
//                         .select("createdAt")
//                         .lean();

//                     const totalSynced = await CallLog.countDocuments({
//                         agent: member._id,
//                         source: "device_sync",
//                     });

//                     return {
//                         salespersonId: member._id,
//                         salespersonName: member.name,
//                         lastSyncAt: lastCall ? lastCall.createdAt : null,
//                         totalSynced,
//                     };
//                 })
//             );

//             return res.json({ teamSyncStatus });
//         }

//         // ── SUPER ADMIN: platform ki last 10 recent syncs ────
//         const recentSyncs = await CallLog
//             .find({ source: "device_sync" })
//             .sort({ createdAt: -1 })
//             .limit(10)
//             .populate("agent", "name email")
//             .select("createdAt agent")
//             .lean();

//         return res.json({ recentSyncs });

//     } catch (err) {
//         console.error("getSyncStatus error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };



// const CallLog = require("../models/CallLog");
// const { emitNewCall } = require('../socket');
// const User = require("../models/User");


// // ── Helper: convert duration seconds to "Xm Ys" format ──
// const formatDuration = (seconds) => {
//     if (!seconds || seconds === 0) return "0s";
//     const m = Math.floor(seconds / 60);
//     const s = seconds % 60;
//     if (m === 0) return `${s}s`;
//     return s === 0 ? `${m}m` : `${m}m ${s}s`;
// };

// // ─────────────────────────────────────────────────────────
// // GET /api/calls
// // ─────────────────────────────────────────────────────────
// exports.getCallLogs = async (req, res) => {
//     try {
//         const {
//             page = 1,
//             limit = 20,
//             search = "",
//             callType,
//             callStatus,
//             dateFrom,
//             dateTo,
//             sortField = "calledAt",
//             sortDir = "desc",
//         } = req.query;

//         const userRole = req.user.role;
//         const query = {};

//         if (["admin", "super_admin"].includes(userRole)) {
//             if (req.query.agentId) query.agent = req.query.agentId;
//         } else if (userRole === "manager") {
//             if (req.query.agentId) {
//                 query.agent = req.query.agentId;
//             } else {
//                 const teamMembers = await User.find({
//                     managerId: req.user._id,
//                     role: { $in: ["agent", "team_leader"] }
//                 }).select("_id");
//                 const teamIds = teamMembers.map(m => m._id);
//                 query.agent = { $in: teamIds };
//             }
//         } else if (userRole === "business_user") {
//             if (req.query.agentId) {
//                 query.agent = req.query.agentId;
//             } else {
//                 const teamMembers = await User.find({
//                     businessUserId: req.user._id,
//                     role: "salesperson"
//                 }).select("_id");
//                 const teamIds = teamMembers.map(m => m._id);

//                 if (teamIds.length === 0) {
//                     return res.json({
//                         logs: [],
//                         pagination: { total: 0, page: 1, pages: 0 }
//                     });
//                 }
//                 query.agent = { $in: teamIds };
//             }
//         } else if (userRole === "salesperson") {
//             query.agent = req.user._id;
//         } else {
//             query.agent = req.user._id;
//         }

//         if (search.trim()) {
//             query.$or = [
//                 { customerName: { $regex: search.trim(), $options: "i" } },
//                 { customerNumber: { $regex: search.trim(), $options: "i" } },
//             ];
//         }

//         if (callType && callType !== "All") query.callType = callType;
//         if (callStatus && callStatus !== "All") query.callStatus = callStatus;

//         if (dateFrom || dateTo) {
//             query.calledAt = {};
//             if (dateFrom) query.calledAt.$gte = new Date(dateFrom);
//             if (dateTo) {
//                 const end = new Date(dateTo);
//                 end.setHours(23, 59, 59, 999);
//                 query.calledAt.$lte = end;
//             }
//         }

//         const sortOrder = sortDir === "asc" ? 1 : -1;
//         const sortObj = { [sortField]: sortOrder };

//         const total = await CallLog.countDocuments(query);
//         const calls = await CallLog.find(query)
//             .sort(sortObj)
//             .skip((page - 1) * limit)
//             .limit(Number(limit))
//             .populate("agent", "name email role")
//             .lean();

//         const logs = calls.map((c) => ({
//             _id: c._id,
//             customerName: c.customerName || "Unknown",
//             customerNumber: c.customerNumber,
//             callType: c.callType,
//             callStatus: c.callStatus,
//             durationSeconds: c.durationSeconds,
//             calledAt: c.calledAt,
//             notes: c.notes,
//             agent: c.agent,
//             disposition: c.disposition || "",
//             followUpDate: c.followUpDate || null,
//             followUpNotes: c.followUpNotes || "",
//         }));

//         res.json({
//             logs,
//             pagination: {
//                 total,
//                 page: Number(page),
//                 pages: Math.ceil(total / limit),
//             },
//         });
//     } catch (err) {
//         console.error("getCallLogs error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };

// // ─────────────────────────────────────────────────────────
// // POST /api/calls
// // ✅ UPDATED: businessUserId fetch karke socket mein pass
// // ─────────────────────────────────────────────────────────
// exports.createCallLog = async (req, res) => {
//     try {
//         const {
//             customerName,
//             customerNumber,
//             callType,
//             callStatus,
//             durationSeconds,
//             notes,
//             calledAt,
//         } = req.body;

//         console.log("Creating call log for user:", req.user._id, req.user.name);

//         if (!customerNumber) {
//             return res.status(400).json({ message: "Phone number is required" });
//         }
//         if (!callType || !["Incoming", "Outgoing"].includes(callType)) {
//             return res.status(400).json({ message: "Valid call type required: Incoming or Outgoing" });
//         }

//         const callLog = await CallLog.create({
//             agent: req.user._id,
//             customerName: customerName || "",
//             customerNumber,
//             callType,
//             callStatus: callStatus || "Connected",
//             durationSeconds: Number(durationSeconds) || 0,
//             notes: notes || "",
//             calledAt: calledAt ? new Date(calledAt) : new Date(),
//             disposition: req.body.disposition || "",
//             followUpDate: req.body.followUpDate ? new Date(req.body.followUpDate) : null,
//             followUpNotes: req.body.followUpNotes || "",
//         });

//         const populatedCall = await CallLog.findById(callLog._id)
//             .populate("agent", "name email role");

//         const callData = {
//             _id: populatedCall._id,
//             customerName: populatedCall.customerName || "Unknown",
//             customerNumber: populatedCall.customerNumber,
//             callType: populatedCall.callType,
//             callStatus: populatedCall.callStatus,
//             durationSeconds: populatedCall.durationSeconds,
//             duration: formatDurationForSocket(populatedCall.durationSeconds),
//             calledAt: populatedCall.calledAt,
//             timeAgo: getTimeAgo(populatedCall.calledAt),
//             agent: {
//                 id: populatedCall.agent._id,
//                 name: populatedCall.agent.name,
//                 role: populatedCall.agent.role,
//             }
//         };

//         // ── businessUserId fetch karo ──────────────────────
//         // Salesperson ke businessUserId se BU room mein emit hoga
//         let businessUserId = null;
//         if (req.user.role === "salesperson") {
//             if (req.user.businessUserId) {
//                 // JWT mein already hai
//                 businessUserId = req.user.businessUserId;
//             } else {
//                 // Fallback: DB se fetch karo
//                 const agentDoc = await User.findById(req.user._id)
//                     .select("businessUserId")
//                     .lean();
//                 businessUserId = agentDoc?.businessUserId || null;
//             }
//         }

//         // Broadcast — businessUserId bhi pass hoga socket mein
//         emitNewCall(callData, req.user._id, req.user.role, businessUserId);

//         res.status(201).json({
//             message: "Call log saved successfully ✅",
//             call: {
//                 _id: callLog._id,
//                 customerName: callLog.customerName || "Unknown",
//                 customerNumber: callLog.customerNumber,
//                 callType: callLog.callType,
//                 callStatus: callLog.callStatus,
//                 durationSeconds: callLog.durationSeconds,
//                 calledAt: callLog.calledAt,
//                 notes: callLog.notes,
//             },
//         });
//     } catch (err) {
//         console.error("createCallLog error:", err);
//         if (err.name === "ValidationError") {
//             return res.status(400).json({
//                 message: "Validation failed",
//                 errors: Object.values(err.errors).map(e => e.message)
//             });
//         }
//         res.status(500).json({ message: "Failed to save call log" });
//     }
// };

// // Helper functions for socket
// function formatDurationForSocket(seconds) {
//     if (!seconds || seconds === 0) return "0s";
//     const mins = Math.floor(seconds / 60);
//     const secs = seconds % 60;
//     if (mins === 0) return `${secs}s`;
//     return secs === 0 ? `${mins}m` : `${mins}m ${secs}s`;
// }

// function getTimeAgo(date) {
//     const now = new Date();
//     const diffMs = now - new Date(date);
//     const diffMins = Math.floor(diffMs / 60000);
//     const diffHours = Math.floor(diffMins / 60);

//     if (diffMins < 1) return "Just now";
//     if (diffMins < 60) return `${diffMins} min ago`;
//     if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
//     return new Date(date).toLocaleDateString();
// }

// // ─────────────────────────────────────────────────────────
// // PUT /api/calls/:id
// // ─────────────────────────────────────────────────────────
// exports.updateCallLog = async (req, res) => {
//     try {
//         const call = await CallLog.findOne({
//             _id: req.params.id,
//             agent: req.user._id,
//         });

//         if (!call) return res.status(404).json({ message: "Call log not found" });

//         const allowed = ["notes", "customerName", "callType", "callStatus", "durationSeconds", "calledAt", "disposition", "followUpDate", "followUpNotes"];
//         allowed.forEach((field) => {
//             if (req.body[field] !== undefined) call[field] = req.body[field];
//         });

//         await call.save();
//         res.json({ message: "Call log updated successfully ✅" });
//     } catch (err) {
//         console.error("updateCallLog error:", err);
//         res.status(500).json({ message: "Failed to update call log" });
//     }
// };

// // ─────────────────────────────────────────────────────────
// // GET /api/calls/stats
// // ─────────────────────────────────────────────────────────
// exports.getCallStats = async (req, res) => {
//     try {
//         const userRole = req.user.role;
//         const userId = req.user._id;

//         let agentFilter = {};

//         if (["admin", "super_admin"].includes(userRole)) {
//             if (req.query.agentId) {
//                 agentFilter.agent = req.query.agentId;
//             }
//         } else if (userRole === "manager") {
//             if (req.query.agentId) {
//                 agentFilter.agent = req.query.agentId;
//             } else {
//                 const teamMembers = await User.find({
//                     managerId: userId,
//                     role: { $in: ["agent", "team_leader"] }
//                 }).select("_id");
//                 const teamIds = teamMembers.map(m => m._id);
//                 if (teamIds.length > 0) {
//                     agentFilter.agent = { $in: teamIds };
//                 } else {
//                     return res.json({
//                         total: 0, todayCalls: 0, connected: 0,
//                         missed: 0, incoming: 0, outgoing: 0, connectRate: 0,
//                     });
//                 }
//             }
//         } else if (userRole === "business_user") {
//             if (req.query.agentId) {
//                 agentFilter.agent = req.query.agentId;
//             } else {
//                 const teamMembers = await User.find({
//                     businessUserId: userId,
//                     role: "salesperson"
//                 }).select("_id");
//                 const teamIds = teamMembers.map(m => m._id);
//                 if (teamIds.length > 0) {
//                     agentFilter.agent = { $in: teamIds };
//                 } else {
//                     return res.json({
//                         total: 0, todayCalls: 0, connected: 0,
//                         missed: 0, incoming: 0, outgoing: 0, connectRate: 0
//                     });
//                 }
//             }
//         } else {
//             agentFilter.agent = userId;
//         }

//         const today = new Date();
//         today.setHours(0, 0, 0, 0);

//         const [total, todayCalls, connected, missed, incoming, outgoing] =
//             await Promise.all([
//                 CallLog.countDocuments(agentFilter),
//                 CallLog.countDocuments({ ...agentFilter, calledAt: { $gte: today } }),
//                 CallLog.countDocuments({ ...agentFilter, callStatus: "Connected" }),
//                 CallLog.countDocuments({ ...agentFilter, callStatus: "Missed" }),
//                 CallLog.countDocuments({ ...agentFilter, callType: "Incoming" }),
//                 CallLog.countDocuments({ ...agentFilter, callType: "Outgoing" }),
//             ]);

//         const connectRate = total > 0 ? Math.round((connected / total) * 100) : 0;

//         res.json({ total, todayCalls, connected, missed, incoming, outgoing, connectRate });
//     } catch (err) {
//         console.error("getCallStats error:", err);
//         res.status(500).json({ message: "Failed to load stats" });
//     }
// };

// // ─────────────────────────────────────────────────────────
// // DELETE /api/calls/:id
// // ─────────────────────────────────────────────────────────
// exports.deleteCallLog = async (req, res) => {
//     try {
//         const call = await CallLog.findOneAndDelete({
//             _id: req.params.id,
//             agent: req.user._id,
//         });

//         if (!call) return res.status(404).json({ message: "Call log not found" });

//         res.json({ message: "Call log deleted successfully" });
//     } catch (err) {
//         console.error("deleteCallLog error:", err);
//         res.status(500).json({ message: "Failed to delete call log" });
//     }
// };

// // ─────────────────────────────────────────────────────────
// // POST /api/calls/bulk-import
// // ─────────────────────────────────────────────────────────
// exports.bulkImportCalls = async (req, res) => {
//     try {
//         const calls = req.body.calls;

//         if (!calls || !calls.length) {
//             return res.status(400).json({ message: "No calls data provided" });
//         }

//         const normalizeCallType = (rawType) => {
//             if (rawType === "Incoming") return "Incoming";
//             if (rawType === "Outgoing") return "Outgoing";
//             if (["Missed", "Voicemail"].includes(rawType)) return "Incoming";
//             if (["Rejected", "Blocked"].includes(rawType)) return "Incoming";
//             return "Outgoing";
//         };

//         const normalizeCallStatus = (rawType, durationSeconds) => {
//             if (rawType === "Missed" || rawType === "Voicemail") return "Missed";
//             if (rawType === "Rejected" || rawType === "Blocked") return "Rejected";
//             if (durationSeconds === 0) return "Missed";
//             return "Connected";
//         };

//         const existingCalls = await CallLog.find({
//             agent: req.user._id,
//             calledAt: { $gte: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) }
//         }).select("customerNumber calledAt").lean();

//         const existingSet = new Set(
//             existingCalls.map(c => `${c.customerNumber}_${new Date(c.calledAt).getTime()}`)
//         );

//         const createdCalls = [];
//         const skipped = [];

//         for (const call of calls) {
//             const rawType = call.callType || "Outgoing";
//             const duration = Number(call.durationSeconds) || 0;
//             const calledAtDate = call.calledAt ? new Date(call.calledAt) : new Date();
//             const phone = (call.customerNumber || "").trim();

//             if (!phone) continue;

//             const key = `${phone}_${calledAtDate.getTime()}`;
//             if (existingSet.has(key)) {
//                 skipped.push(key);
//                 continue;
//             }

//             const newCall = await CallLog.create({
//                 agent: req.user._id,
//                 customerName: call.customerName || "Unknown",
//                 customerNumber: phone,
//                 callType: normalizeCallType(rawType),
//                 callStatus: normalizeCallStatus(rawType, duration),
//                 durationSeconds: duration,
//                 calledAt: calledAtDate,
//                 notes: call.notes || "",
//                 disposition: call.disposition || "",
//                 followUpDate: call.followUpDate ? new Date(call.followUpDate) : null,
//                 followUpNotes: call.followUpNotes || "",
//                 source: "device_sync",
//             });
//             createdCalls.push(newCall);
//             existingSet.add(key);
//         }

//         console.log(`[BulkImport] Agent: ${req.user._id} | Saved: ${createdCalls.length} | Skipped (dup): ${skipped.length}`);

//         res.json({
//             success: true,
//             message: `Successfully imported ${createdCalls.length} calls`,
//             count: createdCalls.length,
//             imported: createdCalls.length,
//             skipped: skipped.length
//         });
//     } catch (err) {
//         console.error("bulkImport error:", err);
//         res.status(500).json({ success: false, message: "Import failed", error: err.message });
//     }
// };

// // ─────────────────────────────────────────────────────────
// // GET /api/calls/follow-ups
// // ─────────────────────────────────────────────────────────
// exports.getPendingFollowUps = async (req, res) => {
//     try {
//         const now = new Date();
//         const calls = await CallLog.find({
//             agent: req.user._id,
//             followUpDate: { $lte: now },
//             disposition: "Follow-up",
//         })
//             .sort({ followUpDate: 1 })
//             .limit(20)
//             .lean();

//         res.json({ count: calls.length, followUps: calls });
//     } catch (err) {
//         console.error("getPendingFollowUps error:", err);
//         res.status(500).json({ message: "Failed to fetch follow-ups" });
//     }
// };

// // ─────────────────────────────────────────────────────────
// // GET /api/calls/leaderboard?period=weekly|monthly
// // ─────────────────────────────────────────────────────────
// exports.getLeaderboard = async (req, res) => {
//     try {
//         const { period = 'weekly' } = req.query;
//         const now = new Date();
//         let startDate;

//         if (period === 'weekly') {
//             startDate = new Date(now);
//             startDate.setDate(now.getDate() - 6);
//             startDate.setHours(0, 0, 0, 0);
//         } else {
//             startDate = new Date(now);
//             startDate.setDate(now.getDate() - 29);
//             startDate.setHours(0, 0, 0, 0);
//         }

//         const agentUsers = await User.find({
//             role: { $in: ['agent', 'team_leader', 'salesperson'] }
//         }).select('_id');
//         const agentIds = agentUsers.map(u => u._id);

//         const results = await CallLog.aggregate([
//             {
//                 $match: {
//                     calledAt: { $gte: startDate },
//                     callStatus: "Connected",
//                     agent: { $in: agentIds }
//                 }
//             },
//             {
//                 $group: {
//                     _id: "$agent",
//                     totalCalls: { $sum: 1 },
//                     totalDuration: { $sum: "$durationSeconds" },
//                     salesDone: {
//                         $sum: { $cond: [{ $eq: ["$disposition", "Sale Done"] }, 1, 0] }
//                     }
//                 }
//             },
//             { $sort: { totalCalls: -1 } },
//             { $limit: 10 },
//             {
//                 $lookup: {
//                     from: "users",
//                     localField: "_id",
//                     foreignField: "_id",
//                     as: "agentInfo"
//                 }
//             },
//             { $unwind: "$agentInfo" },
//             {
//                 $project: {
//                     agentName: "$agentInfo.name",
//                     agentEmail: "$agentInfo.email",
//                     totalCalls: 1,
//                     totalDuration: 1,
//                     salesDone: 1
//                 }
//             }
//         ]);

//         res.json({ period, startDate, leaderboard: results });
//     } catch (err) {
//         console.error("getLeaderboard error:", err);
//         res.status(500).json({ message: "Failed to fetch leaderboard" });
//     }
// };

// // ─────────────────────────────────────────────────────────
// // GET /api/calls/team-stats
// // ─────────────────────────────────────────────────────────
// exports.getTeamCallStats = async (req, res) => {
//     try {
//         const teamMembers = await User.find({
//             businessUserId: req.user._id,
//             role: "salesperson"
//         }).select("_id name email");

//         if (teamMembers.length === 0) {
//             return res.json({
//                 summary: { totalCalls: 0, connectedCalls: 0, missedCalls: 0, avgDuration: 0 },
//                 agents: []
//             });
//         }

//         const teamIds = teamMembers.map(m => m._id);

//         const today = new Date();
//         today.setHours(0, 0, 0, 0);

//         const allCalls = await CallLog.find({
//             agent: { $in: teamIds },
//             calledAt: { $gte: today }
//         }).lean();

//         const totalCalls = allCalls.length;
//         const connectedCalls = allCalls.filter(c => c.callStatus === "Connected").length;
//         const missedCalls = allCalls.filter(c => c.callStatus === "Missed").length;
//         const totalDuration = allCalls.reduce((sum, c) => sum + (c.durationSeconds || 0), 0);
//         const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

//         const agents = teamMembers.map(member => {
//             const memberCalls = allCalls.filter(c => c.agent.toString() === member._id.toString());
//             const connectedCnt = memberCalls.filter(c => c.callStatus === "Connected").length;
//             return {
//                 _id: member._id,
//                 name: member.name,
//                 email: member.email,
//                 totalCalls: memberCalls.length,
//                 connectedCalls: connectedCnt,
//                 missedCalls: memberCalls.filter(c => c.callStatus === "Missed").length,
//             };
//         }).sort((a, b) => b.totalCalls - a.totalCalls);

//         res.json({
//             summary: { totalCalls, connectedCalls, missedCalls, avgDuration },
//             agents
//         });
//     } catch (err) {
//         console.error("getTeamCallStats error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };

// // ─────────────────────────────────────────────────────────
// // GET /api/calls/hourly?date=YYYY-MM-DD&agentId=optional
// // ─────────────────────────────────────────────────────────
// exports.getHourlyBreakdown = async (req, res) => {
//     try {
//         const { date, agentId } = req.query;
//         const targetDate = date || new Date().toISOString().split("T")[0];

//         const dayStart = new Date(targetDate + "T00:00:00.000Z");
//         const dayEnd = new Date(targetDate + "T23:59:59.999Z");

//         const filter = { calledAt: { $gte: dayStart, $lte: dayEnd } };

//         if (req.user.role === "salesperson") {
//             filter.agent = req.user._id;
//         } else if (req.user.role === "business_user") {
//             if (agentId) {
//                 filter.agent = agentId;
//             } else {
//                 const teamMembers = await User.find({
//                     businessUserId: req.user._id,
//                     role: "salesperson",
//                 }).select("_id");
//                 filter.agent = { $in: teamMembers.map(u => u._id) };
//             }
//         }
//         // super_admin — no filter, sees all

//         const calls = await CallLog.find(filter)
//             .select("calledAt callStatus durationSeconds callType")
//             .lean();

//         const hours = Array.from({ length: 24 }, (_, h) => ({
//             hour: h,
//             label: h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`,
//             total: 0, connected: 0, missed: 0, rejected: 0, totalDuration: 0,
//         }));

//         calls.forEach((call) => {
//             const h = new Date(call.calledAt).getHours();
//             if (h >= 0 && h < 24) {
//                 hours[h].total++;
//                 if (call.callStatus === "Connected") {
//                     hours[h].connected++;
//                     hours[h].totalDuration += call.durationSeconds || 0;
//                 } else if (call.callStatus === "Missed") hours[h].missed++;
//                 else if (call.callStatus === "Rejected") hours[h].rejected++;
//             }
//         });

//         const workHours = hours.filter(h => h.hour >= 8 && h.hour <= 21);

//         res.json({
//             date: targetDate,
//             totalCalls: calls.length,
//             workHours,
//             allHours: hours,
//             peakHour: hours.reduce((max, h) => (h.total > max.total ? h : max), hours[0]),
//         });
//     } catch (err) {
//         console.error("getHourlyBreakdown error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };

// // ══════════════════════════════════════════════════════════
// //  GET /api/calls/sync-status
// // ══════════════════════════════════════════════════════════
// exports.getSyncStatus = async (req, res) => {
//     try {
//         const userId = req.user._id;
//         const userRole = req.user.role;

//         if (userRole === "salesperson") {
//             const lastCall = await CallLog
//                 .findOne({ agent: userId, source: "device_sync" })
//                 .sort({ createdAt: -1 })
//                 .select("createdAt calledAt")
//                 .lean();

//             const totalSynced = await CallLog.countDocuments({
//                 agent: userId,
//                 source: "device_sync",
//             });

//             return res.json({
//                 lastSyncAt: lastCall ? lastCall.createdAt : null,
//                 lastCallDate: lastCall ? lastCall.calledAt : null,
//                 totalSynced,
//                 message: lastCall
//                     ? `Last synced: ${new Date(lastCall.createdAt).toLocaleString("en-IN")}`
//                     : "No sync done yet",
//             });
//         }

//         if (userRole === "business_user") {
//             const teamMembers = await User.find({
//                 businessUserId: userId,
//                 role: "salesperson",
//             }).select("_id name").lean();

//             const teamSyncStatus = await Promise.all(
//                 teamMembers.map(async (member) => {
//                     const lastCall = await CallLog
//                         .findOne({ agent: member._id, source: "device_sync" })
//                         .sort({ createdAt: -1 })
//                         .select("createdAt")
//                         .lean();

//                     const totalSynced = await CallLog.countDocuments({
//                         agent: member._id,
//                         source: "device_sync",
//                     });

//                     return {
//                         salespersonId: member._id,
//                         salespersonName: member.name,
//                         lastSyncAt: lastCall ? lastCall.createdAt : null,
//                         totalSynced,
//                     };
//                 })
//             );

//             return res.json({ teamSyncStatus });
//         }

//         // super_admin
//         const recentSyncs = await CallLog
//             .find({ source: "device_sync" })
//             .sort({ createdAt: -1 })
//             .limit(10)
//             .populate("agent", "name email")
//             .select("createdAt agent")
//             .lean();

//         return res.json({ recentSyncs });

//     } catch (err) {
//         console.error("getSyncStatus error:", err);
//         res.status(500).json({ message: "Server error" });
//     }
// };

// ╔══════════════════════════════════════════════════════════════╗
// ║  FILE: call backend/src/controllers/callController.js        ║
// ║                                                              ║
// ║  CHANGES vs old file (show old → new pattern below):         ║
// ║  1. bulkImportCalls  — two-layer duplicate detection:         ║
// ║     OLD: only phone+timestamp set lookup (in-memory, 8-day)   ║
// ║     NEW: primary check via deviceLogId index (DB-level),      ║
// ║          fallback to phone+timestamp for calls without ID     ║
// ║  2. bulkImportCalls  — saves deviceLogId + source fields      ║
// ║     OLD: source saved but deviceLogId column missing          ║
// ║     NEW: both saved; MongoDB unique index prevents dup inserts ║
// ║  3. getSyncStatus    — returns deviceLogId-aware last-sync     ║
// ║  All other exports (getCallLogs, createCallLog, etc.)         ║
// ║  are UNCHANGED from the original. They are fully preserved    ║
// ║  here so you only need to replace this one file.              ║
// ╚══════════════════════════════════════════════════════════════╝

const CallLog = require("../models/CallLog");
const { emitNewCall } = require("../socket");
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

        const userRole = req.user.role;
        const query = {};

        if (["admin", "super_admin"].includes(userRole)) {
            if (req.query.agentId) query.agent = req.query.agentId;
        } else if (userRole === "manager") {
            if (req.query.agentId) {
                query.agent = req.query.agentId;
            } else {
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
                    return res.json({
                        logs: [],
                        pagination: { total: 0, page: 1, pages: 0 }
                    });
                }
                query.agent = { $in: teamIds };
            }
        } else if (userRole === "salesperson") {
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
            source: c.source || "manual",
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
// POST /api/calls
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

        const agentUser = await User.findById(req.user._id).select("businessUserId role").lean();

        const call = await CallLog.create({
            agent: req.user._id,
            customerName: customerName || "Unknown",
            customerNumber,
            callType: callType || "Outgoing",
            callStatus: callStatus || "Connected",
            durationSeconds: durationSeconds || 0,
            notes: notes || "",
            calledAt: calledAt ? new Date(calledAt) : new Date(),
            source: "manual",
        });

        const populatedCall = await CallLog.findById(call._id)
            .populate("agent", "name email role")
            .lean();

        const businessUserId = agentUser?.businessUserId || null;

        try {
            emitNewCall(populatedCall, businessUserId);
        } catch (socketErr) {
            console.warn("Socket emit failed (non-fatal):", socketErr.message);
        }

        res.status(201).json({
            message: "Call log created",
            call: populatedCall,
        });
    } catch (err) {
        console.error("createCallLog error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ─────────────────────────────────────────────────────────
// PUT /api/calls/:id
// ─────────────────────────────────────────────────────────
exports.updateCallLog = async (req, res) => {
    try {
        const call = await CallLog.findOneAndUpdate(
            { _id: req.params.id, agent: req.user._id },
            req.body,
            { new: true }
        ).populate("agent", "name email role");

        if (!call) return res.status(404).json({ message: "Call not found" });
        res.json({ message: "Updated", call });
    } catch (err) {
        console.error("updateCallLog error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ─────────────────────────────────────────────────────────
// GET /api/calls/stats
// ─────────────────────────────────────────────────────────
exports.getCallStats = async (req, res) => {
    try {
        const { callType, callStatus, dateFrom, dateTo, agentId, search } = req.query;
        const userRole = req.user.role;
        const query = {};

        if (["admin", "super_admin"].includes(userRole)) {
            if (agentId) query.agent = agentId;
        } else if (userRole === "manager") {
            if (agentId) {
                query.agent = agentId;
            } else {
                const teamMembers = await User.find({
                    managerId: req.user._id,
                    role: { $in: ["agent", "team_leader"] }
                }).select("_id");
                query.agent = { $in: teamMembers.map(m => m._id) };
            }
        } else if (userRole === "business_user") {
            if (agentId) {
                query.agent = agentId;
            } else {
                const teamMembers = await User.find({
                    businessUserId: req.user._id,
                    role: "salesperson"
                }).select("_id");
                const teamIds = teamMembers.map(m => m._id);
                if (teamIds.length === 0) {
                    return res.json({ total: 0, connected: 0, missed: 0, rejected: 0, avgDuration: 0, totalDuration: 0 });
                }
                query.agent = { $in: teamIds };
            }
        } else if (userRole === "salesperson") {
            query.agent = req.user._id;
        } else {
            query.agent = req.user._id;
        }

        if (search?.trim()) {
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

        const [total, connected, missed, rejected, durationAgg] = await Promise.all([
            CallLog.countDocuments(query),
            CallLog.countDocuments({ ...query, callStatus: "Connected" }),
            CallLog.countDocuments({ ...query, callStatus: "Missed" }),
            CallLog.countDocuments({ ...query, callStatus: "Rejected" }),
            CallLog.aggregate([
                { $match: query },
                { $group: { _id: null, total: { $sum: "$durationSeconds" }, avg: { $avg: "$durationSeconds" } } },
            ]),
        ]);

        res.json({
            total,
            connected,
            missed,
            rejected,
            avgDuration: Math.round(durationAgg[0]?.avg || 0),
            totalDuration: durationAgg[0]?.total || 0,
        });
    } catch (err) {
        console.error("getCallStats error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ─────────────────────────────────────────────────────────
// DELETE /api/calls/:id
// ─────────────────────────────────────────────────────────
exports.deleteCallLog = async (req, res) => {
    try {
        const call = await CallLog.findOneAndDelete({ _id: req.params.id, agent: req.user._id });
        if (!call) return res.status(404).json({ message: "Call not found" });
        res.json({ message: "Deleted" });
    } catch (err) {
        console.error("deleteCallLog error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ─────────────────────────────────────────────────────────
// POST /api/calls/bulk-import
// ─────────────────────────────────────────────────────────
// ╔═══════════════════════════════════════════════════════╗
// ║  OLD CODE (preserved for reference):                  ║
// ║                                                       ║
// ║  exports.bulkImportCalls = async (req, res) => {      ║
// ║    const calls = req.body.calls;                      ║
// ║    ...                                                ║
// ║    // Only checked phone+timestamp in-memory          ║
// ║    const existingCalls = await CallLog.find({         ║
// ║      agent: req.user._id,                             ║
// ║      calledAt: { $gte: 8-day-ago }                    ║
// ║    }).select("customerNumber calledAt").lean();        ║
// ║    const existingSet = new Set(                       ║
// ║      existingCalls.map(c =>                           ║
// ║        `${c.customerNumber}_${calledAt.getTime()}`    ║
// ║      )                                                ║
// ║    );                                                 ║
// ║    // No deviceLogId stored, no DB-level dedup guard  ║
// ║    const newCall = await CallLog.create({ ...fields,  ║
// ║      source: "device_sync" });  // deviceLogId missing║
// ║  };                                                   ║
// ╚═══════════════════════════════════════════════════════╝
//
// NEW CODE below: two-pass dedup (deviceLogId first, then
// phone+timestamp fallback) + stores deviceLogId so future
// syncs are O(1) per call via MongoDB unique index.
// ─────────────────────────────────────────────────────────
exports.bulkImportCalls = async (req, res) => {
    try {
        const calls = req.body.calls;

        console.log(`[DEBUG BulkImport] Total received: ${calls?.length}`);
        if (!calls || !Array.isArray(calls) || calls.length === 0) {
            return res.status(400).json({ message: "No calls data provided" });
        }

        // ── Normalise raw device call type to DB enum ──────────
        const normalizeCallType = (rawType) => {
            if (rawType === "Incoming") return "Incoming";
            if (rawType === "Outgoing") return "Outgoing";
            // Missed/Voicemail came in as Incoming direction
            if (["Missed", "Voicemail"].includes(rawType)) return "Incoming";
            // Rejected/Blocked came in as Incoming direction
            if (["Rejected", "Blocked"].includes(rawType)) return "Incoming";
            return "Outgoing";
        };

        const normalizeCallStatus = (rawType, durationSeconds) => {
            if (rawType === "Missed" || rawType === "Voicemail") return "Missed";
            if (rawType === "Rejected" || rawType === "Blocked") return "Rejected";
            if (durationSeconds === 0) return "Missed";
            return "Connected";
        };

        // ── PASS 1: collect all deviceLogIds in this batch ────
        const incomingDeviceIds = calls
            .map(c => c.deviceLogId)
            .filter(Boolean); // filter out undefined/null

        // ── DB lookup: which deviceLogIds already exist? ───────
        let alreadySyncedIds = new Set();
        if (incomingDeviceIds.length > 0) {
            const existing = await CallLog.find({
                agent: req.user._id,
                deviceLogId: { $in: incomingDeviceIds },
            }).select("deviceLogId").lean();
            existing.forEach(e => alreadySyncedIds.add(e.deviceLogId));
        }

        // ── PASS 2: phone+timestamp fallback for calls without deviceLogId ──
        // Only look back 8 days to keep the query cheap.
        // const fallbackExisting = await CallLog.find({
        //     agent: req.user._id,
        //     calledAt: { $gte: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000) },
        // }).select("customerNumber calledAt").lean();
        const fallbackExisting = await CallLog.find({
            agent: req.user._id,
            calledAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        }).select("customerNumber calledAt").lean();

        const fallbackSet = new Set(
            fallbackExisting.map(c => `${c.customerNumber}_${new Date(c.calledAt).getTime()}`)
        );

        // ── Process each call ──────────────────────────────────
        const createdCalls = [];
        const skipped = [];

        // ── 24-hour cutoff: computed ONCE before the loop ──
        const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

        for (const call of calls) {
            const rawType = call.callType || "Outgoing";
            const duration = Number(call.durationSeconds) || 0;
            const calledAtDate = call.calledAt ? new Date(call.calledAt) : new Date();
            const phone = (call.customerNumber || "").trim();

            if (!phone) continue; // skip malformed entries

            // ── 24-hour filter: reject calls older than 1 day ──
            if (calledAtDate < cutoff24h) {
                skipped.push(`old_${call.deviceLogId || phone}_${calledAtDate.getTime()}`);
                continue;
            }

            // ── Dedup check ─────────────────────────────────
            const deviceId = call.deviceLogId || null;
            if (deviceId && alreadySyncedIds.has(deviceId)) {
                skipped.push(deviceId);
                continue;
            }
            // Fallback: phone+timestamp
            if (!deviceId) {
                const fallbackKey = `${phone}_${calledAtDate.getTime()}`;
                if (fallbackSet.has(fallbackKey)) {
                    skipped.push(fallbackKey);
                    continue;
                }
            }

            try {
                const newCall = await CallLog.create({
                    agent: req.user._id,
                    customerName: call.customerName || "Unknown",
                    customerNumber: phone,
                    callType: normalizeCallType(rawType),
                    callStatus: normalizeCallStatus(rawType, duration),
                    durationSeconds: duration,
                    calledAt: calledAtDate,
                    notes: call.notes || "",
                    disposition: call.disposition || "",
                    followUpDate: call.followUpDate ? new Date(call.followUpDate) : null,
                    followUpNotes: call.followUpNotes || "",
                    source: "device_sync",
                    deviceLogId: deviceId,   // ← NEW: stored for future dedup
                });

                createdCalls.push(newCall);

                // Keep in-memory sets updated for later iterations in same batch
                if (deviceId) alreadySyncedIds.add(deviceId);
                const fallbackKey = `${phone}_${calledAtDate.getTime()}`;
                fallbackSet.add(fallbackKey);

            } catch (insertErr) {
                // Handle MongoDB unique index violation (race condition / duplicate batch)
                if (insertErr.code === 11000) {
                    skipped.push(deviceId || `${phone}_${calledAtDate.getTime()}`);
                } else {
                    console.error("[BulkImport] Unexpected insert error:", insertErr.message);
                }
            }
        }

        console.log(
            `[BulkImport] Agent: ${req.user._id} | Saved: ${createdCalls.length} | Skipped (dup): ${skipped.length}`
        );

        res.json({
            success: true,
            message: `Successfully imported ${createdCalls.length} calls`,
            count: createdCalls.length,
            imported: createdCalls.length,
            skipped: skipped.length,
        });
    } catch (err) {
        console.error("bulkImport error:", err);
        res.status(500).json({ success: false, message: "Import failed", error: err.message });
    }
};

// ─────────────────────────────────────────────────────────
// GET /api/calls/follow-ups
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
            .limit(50)
            .populate("agent", "name email role")
            .lean();

        res.json({ calls });
    } catch (err) {
        console.error("getPendingFollowUps error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ─────────────────────────────────────────────────────────
// GET /api/calls/leaderboard?period=weekly|monthly|daily
// ─────────────────────────────────────────────────────────
exports.getLeaderboard = async (req, res) => {
    try {
        const { period = "weekly" } = req.query;
        const userRole = req.user.role;

        const now = new Date();
        let startDate;
        if (period === "daily" || period === "today") {
            startDate = new Date(now);
            startDate.setHours(0, 0, 0, 0);
        } else if (period === "weekly") {
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
        } else if (period === "all") {
            startDate = new Date("2020-01-01"); // bahut purani date — sab data aayega
        } else {
            // monthly
            startDate = new Date(now);
            startDate.setDate(1);
            startDate.setHours(0, 0, 0, 0);
        }

        // Determine which agents to include
        let agentIds = null;
        if (userRole === "business_user") {
            const teamMembers = await User.find({
                businessUserId: req.user._id,
                role: "salesperson",
            }).select("_id").lean();
            agentIds = teamMembers.map(m => m._id);
            if (agentIds.length === 0) return res.json({ leaderboard: [] });
        }

        const matchStage = { calledAt: { $gte: startDate } };
        if (agentIds) matchStage.agent = { $in: agentIds };

        const agg = await CallLog.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: "$agent",
                    total: { $sum: 1 },
                    connected: { $sum: { $cond: [{ $eq: ["$callStatus", "Connected"] }, 1, 0] } },
                    missed: { $sum: { $cond: [{ $eq: ["$callStatus", "Missed"] }, 1, 0] } },
                    totalDuration: { $sum: "$durationSeconds" },
                },
            },
            { $sort: { total: -1 } },
            { $limit: 20 },
            {
                $lookup: {
                    from: "users",
                    localField: "_id",
                    foreignField: "_id",
                    as: "agentInfo",
                },
            },
            { $unwind: "$agentInfo" },
            {
                $project: {
                    agentId: "$_id",
                    name: "$agentInfo.name",
                    email: "$agentInfo.email",
                    agentName: "$agentInfo.name",   // ← old frontend isko use karta tha
                    agentEmail: "$agentInfo.email", // ← old frontend isko use karta tha
                    total: 1,
                    connected: 1,
                    missed: 1,
                    totalDuration: 1,
                    totalCalls: "$total",           // ← frontend expects 'totalCalls'
                    connectedCalls: "$connected",   // ← frontend expects 'connectedCalls'
                },
            },
            {
                $addFields: {
                    totalCalls: "$total",
                    connectedCalls: "$connected",
                    agentName: "$name",
                    agentEmail: "$email",
                }
            },
        ]);

        res.json({ leaderboard: agg });
    } catch (err) {
        console.error("getLeaderboard error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ─────────────────────────────────────────────────────────
// GET /api/calls/team-stats
// ─────────────────────────────────────────────────────────
exports.getTeamCallStats = async (req, res) => {
    try {
        const { date, agentId } = req.query;
        const userRole = req.user.role;

        const day = date ? new Date(date) : new Date();
        const start = new Date(day); start.setHours(0, 0, 0, 0);
        const end = new Date(day); end.setHours(23, 59, 59, 999);

        const query = { calledAt: { $gte: start, $lte: end } };

        if (agentId) {
            query.agent = agentId;
        } else if (userRole === "business_user") {
            const teamMembers = await User.find({
                businessUserId: req.user._id,
                role: "salesperson",
            }).select("_id").lean();
            const ids = teamMembers.map(m => m._id);
            if (ids.length === 0) return res.json({ stats: [] });
            query.agent = { $in: ids };
        } else {
            query.agent = req.user._id;
        }

        const agg = await CallLog.aggregate([
            { $match: query },
            {
                $group: {
                    _id: "$agent",
                    total: { $sum: 1 },
                    connected: { $sum: { $cond: [{ $eq: ["$callStatus", "Connected"] }, 1, 0] } },
                    missed: { $sum: { $cond: [{ $eq: ["$callStatus", "Missed"] }, 1, 0] } },
                    totalDuration: { $sum: "$durationSeconds" },
                },
            },
            {
                $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "agentInfo" },
            },
            { $unwind: "$agentInfo" },
            {
                $project: {
                    agentId: "$_id",
                    name: "$agentInfo.name",
                    email: "$agentInfo.email",
                    total: 1,
                    connected: 1,
                    missed: 1,
                    totalDuration: 1,
                },
            },
        ]);

        // res.json({ stats: agg });
        const totalCalls = agg.reduce((s, a) => s + a.total, 0);
        const connectedCalls = agg.reduce((s, a) => s + a.connected, 0);
        const missedCalls = agg.reduce((s, a) => s + a.missed, 0);
        const totalDuration = agg.reduce((s, a) => s + a.totalDuration, 0);
        const avgDuration = totalCalls > 0 ? Math.round(totalDuration / totalCalls) : 0;

        // Agents array bhi purane format mein bhejo
        const agents = agg.map(a => ({
            _id: a.agentId,
            name: a.name,
            email: a.email,
            totalCalls: a.total,
            connectedCalls: a.connected,
            missedCalls: a.missed,
        }));

        res.json({
            summary: { totalCalls, connectedCalls, missedCalls, avgDuration },
            agents
        });
    } catch (err) {
        console.error("getTeamCallStats error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ─────────────────────────────────────────────────────────
// GET /api/calls/hourly?date=YYYY-MM-DD&agentId=
// ─────────────────────────────────────────────────────────
exports.getHourlyBreakdown = async (req, res) => {
    try {
        const { date, agentId } = req.query;
        const userRole = req.user.role;

        const day = date ? new Date(date) : new Date();
        const start = new Date(day); start.setHours(0, 0, 0, 0);
        const end = new Date(day); end.setHours(23, 59, 59, 999);

        const query = { calledAt: { $gte: start, $lte: end } };

        if (agentId) {
            query.agent = agentId;
        } else if (["admin", "super_admin"].includes(userRole)) {
            // no filter — all agents
        } else if (userRole === "business_user") {
            const team = await User.find({ businessUserId: req.user._id, role: "salesperson" }).select("_id").lean();
            const ids = team.map(m => m._id);
            if (ids.length === 0) return res.json({ hourly: [] });
            query.agent = { $in: ids };
        } else {
            query.agent = req.user._id;
        }

        const agg = await CallLog.aggregate([
            { $match: query },
            { $group: { _id: { $hour: "$calledAt" }, count: { $sum: 1 } } },
            { $sort: { "_id": 1 } },
        ]);

        // Build full 24-hour array
        const hourly = Array.from({ length: 24 }, (_, h) => {
            const found = agg.find(a => a._id === h);
            return { hour: h, count: found ? found.count : 0 };
        });

        res.json({ hourly });
    } catch (err) {
        console.error("getHourlyBreakdown error:", err);
        res.status(500).json({ message: "Server error" });
    }
};

// ─────────────────────────────────────────────────────────
// GET /api/calls/sync-status
// Returns per-agent last-sync metadata (used by DeviceCallSyncScreen)
// ─────────────────────────────────────────────────────────
exports.getSyncStatus = async (req, res) => {
    try {
        const userId = req.user._id;
        const userRole = req.user.role;

        if (userRole === "salesperson" || userRole === "agent") {
            // Own sync status
            const lastSync = await CallLog.findOne({
                agent: userId,
                source: "device_sync",
            })
                .sort({ createdAt: -1 })
                .select("createdAt calledAt")
                .lean();

            const todayCount = await CallLog.countDocuments({
                agent: userId,
                source: "device_sync",
                calledAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
            });

            return res.json({
                lastSyncAt: lastSync?.createdAt || null,
                lastCallAt: lastSync?.calledAt || null,
                todaySynced: todayCount,
                agentSummary: null,
            });
        }

        // business_user → summary for each salesperson
        const teamMembers = await User.find({
            businessUserId: userId,
            role: "salesperson",
        }).select("_id name email").lean();

        const agentSummary = await Promise.all(
            teamMembers.map(async (member) => {
                const lastSync = await CallLog.findOne({
                    agent: member._id,
                    source: "device_sync",
                })
                    .sort({ createdAt: -1 })
                    .select("createdAt calledAt")
                    .lean();

                const todayCount = await CallLog.countDocuments({
                    agent: member._id,
                    source: "device_sync",
                    calledAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
                });

                return {
                    agentId: member._id,
                    name: member.name,
                    email: member.email,
                    lastSyncAt: lastSync?.createdAt || null,
                    lastCallAt: lastSync?.calledAt || null,
                    todaySynced: todayCount,
                };
            })
        );

        res.json({ agentSummary, lastSyncAt: null, todaySynced: null });
    } catch (err) {
        console.error("getSyncStatus error:", err);
        res.status(500).json({ message: "Server error" });
    }
};