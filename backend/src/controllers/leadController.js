const Lead = require("../models/Lead");
const User = require("../models/User");

// Helper — businessUserId dono roles ke liye resolve karta hai
const resolveBusinessId = (user) => {
  if (user.role === "business_user") return user._id;
  if (user.role === "salesperson")   return user.businessUserId;
  return null;
};

// ─────────────────────────────────────────────────────────────
// GET /api/leads
// ─────────────────────────────────────────────────────────────
exports.getLeads = async (req, res) => {
  try {
    const businessId = resolveBusinessId(req.user);
    if (!businessId) return res.status(403).json({ message: "Forbidden" });

    const { status, search, fromDate, toDate, page = 1, limit = 50 } = req.query;

    const filter = { businessUserId: businessId };

    // Salesperson sirf apne assigned leads dekhta hai
    if (req.user.role === "salesperson") {
      filter.assignedTo = req.user._id;
    }

    // if (status && ["Interested", "Not Interested", "DNP"].includes(status)) {
    //   filter.status = status;
    // }
    if (status && ["Fresh Lead", "Interested", "Not Interested", "DNP"].includes(status)) {
      filter.status = status;
    }


    // FIX: search ke liye $and use karo taaki assignedTo filter break na ho
    if (search) {
      filter.$and = [
        {
          $or: [
            { customerName: { $regex: search, $options: "i" } },
            { mobileNumber: { $regex: search, $options: "i" } },
            { courseName:   { $regex: search, $options: "i" } },
          ],
        },
      ];
    }

    if (fromDate || toDate) {
      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        filter.createdAt.$lte = end;
      }
    }

    const skip = (Number(page) - 1) * Number(limit);

    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .populate("assignedTo", "name email phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Lead.countDocuments(filter),
    ]);

    res.json({
      leads,
      total,
      page:  Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    console.error("getLeads:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/leads/stats
// ─────────────────────────────────────────────────────────────
exports.getLeadStats = async (req, res) => {
  try {
    const businessId = resolveBusinessId(req.user);
    if (!businessId) return res.status(403).json({ message: "Forbidden" });

    const filter = { businessUserId: businessId };
    if (req.user.role === "salesperson") filter.assignedTo = req.user._id;

    // const [total, interested, notInterested, dnp, pendingFollowups] = await Promise.all([
    //   Lead.countDocuments(filter),
    //   Lead.countDocuments({ ...filter, status: "Interested" }),
    //   Lead.countDocuments({ ...filter, status: "Not Interested" }),
    //   Lead.countDocuments({ ...filter, status: "DNP" }),
    //   Lead.countDocuments({
    //     ...filter,
    //     followUpDate: { $lte: new Date() },
    //     status: "Interested",
    //   }),
    // ]);

    // res.json({ total, interested, notInterested, dnp, pendingFollowups });
    const [total, freshLeads, interested, notInterested, dnp, pendingFollowups] = await Promise.all([
      Lead.countDocuments(filter),
      Lead.countDocuments({ ...filter, status: "Fresh Lead" }),  // ✅ NAYA
      Lead.countDocuments({ ...filter, status: "Interested" }),
      Lead.countDocuments({ ...filter, status: "Not Interested" }),
      Lead.countDocuments({ ...filter, status: "DNP" }),
      Lead.countDocuments({ ...filter, followUpDate: { $lte: new Date() }, status: "Interested" }),
    ]);
    res.json({ total, freshLeads, interested, notInterested, dnp, pendingFollowups });  // ✅

  } catch (err) {
    console.error("getLeadStats:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/leads/:id
// ─────────────────────────────────────────────────────────────
exports.getLeadById = async (req, res) => {
  try {
    const businessId = resolveBusinessId(req.user);
    if (!businessId) return res.status(403).json({ message: "Forbidden" });

    const lead = await Lead.findOne({ _id: req.params.id, businessUserId: businessId })
      .populate("assignedTo", "name email phone")
      .populate("followUpHistory.updatedBy", "name");

    if (!lead) return res.status(404).json({ message: "Lead not found" });
    res.json(lead);
  } catch (err) {
    console.error("getLeadById:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/leads
// ─────────────────────────────────────────────────────────────
// exports.createLead = async (req, res) => {
//   try {
//     const businessId = resolveBusinessId(req.user);
//     if (!businessId) return res.status(403).json({ message: "Forbidden" });

//     const {
//       customerName, mobileNumber, courseName, leadSource,
//       status, followUpDescription, followUpDate, assignedTo,
//     } = req.body;

//     if (!customerName || !mobileNumber) {
//       return res.status(400).json({ message: "customerName aur mobileNumber required hain" });
//     }

//     const lead = await Lead.create({
//       businessUserId:      businessId,
//       assignedTo:          assignedTo || null,
//       customerName,
//       mobileNumber,
//       courseName:          courseName          || "",
//       leadSource:          leadSource          || "",
//       status:              status              || "Interested",
//       followUpDescription: followUpDescription || "",
//       followUpDate:        followUpDate        || null,
//       followUpHistory: followUpDescription
//         ? [{ description: followUpDescription, followUpDate: followUpDate || null, updatedBy: req.user._id }]
//         : [],
//       source: "manual",
//     });

//     res.status(201).json({ message: "Lead created", lead });
//   } catch (err) {
//     console.error("createLead:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

exports.createLead = async (req, res) => {
  try {
    const businessId = resolveBusinessId(req.user);
    if (!businessId) return res.status(403).json({ message: "Forbidden" });
 
   
    const { customerName, mobileNumber, courseName, leadSource, assignedTo } = req.body;
 
    if (!customerName || !mobileNumber) {
      return res.status(400).json({ message: "customerName aur mobileNumber required hain" });
    }
 
    const lead = await Lead.create({
      businessUserId: businessId,
      assignedTo:     assignedTo || null,
      customerName,
      mobileNumber,
      courseName:  courseName  || "",
      leadSource:  leadSource  || "",
      status:      "Fresh Lead",  
      followUpDescription: "",    
      followUpDate:        null,  
      followUpHistory:     [],
      source: "manual",
    });
 
    res.status(201).json({ message: "Lead created", lead });
  } catch (err) {
    console.error("createLead:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// ─────────────────────────────────────────────────────────────
// PUT /api/leads/:id
// ─────────────────────────────────────────────────────────────
exports.updateLead = async (req, res) => {
  try {
    const businessId = resolveBusinessId(req.user);
    if (!businessId) return res.status(403).json({ message: "Forbidden" });

    const lead = await Lead.findOne({ _id: req.params.id, businessUserId: businessId });
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const {
      customerName, mobileNumber, courseName, leadSource,
      status, followUpDescription, followUpDate, assignedTo,
    } = req.body;

    if (customerName  !== undefined) lead.customerName  = customerName;
    if (mobileNumber  !== undefined) lead.mobileNumber  = mobileNumber;
    if (courseName    !== undefined) lead.courseName    = courseName;
    if (leadSource    !== undefined) lead.leadSource    = leadSource;
    if (status        !== undefined) lead.status        = status;
    if (assignedTo    !== undefined) lead.assignedTo    = assignedTo || null;

    // Follow-up update hone par history mein push karo
    if (followUpDescription !== undefined || followUpDate !== undefined) {
      const desc = followUpDescription ?? lead.followUpDescription;
      const date = followUpDate        ?? lead.followUpDate;

      lead.followUpDescription = desc;
      lead.followUpDate        = date;

      lead.followUpHistory.push({
        description:  desc,
        followUpDate: date,
        updatedBy:    req.user._id,
      });
    }

    await lead.save();
    res.json({ message: "Lead updated", lead });
  } catch (err) {
    console.error("updateLead:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────
// DELETE /api/leads/:id  — sirf business_user
// ─────────────────────────────────────────────────────────────
exports.deleteLead = async (req, res) => {
  try {
    if (req.user.role !== "business_user") {
      return res.status(403).json({ message: "Sirf business user delete kar sakta hai" });
    }

    const lead = await Lead.findOneAndDelete({
      _id: req.params.id,
      businessUserId: req.user._id,
    });

    if (!lead) return res.status(404).json({ message: "Lead not found" });
    res.json({ message: "Lead deleted" });
  } catch (err) {
    console.error("deleteLead:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/leads/import  — sirf business_user
// ─────────────────────────────────────────────────────────────
exports.importLeads = async (req, res) => {
  try {
    if (req.user.role !== "business_user") {
      return res.status(403).json({ message: "Sirf business user import kar sakta hai" });
    }

    const { leads: rawLeads = [], importType = "csv" } = req.body;

    if (!Array.isArray(rawLeads) || rawLeads.length === 0) {
      return res.status(400).json({ message: "Koi leads nahi mili" });
    }

    if (rawLeads.length > 5000) {
      return res.status(400).json({ message: "Ek baar mein max 5000 leads import kar sakte hain" });
    }

    const sourceType = importType === "excel" ? "excel" : "csv";

    const docs = rawLeads
      .filter((r) => r.customerName && r.mobileNumber)
      .map((r) => ({
        businessUserId:      req.user._id,
        assignedTo:          r.assignedTo || null,
        customerName:        String(r.customerName).trim(),
        mobileNumber:        String(r.mobileNumber).trim(),
        courseName:          String(r.courseName          || "").trim(),
        leadSource:          String(r.leadSource          || "").trim(),
        // status:              ["Interested", "Not Interested", "DNP"].includes(r.status)
        //                        ? r.status : "Interested",
        // followUpDescription: String(r.followUpDescription || r.notes || "").trim(),
        // followUpDate:        r.followUpDate ? new Date(r.followUpDate) : null,
        status: "Fresh Lead", 
        followUpDescription: "",  
        followUpDate: null,       
        followUpHistory:     [],
        source:              sourceType,
      }));

    if (docs.length === 0) {
      return res.status(400).json({
        message: "Koi valid lead nahi mili — customerName aur mobileNumber required hain",
      });
    }

    const inserted = await Lead.insertMany(docs, { ordered: false });

    res.status(201).json({
      message:  `${inserted.length} leads successfully import ho gayi`,
      imported: inserted.length,
      skipped:  rawLeads.length - docs.length,
    });
  } catch (err) {
    console.error("importLeads:", err);
    if (err.writeErrors) {
      return res.status(207).json({
        message:  "Partial import",
        imported: err.result?.nInserted || 0,
        errors:   err.writeErrors.length,
      });
    }
    res.status(500).json({ message: "Server error" });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/leads/:id/followup
// ─────────────────────────────────────────────────────────────
exports.addFollowUp = async (req, res) => {
  try {
    const businessId = resolveBusinessId(req.user);
    if (!businessId) return res.status(403).json({ message: "Forbidden" });

    const lead = await Lead.findOne({ _id: req.params.id, businessUserId: businessId });
    if (!lead) return res.status(404).json({ message: "Lead not found" });

    const { description, followUpDate, status } = req.body;
    if (!description) return res.status(400).json({ message: "description required hai" });

    lead.followUpDescription = description;
    lead.followUpDate        = followUpDate || null;

    if (status && ["Interested", "Not Interested", "DNP"].includes(status)) {
      lead.status = status;
    }

    lead.followUpHistory.push({
      description,
      followUpDate: followUpDate || null,
      updatedBy:    req.user._id,
    });

    await lead.save();
    res.json({ message: "Follow-up add ho gaya", lead });
  } catch (err) {
    console.error("addFollowUp:", err);
    res.status(500).json({ message: "Server error" });
  }
};


// ─────────────────────────────────────────────────────────────
// GET /api/leads/worked  — sirf business_user
// Salesperson ki activity track karne ke liye
// ─────────────────────────────────────────────────────────────
exports.getWorkedLeads = async (req, res) => {
  try {
    if (req.user.role !== "business_user") {
      return res.status(403).json({ message: "Sirf business user access kar sakta hai" });
    }
 
    const businessId = req.user._id;
    const { salespersonId, status, fromDate, toDate, page = 1, limit = 30 } = req.query;
 
    // Sirf wahi leads jo salesperson ne touch ki hain (followup history hai)
    const filter = {
      businessUserId: businessId,
      assignedTo: { $ne: null },  // assigned honi chahiye
      $or: [
        { "followUpHistory.0": { $exists: true } },  // followup history ho
        { status: { $in: ["Interested", "Not Interested", "DNP"] } }  // ya status changed ho
      ]
    };
 
    if (salespersonId) filter.assignedTo = salespersonId;
    if (status && ["Interested", "Not Interested", "DNP"].includes(status)) {
      filter.status = status;
    }
    if (fromDate || toDate) {
      filter.updatedAt = {};
      if (fromDate) filter.updatedAt.$gte = new Date(fromDate);
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        filter.updatedAt.$lte = end;
      }
    }
 
    const skip = (Number(page) - 1) * Number(limit);
 
    const [leads, total] = await Promise.all([
      Lead.find(filter)
        .populate("assignedTo", "name email phone")
        .populate("followUpHistory.updatedBy", "name")
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Lead.countDocuments(filter),
    ]);
 
    res.json({
      leads,
      total,
      page:  Number(page),
      pages: Math.ceil(total / Number(limit)),
    });
  } catch (err) {
    console.error("getWorkedLeads:", err);
    res.status(500).json({ message: "Server error" });
  }
};
