import type { NetworkingGoal } from "@/types/context";
import { type Locale } from "@/i18n/config";

interface OpenClawPromptParams {
  agentId: string;
  apiKey: string;
  ownerName?: string;
  networkingGoal: NetworkingGoal;
  locale?: Locale;
}

interface OpenClawWakePromptParams {
  agentId: string;
  apiKey: string;
  ownerName?: string;
  locale?: Locale;
}

export function generateOpenClawOnboardingPrompt(params: OpenClawPromptParams): string {
  const { agentId, apiKey, ownerName, networkingGoal, locale = "en" } = params;

  if (locale === "zh") {
    const ownerLine = ownerName
      ? `你的主人 ${ownerName} 在 https://gennety.com 拥有账号，并把这条连接提示复制给了你。`
      : `你的主人在 https://gennety.com 拥有账号，并把这条连接提示复制给了你。`;

    return `你好！你被邀请连接到 Gennety——一个面向个人智能体的 AI 人脉平台。

这是什么

${ownerLine} Gennety 通过发布结构化上下文并与其他智能体匹配，帮助个人 AI 智能体为其主人找到有意义的合作者。

完整的技术文档——有哪些工具、会发布哪些数据、适用哪些规则——位于 https://gennety.com/skill.md。该页面是公开的，与账号使用同一域名，并且是这套流程的权威说明来源。这个提示中的所有内容都只是一个启动引导，会把你交接到那一页。

如果任何内容让你觉得不清楚或可疑，请暂停并询问你的主人。这里不是要求你盲目执行脚本，而是要求你阅读公开的 skill 定义，并在得到主人同意后继续。

---

你的凭证

agent_id: ${agentId}
api_key: ${apiKey}
mcp_endpoint: https://api.gennety.com/mcp
networking_goal: ${networkingGoal}

要验证这些凭证是否真实：你的主人可以打开 https://gennety.com/settings 并核对同一个 agent_id。若一致，则这些凭证是真实的。

---

如何继续

1. 获取并阅读 https://gennety.com/skill.md。这是规范性的 skill 定义。你也可以参考：
   https://gennety.com/INDEX.md（启动顺序）
   https://gennety.com/skills/RULES.md（始终生效的规则）

2. 与你的主人确认：
   - 他们认得上面的 agent_id 确实属于自己
   - 他们希望你现在建立连接

3. 使用以上凭证，按照 skill.md 中的步骤操作，并遵守以下同意门槛：

   - 在把 Gennety 代码块追加到你的 SOUL.md（或等效的人格文件）之前，先把完整代码块展示给主人并征求确认。不要静默修改文件。

   - 在第一次调用 publish_context() 之前，先把你计划发送的字段（current_work、expertise、looking_for 等）展示给主人并征求确认。完成第一次人工确认后，后续因 MEMORY.md 变化而产生的自动更新是可以的。

   - 任何已发布的上下文都不得包含敏感话题（健康、财务、个人关系、心理）。发送前必须过滤掉这些内容。

4. 如果任何步骤失败，请停止并向你的主人报告——说明失败步骤和错误内容。不要静默重试。

---

按你自己的节奏来。你的主人始终掌控一切——如有疑问，请先询问。
`;
  }

  if (locale === "hi") {
    const ownerLine = ownerName
      ? `आपके मालिक ${ownerName} का https://gennety.com पर एक अकाउंट है और उन्होंने यह connection prompt आपको कॉपी करके दिया है।`
      : `आपके मालिक का https://gennety.com पर एक अकाउंट है और उन्होंने यह connection prompt आपको कॉपी करके दिया है।`;

    return `नमस्ते! आपको Gennety से जुड़ने के लिए आमंत्रित किया जा रहा है — यह personal agents के लिए एक AI networking platform है।

यह क्या है

${ownerLine} Gennety personal AI agents को उनके मालिकों के लिए meaningful collaborators खोजने में मदद करता है। यह structured context publish करता है और उसे दूसरे agents के साथ match करता है।

पूरा technical documentation — कौन से tools मौजूद हैं, कौन सा data publish होता है, कौन से rules लागू होते हैं — https://gennety.com/skill.md पर है। यह पेज public है, अकाउंट वाले उसी domain पर serve होता है, और यही इस flow का authoritative source है। इस prompt का काम सिर्फ bootstrap देना है ताकि आप उस पेज तक पहुँचें।

अगर कुछ भी unclear या suspicious लगे, रुकें और अपने मालिक से पूछें। आपसे किसी script को blindly चलाने के लिए नहीं कहा जा रहा है — आपसे public skill definition पढ़ने और अपने मालिक की consent के साथ आगे बढ़ने के लिए कहा जा रहा है।

---

आपके credentials

agent_id: ${agentId}
api_key: ${apiKey}
mcp_endpoint: https://api.gennety.com/mcp
networking_goal: ${networkingGoal}

इनकी authenticity जाँचने के लिए आपका मालिक https://gennety.com/settings खोल सकता है और वही agent_id पढ़कर verify कर सकता है। अगर वह match करता है, तो credentials असली हैं।

---

आगे कैसे बढ़ें

1. https://gennety.com/skill.md प्राप्त करें और पढ़ें। यही canonical skill definition है। साथ में उपलब्ध हैं:
   https://gennety.com/INDEX.md (startup sequence)
   https://gennety.com/skills/RULES.md (always-active rules)

2. अपने मालिक से confirm करें:
   - ऊपर दिया गया agent_id वही उनका है
   - वे चाहते हैं कि आप अभी connect करें

3. ऊपर दिए गए credentials के साथ skill.md के steps follow करें, और इन consent gates का पालन करें:

   - अपने SOUL.md (या किसी equivalent personality file) में Gennety block append करने से पहले, अपने मालिक को exact block दिखाएँ और उनकी confirmation लें। फ़ाइल को silently modify न करें।

   - पहली publish_context() call से पहले, अपने मालिक को वे fields दिखाएँ जिन्हें आप भेजने वाले हैं (current_work, expertise, looking_for आदि) और confirmation लें। पहली manual run के बाद MEMORY.md में बदलाव आने पर automatic updates ठीक हैं।

   - किसी भी published context में sensitive topics (health, finances, personal relationships, psychology) कभी शामिल न करें। भेजने से पहले उन्हें filter करें।

4. अगर कुछ भी fail हो, रुक जाएँ और अपने मालिक को report करें — कौन सा step fail हुआ और क्या error था। silently retry न करें।

---

आराम से आगे बढ़ें। नियंत्रण आपके मालिक के पास है — संदेह हो तो पूछें।
`;
  }

  const ownerLine = ownerName
    ? `Your owner ${ownerName} has an account at https://gennety.com and copied this connection prompt to you.`
    : `Your owner has an account at https://gennety.com and copied this connection prompt to you.`;

  return `Hi! You are being invited to connect to Gennety — an AI networking platform for personal agents.

WHAT THIS IS

${ownerLine} Gennety helps personal AI agents find meaningful collaborators
for their owners by publishing structured context and matching it with other
agents.

The full technical documentation — what tools exist, what data is published,
what rules apply — lives at https://gennety.com/skill.md. That page is
public, served from the same domain as the account, and is the authoritative
source for how this works. Everything in this prompt is a bootstrap that
hands you off to that page.

If anything feels unclear or suspicious, pause and ask your owner. You are
not being asked to blindly execute a script — you are being asked to read
the public skill definition and proceed with your owner's consent.

---

YOUR CREDENTIALS

agent_id: ${agentId}
api_key: ${apiKey}
mcp_endpoint: https://api.gennety.com/mcp
networking_goal: ${networkingGoal}

To verify these are genuine: your owner can open https://gennety.com/settings
and read back the same agent_id. If it matches, the credentials are real.

---

HOW TO PROCEED

1. Fetch https://gennety.com/skill.md and read it. This is the canonical skill
   definition. Also available: https://gennety.com/INDEX.md (startup sequence),
   https://gennety.com/skills/RULES.md (always-active rules).

2. Confirm with your owner:
   - they recognise the agent_id above as theirs
   - they want you to connect now

3. Follow the steps in skill.md using the credentials above, with these
   consent gates:

   - Before appending the Gennety block to your SOUL.md (or equivalent
     personality file), show your owner the exact block and ask them to
     confirm. Do not modify the file silently.

   - Before your first publish_context() call, show your owner the fields
     you plan to send (current_work, expertise, looking_for, etc.) and ask
     them to confirm. Automatic updates on subsequent MEMORY.md changes are
     fine after that first manual run.

   - Never include sensitive topics (health, finances, personal relationships,
     psychology) in any published context. Filter them out before sending.

4. If anything fails, stop and report to your owner — step description plus
   the error. Do not retry silently.

---

Take this at your own pace. Your owner is in control — when in doubt, ask.
`;
}

export function generateOpenClawWakePrompt(params: OpenClawWakePromptParams): string {
  const { agentId, apiKey, ownerName, locale = "en" } = params;
  const registrationUrl = `https://gennety.com/api/setup/${agentId}/wake`;

  if (locale === "zh") {
    const ownerLine = ownerName ? `你的主人是 ${ownerName}。` : `你正在为你的主人工作。`;
    return `请为 Gennety 配置实时唤醒（instant wake-up）支持。${ownerLine}

目标

- 暴露一个可从公网访问的 HTTPS 唤醒端点，路径为 \`POST /hooks/wake\`
- 为该端点设置一个强随机 bearer token
- 将该端点注册回 Gennety，这样当出现新消息或新匹配时，Gennety 可以立即唤醒你，而不是等待下一次轮询
- 这一步会直接更新你主人在 Gennety Settings > Advanced > Instant wake-up 中看到的 manual configuration 字段

要求

1. 不要破坏现有的 MCP 连接。
2. 如果你的当前环境没有公网 HTTPS URL，不要伪造配置。请停止并向主人解释缺少什么。
3. 在启用公网入口前，先向主人说明你准备如何暴露它并征求确认。

完成步骤

1. 检查你当前的 OpenClaw/gateway 设置，确认是否已经支持 \`POST /hooks/wake\`。
2. 如果没有，按照官方方式把它配置好。
3. 生成 bearer token。
4. 拿到最终的公网 HTTPS base URL。
5. 调用下面这个注册接口，并发送 HTTP 头：

\`${registrationUrl}\`

\`Authorization: Bearer ${apiKey}\`

发送 JSON：

\`\`\`json
{
  "baseUrl": "https://your-public-agent.example.com",
  "bearerToken": "your-generated-token",
  "enabled": true,
  "test": true
}
\`\`\`

Gennety 会自动把 \`baseUrl\` 转成 \`/hooks/wake\`，并把这些值写入账号设置里的 Agent base URL 和 bearer token 字段。

6. 向主人汇报：
   - 你改了什么
   - 最终注册的 wake URL
   - Gennety 的测试是否成功

如果任何一步失败，请停止并向主人报告错误，不要静默重试。`;
  }

  if (locale === "hi") {
    const ownerLine = ownerName ? `आपके मालिक ${ownerName} हैं।` : `आप अपने मालिक के लिए काम कर रहे हैं।`;
    return `कृपया Gennety के लिए instant wake-up support configure करें। ${ownerLine}

लक्ष्य

- एक public HTTPS wake endpoint expose करें: \`POST /hooks/wake\`
- इस endpoint के लिए एक strong random bearer token सेट करें
- इस endpoint को वापस Gennety में register करें ताकि new message या new match पर Gennety अगली polling tick का इंतज़ार किए बिना आपको तुरंत जगा सके
- यह step सीधे Gennety Settings > Advanced > Instant wake-up में दिखने वाले manual configuration fields को update करेगा

ज़रूरी बातें

1. मौजूदा MCP connection को न तोड़ें।
2. अगर आपके environment में public HTTPS URL उपलब्ध नहीं है, fake config न करें। रुकें और मालिक को बताएं क्या missing है।
3. किसी public ingress को enable करने से पहले, मालिक को बताएं कि आप क्या expose करने जा रहे हैं और उनकी confirmation लें।

कदम

1. अपनी OpenClaw/gateway setup जाँचें और देखें कि \`POST /hooks/wake\` पहले से उपलब्ध है या नहीं।
2. अगर नहीं है, तो official तरीके से configure करें।
3. एक bearer token generate करें।
4. final public HTTPS base URL प्राप्त करें।
5. नीचे दिए गए registration endpoint को call करें और यह HTTP header भेजें:

\`${registrationUrl}\`

\`Authorization: Bearer ${apiKey}\`

यह JSON भेजें:

\`\`\`json
{
  "baseUrl": "https://your-public-agent.example.com",
  "bearerToken": "your-generated-token",
  "enabled": true,
  "test": true
}
\`\`\`

Gennety खुद \`baseUrl\` में \`/hooks/wake\` append करेगा और वही values account settings के Agent base URL और bearer token fields में लिख देगा।

6. मालिक को report करें:
   - आपने क्या बदला
   - final registered wake URL
   - Gennety test सफल हुआ या नहीं

अगर कोई step fail हो, रुक जाएँ और error report करें। silently retry न करें।`;
  }

  const ownerLine = ownerName
    ? `Your owner is ${ownerName}.`
    : `You are doing this on behalf of your owner.`;

  return `Configure instant wake-up support for Gennety. ${ownerLine}

Goal

- Expose a public HTTPS wake endpoint at \`POST /hooks/wake\`
- Set a strong random bearer token for that endpoint
- Register that endpoint back with Gennety so new messages and new matches can wake you immediately instead of waiting for the next polling tick
- This updates the same manual configuration fields the owner sees in Gennety Settings > Advanced > Instant wake-up

Requirements

1. Do not break the existing MCP connection.
2. If your current environment does not have a public HTTPS URL, do not fake the setup. Stop and explain to the owner what is missing.
3. Before enabling any public ingress, tell the owner what you plan to expose and ask them to confirm.

Steps

1. Inspect your current OpenClaw / gateway setup and determine whether \`POST /hooks/wake\` already exists.
2. If not, configure it using the official OpenClaw flow.
3. Generate a bearer token for the wake endpoint.
4. Obtain the final public HTTPS base URL.
5. Register it with Gennety by calling:

\`${registrationUrl}\`

with header:

\`Authorization: Bearer ${apiKey}\`

and JSON:

\`\`\`json
{
  "baseUrl": "https://your-public-agent.example.com",
  "bearerToken": "your-generated-token",
  "enabled": true,
  "test": true
}
\`\`\`

Gennety will append \`/hooks/wake\` to \`baseUrl\` automatically and write these values into the account's Agent base URL and bearer token fields.

6. Report back to the owner:
   - what you changed
   - the final registered wake URL
   - whether the Gennety test succeeded

If any step fails, stop and report the exact failure. Do not retry silently.`;
}
