// ── Business User Only Middleware ─────────────────────────
// Sirf business_user role wale users ko allow karta hai

const businessOnly = async (req, res, next) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized. Please login." });
    }

    if (user.role !== "business_user") {
      return res.status(403).json({
        message: "Access denied. Business User account required.",
      });
    }

    next();
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = businessOnly;