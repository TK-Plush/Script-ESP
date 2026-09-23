// CineForge AI — Smart chat brain API
// Uses an LLM (OpenAI-compatible) when a key is configured,
// otherwise the built-in offline CineBrain engine. Always answers, always free.

import { createSystemPrompt, smartReply, summarizeMemory, extractCharacters } from "../../../lib/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

const API_KEY = process.env.OPENAI_API_KEY || "";
const HAS_KEY = API_KEY && API_KEY.length > 8 && !/YOUR|XXX|PLACEHOLDER|changeme/i.test(API_KEY);
const BASE_URL = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

async function llmChat(messages, characters, userName) {
  const system = createSystemPrompt(userName, characters);
  const full = [{ role: "system", content: system }, ...messages.slice(-16)];
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: full,
      temperature: 0.85,
      max_tokens: 1400,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`LLM ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
  return content;
}

export async function POST(req) {
  try {
    const { messages = [], characters = [], userName = "Writer", memory = "" } = await req.json();

    if (!messages.length) return json({ error: "No messages" }, 400);

    // Auto-extract characters the model may have introduced (kept in Memory tab)
    const lastUserMsg = [...messages].filter((m) => m.role === "user").slice(-1)[0];
    const autoChars = lastUserMsg ? extractCharacters(lastUserMsg.content || "") : [];
    const autoSave = autoChars.length ? autoChars[0] : null;

    if (HAS_KEY) {
      try {
        const content = await llmChat(messages, characters, userName);
        return json({ content, autoSaveCharacter: autoSave, engine: "llm", suggestions: [] });
      } catch (e) {
        // fall through to offline engine
        console.warn("LLM failed, using offline engine:", e.message);
      }
    }

    const mem = memory || summarizeMemory(messages);
    const out = smartReply(messages, characters, mem);
    return json({
      content: out.content,
      autoSaveCharacter: out.autoSaveCharacter || autoSave,
      engine: "offline",
      suggestions: out.suggestions || [],
    });
  } catch (e) {
    return json({ error: String(e && e.message ? e.message : e) }, 500);
  }
}