const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// ── Helper: Generate JWT ──────────────────────────────────
const generateToken = (userId) => {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

// ── REGISTER ─────────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: "Name, email and password are required" });

    if (password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters" });

    const userExists = await User.findOne({ email: email.toLowerCase().trim() });
    if (userExists)
      return res.status(400).json({ message: "Email already registered. Please login." });

    const hashedPassword = await bcrypt.hash(password, 12);

    // Register sirf business_user ke liye — status: pending
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashedPassword,
      role: "business_user",      // ← hamesha business_user
      status: "pending",          // ← admin approve karega
      phone: phone || "",
    });

    res.status(201).json({
      message: "Registration successful! Your account is pending admin approval.",
      status: "pending",
    });
  } catch (err) {
    if (err.code === 11000)
      return res.status(400).json({ message: "Email already registered." });
    res.status(500).json({ message: "Server error. Please try again." });
  }
};

// ── LOGIN ─────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    // Find user
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user)
      return res.status(400).json({ message: "Invalid email or password" });

    // Check active status
    if (!user.isActive)
      return res.status(403).json({ message: "Your account has been deactivated. Contact admin." });

    // Pending check (sirf business_user ke liye hoga)
    if (user.status === "pending") {
      return res.status(403).json({
        message: "Your account is pending admin approval.",
        status: "pending",
      });
    }

    // Rejected check
    if (user.status === "rejected") {
      return res.status(403).json({
        message: "Your account registration was rejected. Contact admin.",
        status: "rejected",
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid email or password" });

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user._id);

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        phone: user.phone,
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error. Please try again." });
  }
};

// ── GET ME (Profile) ──────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user).select("-password");
    if (!user)
      return res.status(404).json({ message: "User not found" });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};

// ── CHANGE PASSWORD ───────────────────────────────────────
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ message: "Both fields are required" });
    if (newPassword.length < 6)
      return res.status(400).json({ message: "New password must be at least 6 characters" });

    const user = await User.findById(req.user);
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Current password is incorrect" });

    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ message: "Password changed successfully" });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
};
