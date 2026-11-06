
import express from "express";
import cors from "cors";
import helmet from "helmet";

const app = express();

app.use(helmet());

app.use(
    cors({
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
        credentials: true
    })
);

app.use(express.json({ limit: "10mb" }));

app.get("/api/v1/health", (_req, res) => {
    res.status(200).json({
        success: true,
        message: "InsightFlow backend is running",
        data: {
            application: "InsightFlow",
            status: "healthy"
        }
    });
});

export default app;
