import { z } from "zod";
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_COMPLEXITY_REGEX,
  PASSWORD_POLICY_MESSAGE,
} from "../auth/auth.constants.js";

export const updateProfileSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(1, "Full name cannot be empty")
      .max(200, "Full name cannot exceed 200 characters")
      .optional(),

    profilePicture: z
      .string()
      .url("Profile picture must be a valid URL")
      .optional()
      .or(z.literal(""))
      .or(z.null())
      .transform((val) => (val === "" || val === null ? undefined : val)),

    preferences: z
      .object({
        theme: z.enum(["light", "dark", "system"]).optional(),
        language: z.string().min(2).max(10).optional(),
        notificationsEnabled: z.boolean().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string({ message: "Current password is required" })
      .min(1, "Current password is required"),

    newPassword: z
      .string({ message: "New password is required" })
      .min(PASSWORD_MIN_LENGTH, `New password must be at least ${PASSWORD_MIN_LENGTH} characters`)
      .max(PASSWORD_MAX_LENGTH, `New password cannot exceed ${PASSWORD_MAX_LENGTH} characters`)
      .regex(PASSWORD_COMPLEXITY_REGEX, PASSWORD_POLICY_MESSAGE),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password cannot be the same as your current password",
    path: ["newPassword"],
  });

export type UpdateProfileSchema = z.infer<typeof updateProfileSchema>;
export type ChangePasswordSchema = z.infer<typeof changePasswordSchema>;
