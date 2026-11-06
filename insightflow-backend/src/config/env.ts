
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
        )
});

const result = envSchema.safeParse(process.env);

if (!result.success) {
    console.error("Invalid environment configuration:");
    console.error(z.treeifyError(result.error));
    process.exit(1);
}

export const env = result.data;
