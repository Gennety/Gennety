import { z } from "zod";

export const ModelAdviceRequestSchema = z
  .object({
    matchId: z.string().min(1).max(50),
    promptKey: z.string().min(1).max(100).optional(),
    promptText: z.string().trim().min(1).max(2000).optional(),
  })
  .refine((value) => value.promptKey || value.promptText, {
    message: "Choose a preset or write your own question",
    path: ["promptText"],
  });

export const ModelAdviceRespondSchema = z.object({
  sessionId: z.string().min(1).max(50),
  action: z.enum(["approve", "decline", "cancel"]),
});

export type ModelAdviceRequestInput = z.infer<typeof ModelAdviceRequestSchema>;
export type ModelAdviceRespondInput = z.infer<typeof ModelAdviceRespondSchema>;
