// Verifies run-local chat history and independent concurrent branch context.
import assert from "node:assert/strict";
import test from "node:test";
import type { ChatMessage, LlmTransport } from "../../../llm.js";
import { createContextualLlmTransport, withConversationBranch } from "./conversation-context.js";

async function request(transport: LlmTransport, prompt: string) {
  let output = "";
  for await (const chunk of transport.streamChatCompletion({
    providerSettings: { apiBaseUrl: "https://example.test", apiKey: "test", model: "test" },
    messages: [{ role: "system", content: "JSON only" }, { role: "user", content: prompt }],
  })) output += chunk;
  return output;
}

test("subsequent calls resend prior assistant and user turns", async () => {
  const calls: ChatMessage[][] = [];
  const base: LlmTransport = {
    async *streamChatCompletion(input) {
      calls.push(input.messages);
      yield calls.length === 1 ? '{"draft":true}' : '{"draft":false}';
    },
  };
  const context = createContextualLlmTransport(base);
  await request(context.transport, "Generate model");
  await request(context.transport, "Fix invalid relationship");
  assert.deepEqual(calls[1]?.map((message) => message.role), ["system", "user", "assistant", "user"]);
  assert.equal(calls[1]?.[2]?.content, '{"draft":true}');
});

test("parallel diagram branches do not see sibling output and merge only validated summaries", async () => {
  const calls: Array<{ branch: string; messages: ChatMessage[] }> = [];
  const base: LlmTransport = {
    async *streamChatCompletion(input) {
      const prompt = String(input.messages.at(-1)?.content);
      calls.push({ branch: prompt, messages: input.messages });
      yield prompt;
    },
  };
  const context = createContextualLlmTransport(base);
  await request(context.transport, "Shared rules");
  await Promise.all([
    withConversationBranch("usecase", () => request(context.transport, "Use case")),
    withConversationBranch("class", () => request(context.transport, "Class")),
  ]);
  assert.equal(JSON.stringify(calls[1]?.messages).includes("Class"), false);
  assert.equal(JSON.stringify(calls[2]?.messages).includes("Use case"), false);
  context.commitValidatedBranch("usecase", "Validated use case model");
  await request(context.transport, "Next stage");
  assert.match(JSON.stringify(calls.at(-1)?.messages), /Validated use case model/);
  assert.doesNotMatch(JSON.stringify(calls.at(-1)?.messages), /已验证子任务 class/);
});

test("queued parallel branches keep the common history even after another branch commits", async () => {
  const calls: ChatMessage[][] = [];
  const context = createContextualLlmTransport({ async *streamChatCompletion(input) {
    calls.push(input.messages);
    yield "validated output";
  } });
  await request(context.transport, "Shared rules");
  context.forkBranches(["first", "queued"]);
  await withConversationBranch("first", () => request(context.transport, "First diagram"));
  context.commitValidatedBranch("first", "First validated diagram");
  await withConversationBranch("queued", () => request(context.transport, "Queued diagram"));
  assert.doesNotMatch(JSON.stringify(calls.at(-1)), /First validated diagram/);
  assert.match(JSON.stringify(calls.at(-1)), /Shared rules/);
});
