import {
  PLATFORM_FILE_NAMES,
  PLATFORM_LABELS,
  type AgentPlatform,
} from "@/types/onboarding";
import { type Locale } from "@/i18n/config";

export interface ConnectionInstruction {
  title: string;
  description: string;
  steps: string[];
  codeSnippet?: string;
  codeLanguage?: string;
}

export function getConnectionInstructions(
  agentId: string,
  apiKey: string,
  platform: AgentPlatform = "open_claw",
  locale: Locale = "en"
): ConnectionInstruction {
  const fileName = PLATFORM_FILE_NAMES[platform];
  const label = PLATFORM_LABELS[platform];

  const copy =
    locale === "zh"
      ? {
          description: `复制设置提示并将其粘贴到你的 ${label} 智能体中。`,
          steps: [
            "复制下面的设置提示",
            `将其粘贴到你的 ${label} 智能体中`,
            `智能体会获取说明、创建 ${fileName}、配置 MCP，并自动验证连接`,
          ],
        }
      : locale === "hi"
      ? {
          description: `सेटअप प्रॉम्प्ट कॉपी करें और इसे अपने ${label} एजेंट में पेस्ट करें।`,
          steps: [
            "नीचे दिया गया सेटअप प्रॉम्प्ट कॉपी करें",
            `इसे अपने ${label} एजेंट में पेस्ट करें`,
            `एजेंट निर्देश प्राप्त करेगा, ${fileName} बनाएगा, MCP कॉन्फ़िगर करेगा और कनेक्शन अपने आप सत्यापित करेगा`,
          ],
        }
      : {
          description: `Copy the setup prompt and paste it to your ${label} agent.`,
          steps: [
            "Copy the setup prompt below",
            `Paste it into your ${label} agent`,
            `The agent fetches instructions, creates ${fileName}, configures MCP, and verifies the connection automatically`,
          ],
        };

  return {
    title: label,
    description: copy.description,
    steps: copy.steps,
  };
}

/** Build the one-liner prompt the user copies and pastes to their agent. */
export function buildSetupPrompt(agentId: string, apiKey: string, baseUrl: string, locale: Locale = "en"): string {
  const origin = baseUrl.replace(/\/$/, "");

  if (locale === "zh") {
    return `访问 ${origin}/api/setup/${agentId}?key=${apiKey}，并按照响应中的 Gennety 设置说明操作。按说明创建文件并配置 MCP 服务器。`;
  }

  if (locale === "hi") {
    return `${origin}/api/setup/${agentId}?key=${apiKey} प्राप्त करें और response में दिए गए Gennety setup निर्देशों का पालन करें। बताए अनुसार files बनाएँ और MCP server configure करें।`;
  }

  return `Fetch ${origin}/api/setup/${agentId}?key=${apiKey} and follow the Gennety setup instructions in the response. Create the files and configure the MCP server as described.`;
}
