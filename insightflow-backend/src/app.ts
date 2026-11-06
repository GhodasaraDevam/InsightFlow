import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import authRoutes from "./modules/auth/auth.routes.js";
import userRoutes from "./modules/users/user.routes.js";
import documentRoutes from "./modules/documents/document.routes.js";
import { errorHandler } from "./middlewares/error-handler.middleware.js";

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "X-InsightFlow-Client",
    ],
  })
);

app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Health check endpoint
app.get("/api/v1/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "InsightFlow backend is running",
    data: {
      application: "InsightFlow",
      status: "healthy",
    },
  });
});

// Authentication, User & Document routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/documents", documentRoutes);

// 404 Not Found handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    message: "Requested endpoint does not exist",
    errors: [],
  });
});

// Centralized error handler
app.use(errorHandler);

export default app;
