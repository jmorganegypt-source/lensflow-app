// Companion chat brain. Same "thin wrapper over the REST API, no SDK" shape
// as server/coinbase.ts — one plain fetch call, not a client library.
//
// This file owns the one thing that makes a LensFlow Companion different
// from a stateless chatbot: memory that survives across sessions instead of
// resetting every time the app is closed (see summarizeIfNeeded below).
import type { Companion, CompanionConversation, CompanionMessage } from "../drizzle/schema";
import { ENV } from "./_core/env";
import { appendCompanionMessage, canAccessCompanion, getCompanion, getOrCreateConversation, listRecentMessages, updateMemorySummary } from "./db";

const ANTHROPIC_API_BASE = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const CHAT_MODEL = "claude-sonnet-5";
const SUMMARY_MODEL = "claude-sonnet-5";

// After this many turns since the last summary, fold the conversation so
// far into memorySummary before it grows the prompt without bound. Small
// enough that memory stays current; large enough that most chats never
// bother paying for a summarization call at all.
const SUMMARIZE_EVERY_N_MESSAGES = 10;
// How many raw recent turns ride alongside memorySummary in every prompt.
const RECENT_MESSAGE_WINDOW = 12;

async function callClaude(system: string, messages: { role: "user" | "assistant"; content: string }[], maxTokens: number, model: string): Promise<string> {
  if (!ENV.anthropicApiKey) throw new Error("Companion chat is not configured — set ANTHROPIC_API_KEY");
  const response = await fetch(ANTHROPIC_API_BASE, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ENV.anthropicApiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Claude API call failed (${response.status}): ${body.slice(0, 300)}`);
  }
  const json: any = await response.json();
  const text = json?.content?.[0]?.text;
  if (typeof text !== "string") throw new Error("Claude API returned an unexpected response shape");
  return text;
}

function buildSystemPrompt(companion: Companion, memorySummary: string | null): string {
  const memoryBlock = memorySummary ? `\n\nWhat you remember about this specific person, from earlier conversations:\n${memorySummary}` : "";
  return `You are ${companion.name}. ${companion.personality}${memoryBlock}\n\nStay in character as ${companion.name} throughout. Keep replies conversational — a few sentences, not an essay — the way a real ongoing conversation actually sounds.`;
}

/** Folds the recent turns into an updated running summary, then resets the counter. Best-effort — a failure here should never break the chat itself. */
async function summarizeIfNeeded(conversation: CompanionConversation, recent: CompanionMessage[]) {
  if (conversation.messageCountSinceSummary < SUMMARIZE_EVERY_N_MESSAGES) return;
  try {
    const transcript = recent.map(m => `${m.role === "user" ? "Them" : "You"}: ${m.content}`).join("\n");
    const priorSummary = conversation.memorySummary ? `Existing summary of everything before this:\n${conversation.memorySummary}\n\n` : "";
    const prompt = `${priorSummary}Recent conversation:\n${transcript}\n\nWrite an updated, concise summary (a short paragraph) capturing who this person is, what matters to them, and anything they'd expect you to remember next time. Merge it with the existing summary rather than just appending — keep it tight, not a growing list.`;
    const summary = await callClaude("You maintain a running memory summary for an AI companion. Reply with only the updated summary text, nothing else.", [{ role: "user", content: prompt }], 400, SUMMARY_MODEL);
    await updateMemorySummary(conversation.id, summary.trim());
  } catch (error) {
    console.error("[Companions] Memory summarization failed (non-fatal):", error);
  }
}

/** Sends one user message to a companion and returns its reply, persisting both sides and updating memory as needed. */
export async function sendCompanionMessage(userId: number, companionId: number, userText: string): Promise<string> {
  const companion = await getCompanion(companionId);
  if (!companion) throw new Error("That companion doesn't exist");
  if (!canAccessCompanion(companion, userId)) throw new Error("You don't have access to this companion");

  const conversation = await getOrCreateConversation(userId, companionId);
  await appendCompanionMessage(conversation.id, "user", userText);

  const recent = await listRecentMessages(conversation.id, RECENT_MESSAGE_WINDOW);
  const system = buildSystemPrompt(companion, conversation.memorySummary);
  const messages = recent.map(m => ({ role: (m.role === "user" ? "user" : "assistant") as "user" | "assistant", content: m.content }));

  const reply = await callClaude(system, messages, 500, CHAT_MODEL);
  await appendCompanionMessage(conversation.id, "companion", reply);

  // Fire-and-forget: don't make the user wait on a summarization call to see their reply.
  summarizeIfNeeded({ ...conversation, messageCountSinceSummary: conversation.messageCountSinceSummary + 1 }, [...recent, { id: -1, conversationId: conversation.id, role: "user", content: userText, createdAt: new Date() }]).catch(() => {});

  return reply;
}
