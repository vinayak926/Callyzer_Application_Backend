const User = require("../models/User");

// ── Allows HR and above roles (admin, super_admin) ────────────
const hrOnly = async (req, res, next) => {
    try {
        // req.user is full user object (set by authMiddleware)
        const user = req.user;
        if (!user) return res.status(401).json({ message: "User not found" });

        const allowed = ["hr", "admin", "super_admin"];
        if (!allowed.includes(user.role)) {
            return res.status(403).json({ message: "HR access required" });
        }

        req.hrUser = user;
        next();
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ── Allows only the HR role (not admin) ───────────────────────
const strictHrOnly = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) return res.status(401).json({ message: "User not found" });

        if (user.role !== "hr") {
            return res.status(403).json({ message: "Only HR can access this" });
        }

        req.hrUser = user;
        next();
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = { hrOnly, strictHrOnly };