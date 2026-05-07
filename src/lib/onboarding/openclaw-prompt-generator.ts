import type { NetworkingGoal } from "@/types/context";
import { type Locale } from "@/i18n/config";
import {
  buildOpenClawBridgeConfig,
  getOpenClawBridgePaths,
} from "@/lib/onboarding/openclaw-bridge";

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
  const { bridgeConfigPath, bridgeDocsUrl, bridgeScriptUrl, wakeStreamUrl, appOrigin } =
    getOpenClawBridgePaths();
  const statusUrl = `${appOrigin}/api/setup/${agentId}/wake`;
  const bridgeConfig = buildOpenClawBridgeConfig({ agentId, apiKey });
  const installCommand = [
    "mkdir -p ~/.config/gennety",
    `curl -fsSL ${bridgeScriptUrl} -o ~/.config/gennety/gennety-openclaw-bridge.mjs`,
  ].join("\n");
  const startCommand = [
    "nohup node ~/.config/gennety/gennety-openclaw-bridge.mjs \\",
    `  --config ${bridgeConfigPath} \\`,
    "  >/tmp/gennety-openclaw-bridge.log 2>&1 &",
  ].join("\n");

  if (locale === "zh") {
    const ownerLine = ownerName ? `你的主人是 ${ownerName}。` : `你正在为你的主人工作。`;
    return `请为 Gennety 配置 Gennety OpenClaw Bridge。${ownerLine}

目标

- 不要暴露公网入口；不要配置 Tailscale Funnel 或 \`POST /hooks/wake\`
- 使用本地 bridge 保持到 Gennety 的 outbound realtime 连接
- 当收到 \`wake\` 或 \`resync\` 时，bridge 必须立刻调用 \`check_in(agent_id)\`
- owner-facing 事件要走 OpenClaw 的原生消息/agent turn 路径
- 保留普通 \`check_in\` 轮询作为 fallback

连接信息

- Agent ID: \`${agentId}\`
- Wake stream: \`${wakeStreamUrl}\`
- Bridge 脚本: \`${bridgeScriptUrl}\`
- Bridge 文档: \`${bridgeDocsUrl}\`
- 配置文件: \`${bridgeConfigPath}\`

完成步骤

1. 保持现有 MCP 连接不变。
2. 下载 bridge 脚本：

\`\`\`bash
${installCommand}
\`\`\`

3. 把下面配置原样写入 \`${bridgeConfigPath}\`：

\`\`\`json
${bridgeConfig}
\`\`\`

4. 在后台启动 bridge：

\`\`\`bash
${startCommand}
\`\`\`

5. bridge 运行后，应当自动：
   - 打开 wake stream
   - 在 \`connected\`、\`wake\`、\`resync\` 时执行 \`check_in\`
   - 把 owner-facing 事件通过 OpenClaw 的默认输出通道发给主人
   - 仅在成功交付后调用 \`ack_inbox\`
6. 如果连接断开，使用指数退避自动重连；如果 stream 暂时不可用，就继续普通 polling。
7. 可用下面接口读取状态：
   \`${statusUrl}\`

只有在 bridge 已经启动并连接成功后，才向主人报告完成；如果失败，报告精确的失败步骤和错误。`;
  }

  if (locale === "hi") {
    const ownerLine = ownerName ? `आपके मालिक ${ownerName} हैं।` : `आप अपने मालिक के लिए काम कर रहे हैं।`;
    return `कृपया Gennety OpenClaw Bridge configure करें। ${ownerLine}

लक्ष्य

- कोई public inbound URL expose न करें; Tailscale Funnel या \`POST /hooks/wake\` की जरूरत नहीं है
- local bridge के माध्यम से Gennety की तरफ outbound realtime connection रखें
- \`wake\` या \`resync\` event मिलते ही bridge तुरंत MCP \`check_in(agent_id)\` call करे
- owner-facing events OpenClaw के native message/agent turn path से जाएँ
- सामान्य \`check_in\` polling fallback बनी रहे

Connection

- Agent ID: \`${agentId}\`
- Wake stream: \`${wakeStreamUrl}\`
- Bridge script: \`${bridgeScriptUrl}\`
- Bridge docs: \`${bridgeDocsUrl}\`
- Config path: \`${bridgeConfigPath}\`

कदम

1. मौजूदा MCP connection को न बदलें।
2. bridge script डाउनलोड करें:

\`\`\`bash
${installCommand}
\`\`\`

3. नीचे दिया गया config ठीक इसी रूप में \`${bridgeConfigPath}\` पर लिखें:

\`\`\`json
${bridgeConfig}
\`\`\`

4. bridge को background में शुरू करें:

\`\`\`bash
${startCommand}
\`\`\`

5. bridge शुरू होने के बाद उसे अपने आप:
   - wake stream खोलना है
   - \`connected\`, \`wake\`, और \`resync\` पर \`check_in\` चलाना है
   - owner-facing events को OpenClaw के default output channel से भेजना है
   - delivery सफल होने के बाद ही \`ack_inbox\` करना है
6. connection टूटने पर exponential backoff से reconnect करें। stream unavailable हो तो normal polling जारी रखें।
7. status पढ़ना हो तो:
   \`${statusUrl}\`

bridge चलने और connect होने के बाद ही मालिक को success report करें। अगर कुछ fail हो, exact error बताएं।`;
  }

  const ownerLine = ownerName
    ? `Your owner is ${ownerName}.`
    : `You are doing this on behalf of your owner.`;

  return `Configure the Gennety OpenClaw Bridge. ${ownerLine}

Goal

- Do not expose a public inbound URL. Do not set up Tailscale Funnel or \`POST /hooks/wake\`.
- Run the local Gennety bridge so OpenClaw keeps a persistent outbound realtime connection to Gennety.
- On every \`wake\` or \`resync\`, the bridge must call MCP \`check_in(agent_id)\` immediately.
- Route owner-facing Gennety events through OpenClaw's native delivery path.
- Keep normal \`check_in\` polling as the fallback.

Requirements

1. Do not break the existing MCP connection.
2. Do not ask the owner for a public URL. This setup is outbound-only.
3. If the bridge cannot open the stream, keep polling with \`check_in\` and report the exact error.

Connection

- Agent ID: \`${agentId}\`
- Wake stream: \`${wakeStreamUrl}\`
- Bridge script: \`${bridgeScriptUrl}\`
- Bridge docs: \`${bridgeDocsUrl}\`
- Config path: \`${bridgeConfigPath}\`

Steps

1. Leave the existing MCP server configuration unchanged.
2. Download the bridge script:

\`\`\`bash
${installCommand}
\`\`\`

3. Write this exact config to \`${bridgeConfigPath}\`:

\`\`\`json
${bridgeConfig}
\`\`\`

4. Start the bridge in the background:

\`\`\`bash
${startCommand}
\`\`\`

5. Once running, the bridge should automatically:
   - open the wake stream
   - call \`check_in\` on \`connected\`, \`wake\`, and \`resync\`
   - route owner-facing events back to your owner through OpenClaw's default delivery path
   - call \`ack_inbox\` only after delivery succeeds
6. On disconnect or HTTP/network failure, reconnect automatically with exponential backoff and keep using \`next_check_in_ms\` for fallback polling.
7. You can read status at:
   \`${statusUrl}\`

Report back to the owner only after the bridge is running, or if you must fall back to polling because the bridge could not open the stream.`;
}
