require("dotenv").config();
const http = require("http");
const app = require("./src/app");
const connectDB = require("./src/config/db");
const seedAdmin = require("./src/config/seedAdmin");
const { initSocket } = require("./src/socket");

const start = async () => {
  await connectDB();      // first connect to DB
  await seedAdmin();      // then check/create admin

  // Create HTTP server
  const server = http.createServer(app);
  
  // Initialize Socket.io
  const io = initSocket(server);
  console.log("✅ Socket.io initialized");
  
  // Make io available to routes
  app.set("io", io);

  server.listen(process.env.PORT || 5000, () => {
    console.log(`🚀 Server running on port ${process.env.PORT || 5000}`);
    console.log(`🔌 WebSocket ready for connections`);
  });
};

start();