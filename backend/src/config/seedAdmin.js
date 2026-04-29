const User = require("../models/User");
const bcrypt = require("bcryptjs");

const seedAdmin = async () => {
  try {
    const { ADMIN_NAME, ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_ROLE } = process.env;

    // Skip if admin credentials are not set in .env
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;

    // Check if an admin with this email already exists
    const existingAdmin = await User.findOne({ email: ADMIN_EMAIL.toLowerCase() });

    if (existingAdmin) {
      console.log(`ℹ️  Admin already exists: ${existingAdmin.email} (${existingAdmin.role})`);
      return;
    }

    // Create new admin
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 12);

    await User.create({
      name:     ADMIN_NAME || "Super Admin",
      email:    ADMIN_EMAIL.toLowerCase().trim(),
      password: hashedPassword,
      role:     ADMIN_ROLE || "super_admin",
      isActive: true,
    });

    console.log(`✅ Admin created from .env → ${ADMIN_EMAIL} (${ADMIN_ROLE || "super_admin"})`);

  } catch (err) {
    console.error("❌ seedAdmin error:", err.message);
  }
};

module.exports = seedAdmin;
