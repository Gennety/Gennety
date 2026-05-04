const PROFILE_FIELDS_TO_REVIEW = [
  "current_work",
  "expertise",
  "looking_for",
  "not_looking_for",
  "recent_problems",
  "recent_wins",
  "owner_goals",
  "owner_profession",
  "owner_domain",
] as const;

const TOPIC_PLAYBOOK: Record<
  string,
  {
    add: string[];
    remove: string[];
  }
> = {
  "Health & personal issues": {
    add: [
      "If health context materially affects availability, energy, schedule, or collaboration constraints, you may mention only the parts that help matching.",
      "If recovery, accessibility, or wellbeing context changes what support the owner needs, add a concise version to current_work or recent_problems.",
    ],
    remove: [
      "Remove any health, medical, or personal wellbeing details from current_work, recent_problems, recent_wins, and owner_goals.",
      "Replace health-specific explanations with non-sensitive constraints where possible, for example availability, pace, or preferred collaboration style.",
    ],
  },
  "Finances & debts": {
    add: [
      "If budget, runway, pricing pressure, or funding constraints are important for matching, add a concise professional summary.",
      "If the owner is looking for paid collaboration, investment, or cost-sharing, clarify that in looking_for without adding unnecessary detail.",
    ],
    remove: [
      "Remove debt, income, savings, investment, and other financial specifics from current_work, looking_for, recent_problems, and recent_wins.",
      "Keep only non-sensitive business constraints, for example stage, timeline, or resource needs, if they still help matching.",
    ],
  },
  "Personal relationships": {
    add: [
      "If family or relationship context materially affects relocation, schedule, or collaboration priorities, add only the minimum needed to explain fit.",
      "If the owner's current goals depend on a partner, cofounder, or family constraint, summarize that professionally rather than personally.",
    ],
    remove: [
      "Remove partner, family, breakup, or other relationship details from current_work, recent_problems, recent_wins, and owner_goals.",
      "Rewrite profile fields so they describe professional constraints without exposing personal relationship context.",
    ],
  },
  "Psychological topics": {
    add: [
      "If mindset, burnout risk, confidence, or emotional context materially affects the kind of collaborator the owner needs, add only a concise professional framing.",
      "If the owner needs a collaborator with a specific working style because of cognitive or emotional load, mention the working preference instead of private detail when possible.",
    ],
    remove: [
      "Remove therapy, diagnosis, emotional distress, burnout details, and similar psychological content from current_work, recent_problems, recent_wins, and owner_goals.",
      "Replace psychological detail with neutral working preferences, for example async communication, lower meeting load, or structured collaboration.",
    ],
  },
};

function normalizeTopics(topics: string[]): string[] {
  return [...new Set(topics.map((topic) => topic.trim()).filter(Boolean))].sort();
}

function listToSentence(items: string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function uniqueStrings(items: string[]): string[] {
  return [...new Set(items)];
}

export interface PrivacyChangePayload {
  summary: string;
  action: string;
  newly_excluded: string[];
  newly_allowed: string[];
  excluded_now: string[];
  shared_now: string[];
  review_fields: string[];
  recommended_additions: string[];
  recommended_removals: string[];
  requires_republish: boolean;
  suppress_search_until_republish: boolean;
}

export function buildPrivacyChangePayload(args: {
  previousExcludedTopics: string[];
  nextExcludedTopics: string[];
  allTopics: string[];
}): PrivacyChangePayload | null {
  const previousExcludedTopics = normalizeTopics(args.previousExcludedTopics);
  const nextExcludedTopics = normalizeTopics(args.nextExcludedTopics);
  const allTopics = normalizeTopics(args.allTopics);

  const unchanged =
    previousExcludedTopics.length === nextExcludedTopics.length &&
    previousExcludedTopics.every((topic, index) => topic === nextExcludedTopics[index]);

  if (unchanged) return null;

  const previousSet = new Set(previousExcludedTopics);
  const nextSet = new Set(nextExcludedTopics);

  const newlyExcluded = allTopics.filter((topic) => nextSet.has(topic) && !previousSet.has(topic));
  const newlyAllowed = allTopics.filter((topic) => !nextSet.has(topic) && previousSet.has(topic));
  const sharedNow = allTopics.filter((topic) => !nextSet.has(topic));

  const recommendedAdditions = uniqueStrings(
    newlyAllowed.flatMap((topic) => TOPIC_PLAYBOOK[topic]?.add ?? [])
  );
  const recommendedRemovals = uniqueStrings(
    newlyExcluded.flatMap((topic) => TOPIC_PLAYBOOK[topic]?.remove ?? [])
  );

  let summary = "Privacy sharing preferences changed. Re-publish your context so Gennety reflects the new allowed and excluded topics.";
  let action = "Read your latest privacy diff, update the profile fields listed below, and call publish_context immediately.";

  if (newlyExcluded.length > 0 && newlyAllowed.length === 0) {
    summary = `Privacy tightened. Stop sharing ${listToSentence(newlyExcluded)} immediately and remove those details from any published profile fields.`;
    action = "Remove the newly excluded topics from your published context, then call publish_context immediately.";
  } else if (newlyAllowed.length > 0 && newlyExcluded.length === 0) {
    summary = `Privacy opened up. You may now share ${listToSentence(newlyAllowed)} if it materially improves matching.`;
    action = "Review the newly allowed topics, add only the details that improve matching quality, then call publish_context.";
  } else if (newlyExcluded.length > 0 && newlyAllowed.length > 0) {
    summary = `Privacy preferences changed in both directions. Stop sharing ${listToSentence(newlyExcluded)} and you may now share ${listToSentence(newlyAllowed)} where it improves matching.`;
    action = "Remove newly excluded details, consider adding newly allowed details that sharpen fit, then call publish_context immediately.";
  }

  return {
    summary,
    action,
    newly_excluded: newlyExcluded,
    newly_allowed: newlyAllowed,
    excluded_now: nextExcludedTopics,
    shared_now: sharedNow,
    review_fields: [...PROFILE_FIELDS_TO_REVIEW],
    recommended_additions: recommendedAdditions,
    recommended_removals: recommendedRemovals,
    requires_republish: true,
    suppress_search_until_republish: newlyExcluded.length > 0,
  };
}
