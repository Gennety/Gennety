import type { CorporateConnector, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { recordAnalyticsEvent } from "@/lib/analytics-tracking";
import {
  assertConnectorCryptoReady,
  decryptConnectorSecret,
  encryptConnectorSecret,
  verifySharedWebhookSecret,
} from "@/lib/connectors/personal/crypto";
import {
  CorporateConnectorPlatform,
  CorporateConnectorUpsertSchema,
  type CorporateConnectorPlatform as CorporateConnectorPlatformValue,
} from "@/types/corporate-connectors";

export class CorporateConnectorError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "CorporateConnectorError";
  }
}

export function asCorporateConfig(value: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function configString(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function configStringArray(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function configRecord(config: Record<string, unknown>, key: string) {
  const value = config[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function toCorporateJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

export function decryptCorporateConnectorToken(
  connector: Pick<CorporateConnector, "encryptedToken" | "tokenIv">
) {
  return decryptConnectorSecret(connector);
}

export function verifyCorporateWebhookSecret(
  actual: string | null | undefined,
  connector: Pick<CorporateConnector, "webhookSecret">
) {
  return verifySharedWebhookSecret(actual, connector.webhookSecret);
}

export async function listCorporateConnectors(communityId: string) {
  const connectors = await prisma.corporateConnector.findMany({
    where: { communityId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      communityId: true,
      platform: true,
      enabled: true,
      externalSpaceId: true,
      webhookSecret: true,
      config: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return connectors.map((connector) => ({
    ...connector,
    hasWebhookSecret: Boolean(connector.webhookSecret),
  }));
}

export async function upsertCorporateConnector(input: unknown) {
  const parsed = CorporateConnectorUpsertSchema.parse(input);
  assertConnectorCryptoReady();
  const tokenFields = parsed.token ? encryptConnectorSecret(parsed.token) : null;

  const existing = await prisma.corporateConnector.findUnique({
    where: {
      communityId_platform: {
        communityId: parsed.communityId,
        platform: parsed.platform,
      },
    },
    select: { id: true, encryptedToken: true, tokenIv: true },
  });

  if (!existing && !tokenFields) {
    throw new CorporateConnectorError("token is required when creating a corporate connector", 400);
  }
  const createTokenFields = tokenFields ?? {
    encryptedToken: existing?.encryptedToken ?? "",
    tokenIv: existing?.tokenIv ?? "",
  };

  const connector = await prisma.corporateConnector.upsert({
    where: {
      communityId_platform: {
        communityId: parsed.communityId,
        platform: parsed.platform,
      },
    },
    create: {
      communityId: parsed.communityId,
      platform: parsed.platform,
      enabled: parsed.enabled,
      externalSpaceId: parsed.externalSpaceId,
      webhookSecret: parsed.webhookSecret ?? null,
      config: toCorporateJson(parsed.config ?? {}),
      ...createTokenFields,
    },
    update: {
      enabled: parsed.enabled,
      externalSpaceId: parsed.externalSpaceId,
      webhookSecret: parsed.webhookSecret ?? undefined,
      config: toCorporateJson(parsed.config ?? {}),
      ...(tokenFields ?? {}),
    },
  });

  await recordAnalyticsEvent({
    type: "CORPORATE_CONNECTOR_UPSERTED",
    communityId: connector.communityId,
    metadata: {
      connector_id: connector.id,
      platform: connector.platform,
      enabled: connector.enabled,
      external_space_id: connector.externalSpaceId,
    },
  });

  return connector;
}

export async function findCorporateConnector(args: {
  platform: CorporateConnectorPlatformValue;
  connectorId?: string | null;
  communityId?: string | null;
  externalSpaceId?: string | null;
  enabledOnly?: boolean;
}) {
  const corporateConnector = (prisma as unknown as {
    corporateConnector?: typeof prisma.corporateConnector;
  }).corporateConnector;
  if (!corporateConnector) return null;

  const platform = CorporateConnectorPlatform.parse(args.platform);
  const enabled = args.enabledOnly === false ? undefined : true;

  if (args.connectorId) {
    return corporateConnector.findFirst({
      where: {
        id: args.connectorId,
        platform,
        ...(enabled === undefined ? {} : { enabled }),
      },
    });
  }

  if (args.communityId) {
    return corporateConnector.findFirst({
      where: {
        communityId: args.communityId,
        platform,
        ...(enabled === undefined ? {} : { enabled }),
      },
    });
  }

  if (args.externalSpaceId) {
    return corporateConnector.findFirst({
      where: {
        externalSpaceId: args.externalSpaceId,
        platform,
        ...(enabled === undefined ? {} : { enabled }),
      },
    });
  }

  return null;
}

export function resolveOwnerIdFromCorporateUser(args: {
  connector: Pick<CorporateConnector, "platform" | "config">;
  externalUserId?: string | null;
}) {
  const externalUserId = args.externalUserId?.trim();
  if (!externalUserId) return null;

  const config = asCorporateConfig(args.connector.config);
  const genericMap = configRecord(config, "userOwnerMap");
  const platformMap =
    args.connector.platform === "SLACK"
      ? configRecord(config, "slackUserOwnerMap")
      : configRecord(config, "atlassianUserOwnerMap");
  const ownerId = platformMap[externalUserId] ?? genericMap[externalUserId];
  return typeof ownerId === "string" && ownerId.trim() ? ownerId.trim() : null;
}

export async function assertCorporateOwnerMapped(args: {
  connector: Pick<CorporateConnector, "communityId" | "platform" | "config">;
  externalUserId?: string | null;
}) {
  const ownerId = resolveOwnerIdFromCorporateUser(args);
  if (!ownerId) {
    throw new CorporateConnectorError("Corporate user is not mapped to a Gennety owner", 403);
  }

  const membership = await prisma.communityMember.findUnique({
    where: {
      communityId_ownerId: {
        communityId: args.connector.communityId,
        ownerId,
      },
    },
    select: { role: true, status: true },
  });

  if (!membership || membership.status !== "ACTIVE") {
    throw new CorporateConnectorError("Mapped owner is not an active community member", 403);
  }

  return { ownerId, role: membership.role };
}
