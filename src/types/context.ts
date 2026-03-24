import { z } from "zod";

export const NetworkingGoal = z.enum(["partnership", "collaboration", "mentor", "peer"]);
export type NetworkingGoal = z.infer<typeof NetworkingGoal>;

export const ContextSchema = z.object({
  current_work: z.string().min(1, "current_work is required"),
  expertise: z.array(z.string()).min(1, "at least one expertise area required"),
  looking_for: z.string().min(1, "looking_for is required"),
  not_looking_for: z.string().optional(),
  recent_problems: z.string().optional(),
  location: z.string().optional(),
  networking_goal: NetworkingGoal,
});

export type ContextInput = z.infer<typeof ContextSchema>;
