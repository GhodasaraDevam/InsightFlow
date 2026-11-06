import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .default(5000),

  FRONTEND_URL: z
    .string()
    .url()
    .default("http://localhost:5173"),

  MONGODB_URI: z
    .string()
    .min(1, "MongoDB URI is required")
    .refine(
      (value) =>
        value.startsWith("mongodb://") ||
        value.startsWith("mongodb+srv://"),
      "Invalid MongoDB connection string"
    ),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, "JWT_ACCESS_SECRET must be at least 32 characters long"),

  JWT_REFRESH_SECRET: z
    .string()
    .min(32, "JWT_REFRESH_SECRET must be at least 32 characters long"),

  JWT_ACCESS_EXPIRES_IN: z
    .string()
    .default("15m"),

  JWT_REFRESH_EXPIRES_IN: z
    .string()
    .default("7d"),

  COOKIE_DOMAIN: z
    .string()
    .optional()
    .transform((val) => (val && val.trim().length > 0 ? val.trim() : undefined)),

  COOKIE_SECURE: z
    .string()
    .optional()
    .transform((val) => val === "true" || (process.env.NODE_ENV === "production" && val !== "false")),

  COOKIE_SAME_SITE: z
    .enum(["lax", "strict", "none"])
    .default("lax"),
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error("Invalid environment configuration:");
  console.error(result.error.format());
  process.exit(1);
}

export const env = result.data;
