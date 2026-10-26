import "dotenv/config"; // reads .env — copy .env.local to .env locally (both are gitignored)
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";

import authRoutes from "./routes/auth.routes";
import documentRoutes from "./routes/documents.routes";
import searchRoutes from "./routes/search.routes";
import chatRoutes from "./routes/chat.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import ocrRoutes from "./routes/ocr.routes";

const app = express();
const PORT = process.env.PORT || 4000;

// Trust Render's load balancer so req.secure works and cookies with secure:true are set correctly
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

// Build allowed origins list from CLIENT_URL env var (comma-separated for multiple)
const rawOrigins = process.env.CLIENT_URL || "http://localhost:5173";
const allowedOrigins = rawOrigins.split(",").map((o) => o.trim().replace(/\/$/, ""));

const corsOptions: cors.CorsOptions = {
  origin(requestOrigin, callback) {
    // Allow requests with no origin (curl, Postman, server-to-server)
    if (!requestOrigin) return callback(null, true);
    if (allowedOrigins.includes(requestOrigin)) return callback(null, true);
    callback(new Error(`CORS: origin ${requestOrigin} not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
// Handle preflight OPTIONS requests for all routes
app.options("*", cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Static file serving for uploaded documents
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/search", searchRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/ocr", ocrRoutes);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`LifeOps server running on http://localhost:${PORT}`);
});
