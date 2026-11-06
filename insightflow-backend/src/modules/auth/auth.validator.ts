import { z } from "zod";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_COMPLEXITY_REGEX,
  PASSWORD_POLICY_MESSAGE,
} from "./auth.constants.js";

export const registerSchema = z.object({
  fullName: z
    .string({ message: "Full name is required" })
    .trim()
    .min(1, "Full name cannot be empty")
    .max(200, "Full name cannot exceed 200 characters"),

  email: z
    .string({ message: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Please provide a valid email address"),

  password: z
    .string({ message: "Password is required" })
    .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
    .max(PASSWORD_MAX_LENGTH, `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters`)
    .regex(PASSWORD_COMPLEXITY_REGEX, PASSWORD_POLICY_MESSAGE),
});

export const loginSchema = z.object({
  email: z
    .string({ message: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Please provide a valid email address"),

  password: z
    .string({ message: "Password is required" })
    .min(1, "Password is required"),
});

export type RegisterSchema = z.infer<typeof registerSchema>;
export type LoginSchema = z.infer<typeof loginSchema>;
