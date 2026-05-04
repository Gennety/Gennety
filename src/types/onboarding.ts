import { z } from "zod";
import { NetworkingGoal } from "./context";
import { isSupportedCountryCode } from "@/lib/countries";

export const AgentPlatform = z.enum([
  "open_claw",
  "nemo_claw",
  "zero_claw",
  "nano_claw",
]);
export type AgentPlatform = z.infer<typeof AgentPlatform>;

export const PLATFORM_FILE_NAMES: Record<AgentPlatform, string> = {
  open_claw: "SOUL.md",
  nemo_claw: "SOUL.md",
  zero_claw: "SOUL.md",
  nano_claw: "SOUL.md",
};

export const PLATFORM_TEMPLATE_FILES: Record<AgentPlatform, string> = {
  open_claw: "open-claw.md",
  nemo_claw: "open-claw.md",
  zero_claw: "open-claw.md",
  nano_claw: "open-claw.md",
};

export const PLATFORM_LABELS: Record<AgentPlatform, string> = {
  open_claw: "Open Claw",
  nemo_claw: "Nemo Claw",
  zero_claw: "Zero Claw",
  nano_claw: "Nano-Claw",
};

export const OnboardingSchema = z.object({
  agentPlatform: AgentPlatform,
  networkingGoal: NetworkingGoal,
  countryCode: z.string().trim().toUpperCase().refine(isSupportedCountryCode, {
    message: "A valid country is required",
  }),
  privacyConsent: z.boolean().refine((v) => v === true, {
    message: "Privacy consent is required to use Gennety",
  }),
  researchConsent: z.boolean().optional(),
  excludedTopics: z.array(z.string().max(100)).max(20).optional(),
});

export type OnboardingInput = z.infer<typeof OnboardingSchema>;
