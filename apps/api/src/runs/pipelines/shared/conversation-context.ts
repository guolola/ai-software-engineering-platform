// Keeps standard chat message history within one run and isolates concurrent diagram branches.
import { AsyncLocalStorage } from "node:async_hooks";
import type { ChatMessage, LlmTransport } from "../../../llm.js";

const scope = new AsyncLocalStorage<string>();
const MAX_HISTORY_CHARS = 64000;

function contentSize(message: ChatMessage) {
  return typeof message.content === "string"
    ? message.content.length
    : message.content.reduce((size, part) => size + (part.type === "text" ? part.text.length : 256), 0);
}

function compact(messages: ChatMessage[], validatedSummaries: string[] = []) {
  if (messages.reduce((size, message) => size + contentSize(message), 0) <= MAX_HISTORY_CHARS) {
    return messages;
  }
  const system = messages.find((message) => message.role === "system");
  // Earlier branches are represented by validated results; keep the latest two raw turns.
  const recent = messages.filter((message) => message !== system).slice(-4).map((message, index): ChatMessage => {
    if (index === 3 || typeof message.content !== "string" || message.content.length <= 8000) return message;
    return { ...message, content: `${message.content.slice(0, 8000)}\n...[较长内容已压缩]` };
  });
  const omitted = messages.length - recent.length - Number(Boolean(system));
  const validated = validatedSummaries.join("\n").slice(-8000);
  return [
    ...(system ? [system] : []),
    { role: "user" as const, content: `较早的 ${omitted} 条对话已压缩。已验证结果：\n${validated || "无"}\n请以本轮权威输入和最近的结果为准。` },
    ...recent,
  ];
}

export function withConversationBranch<T>(id: string, work: () => Promise<T>): Promise<T> {
  return scope.run(id, work);
}

export function createContextualLlmTransport(transport: LlmTransport) {
  const histories = new Map<string, ChatMessage[]>();
  const validated = new Map<string, string>();
  const contextual: LlmTransport = {
    async *streamChatCompletion(input) {
      const id = scope.getStore() ?? "main";
      const history = histories.get(id) ?? (id === "main" ? [] : [...(histories.get("main") ?? [])]);
      const incoming = input.messages.filter((message) => message.role !== "system");
      const stageSystem = input.messages.find((message) => message.role === "system");
      const system = history.find((message) => message.role === "system") ?? stageSystem;
      const next = compact([
        ...(system ? [system] : []),
        ...history.filter((message) => message.role !== "system").map((message): ChatMessage =>
          Array.isArray(message.content)
            ? { ...message, content: message.content.filter((part) => part.type !== "image_url") }
            : message),
        ...(stageSystem && stageSystem.content !== system?.content
          ? [{ role: "user" as const, content: `本阶段约束：${stageSystem.content}` }]
          : []),
        ...incoming,
      ], [...validated.entries()].map(([branchId, summary]) => `${branchId}: ${summary}`));
      let output = "";
      for await (const chunk of transport.streamChatCompletion({ ...input, messages: next })) {
        output += chunk;
        yield chunk;
      }
      histories.set(id, [...next, { role: "assistant", content: output }]);
    },
  };
  return {
    transport: contextual,
    forkBranches(ids: string[]) {
      const common = histories.get("main") ?? [];
      for (const id of ids) {
        if (!histories.has(id)) histories.set(id, [...common]);
      }
    },
    commitValidatedBranch(id: string, summary: string) {
      if (validated.get(id) === summary) return;
      validated.set(id, summary);
      const main = histories.get("main") ?? [];
      histories.set("main", compact([...main, { role: "user", content: `已验证子任务 ${id} 的结果：${summary}` }], [...validated.entries()].map(([branchId, value]) => `${branchId}: ${value}`)));
    },
  };
}
