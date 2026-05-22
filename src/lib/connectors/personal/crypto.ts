import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

const CONNECTOR_KEY_MIN_BYTES = 32;
const AES_GCM_IV_BYTES = 12;
const AES_GCM_TAG_BYTES = 16;
const CONNECTOR_SECRET_ENV = "CONNECTOR_SECRET_KEY";

export class ConnectorCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConnectorCryptoError";
  }
}

function decodeBase64LikeSecret(value: string) {
  if (!/^[A-Za-z0-9+/_=-]+$/.test(value)) return null;
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = Buffer.from(normalized, "base64");
    return decoded.length >= CONNECTOR_KEY_MIN_BYTES ? decoded : null;
  } catch {
    return null;
  }
}

export function deriveConnectorKey(rawSecret = process.env.CONNECTOR_SECRET_KEY ?? "") {
  const secret = rawSecret.trim();
  if (!secret) {
    throw new ConnectorCryptoError(`${CONNECTOR_SECRET_ENV} is required for personal connector writes`);
  }

  let keyMaterial: Buffer | null = null;
  if (/^[a-f0-9]{64,}$/i.test(secret) && secret.length % 2 === 0) {
    keyMaterial = Buffer.from(secret, "hex");
  } else {
    keyMaterial = decodeBase64LikeSecret(secret) ?? Buffer.from(secret, "utf8");
  }

  if (keyMaterial.length < CONNECTOR_KEY_MIN_BYTES) {
    throw new ConnectorCryptoError(`${CONNECTOR_SECRET_ENV} must contain at least 32 bytes of key material`);
  }

  if (keyMaterial.length === CONNECTOR_KEY_MIN_BYTES) return keyMaterial;
  return createHash("sha256").update(keyMaterial).digest();
}

export function assertConnectorCryptoReady() {
  deriveConnectorKey();
}

export function encryptConnectorSecret(plainText: string) {
  if (!plainText) throw new ConnectorCryptoError("Connector secret cannot be empty");

  const key = deriveConnectorKey();
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: AES_GCM_TAG_BYTES });
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    encryptedToken: `${encrypted.toString("base64url")}.${tag.toString("base64url")}`,
    tokenIv: iv.toString("base64url"),
  };
}

export function decryptConnectorSecret(input: { encryptedToken?: string | null; tokenIv?: string | null }) {
  if (!input.encryptedToken || !input.tokenIv) return null;

  const [cipherTextEncoded, tagEncoded] = input.encryptedToken.split(".");
  if (!cipherTextEncoded || !tagEncoded) {
    throw new ConnectorCryptoError("Encrypted connector secret is malformed");
  }

  const key = deriveConnectorKey();
  const iv = Buffer.from(input.tokenIv, "base64url");
  const cipherText = Buffer.from(cipherTextEncoded, "base64url");
  const tag = Buffer.from(tagEncoded, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: AES_GCM_TAG_BYTES });
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8");
}

function safeEqualStrings(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function verifySharedWebhookSecret(actual: string | null | undefined, expectedSecret: string | null | undefined) {
  if (!actual || !expectedSecret) return false;
  return safeEqualStrings(actual, expectedSecret);
}

export function signWebhookBodySha256(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

export function verifySha256WebhookSignature(args: {
  secret: string | null | undefined;
  body: string;
  signature: string | null | undefined;
  prefix?: string;
}) {
  if (!args.secret || !args.signature) return false;
  const prefix = args.prefix ?? "sha256=";
  const actual = args.signature.startsWith(prefix) ? args.signature.slice(prefix.length) : args.signature;
  const expected = signWebhookBodySha256(args.secret, args.body);
  return safeEqualStrings(actual, expected);
}

export const __test = {
  safeEqualStrings,
};
