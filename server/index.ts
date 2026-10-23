import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";

import authRoutes from "./routes/auth.routes";
import documentRoutes from "./routes/documents.routes";
import searchRoutes from "./routes/search.routes";
import chatRoutes from "./routes/chat.routes";
import dashboardRoutes from "./routes/dashboard.routes";

const app = express();
const PORT = process.env.PORT || 4000;

// Trust Render's load balancer so req.secure works and cookies with secure:true are set correctly
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

app.use(cors({
  origin: process.env.CLIENT_URL || "http://localhost:5173",
  credentials: true,
}));
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

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`LifeOps server running on http://localhost:${PORT}`);
});
