const OPENAI_EMBEDDING_MODEL = "text-embedding-ada-002";
const ANTHROPIC_SONNET_MODEL = "claude-sonnet-4-20250514";

function toNumber(value: string | undefined, fallback: number) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const aiPricing = {
  embedding: {
    provider: "openai",
    model: OPENAI_EMBEDDING_MODEL,
    inputUsdPerMillion: toNumber(process.env.OPENAI_EMBEDDING_USD_PER_MILLION, 0.1),
  },
  anthropicSonnet: {
    provider: "anthropic",
    model: ANTHROPIC_SONNET_MODEL,
    inputUsdPerMillion: toNumber(process.env.ANTHROPIC_SONNET_INPUT_USD_PER_MILLION, 3),
    outputUsdPerMillion: toNumber(process.env.ANTHROPIC_SONNET_OUTPUT_USD_PER_MILLION, 15),
  },
} as const;

export function estimateEmbeddingCostUsd(tokensInput: number) {
  return (tokensInput / 1_000_000) * aiPricing.embedding.inputUsdPerMillion;
}

export function estimateAnthropicCostUsd(tokensInput: number, tokensOutput: number) {
  return (
    (tokensInput / 1_000_000) * aiPricing.anthropicSonnet.inputUsdPerMillion +
    (tokensOutput / 1_000_000) * aiPricing.anthropicSonnet.outputUsdPerMillion
  );
}

export function getEmbeddingModel() {
  return aiPricing.embedding.model;
}

export function getAnthropicSonnetModel() {
  return aiPricing.anthropicSonnet.model;
}
