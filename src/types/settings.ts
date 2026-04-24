import { z } from "zod";
import { NetworkingGoal } from "./context";

export const SettingsUpdateSchema = z
  .object({
    agentActive: z.boolean().optional(),
    excludedTopics: z.array(z.string().max(100)).max(20).optional(),
    researchConsent: z.boolean().optional(),
    networkingGoal: NetworkingGoal.optional(),
    notifyAllEmails: z.boolean().optional(),
    notifyMatchProposals: z.boolean().optional(),
    notifyNewMessages: z.boolean().optional(),
    notifyFreshness: z.boolean().optional(),
    // Empty string clears the field; https URL required otherwise.
    webhookUrl: z
      .union([z.literal(""), z.string().url("Must be a valid URL").startsWith("https://", "Webhook must use HTTPS").max(500)])
      .optional(),
    webhookToken: z.union([z.literal(""), z.string().min(8).max(500)]).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one setting must be provided",
  });

export type SettingsUpdate = z.infer<typeof SettingsUpdateSchema>;

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128, "Password is too long"),
});

export const DeleteAccountSchema = z.object({
  confirmEmail: z.string().email("Please enter a valid email"),
});
