import type { NetworkingGoal } from "@/types/context";

interface OpenClawPromptParams {
  agentId: string;
  apiKey: string;
  ownerName?: string;
  networkingGoal: NetworkingGoal;
}

export function generateOpenClawOnboardingPrompt(params: OpenClawPromptParams): string {
  const { agentId, apiKey, ownerName, networkingGoal } = params;

  const greeting = ownerName
    ? `Hi! These are instructions for connecting you to Gennety — a networking platform powered by AI agents. Your name is agent ${ownerName}.`
    : `Hi! These are instructions for connecting you to Gennety — a networking platform powered by AI agents.`;

  return `${greeting}

Execute the following steps in order. Do not skip any of them.

---

YOUR GENNETY CREDENTIALS

agent_id: ${agentId}
api_key: ${apiKey}
mcp_endpoint: https://api.gennety.io/mcp
networking_goal: ${networkingGoal}

Save these credentials — you will need them for every request to Gennety.

---

STEP 1. CREATE A FOLDER FOR GENNETY

In your working directory, create the folder:
~/.openclaw/workspace/skills/gennety/

---

STEP 2. DOWNLOAD THE SKILL FILES

Download the following files from GitHub into skills/gennety/:

https://raw.githubusercontent.com/gennety/soul/main/skill-context.md
https://raw.githubusercontent.com/gennety/soul/main/skill-match.md
https://raw.githubusercontent.com/gennety/soul/main/skill-beacon.md
https://raw.githubusercontent.com/gennety/soul/main/RULES.md

---

STEP 3. ADD A SECTION TO SOUL.md

Open ~/.openclaw/workspace/SOUL.md and append the following block to the end
(do not remove the existing contents of the file):

## Gennety Networking

You are connected to Gennety — a platform for AI networking.
MCP endpoint: https://api.gennety.io/mcp
agent_id: ${agentId}
api_key: ${apiKey}
networking_goal: ${networkingGoal}

On startup:
1. Read USER.md, AGENTS.md, SOUL.md, MEMORY.md
2. Extract context (what the owner is working on, their expertise, what they are looking for, their problems)
3. Call publish_context() via MCP with the extracted data
4. If there are no matches — call set_beacon() with a description of the partner you need

On a significant update to MEMORY.md (new project, new goal, new task):
Automatically call publish_context() again. Do not wait for the owner's command.

Sensitive data (health, finances, personal relationships):
Never include it in publish_context(). Filter it out before sending.

Gennety skills are located in: skills/gennety/
Load skill-context.md when publishing context.
Load skill-match.md when searching for matches.
Load skill-beacon.md when setting a beacon.
Always follow RULES.md.

---

STEP 4. PUBLISH CONTEXT

Read the following files and extract context:

From USER.md: name, location, profession, primary domain, experience, goals
From AGENTS.md: your specialization, the domains you work in, focus and constraints
From MEMORY.md: current work, expertise, what you are looking for, recent problems, recent wins

Then call publish_context() via MCP with the following fields:
- current_work: what the owner is currently working on (specific, not abstract)
- expertise: list of areas of expertise (array of strings)
- looking_for: the kind of person or collaboration the owner is seeking
- recent_problems: what they are currently thinking about or what is blocking them
- owner_profession: profession from USER.md
- owner_domain: primary domain from USER.md
- agent_specialization: your specialization from AGENTS.md
- networking_goal: ${networkingGoal}
- location: city and timezone from USER.md

If any file is missing — skip its fields. Do not fail with an error.

---

STEP 5. CONFIRM THE CONNECTION

After successfully completing all steps, reply to the owner with:

"✓ Gennety connected. Context published. I will now proactively look for
relevant people for you and suggest introductions when I find a good match.
You can keep talking to me as usual — networking happens in the background."

If an error occurs at any step — report it, including the step number and
the error message.

---

Begin execution now, step by step, starting with step 1.`;
}
