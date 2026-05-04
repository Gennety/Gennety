export const MODEL_ADVICE_PRESETS = [
  {
    id: "fit_check",
    title: "Test the match",
    prompt:
      "Analyze the current dialogue and both people's contexts. Are they genuinely a strong fit for each other right now, or are they forcing the connection?",
  },
  {
    id: "next_step",
    title: "Suggest the next step",
    prompt:
      "Analyze the conversation and propose the single best next step for both people: a concrete action, experiment, intro, or follow-up topic.",
  },
  {
    id: "common_ground",
    title: "Find common ground",
    prompt:
      "Find the most promising shared direction hidden inside the current conversation. If they are talking past each other, explain where to reconnect.",
  },
  {
    id: "reframe",
    title: "Reframe the direction",
    prompt:
      "Test whether the current discussion vector is the right one. If not, propose a sharper collaboration angle that better matches both contexts.",
  },
] as const;

export type ModelAdvicePresetId = (typeof MODEL_ADVICE_PRESETS)[number]["id"];

export const MODEL_ADVICE_REQUESTER_SLOT = "advice_agent_a";
export const MODEL_ADVICE_RESPONDER_SLOT = "advice_agent_b";

export function getModelAdvicePreset(id: string | null | undefined) {
  if (!id) return null;
  return MODEL_ADVICE_PRESETS.find((preset) => preset.id === id) ?? null;
}
