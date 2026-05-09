import { z } from "zod";

export const CommunityVisibility = z.enum(["PUBLIC", "PRIVATE"]);
export type CommunityVisibility = z.infer<typeof CommunityVisibility>;

export const CommunityProfileVisibility = z.enum(["VISIBLE", "HIDDEN"]);
export type CommunityProfileVisibility = z.infer<typeof CommunityProfileVisibility>;

export const CommunityCategory = z.enum(["INVESTMENTS", "SCIENCE", "TECHNOLOGY"]);
export type CommunityCategory = z.infer<typeof CommunityCategory>;

export const CommunitySpecialization = z.enum([
  "INVESTOR_HUB",
  "ANGEL_HUB",
  "BIOLOGISTS",
  "RESEARCHERS",
  "SCIENTISTS",
  "SPACE_RESEARCH",
  "AI_DEVELOPMENT",
  "SOLO_FOUNDERS",
]);
export type CommunitySpecialization = z.infer<typeof CommunitySpecialization>;

export const COMMUNITY_SPECIALIZATIONS_BY_CATEGORY: Record<
  CommunityCategory,
  CommunitySpecialization[]
> = {
  INVESTMENTS: ["INVESTOR_HUB", "ANGEL_HUB"],
  SCIENCE: ["BIOLOGISTS", "RESEARCHERS", "SCIENTISTS", "SPACE_RESEARCH"],
  TECHNOLOGY: ["AI_DEVELOPMENT", "SOLO_FOUNDERS"],
};

export const COMMUNITY_CATEGORY_LABELS: Record<CommunityCategory, string> = {
  INVESTMENTS: "Investments",
  SCIENCE: "Science",
  TECHNOLOGY: "Technology",
};

export const COMMUNITY_SPECIALIZATION_LABELS: Record<CommunitySpecialization, string> = {
  INVESTOR_HUB: "Investor hub",
  ANGEL_HUB: "Business angels",
  BIOLOGISTS: "Biologists",
  RESEARCHERS: "Researchers",
  SCIENTISTS: "Scientists",
  SPACE_RESEARCH: "Space research",
  AI_DEVELOPMENT: "AI development",
  SOLO_FOUNDERS: "Solo founders",
};

const optionalText = (max: number) =>
  z
    .union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      return value ? value : null;
    });

function specializationMatchesCategory(input: {
  category?: CommunityCategory | null;
  specialization?: CommunitySpecialization | null;
}) {
  if (!input.category || !input.specialization) return true;
  return COMMUNITY_SPECIALIZATIONS_BY_CATEGORY[input.category].includes(input.specialization);
}

export const CreateCommunitySchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short").max(80, "Name is too long"),
    description: optionalText(1000),
    visibility: CommunityVisibility,
    profileVisibility: CommunityProfileVisibility.default("VISIBLE"),
    category: CommunityCategory.nullish(),
    specialization: CommunitySpecialization.nullish(),
  })
  .refine((data) => data.visibility !== "PUBLIC" || !!data.category, {
    message: "Public communities require a category",
    path: ["category"],
  })
  .refine((data) => data.visibility !== "PUBLIC" || !!data.specialization, {
    message: "Public communities require a specialization",
    path: ["specialization"],
  })
  .refine(specializationMatchesCategory, {
    message: "Specialization does not belong to the selected category",
    path: ["specialization"],
  });

export type CreateCommunityInput = z.infer<typeof CreateCommunitySchema>;

export const UpdateCommunitySchema = z
  .object({
    name: z.string().trim().min(2).max(80).optional(),
    description: optionalText(1000),
    visibility: CommunityVisibility.optional(),
    profileVisibility: CommunityProfileVisibility.optional(),
    category: CommunityCategory.nullish(),
    specialization: CommunitySpecialization.nullish(),
    ssotEnabled: z.boolean().optional(),
    strategyEnabled: z.boolean().optional(),
    strategyIntervalHours: z.number().int().min(1).max(720).optional(),
    strategyTokenLimit: z.number().int().min(1000).max(2_000_000).optional(),
    monthlyTokenLimit: z.number().int().min(1000).max(50_000_000).nullable().optional(),
    judgeIterationLimit: z.number().int().min(1).max(10).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  })
  .refine(specializationMatchesCategory, {
    message: "Specialization does not belong to the selected category",
    path: ["specialization"],
  });

export type UpdateCommunityInput = z.infer<typeof UpdateCommunitySchema>;

export const CommunityInviteSchema = z
  .object({
    inviteeOwnerId: z.string().min(1).max(80).optional(),
    inviteeEmail: z.string().trim().email().max(254).optional(),
  })
  .refine((data) => !!data.inviteeOwnerId || !!data.inviteeEmail, {
    message: "Invitee owner id or email is required",
  });

export type CommunityInviteInput = z.infer<typeof CommunityInviteSchema>;

export const CommunityProfileVisibilitySchema = z.object({
  profileVisibility: CommunityProfileVisibility.optional(),
  showOnProfile: z.boolean().optional(),
}).refine((data) => data.profileVisibility !== undefined || data.showOnProfile !== undefined, {
  message: "At least one visibility setting is required",
});

export type CommunityProfileVisibilityInput = z.infer<typeof CommunityProfileVisibilitySchema>;
