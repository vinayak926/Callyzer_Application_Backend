const managerOnly = async (req, res, next) => {
    try {
        const user = req.user; // full object from authMiddleware
        if (!user) return res.status(401).json({ message: "User not found" });

        const allowed = ["manager", "admin", "super_admin"];
        if (!allowed.includes(user.role)) {
            return res.status(403).json({ message: "Manager access required" });
        }

        req.managerUser = user;
        next();
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

// ── Allows only the manager role (not admin) ──────────────────
const strictManagerOnly = async (req, res, next) => {
    try {
        const user = req.user;
        if (!user) return res.status(401).json({ message: "User not found" });

        if (user.role !== "manager") {
            return res.status(403).json({ message: "Only managers can access this" });
        }

        req.managerUser = user;
        next();
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};

module.exports = { managerOnly, strictManagerOnly };