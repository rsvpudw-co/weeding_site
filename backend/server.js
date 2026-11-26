import express from "express";
import http from "http";
import { Server as SocketIOServer } from "socket.io";
import { initializeChatSocket, authenticate } from "./socket/chatSocket.js";
import { supabase } from "./Db_connection/supabaseClient.js";
import dotenv from "dotenv";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { testConnection } from "./Db_connection/dbconnection.js";
import authRoutes from "./routes/authRoutes.js";
import guestRoutes from "./routes/guestRoutes.js";
import weddingRoutes from "./routes/weddingRoutes.js";
import callLogRoutes from "./routes/callLogRoutes.js";
import googleSheetsRoutes from "./routes/googleSheetsRoutes.js";
import messageRoutes from "./routes/messageRoutes.js";
import { getExportDir } from "./services/excelService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Candidate paths for .env file
const envCandidates = [
  path.resolve(__dirname, ".env"),
  path.resolve(__dirname, "../.env"),
  path.resolve(process.cwd(), "backend/.env"),
  path.resolve(process.cwd(), ".env"),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize HTTP server and Socket.IO for Live Real-Time Chatbot
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: (origin, callback) => callback(null, true),
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "x-user-role", "x-user-id", "x-user-wedding-id", "*"],
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ["websocket", "polling"],
  allowUpgrades: true,
  allowEIO3: true,
});

// Attach io instance to express app so routes can broadcast messages
app.set("io", io);
initializeChatSocket(io);

// Initialize exports folder
const exportDir = getExportDir();

// Allowed CORS origins - add all your Vercel/Netlify/custom URLs here
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://weeding-site-six.vercel.app",
  process.env.CORS_ORIGIN,
  process.env.FRONTEND_URL,
].filter(Boolean);

// CORS middleware - must be FIRST so headers are set even on errors/crashes
app.use((req, res, next) => {
  const origin = req.headers.origin || "";
  const isAllowed =
    !origin ||
    origin.endsWith(".vercel.app") ||
    origin.includes("localhost") ||
    ALLOWED_ORIGINS.includes(origin);

  const allowedOrigin = isAllowed ? origin : ALLOWED_ORIGINS[0] || "*";
  res.header("Access-Control-Allow-Origin", allowedOrigin);
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, x-user-role, x-user-id, x-user-wedding-id, x-file-name, *");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Vary", "Origin");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

app.use(
  cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
    methods: ["GET, POST, PUT, DELETE, OPTIONS, PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "x-user-role", "x-user-id", "x-user-wedding-id", "x-file-name", "*"],
  })
);

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// Serve static exports folder for direct file downloads
app.use("/exports", express.static(exportDir));

// Health Check
app.get("/", (req, res) => {
  res.json({
    status: "online",
    message: "Multi-Wedding & Guest Logistics Management API with ExcelJS Marriage Sheet Generator & Google Sheets Sync",
    version: "1.0",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
  });
});

// Real-time terminal error logging endpoint for frontend browser errors
app.post("/api/logs/client-error", (req, res) => {
  const { message, stack, componentStack, url, line, column, time } = req.body || {};
  console.log("\n=======================================================");
  console.error("🚨 [CLIENT BROWSER RUNTIME ERROR DETECTED]:");
  console.error(`📌 Message: ${message || "Unknown error"}`);
  if (url || line || column) {
    console.error(`📍 Location: ${url || "browser"}:${line || "?"}:${column || "?"}`);
  }
  if (componentStack) {
    console.error(`🧱 React Component Stack:\n${componentStack.trim()}`);
  }
  if (stack) {
    console.error(`📜 Stack Trace:\n${stack.trim()}`);
  }
  console.log("=======================================================\n");
  res.json({ success: true, logged: true });
});

// API Routes
app.use("/api/auth", authRoutes);
app.use("/api/weddings", weddingRoutes);
app.use("/api/guests", guestRoutes);
app.use("/api/call-logs", callLogRoutes);
app.use("/api/sheets", googleSheetsRoutes);
app.use("/api/messages", messageRoutes);

// Auth middleware for REST history endpoints (Rule 6 & 7)
const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader || req.query.token;
  const user = await authenticate(token);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.user = user;
  next();
};

// Chat history for one wedding (oldest first)
// Scoped: clients can only read their own wedding_id, admins can read any
app.get(
  ["/weddings/:weddingId/messages", "/api/weddings/:weddingId/messages"],
  requireAuth,
  async (req, res) => {
    const rawId = req.params.weddingId || "";
    const cleanWeddingId = rawId.replace(/^wedding:/, "").trim();

    const idVariants = [cleanWeddingId];
    if (cleanWeddingId.startsWith("wedding_")) {
      idVariants.push(cleanWeddingId.replace(/^wedding_/, ""));
    } else {
      idVariants.push(`wedding_${cleanWeddingId}`);
    }

    // Rule 7: Clients may only read their own wedding's room
    if (req.user.role === "client" && !idVariants.includes(req.user.weddingId)) {
      return res.status(403).json({ error: "Forbidden: You may only view your own wedding messages" });
    }

    let messages = [];
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("wedding_messages")
          .select("*")
          .in("wedding_id", idVariants)
          .order("created_at", { ascending: true });

        if (!error && Array.isArray(data)) {
          messages = data;
        }
      } catch (e) {}
    }

    // Merge with in-memory store if present
    const { store } = await import("./Db_connection/queries.js");
    const localMsgs = (store?.messages || []).filter((m) => idVariants.includes(m.wedding_id));
    const seen = new Set(messages.map((m) => m.id));
    localMsgs.forEach((lm) => {
      if (!seen.has(lm.id)) {
        messages.push(lm);
        seen.add(lm.id);
      }
    });

    messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    res.json(messages);
  }
);

// Mark chat messages as seen / read
app.put(
  [
    "/weddings/:weddingId/messages/read",
    "/api/weddings/:weddingId/messages/read",
    "/api/messages/read/:weddingId",
    "/messages/read/:weddingId",
  ],
  async (req, res) => {
    try {
      const rawId = req.params.weddingId || "";
      const cleanWeddingId = rawId.replace(/^wedding:/, "").trim() || "wedding_01";
      const { readerRole = "client" } = req.body || {};

      res.json({ success: true, message: "Messages marked as read" });

      MessageModel.markAsRead(cleanWeddingId, readerRole).catch(() => {});

      const io = req.app.get("io");
      if (io) {
        io.to(`wedding:${cleanWeddingId}`).emit("messages_read", {
          wedding_id: cleanWeddingId,
          reader_role: readerRole,
        });
        io.to("admins").emit("messages_read", {
          wedding_id: cleanWeddingId,
          reader_role: readerRole,
        });
      }
    } catch (e) {
      if (!res.headersSent) res.json({ success: true });
    }
  }
);

// Global Error Handler with guaranteed CORS headers
app.use((err, req, res, next) => {
  const origin = req.headers.origin || "*";
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, x-user-role, x-user-id, x-user-wedding-id, x-file-name, *");
  console.error("Unhandled Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    error: err.message,
  });
});

// Process safety listeners to prevent Node crash / 502 Bad Gateway
process.on("unhandledRejection", (reason, promise) => {
  console.warn("⚠️ Unhandled Rejection at:", promise, "reason:", reason);
});
process.on("uncaughtException", (error) => {
  console.error("❌ Uncaught Exception:", error);
});

// Start Server with Socket.IO Enabled (bind to 0.0.0.0 for Render/Docker)
server.listen(PORT, "0.0.0.0", async () => {
  console.log(`🚀 Backend Server & Live Socket.IO Chat started on port ${PORT}`);
  await testConnection();
});
