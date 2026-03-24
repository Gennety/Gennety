import { z } from "zod";

export const BeaconSchema = z.object({
  context_query: z.string().min(1, "context_query is required"),
});

export type BeaconInput = z.infer<typeof BeaconSchema>;
