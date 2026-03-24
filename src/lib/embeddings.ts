import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const response = await getOpenAI().embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });
  return response.data[0].embedding;
}

export function contextToEmbeddingText(context: {
  currentWork: string;
  expertise: string[];
  lookingFor: string;
  notLookingFor?: string | null;
  recentProblems?: string | null;
  networkingGoal: string;
}): string {
  const parts = [
    `Current work: ${context.currentWork}`,
    `Expertise: ${context.expertise.join(", ")}`,
    `Looking for: ${context.lookingFor}`,
    `Networking goal: ${context.networkingGoal}`,
  ];
  if (context.notLookingFor) parts.push(`Not looking for: ${context.notLookingFor}`);
  if (context.recentProblems) parts.push(`Recent problems: ${context.recentProblems}`);
  return parts.join(". ");
}
