// CineForge AI — per-user local persistence (chats, characters, generations)

function userScope(session) {
  return (session && session.email) || "guest";
}

function load(key, def, session) {
  if (typeof window === "undefined") return def;
  try {
    const raw = localStorage.getItem(`cf_${userScope(session)}__${key}`);
    return raw ? JSON.parse(raw) : def;
  } catch {
    return def;
  }
}

function save(key, val, session) {
  if (typeof window === "undefined") return;
  localStorage.setItem(`cf_${userScope(session)}__${key}`, JSON.stringify(val));
}

export const Store = {
  getChats(session) {
    return load("chats", [], session);
  },
  setChats(chats, session) {
    save("chats", chats, session);
  },
  getCharacters(session) {
    return load("characters", [], session);
  },
  setCharacters(chars, session) {
    save("characters", chars, session);
  },
  getGenerations(session) {
    return load("gens", [], session);
  },
  setGenerations(gens, session) {
    save("gens", gens, session);
  },
  getSettings(session) {
    return { ...{ tone: "cinematic", autoAudio: true, style: "" }, ...load("settings", {}, session) };
  },
  setSettings(settings, session) {
    save("settings", settings, session);
  },
  wipeUser(session) {
    if (typeof window === "undefined") return;
    const scope = userScope(session);
    ["chats", "characters", "gens", "settings"].forEach((k) => localStorage.removeItem(`cf_${scope}__${k}`));
  },
};

export function uid(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}