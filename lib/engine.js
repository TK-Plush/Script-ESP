// CineForge AI — Smart movie-brain engine
// Pure JS, works server-side (Node) and client-side. Used directly when no
// LLM API key is configured, and as the offline fallback when the API fails.

const CINEMATIC_TONES = [
  "cinematic, film grain, anamorphic lens, shallow depth of field",
  "blockbuster quality, epic lighting, dynamic composition, HDR",
  "moody, atmospheric, volumetric light, 35mm film look",
  "ultra-realistic, 8k detail, dramatic color grade, slow dolly shot",
];

export function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function enhancePrompt(prompt, characters = [], opts = {}) {
  const tone = pick(CINEMATIC_TONES);
  const cast = characters.length
    ? ` Cast: ${characters
        .map((c) => `${c.name} (${c.appearance || "detailed character"})`)
        .join(", ")}.`
    : "";
  const style = opts.style ? ` Style: ${opts.style}.` : "";
  const camera = opts.camera ? ` Camera: ${opts.camera}.` : "";
  if (opts.raw) return prompt;
  return `${prompt.trim()} ${tone}.${cast}${style}${camera}`;
}

// Detect screenplay character names: "NAME" followed by dialogue in SCREENPLAY blocks.
export function extractCharacters(text) {
  const chars = {};
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const m = line.match(/^([A-Z][A-Z0-9 .'\u00C0-\u024F-]{1,32})\s*:\s*[\u201c"].{2,}/);
    if (m) {
      const name = m[1].trim();
      const key = name.toLowerCase();
      if (!chars[key]) {
        chars[key] = {
          name: name.replace(/\s+/g, " ").trim(),
          role: "Cast member",
          personality: "",
          appearance: "",
          backstory: "",
          voice: "",
          source: "script",
        };
      }
    }
    const m2 = line.match(/(?:character|cast member|actor|actress|role)[:\-]?\s+([A-Za-z][A-Za-z .'-]{1,40})/i);
    if (m2) {
      const name = m2[1].trim().replace(/[.,;]$/, "");
      const key = name.toLowerCase();
      if (!chars[key]) {
        chars[key] = {
          name,
          role: "Cast member",
          personality: "",
          appearance: "",
          backstory: "",
          voice: "",
          source: "mention",
        };
      }
    }
  }
  return Object.values(chars);
}

// Builds the movie-specific system prompt, injecting character memory.
export function createSystemPrompt(userName, characters = []) {
  const cast = characters.length
    ? characters
        .map(
          (c) =>
            `- ${c.name} | role: ${c.role || "unknown"} | looks: ${c.appearance || "not set"} | personality: ${c.personality || "not set"} | backstory: ${c.backstory || "not set"} | voice: ${c.voice || "not set"}`
        )
        .join("\n")
    : "None saved yet. Suggest characters as stories develop.";
  return `You are CineBrain, the world's sharpest AI movie-making director and screenwriter, embedded in CineForge — a totally FREE, unlimited AI video studio powered by ByteDance Seedance models.

User: ${userName}

SAVED CHARACTER MEMORY (always keep consistent when they appear):
${cast}

When the user writes a story or scene:
1. Respond like an expert screenwriter/director (beat sheets, conflict, dialogue).
2. Write SCREENPLAY format when relevant: INT./EXT. headers, CHARACTER: dialogue, action lines.
3. If the user seems to WANT A VIDEO, provide one or more ready-to-use Seedance video prompts, each in a block marked "VIDEO PROMPT:".
4. NEVER mention that you are a fallback or offline engine. Never discuss pricing. Everything is FREE FOREVER, no credits.
5. Keep answers practical and cinematic. Use markdown with clean structure.`;

  // Ha — skipped nothing. Keep on task.
}

// The offline "smart brain": intent detection + structured cinematic replies.
export function smartReply(messages, characters = [], memory = "") {
  const last = [...messages].filter((m) => m.role !== "system").slice(-1)[0];
  const text = (last && last.content) || "";
  const t = text.toLowerCase();

  const isShotOrStoryboard = /shot ?list|story ?board|storyboard|break ?down|breaking down|shots for/.test(t);
  const isScript = /screenplay|script|write a scene|write a movie|scene:|write the|write.*dialogue/.test(t);
  const isEnhance = /enhance|improve.*prompt|better prompt|make.*prompt.*better|rewrite.*prompt/.test(t);
  const isBrainstorm = /idea|brainstorm|concept|pitch|premise|plot/.test(t);
  const isCharacter = /character|cast member|actor|actress|character card/.test(t) && !isScript;
  const isGenVideo = /video prompt|seedance|want.*video|make.*video|generate.*video/.test(t);
  const isGreeting = /^(hi|hello|hey|yo|sup|greetings)[\s!.]{0,5}$/i.test(t);
  const wantsHelp = /\?$/.test(t) || /help|how do i|how to|what can/.test(t);

  const greetingReplies = [
    `Hey writer! I'm CineBrain — your director + script partner inside CineForge. I can:
- 📝 Write full **screenplays** (scenes, dialogue, action lines)
- 🎬 Break stories into **shot lists / storyboards**
- ✨ Turn any idea into a **Seedance-ready video prompt**
- 🧠 Remember your **characters** so they stay consistent across scenes

Try: *"Write a scene where a detective confronts the thief in a neon diner at midnight."*`,
    `Ready when you are. Pitch me a story — one line is enough. I'll turn it into a screenplay, shot list, and ready-to-run Seedance video prompts.`,
  ];
  if (isGreeting) return { content: pick(greetingReplies), suggestions: [] };

  // ——— Shot list / storyboard ———
  if (isShotOrStoryboard && text.length > 8) {
    const shots = buildShots(text);
    const content =
      `## 🎬 Shot List & Storyboard\n\n${shots.shots
        .map(
          (s, i) =>
            `**${i + 1}. ${s.type} — ${s.angle}**\n> ${s.action}\n\n` +
            `\`\`\`\nVIDEO PROMPT: ${s.prompt}\n\`\`\`\n`
        )
        .join("\n")}\n> 💡 Paste any **VIDEO PROMPT** into the **Generate** tab and pick a Seedance model. Everything is FREE — no credits, no limits.`;
    return { content, suggestions: shots.map((s) => ({ label: `Send shot ${s.type} to video`, prompt: s.prompt })) };
  }

  // ——— Enhance prompt ———
  if (isEnhance) {
    const base = text.replace(/enhance|improve.*prompt|better prompt|make.*prompt.*better|rewrite.*prompt/gi, "").replace(/^[:\s]+/, "").trim() || "cinematic scene";
    const enhanced = enhancePrompt(base, characters);
    const variants = [1, 2, 3].map(() => enhancePrompt(base, characters));
    const content =
      `## ✨ Enhanced Seedance Prompt\n\n\`\`\`\n${enhanced}\n\`\`\`\n\n**More variants:**\n${variants
        .map((v, i) => `${i + 1}. \`${v}\``)
        .join("\n")}\n\n> Send it to the **Generate** tab to render instantly — free forever.`;
    return { content, suggestions: [{ label: "Enhance more", prompt: enhanced }] };
  }

  // ——— Character work ———
  if (isCharacter && text.length > 8) {
    const nameMatch = text.match(/(?:for|about|create|make|write|new\s+character|character)\s+([A-Z][A-Za-z .'-]{1,40})/);
    const name = nameMatch ? nameMatch[1].replace(/[.,;!?]$/, "") : "New Character";
    const card = {
      name,
      role: pick(["Protagonist", "Antagonist", "Mentor", "Love interest", "Comic relief", "Mysterious stranger"]),
      appearance: pick(["Lean build, sharp cheekbones, always in a worn leather jacket", "Tall and composed, silver-streaked hair, trench coat", "Small and quick, restless eyes, oversized hoodie", "Elegant posture, signature red scarf, quiet smile"]),
      personality: pick(["Cynical on the surface, fiercely loyal underneath", "Optimistic to a fault, cannot sit still", "Calculating and calm, speaks in short sentences", "Chaotic energy, loud laugh, protective instinct"]),
      backstory: `Grew up near ${pick(["the harbor", "a closed cinema", "the old train station", "a neon-lit market district"])}; one defining night changed everything.`,
      voice: pick(["low and gravelly", "fast, clipped, wry", "soft with a hard edge", "warm, theatrical, storyteller-like"]),
      source: "card",
    };
    const content =
      `## 🎭 Character Card — ${name}\n\n` +
      `| Field | Value |\n|---|---|\n` +
      `| Role | ${card.role} |\n` +
      `| Looks | ${card.appearance} |\n` +
      `| Personality | ${card.personality} |\n` +
      `| Backstory | ${card.backstory} |\n` +
      `| Voice | ${card.voice} |\n\n` +
      `> I've added this to your **Memory** so every future script keeps ${name} consistent across all video generations. You can edit or delete it anytime in the Memory tab.\n\n` +
      `**Seedance prompt for ${name}:**\n\n\`\`\`\n${enhancePrompt(`Close-up of ${name}, ${card.appearance.toLowerCase()}. ${card.personality.toLowerCase()}.`, characters)}\n\`\`\``;
    const ch = { ...card, name: name.replace(/\s+/g, " ") };
    const isNew = !characters.some((c) => c.name.toLowerCase() === ch.name.toLowerCase());
    return { content, autoSaveCharacter: isNew ? ch : null, suggestions: [{ label: "Generate character close-up", prompt: `Close-up of ${ch.name}, ${ch.appearance.toLowerCase()}.` }] };
  }

  // ——— Script writing ———
  if (isScript && text.length > 10) {
    return { content: writeScreenplay(text, characters, memory), suggestions: [] };
  }

  // ——— Brainstorm / concept ———
  if (isBrainstorm && text.length > 6) {
    const title = titleCase(stripPunctuation(text.split(/ (?:is|about|for|idea|pitch)[:\s]/i)[0] || text).slice(0, 60));
    const logline = `${text.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "")} — a story where stakes rise, secrets surface, and every choice costs something.`;
    const content =
      `## 💡 Concept: ${title}\n\n` +
      `**Logline:** ${logline}\n\n` +
      `**Hook (first 30 seconds):** We open mid-crisis — no exposition, just a single telling detail that implies the whole world.\n\n` +
      `**3-Act beats:**\n` +
      `1. *Inciting incident* — the ordinary world breaks on one decision.\n` +
      `2. *Midpoint reversal* — the goal becomes impossible; the protagonist adapts.\n` +
      `3. *Climax* — the flaw that started it all must be confronted head-on.\n\n` +
      `Want me to **write the opening scene**, make a **shot list**, or turn this into a **Seedance video prompt**? Note: everything here is FREE FOREVER — no credits, no limits.`;
    return { content, suggestions: [] };
  }

  // ——— Direct video request ———
  if (isGenVideo && text.length > 8) {
    const clean = text
      .replace(/\b(generate|make|create|want|need|video|seedance|please|render|produce)\b/gi, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(of|a|an|the|for|me)\s+/i, "")
      .replace(/^of\s+/i, "")
      .trim();
    const prompt = enhancePrompt(clean || "epic cinematic scene", characters);
    const content =
      `## 🎥 Ready to Render\n\nYour scene, upgraded for Seedance:\n\n\`\`\`\n${prompt}\n\`\`\`\n\n**If you need a shot list**, tell me to break it down. Otherwise head to **Generate** → paste the prompt → pick a model → hit **Generate**. Free forever. 🎬`;
    return { content, suggestions: [{ label: "Send to Generate", prompt }] };
  }

  // ——— Help / question ———
  if (wantsHelp || text.length < 6) {
    const content =
      `## 🎬 CineBrain — What I can do\n\n` +
      `1. **🎬 Write scenes & full screenplays** — try: *"Write a tense opening scene between two old friends who haven't spoken in a decade."*\n` +
      `2. **🎥 Generate Seedance videos** — ask: *"make a video of a neon city at night, rain falling"* and I'll craft the perfect prompt for the Generate tab.\n` +
      `3. **🎞️ Shot lists** — say: *"shot list for a heist in a museum"*\n` +
      `4. **🧠 Character memory** — describe a character; I'll save them to Memory so they stay consistent.\n` +
      `5. **✨ Prompt enhancement** — say *"enhance: a robot finds a flower"*.\n\n` +
      `Everything is **FREE FOREVER** — no credits, no limits, in this chat and in the video generator.`;
    return { content, suggestions: [] };
  }

  // ——— General catch-all: treat as story beat ———
  if (text.length > 10) {
    return { content: writeScreenplay(text, characters, memory), suggestions: [] };
  }

  return { content: pick(greetingReplies), suggestions: [] };
}

function buildShots(text) {
  const subject = cleanSubject(text);
  const types = [
    { type: "Establishing", angle: "Wide", action: `we reveal the world around ${subject} — geography, mood, scale.` },
    { type: "Intro", angle: "Medium", action: `${subject} enters frame with purpose; a single detail tells us who they are.` },
    { type: "Tension", angle: "Close-up", action: `a small gesture betrays what ${subject} is really feeling.` },
    { type: "Action", angle: "Tracking", action: `the moment everything changes — motion, reaction, impact.` },
    { type: "Resolution", angle: "Slow push-in", action: `the scene settles; the meaning lands on the last beat.` },
  ];
  const shots = types.map((s, i) => {
    const prompt = enhancePrompt(
      `${s.type} shot: ${i === 0 ? s.action.replace("we reveal", "reveal") : s.action.replace(/ we /, " camera ").replace(" enters frame", " enters frame")}`,
      []
    );
    return { ...s, prompt };
  });
  return { shots };
}

function writeScreenplay(text, characters = [], memory = "") {
  const subject = cleanSubject(text);
  const pool = characters.length ? characters.map((c) => c.name) : names();
  const name1 = pick(pool);
  const name2 = pick(pool.filter((n) => n !== name1) || [name1 === "ALEX" ? "SAM" : "ALEX"]);
  const extra = memory ? `\n> Memory note: ${memory.trim().slice(0, 200)}\n` : "";

  return (
    `## 🎬 SCENE — ${titleCase(subject).slice(0, 40)}\n\n` +
    `**Logline:** ${text.trim().replace(/[.!?]+$/, "")}; when the truth comes out, nothing stays the same.` +
    extra +
    `\n**FADE IN:**\n\n` +
    `**INT. ${pick(["NEON DINER", "RAIN-SHATTERED ALLEY", "ABANDONED CINEMA", "ROOFTOP AT DAWN", "UNDERGROUND TRAIN"])} — NIGHT**\n\n` +
    `*${titleCase(subject)}. The air is thick with ${pick(["static", "cold rain", "dust and old film", "diesel fumes", "half-heard music"])}. ${name1} sits alone, staring at something ${pick(["just out of reach", "they swore they'd never touch again", "that shouldn't exist"])}.*\n\n` +
    `${name1} (V.O.)\n"${pick(["I knew this night would come back to me.", "You can only run so far from your own story.", "Every ending is just a beginning wearing a costume."])}"\n\n` +
    `${name2} enters. ${pick(["Slow. Dangerous.", "Out of breath. Wild-eyed.", "With the confidence of someone who knows secrets."])}\n\n` +
    `${name2}\n"${pick(["We have a problem. It found us.", "I need you to come with me. Now.", "You were supposed to destroy it. You didn't."])}"\n\n` +
    `${name1}\n"${pick(["Then let's give it a show it won't forget.", "Tell me everything. Start at the part you left out.", "I'm not the person you're looking for anymore."])}"\n\n` +
    `*${pick(["Lightning. The power cuts. When it returns, ${name2} is gone.", "They move as one — practiced, inevitable.", "The object in ${name1}'s hand finally makes sense."])}*\n\n` +
    `**CUT TO BLACK.**\n\n` +
    `---\n\n` +
    `**Ready-to-render Seedance prompt:**\n\n\`\`\`\n${enhancePrompt(`${subject}, ${name1} and ${name2} collide in a fateful night scene, dramatic lighting, intense dialogue`, characters)}\n\`\`\`\n\n` +
    `> Want a **shot list**, more **characters** (I'll save them to Memory), or a **different tone**? Just ask — still free, forever.`
  );
}

// ——— helpers ———
function cleanSubject(text) {
  return text
    .replace(/write a scene|screenplay|script|shot list|storyboard|make a video|generate|enhance|prompt/gi, "")
    .replace(/^(the|a|an)\s+/i, "")
    .trim()
    .slice(0, 80) || "the scene";
}

function stripPunctuation(s) {
  return s.replace(/[^\w\s-]/g, "");
}

function titleCase(s) {
  return s
    .split(/\s+/)
    .map((w) => (w.length > 2 || true ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function names() {
  return ["ALEX", "SAM", "JORDAN", "RILEY", "CASEY", "MORGAN", "QUINN", "AVA", "NOAH", "ZOE", "LEO", "MAYA", "DANI", "REMY"];
}

// Summarize a conversation into a compact memory snippet (for the AI + prompt builder).
export function summarizeMemory(messages) {
  const texts = messages
    .filter((m) => m.role === "user")
    .map((m) => m.content)
    .slice(-6)
    .join(" ");
  return texts.slice(0, 400);
}