const express = require("express");
const cors = require("cors");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const callRoutes = require("./routes/callRoutes");
const reportsRoutes = require("./routes/reportsRoutes");
const businessRoutes = require("./routes/businessRoutes");


const app = express();

// CORS - allow frontend origin
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5174",
  process.env.FRONTEND_URL, // Vercel URL yahan aayega
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.filter(Boolean).includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  exposedHeaders: ["Content-Disposition"],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Callyzer API is running ✅", version: "1.0.0" });
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
// app.use("/api/manager", managerRoutes);
// app.use("/api/hr", hrRoutes);
app.use("/api/calls", callRoutes);
app.use("/api/business", businessRoutes);
// app.use("/api/attendance", attendanceRoutes);

// app.use("/api/dashboard", dashboardRoutes);
app.use("/api/reports", reportsRoutes);
// app.use("/api/targets", targetRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: "Internal server error" });
});

module.exports = app;