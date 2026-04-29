const User = require("../models/User");

const adminOnly = async (req, res, next) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: "User not found" });

    if (user.role !== "super_admin") {   // ← sirf super_admin
      return res.status(403).json({ message: "Super Admin access required" });
    }

    req.adminUser = user;
    next();
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

const superAdminOnly = adminOnly; // same hai ab

module.exports = { adminOnly, superAdminOnly };