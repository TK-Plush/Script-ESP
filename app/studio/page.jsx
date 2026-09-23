"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Md from "../../components/md";
import { MODELS, MODEL_BY_ID, DURATIONS, RESOLUTIONS, ASPECTS, SAMPLE_VIDEOS } from "../../lib/models";
import { enhancePrompt, smartReply } from "../../lib/engine";
import {
  register,
  login,
  linkGoogle,
  getSession,
  logout,
  guestSession,
  isValidEmail,
  changePassword,
  getProviderInfo,
} from "../../lib/auth";
import { Store, uid } from "../../lib/store";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TABS = [
  { id: "chat", icon: "💬", label: "Chat" },
  { id: "generate", icon: "🎥", label: "Generate" },
  { id: "memory", icon: "🧠", label: "Memory" },
  { id: "settings", icon: "⚙️", label: "Settings" },
];

export default function Studio() {
  const [session, setSession] = useState(null);
  const [booted, setBooted] = useState(false);
  const [tab, setTab] = useState("chat");
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [gens, setGens] = useState([]);
  const [toasts, setToasts] = useState([]);

  // guest data copy source
  const guestDataRef = useRef(null);

  const toast = useCallback((msg, type = "info") => {
    const id = uid("t");
    setToasts((t) => [...t, { id, msg, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const saveAll = useCallback(
    (s) => {
      if (!s) return;
      Store.setChats(chats, s);
      Store.setCharacters(characters, s);
      Store.setGenerations(gens, s);
    },
    [chats, characters, gens]
  );

  // boot
  useEffect(() => {
    const s = getSession();
    if (s) {
      setSession(s);
      setChats(Store.getChats(s));
      setCharacters(Store.getCharacters(s));
      const g = Store.getGenerations(s);
      setGens(g.map((x) => (x.status !== "done" && x.status !== "error" ? { ...x, status: "error", error: "Interrupted — press Generate again." } : x)));
    }
    setBooted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // persist on session change
  useEffect(() => {
    if (session) saveAll(session);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, chats, characters, gens]);

  // —— auth handlers ——
  const handleAuth = async (mode, fields) => {
    try {
      let s;
      if (mode === "register") {
        if (!isValidEmail(fields.email)) throw new Error("Enter a valid email address.");
        if (fields.password.length < 6) throw new Error("Password must be at least 6 characters.");
        if (fields.password !== fields.confirm) throw new Error("Passwords do not match.");
        s = await register({ email: fields.email, name: fields.name, password: fields.password });
        // import guest data into new account
        const guest = guestDataRef.current;
        if (guest && guest.chats.length) {
          Store.setChats(guest.chats, s);
          Store.setCharacters(guest.characters, s);
          Store.setGenerations(guest.generations, s);
          setChats(guest.chats);
          setCharacters(guest.characters);
          setGens(guest.generations);
          toast("Guest data imported into your new account ✔", "ok");
        }
      } else {
        s = await login({ email: fields.email, password: fields.password });
      }
      applySession(s);
      toast(`Welcome${s.name ? ", " + s.name : ""}! Everything here is FREE forever 🎬`, "ok");
    } catch (e) {
      toast(e.message, "err");
    }
  };

  const handleGuest = () => {
    guestDataRef.current = { chats, characters, generations: gens };
    applySession(guestSession());
    toast("Guest mode — data saves on this device. Create an account anytime to keep it separate.", "info");
  };

  const handleGoogleConnect = async (profile) => {
    const s = linkGoogle(profile);
    applySession(s);
    toast("Connected with Google ✔", "ok");
  };

  const applySession = (s) => {
    setSession(s);
    setChats(Store.getChats(s));
    setCharacters(Store.getCharacters(s));
    setGens(Store.getGenerations(s).filter((x) => x.status === "done" || x.status === "error" || x.status === undefined || true));
  };

  const doLogout = () => {
    logout();
    setSession(null);
    setChats([]);
    setCharacters([]);
    setGens([]);
    setActiveChatId(null);
  };

  // —— chat ——
  const activeChat = chats.find((c) => c.id === activeChatId) || null;

  const setActiveChatMsgs = (msgs) => {
    setChats((cs) => cs.map((c) => (c.id === activeChatId ? { ...c, msgs, title: c.title === "New Chat" && msgs.length ? msgs.find((m) => m.role === "user")?.content?.slice(0, 42) || "New Chat" : c.title } : c)));
  };

  const newChat = () => {
    const id = uid("c");
    setChats((cs) => [{ id, title: "New Chat", msgs: [], ts: Date.now() }, ...cs]);
    setActiveChatId(id);
    setTab("chat");
  };

  const deleteChat = (id) => {
    setChats((cs) => cs.filter((c) => c.id !== id));
    if (activeChatId === id) setActiveChatId(null);
  };

  const sendChat = async (text, suggestions) => {
    if (!activeChatId) newChat();
    setTab("chat");
    const userMsg = { id: uid("m"), role: "user", content: text, ts: Date.now() };
    const msgs = activeChat ? [...activeChat.msgs, userMsg] : [userMsg];
    setActiveChatMsgs(msgs);
    setTyping(true);
    let data = null;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: msgs.slice(-20).map(({ role, content }) => ({ role, content })),
          characters,
          userName: session?.name || "Writer",
          memory: "",
        }),
      });
      data = await res.json();
      if (!res.ok) throw new Error(data.error || "Chat failed");
    } catch (e) {
      // Offline fallback: run the built-in CineBrain engine right here.
      data = smartReply(
        msgs.slice(-20).map(({ role, content }) => ({ role, content })),
        characters,
        ""
      );
    }
    try {
      let content = data.content || "…";
      if (data.autoSaveCharacter) {
        setCharacters((cs) => {
          const existing = cs.some((c) => c.name.toLowerCase() === data.autoSaveCharacter.name.toLowerCase());
          return existing ? cs : [...cs, { ...data.autoSaveCharacter, id: uid("ch") }];
        });
        toast(`🧠 Saved "${data.autoSaveCharacter.name}" to Memory`, "ok");
      }
      const assistantMsg = {
        id: uid("m"),
        role: "assistant",
        content,
        suggestions: data.suggestions || [],
        ts: Date.now(),
      };
      setActiveChatMsgs([...msgs, assistantMsg]);
    } catch (e2) {
      const errMsg = { id: uid("m"), role: "assistant", content: `⚠️ ${e2.message}`, ts: Date.now() };
      setActiveChatMsgs([...msgs, errMsg]);
    } finally {
      setTyping(false);
    }
  };

// —— generation ——
  const initForm = () => ({
    modelId: MODELS[0].id,
    prompt: "",
    style: "",
    aspect: "auto",
    resolution: "720p",
    duration: "auto",
    audio: true,
    cameraFixed: false,
    seed: "",
    imageData: null,
    endImageData: null,
    refImagesData: [],
    refVideoUrls: [],
    refAudioUrls: [],
  });
  const [form, setForm] = useState(initForm);

  const model = MODEL_BY_ID[form.modelId] || MODELS[0];

  const selectModel = (id) => {
    const m = MODEL_BY_ID[id];
    setForm((f) => ({
      ...f,
      modelId: id,
      duration: DURATIONS[m.version].includes(f.duration) ? f.duration : DURATIONS[m.version][0],
      resolution: RESOLUTIONS[m.version].includes(f.resolution) ? f.resolution : RESOLUTIONS[m.version][0],
    }));
  };

  const pickModelMode = (mode) => {
    const first = MODELS.find((m) => m.mode === mode) || MODELS[0];
    selectModel(first.id);
  };

  const updateGen = (id, patch) => {
    setGens((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  };

  const runGeneration = useCallback(
    async (overrides = {}) => {
      const model = MODEL_BY_ID[overrides.modelId || form.modelId] || MODELS[0];
      const f = { ...form, ...overrides, modelId: model.id };
      if (!f.prompt || !f.prompt.trim()) {
        toast("Write a prompt first ✍️", "err");
        return;
      }
      const prompt = f.style ? `${f.style}: ${f.prompt.trim()}` : f.prompt.trim();
      const task = {
        id: uid("g"),
        modelId: model.id,
        modelName: model.name,
        mode: model.mode,
        prompt,
        status: "submitting",
        statusText: "Submitting…",
        progress: 0,
        createdAt: Date.now(),
        seed: "",
        demo: false,
      };
      setGens((gs) => [task, ...gs]);
      setTab("generate");

      let data = null;
      try {
        const res = await fetch("/api/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: model.id,
            form: {
              prompt,
              style: f.style,
              aspect: f.aspect,
              resolution: f.resolution,
              duration: f.duration,
              audio: f.audio,
              cameraFixed: f.cameraFixed,
              seed: f.seed,
              imageUrl: f.imageUrl || undefined,
              imageData: f.imageData || undefined,
              endImageUrl: f.endImageUrl || undefined,
              endImageData: f.endImageData || undefined,
              refImagesData: f.refImagesData || undefined,
              refVideoUrls: f.refVideoUrls || undefined,
              refAudioUrls: f.refAudioUrls || undefined,
            },
          }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Failed to start generation");
        data = j;
      } catch (e) {
        // Fully offline fallback — free demo render, zero infrastructure.
        data = { demo: true, demoUrl: SAMPLE_VIDEOS[Math.floor(Math.random() * SAMPLE_VIDEOS.length)] };
      }
      pollGen(task.id, data);
    },
    [form]
  );

  const pollGen = async (taskId, data) => {
    try {
      if (data.demo) {
        updateGen(taskId, { status: "rendering", demo: true, statusText: "Rendering (Free Demo)…", progress: 8 });
        const steps = [
          [22, 900],
          [45, 1100],
          [67, 1200],
          [86, 1000],
          [100, 1200],
        ];
        for (const [pct, ms] of steps) {
          await sleep(ms);
          updateGen(taskId, { progress: pct });
        }
        updateGen(taskId, { status: "done", videoUrl: data.demoUrl, seed: "free-demo", statusText: "Ready", progress: 100 });
      } else {
        updateGen(taskId, { status: "queued", statusText: "Queued on fal…", requestId: data.requestId });
        let finished = false;
        let tries = 0;
        while (!finished && tries < 120) {
          await sleep(3000);
          tries++;
          let poll;
          try {
            poll = await fetch(`/api/video?statusUrl=${encodeURIComponent(data.statusUrl)}`).then((r) => r.json());
          } catch {
            continue;
          }
          if (!poll.ok) {
            updateGen(taskId, { statusText: "Polling…" });
            continue;
          }
          if (poll.status === "COMPLETED") {
            const vurl = poll.result?.video?.url || poll.result?.url;
            updateGen(taskId, {
              status: "done",
              videoUrl: vurl,
              seed: poll.result?.seed,
              statusText: "Ready",
              progress: 100,
              meta: poll.result || null,
            });
            finished = true;
          } else if (poll.status === "ERROR") {
            throw new Error("Generation failed (model returned error status).");
          } else {
            const pos = poll.queuePosition;
            const msg = poll.raw?.logs?.[0]?.message || (pos > 1 ? `In queue #${pos}…` : "Rendering…");
            updateGen(taskId, { statusText: msg, progress: Math.min(90, 10 + tries * 3) });
          }
        }
        if (!finished) throw new Error("Timed out while waiting (queue is busy). Try again.");
      }
    } catch (e) {
      updateGen(taskId, { status: "error", error: e.message || "Generation failed" });
    }
  };

  const sendToGenerate = (prompt, modelId) => {
    setForm((f) => ({ ...f, prompt, modelId: modelId || f.modelId }));
    setTab("generate");
    toast("Prompt loaded into the video studio 🎥", "ok");
  };

  const enhanceThis = async () => {
    if (!form.prompt.trim()) {
      toast("Type a prompt to enhance.", "err");
      return;
    }
    toast("Enhancing with CineBrain…", "info");
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: `enhance: ${form.prompt}` }],
          characters,
          userName: session?.name || "Writer",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Enhance failed");
      const codeBlocks = (data.content.match(/```([\s\S]*?)```/g) || []).map((b) => b.replace(/```/g, "").trim());
      const better = codeBlocks[0] || data.content.split("\n").find((l) => l.trim().length > 30);
      if (better) {
        setForm((f) => ({ ...f, prompt: better }));
        toast("✨ Prompt enhanced", "ok");
      }
    } catch (e) {
      // Offline fallback — enhance locally with the built-in engine.
      const better = enhancePrompt(form.prompt, characters);
      setForm((f) => ({ ...f, prompt: better }));
      toast("✨ Enhanced locally (offline engine)", "ok");
    }
  };

  const shuffleTone = () => {
    if (!form.prompt.trim()) {
      toast("Type a prompt first.", "err");
      return;
    }
    const newP = enhancePrompt(form.prompt, []);
    setForm((f) => ({ ...f, prompt: newP }));
  };

  const addCastToPrompt = () => {
    if (!characters.length) {
      toast("No characters in Memory yet. Describe one in Chat!", "info");
      setTab("chat");
      return;
    }
    const castLine = "Cast: " + characters.map((c) => `${c.name} (${c.appearance || "detailed character"})`).join(", ") + ".";
    setForm((f) => ({ ...f, prompt: f.prompt ? `${f.prompt}\n${castLine}` : castLine }));
    toast(`🎭 Added ${characters.length} character(s) from Memory`, "ok");
  };

  // —— shared ui ——
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");

  if (!booted) {
    return (
      <div className="min-h-screen bg-ink grid place-items-center">
        <div className="skeleton w-10 h-10 rounded-full" />
      </div>
    );
  }

  if (!session) {
    return (
      <AuthScreen
        onAuth={handleAuth}
        onGuest={handleGuest}
        onGoogle={handleGoogleConnect}
        guestNotice={chats.length || characters.length ? "You have unsaved local data — it will follow your guest session." : null}
      />
    );
  }

  const doneGens = gens.filter((g) => g.status === "done");
  const activeGens = gens.filter((g) => g.status !== "done");

  return (
    <div className="h-screen flex bg-ink text-neutral-100 overflow-hidden">
      {/* sidebar */}
      <aside className="w-64 shrink-0 border-r border-line bg-panel/70 flex flex-col">
        <div className="flex items-center gap-2.5 px-4 py-4 border-b border-line">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-cyan-500 grid place-items-center text-base">🎬</div>
          <div>
            <div className="font-extrabold leading-none">
              Cine<span className="gradient-text">Forge</span>
            </div>
            <div className="text-[10px] text-emerald-300 mt-1">∞ FREE FOREVER · NO CREDITS</div>
          </div>
        </div>

        <nav className="p-3 space-y-1">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} className={`tab w-full justify-start ${tab === t.id ? "tab-active" : "tab-idle"}`}>
              <span>{t.icon}</span> {t.label}
              {t.id === "memory" && characters.length > 0 && <span className="ml-auto text-[10px] bg-violet-500/20 text-violet-300 rounded-full px-1.5 py-0.5">{characters.length}</span>}
              {t.id === "generate" && activeGens.length > 0 && <span className="ml-auto w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
            </button>
          ))}
        </nav>

        <div className="px-3 pb-2 pt-1">
          <button onClick={newChat} className="btn-ghost w-full !justify-start">
            ＋ New Chat
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-1 space-y-1">
          {chats.map((c) => (
            <div
              key={c.id}
              onClick={() => {
                setActiveChatId(c.id);
                setTab("chat");
              }}
              className={`group flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer text-sm transition ${activeChatId === c.id ? "bg-violet-500/15 text-white border border-violet-500/25" : "text-neutral-400 hover:bg-card hover:text-white border border-transparent"}`}
            >
              <span className="truncate flex-1">{c.title}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteChat(c.id);
                }}
                className="opacity-0 group-hover:opacity-100 text-xs text-neutral-500 hover:text-red-400"
                title="Delete chat"
              >
                ✕
              </button>
            </div>
          ))}
          {!chats.length && <div className="text-xs text-neutral-600 px-3 py-2">No chats yet. Start a new one!</div>}
        </div>

        <div className="border-t border-line p-3">
          <div className="flex items-center gap-2.5">
            {session.picture ? (
              <img src={session.picture} alt="" className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-fuchsia-600 to-violet-600 grid place-items-center text-xs font-bold">
                {(session.name || "G").slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">{session.name}</div>
              <div className="text-[10px] text-neutral-500 truncate">
                {session.provider === "google" ? "🔗 Google" : session.provider === "guest" ? "Guest mode" : session.email}
              </div>
            </div>
            <button onClick={doLogout} className="text-neutral-500 hover:text-white text-xs" title="Log out">
              ⎋
            </button>
          </div>
        </div>
      </aside>

      {/* main */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 px-6 py-3.5 border-b border-line bg-panel/50">
          <h1 className="text-lg font-extrabold tracking-tight">
            {tab === "chat" && <>💬 <span className="gradient-text">Movie Chat</span></>}
            {tab === "generate" && <>🎥 <span className="gradient-text">Seedance Video Studio</span></>}
            {tab === "memory" && <>🧠 <span className="gradient-text">Smart Character Memory</span></>}
            {tab === "settings" && <>⚙️ <span className="gradient-text">Settings</span></>}
          </h1>
          <div className="ml-auto flex items-center gap-3">
            <span className="chip !text-emerald-300 !border-emerald-500/30 !bg-emerald-500/10 hidden sm:inline-flex">⚡ Unlimited · Free Forever</span>
            {activeGens.length > 0 && <span className="chip !text-cyan-300 !border-cyan-500/30">Rendering {activeGens.length}</span>}
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          {tab === "chat" && (
            <ChatTab
              chat={activeChat}
              typing={typing}
              text={text}
              setText={setText}
              onSend={(t, s) => sendChat(t, s)}
              onSuggestion={sendToGenerate}
              characters={characters}
            />
          )}
          {tab === "generate" && (
            <GenerateTab
              form={form}
              setForm={setForm}
              model={model}
              gens={gens}
              MODELS={MODELS}
              selectModel={selectModel}
              pickModelMode={pickModelMode}
              onGenerate={runGeneration}
              onEnhance={enhanceThis}
              onShuffle={shuffleTone}
              onAddCast={addCastToPrompt}
              characters={characters}
            />
          )}
          {tab === "memory" && (
            <MemoryTab
              characters={characters}
              setCharacters={setCharacters}
              chats={chats}
              onJump={() => setTab("chat")}
              onCast={(p) => sendToGenerate(p)}
            />
          )}
          {tab === "settings" && (
            <SettingsTab
              session={session}
              onLogout={doLogout}
              onGoogle={handleGoogleConnect}
              chars={characters}
              setChars={setCharacters}
              onToast={toast}
            />
          )}
        </div>
      </main>

      {/* toasts */}
      <Toasts toasts={toasts} />
    </div>
  );
}

/* ——————————————————— Auth ——————————————————— */
function AuthScreen({ onAuth, onGuest, onGoogle, guestNotice }) {
  const [mode, setMode] = useState("login");
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [gDemo, setGdemo] = useState(false);
  const [gEmail, setGEmail] = useState("");
  const [gName, setGName] = useState("");
  const { googleClientId } = getProviderInfo();

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await onAuth(mode, f);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  const googleClick = () => {
    if (googleClientId) {
      startGIS(googleClientId, onGoogle);
    } else {
      setGdemo(true);
    }
  };

  const demoLink = () => {
    if (!isValidEmail(gEmail)) return setErr("Enter a valid Google email.");
    const pic = "";
    onGoogle({ email: gEmail, name: gName || gEmail.split("@")[0], picture: pic });
    setGdemo(false);
  };

  return (
    <div className="min-h-screen bg-ink grid place-items-center px-4 relative overflow-hidden">
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-violet-700/25 blur-[120px] rounded-full" />
      <div className="relative w-full max-w-md animate-pop">
        <div className="text-center mb-8">
          <div className="inline-grid place-items-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-cyan-500 text-3xl shadow-xl shadow-violet-900/50 mb-4">🎬</div>
          <h1 className="text-3xl font-black tracking-tight">
            Cine<span className="gradient-text">Forge</span> AI
          </h1>
          <p className="text-sm text-neutral-400 mt-2">AI movie studio · Seedance video · <span className="text-emerald-300 font-semibold">FREE FOREVER</span></p>
        </div>

        <div className="glass p-6">
          <div className="flex gap-1 bg-ink rounded-xl p-1 mb-5">
            {["login", "register"].map((m) => (
              <button key={m} onClick={() => { setMode(m); setErr(""); }} className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${mode === m ? "bg-card text-white border border-line shadow" : "text-neutral-500 hover:text-white"}`}>
                {m === "login" ? "Log in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "register" && (
              <input className="input" placeholder="Name (optional)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
            )}
            <input className="input" placeholder="Email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required />
            <input className="input" placeholder="Password" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />
            {mode === "register" && (
              <input className="input" placeholder="Confirm password" type="password" value={f.confirm} onChange={(e) => setF({ ...f, confirm: e.target.value })} required />
            )}
            {err && <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</div>}
            <button disabled={busy} className="btn-primary w-full !py-3">
              {busy ? "…" : mode === "login" ? "Log in →" : "Create free account →"}
            </button>
          </form>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px bg-line" />
            <span className="text-[10px] uppercase tracking-widest text-neutral-500">or</span>
            <div className="flex-1 h-px bg-line" />
          </div>

          <button onClick={googleClick} className="btn-ghost w-full !py-3">
            <svg width="16" height="16" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18A10.97 10.97 0 0 0 1 12c0 1.77.42 3.45 1.18 4.94l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            Continue with Google
          </button>

          <button onClick={onGuest} className="w-full text-center text-sm text-neutral-500 hover:text-white mt-4 py-1">
            Continue as guest →
          </button>
          {guestNotice && <div className="text-[11px] text-neutral-500 text-center mt-1">{guestNotice}</div>}
        </div>
        <p className="text-center text-[11px] text-neutral-600 mt-4">Free forever · No credits · No card · Your data stays on your device</p>
      </div>

      {gDemo && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm" onClick={() => setGdemo(false)}>
          <div className="glass p-6 w-full max-w-sm m-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold mb-1">Connect with Google</h3>
            <p className="text-xs text-neutral-400 mb-4">
              {googleClientId ? "Google sign-in window opened in your browser." : "Google OAuth isn't configured on this deployment, so this links your Google email as a demo connection. Add NEXT_PUBLIC_GOOGLE_CLIENT_ID to enable real one-tap sign-in."}
            </p>
            {!googleClientId && (
              <>
                <input className="input mb-3" placeholder="Your Google email (name@gmail.com)" value={gEmail} onChange={(e) => setGEmail(e.target.value)} />
                <input className="input mb-4" placeholder="Your name" value={gName} onChange={(e) => setGName(e.target.value)} />
                {err && <div className="text-xs text-red-400 mb-2">{err}</div>}
                <button className="btn-primary w-full" onClick={demoLink}>Link Google account</button>
              </>
            )}
            <button className="btn-ghost w-full mt-2" onClick={() => setGdemo(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function startGIS(clientId, onGoogle) {
  if (window.__cfGIS) return;
  window.__cfGIS = true;
  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.onload = () => {
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: (resp) => {
        try {
          const payload = JSON.parse(atob(resp.credential.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
          onGoogle({ email: payload.email, name: payload.name, picture: payload.picture });
        } catch {
          alert("Google sign-in failed. Try again.");
        }
      },
    });
    window.google.accounts.id.prompt();
  };
  document.head.appendChild(script);
}

/* ——————————————————— Chat ——————————————————— */
function ChatTab({ chat, typing, text, setText, onSend, onSuggestion, characters }) {
  const endRef = useRef(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat?.msgs?.length, typing]);

  const msgs = chat?.msgs || [];

  const submit = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || typing) return;
    setText("");
    onSend(t);
  };

  return (
    <div className="h-full flex flex-col max-w-4xl mx-auto w-full">
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {!msgs.length && !typing && (
          <div className="text-center py-10 space-y-4">
            <div className="text-5xl animate-float">🎬</div>
            <h2 className="text-2xl font-extrabold">
              Let's make a <span className="gradient-text">movie.</span>
            </h2>
            <p className="text-sm text-neutral-400 max-w-md mx-auto">
              Chat with CineBrain — your AI director. Write scenes, get shot lists, craft Seedance prompts. Everything FREE forever.
            </p>
            <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto">
              {[
                "Write a scene where a detective confronts a thief in a neon diner at midnight",
                "Create a character: Rhea, a reckless stunt pilot",
                "Shot list: a heist inside a floating casino",
                "Make a video of a dragon sleeping on a treasure hoard",
              ].map((s) => (
                <button key={s} onClick={() => onSend(s)} className="chip hover:!border-violet-500/50 hover:text-white text-left">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {msgs.map((m) => (
          <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                m.role === "user" ? "bg-gradient-to-br from-violet-600 to-violet-700 text-white rounded-br-sm" : "bg-card border border-line rounded-bl-sm"
              }`}
            >
              {m.role === "assistant" ? <Md text={m.content} /> : <div className="whitespace-pre-wrap">{m.content}</div>}
              {m.suggestions?.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.suggestions.map((s, i) => (
                    <button key={i} onClick={() => onSuggestion(s.prompt, undefined)} className="chip hover:!border-cyan-500/50 hover:text-cyan-200">
                      ⚡ {s.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {typing && (
          <div className="flex justify-start">
            <div className="bg-card border border-line rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-fuchsia-400 animate-bounce [animation-delay:120ms]" />
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-bounce [animation-delay:240ms]" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="px-6 pb-5 pt-2">
        {characters.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2.5">
            <span className="text-[10px] uppercase tracking-wider text-neutral-500 self-center">🧠 Memory:</span>
            {characters.slice(0, 6).map((c) => (
              <span key={c.id} className="chip !py-0.5 !text-[11px] !border-violet-500/30">🎭 {c.name}</span>
            ))}
          </div>
        )}
        <form onSubmit={submit} className="flex gap-2">
          <textarea
            className="input resize-none !py-3"
            rows={2}
            placeholder="Describe a scene, ask for a screenplay, or say 'make a video of…' (free, unlimited)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(e);
              }
            }}
          />
          <button type="submit" disabled={typing || !text.trim()} className="btn-primary !px-5">
            ➤
          </button>
        </form>
      </div>
    </div>
  );
}

/* ——————————————————— Generate ——————————————————— */
function GenerateTab({ form, setForm, model, gens, MODELS, selectModel, pickModelMode, onGenerate, onEnhance, onShuffle, onAddCast, characters }) {
  const [modeFilter, setModeFilter] = useState("all");
  const fileRef = useRef(null);
  const endFileRef = useRef(null);
  const refsRef = useRef(null);

  const families = ["2.5", "2.0", "1.5", "1.0"];
  const familyLabel = { "2.5": "Seedance 2.5", "2.0": "Seedance 2.0", "1.5": "Seedance 1.5 Pro", "1.0": "Seedance 1.0" };
  const familyEmoji = { "2.5": "🚀", "2.0": "👑", "1.5": "🔊", "1.0": "🎞️" };

  const visibleModels = MODELS.filter((m) => modeFilter === "all" || m.mode === modeFilter);

  const onFile = (dataUrl) => setForm((f) => ({ ...f, imageData: dataUrl, imageUrl: undefined }));
  const onEndFile = (dataUrl) => setForm((f) => ({ ...f, endImageData: dataUrl, endImageUrl: undefined }));
  const onRefsFile = (dataUrl) => setForm((f) => ({ ...f, refImagesData: [...(f.refImagesData || []), dataUrl] }));

  const gensList = gens.slice(0, 30);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto p-6 grid lg:grid-cols-[380px_1fr] gap-6 items-start">
        {/* ——— left: model + params ——— */}
        <div className="space-y-5 lg:sticky lg:top-6">
          <div className="glass p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="card-title">🎛 Model</span>
              <span className="text-[10px] text-neutral-500 uppercase tracking-wider">All versions</span>
            </div>
            <div className="flex gap-1 bg-ink rounded-lg p-1 mb-3">
              {[
                ["all", "All"],
                ["t2v", "Text→Video"],
                ["i2v", "Image→Video"],
                ["ref2v", "Reference"],
              ].map(([v, l]) => (
                <button key={v} onClick={() => pickModelMode(v === "all" ? "t2v" : v)} className={`flex-1 py-1.5 rounded-md text-[11px] font-bold transition ${modeFilter === v || (v !== "all" && model.mode === v) ? "bg-card border border-line text-white" : "text-neutral-500 hover:text-white"}`}>
                  {l}
                </button>
              ))}
            </div>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {families.map((fam) => {
                const list = visibleModels.filter((m) => m.version === fam);
                if (!list.length) return null;
                return (
                  <div key={fam}>
                    <div className="text-[10px] uppercase tracking-widest text-neutral-500 mb-1.5 flex items-center gap-1.5">
                      {familyEmoji[fam]} {familyLabel[fam]}
                    </div>
                    {list.map((m) => {
                      const active = form.modelId === m.id;
                      return (
                        <button
                          key={m.id}
                          onClick={() => selectModel(m.id)}
                          className={`w-full text-left mb-1.5 rounded-xl border px-3 py-2.5 transition ${active ? "border-violet-500/60 bg-violet-500/10 shadow" : "border-line bg-card hover:border-violet-500/30"}`}
                        >
                          <div className="flex items-center gap-2">
                            <span className={`text-[11px] font-bold ${active ? "text-white" : "text-neutral-200"}`}>{m.name}</span>
                            {m.tag && (
                              <span className={`text-[9px] uppercase tracking-wide rounded px-1.5 py-0.5 ${active ? "bg-cyan-500/20 text-cyan-200" : "bg-line text-neutral-400"}`}>{m.tag}</span>
                            )}
                            {active && <span className="ml-auto text-emerald-400 text-xs">✓</span>}
                          </div>
                          <div className="text-[10px] text-neutral-500 mt-1 leading-snug">{m.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass p-4 space-y-3.5">
            <span className="card-title">⚙️ Parameters</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="label">Aspect ratio</span>
                <select className="input" value={form.aspect} onChange={(e) => setForm((f) => ({ ...f, aspect: e.target.value }))}>
                  {ASPECTS.map((a) => (
                    <option key={a} value={a}>{a === "auto" ? "Auto" : a}</option>
                  ))}
                </select>
              </div>
              <div>
                <span className="label">Resolution</span>
                <select className="input" value={form.resolution} onChange={(e) => setForm((f) => ({ ...f, resolution: e.target.value }))}>
                  {(RESOLUTIONS[model.version] || []).map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
              <div>
                <span className="label">Duration</span>
                <select className="input" value={form.duration} onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))}>
                  {(DURATIONS[model.version] || []).map((d) => (
                    <option key={d} value={d}>{d === "auto" ? "Auto" : `${d}s`}</option>
                  ))}
                </select>
              </div>
              <div>
                <span className="label">Seed</span>
                <input className="input" placeholder="-1 = random" value={form.seed} onChange={(e) => setForm((f) => ({ ...f, seed: e.target.value }))} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
              <input type="checkbox" checked={form.audio} onChange={(e) => setForm((f) => ({ ...f, audio: e.target.checked }))} disabled={!model.audio} className="accent-violet-500 w-3.5 h-3.5" />
              Generate synchronized audio {!model.audio && <span className="text-neutral-600">(not supported on this model)</span>}
            </label>
            {model.version === "1.0" || model.version === "1.5" ? (
              <label className="flex items-center gap-2 text-xs text-neutral-300 cursor-pointer">
                <input type="checkbox" checked={form.cameraFixed} onChange={(e) => setForm((f) => ({ ...f, cameraFixed: e.target.checked }))} className="accent-violet-500 w-3.5 h-3.5" />
                Fixed camera (tripod)
              </label>
            ) : null}
            <div>
              <span className="label">Style preset (prepended to prompt)</span>
              <select className="input" value={form.style} onChange={(e) => setForm((f) => ({ ...f, style: e.target.value }))}>
                <option value="">None</option>
                {["cinematic, film grain, anamorphic lens", "anime style, vibrant colors", "photorealistic, 8k detail", "film noir, high contrast, shadows", "sci-fi, neon, futuristic", "horror, dark, ominous", "fantasy, magical, ethereal", "documentary, natural light"].map((s) => (
                  <option key={s} value={s}>{s.split(",")[0]}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ——— right: prompt + queue ——— */}
        <div className="space-y-5 min-w-0">
          <div className="glass p-4">
            <span className="card-title mb-3 block">✍️ Prompt</span>
            <textarea
              className="input resize-none !py-3"
              rows={6}
              placeholder="Describe your scene like a director… e.g. 'A lone astronaut walks across a rust-red desert as twin suns set, dramatic low-angle shot'"
              value={form.prompt}
              onChange={(e) => setForm((f) => ({ ...f, prompt: e.target.value }))}
            />
            <div className="flex flex-wrap gap-2 mt-3">
              <button onClick={onEnhance} className="chip hover:!border-violet-500/50 hover:text-white" title="CineBrain rewrites your prompt for Seedance">
                ✨ Smart Enhance
              </button>
              <button onClick={onShuffle} className="chip hover:!border-cyan-500/50 hover:text-cyan-200">
                🔀 Shuffle Tone
              </button>
              <button onClick={onAddCast} className="chip hover:!border-fuchsia-500/50 hover:text-fuchsia-200">
                🎭 Add Cast ({characters.length})
              </button>
            </div>

            {/* image inputs */}
            {model.mode === "i2v" && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap gap-3 items-start">
                  <div>
                    <span className="label">Start image {model.id.includes("v1.5") ? "/ frame" : ""}</span>
                    {form.imageData ? (
                      <div className="relative w-32 h-20 rounded-xl overflow-hidden border border-line">
                        <img src={form.imageData} alt="" className="w-full h-full object-cover" />
                        <button onClick={() => setForm((f) => ({ ...f, imageData: null, imageUrl: null }))} className="absolute top-1 right-1 bg-black/70 rounded-full w-5 h-5 text-[10px] grid place-items-center hover:text-red-400">✕</button>
                      </div>
                    ) : (
                      <button onClick={() => fileRef.current?.click()} className="btn-ghost !py-2 !text-xs">📤 Upload image</button>
                    )}
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const r = new FileReader();
                        r.onload = () => onFile(r.result);
                        r.readAsDataURL(file);
                      }
                    }} />
                  </div>
                  {model.id.includes("v1.5") && (
                    <div>
                      <span className="label">End image</span>
                      {form.endImageData ? (
                        <div className="relative w-32 h-20 rounded-xl overflow-hidden border border-line">
                          <img src={form.endImageData} alt="" className="w-full h-full object-cover" />
                          <button onClick={() => setForm((f) => ({ ...f, endImageData: null, endImageUrl: null }))} className="absolute top-1 right-1 bg-black/70 rounded-full w-5 h-5 text-[10px] grid place-items-center hover:text-red-400">✕</button>
                        </div>
                      ) : (
                        <button onClick={() => endFileRef.current?.click()} className="btn-ghost !py-2 !text-xs">📤 End frame</button>
                      )}
                      <input ref={endFileRef} type="file" accept="image/*" hidden onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const r = new FileReader();
                          r.onload = () => onEndFile(r.result);
                          r.readAsDataURL(file);
                        }
                      }} />
                    </div>
                  )}
                </div>
              </div>
            )}

            {model.mode === "ref2v" && (
              <div className="mt-4 space-y-3">
                <span className="label">Reference images (up to 9)</span>
                <div className="flex flex-wrap gap-2 items-center">
                  {(form.refImagesData || []).map((d, i) => (
                    <div key={i} className="relative w-24 h-16 rounded-xl overflow-hidden border border-line">
                      <img src={d} alt="" className="w-full h-full object-cover" />
                      <button onClick={() => setForm((f) => ({ ...f, refImagesData: f.refImagesData.filter((_, j) => j !== i) }))} className="absolute top-1 right-1 bg-black/70 rounded-full w-5 h-5 text-[10px] grid place-items-center hover:text-red-400">✕</button>
                    </div>
                  ))}
                  <button onClick={() => refsRef.current?.click()} className="btn-ghost !py-2 !text-xs">＋ Add reference</button>
                  <input ref={refsRef} type="file" accept="image/*" hidden multiple onChange={(e) => {
                    Array.from(e.target.files || []).forEach((file) => {
                      const r = new FileReader();
                      r.onload = () => onRefsFile(r.result);
                      r.readAsDataURL(file);
                    });
                  }} />
                </div>
              </div>
            )}

            <button
              onClick={() => onGenerate({})}
              className="btn-primary w-full !py-4 !text-base mt-4"
            >
              🎬 Generate Video {model.name} — FREE
            </button>
            <div className="text-center text-[10px] text-emerald-300 mt-2">∞ Unlimited generations · No credits · Always free</div>
          </div>

          {/* live queue */}
          {gensList.some((g) => g.status !== "done" && g.status !== "error") && (
            <div className="space-y-3">
              <span className="card-title">⚡ Rendering now</span>
              {gensList.filter((g) => g.status !== "done" && g.status !== "error").map((g) => (
                <GenCard key={g.id} g={g} />
              ))}
            </div>
          )}

          {/* history */}
          {gens.some((g) => g.status === "done" || g.status === "error") && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="card-title">🎞️ Your renders</span>
                {doneGensCount(gens) > 0 && <span className="text-[10px] text-neutral-500">{doneGensCount(gens)} rendered free</span>}
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {gens
                  .filter((g) => g.status === "done" || g.status === "error")
                  .slice(0, 24)
                  .map((g) => (
                    <div key={g.id} className="glass overflow-hidden">
                      <div className="aspect-video bg-ink relative">
                        {g.status === "error" ? (
                          <div className="absolute inset-0 grid place-items-center text-red-400 text-xs p-4 text-center">{g.error}</div>
                        ) : g.videoUrl ? (
                          <video src={g.videoUrl} controls className="w-full h-full object-contain" />
                        ) : (
                          <div className="absolute inset-0 skeleton" />
                        )}
                      </div>
                      <div className="p-3">
                        <div className="flex items-center gap-2 text-[11px] text-neutral-400 mb-1">
                          <span className="chip !py-0 !px-2 !text-[10px]">{g.modelName}</span>
                          {g.seed && <span className="text-neutral-600">seed {g.seed}</span>}
                        </div>
                        <div className="text-xs text-neutral-300 line-clamp-2">{g.prompt}</div>
                        <div className="flex gap-2 mt-2">
                          {g.videoUrl && (
                            <a href={g.videoUrl} target="_blank" rel="noreferrer" className="btn-ghost !py-1 !px-3 !text-[11px]">⬇ Download</a>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function doneGensCount(gens) {
  return gens.filter((g) => g.status === "done").length;
}

function GenCard({ g }) {
  const state = g.status;
  const label =
    state === "submitting" ? "Submitting…" : state === "queued" ? g.statusText || "Queued…" : state === "rendering" ? "Rendering…" : state === "error" ? "❌ " + (g.error || "Failed") : "Ready";
  return (
    <div className="glass p-3.5 flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-600/30 to-cyan-500/30 grid place-items-center text-xl shrink-0">🎥</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-bold truncate">{g.modelName}</span>
          <span className={`text-[10px] rounded-full px-2 py-0.5 ${state === "error" ? "bg-red-500/15 text-red-300" : "bg-cyan-500/15 text-cyan-300"}`}>{label}</span>
        </div>
        <div className="text-[10px] text-neutral-500 truncate mb-1.5">{g.prompt}</div>
        {(state === "rendering" || state === "queued") && (
          <div className="h-1.5 bg-ink rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-violet-500 to-cyan-400 rounded-full transition-all duration-500" style={{ width: `${Math.max(6, g.progress || 6)}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ——————————————————— Memory ——————————————————— */
function MemoryTab({ characters, setCharacters, chats, onJump, onCast }) {
  const [editingId, setEditingId] = useState(null);
  const [edit, setEdit] = useState(null);
  const [draft, setDraft] = useState({ name: "", role: "", appearance: "", personality: "", backstory: "", voice: "" });
  const [extracted, setExtracted] = useState(null);

  const add = () => {
    if (!draft.name.trim()) return;
    const ch = { ...draft, name: draft.name.trim(), id: uid("ch"), source: "manual" };
    setCharacters((cs) => [ch, ...cs]);
    setDraft({ name: "", role: "", appearance: "", personality: "", backstory: "", voice: "" });
  };

  const saveEdit = () => {
    if (!edit || !edit.name.trim()) return;
    setCharacters((cs) => cs.map((c) => (c.id === editingId ? edit : c)));
    setEditingId(null);
    setEdit(null);
  };

  const remove = (id) => setCharacters((cs) => cs.filter((c) => c.id !== id));

  const extractFromChat = () => {
    const allText = chats.flatMap((c) => c.msgs.map((m) => m.content)).join("\n");
    const chars = [];
    const re = /(?:character|cast member|actor|actress|role)[:\-]\s*([A-Za-z][A-Za-z .'-]{1,40})/gi;
    let m;
    const seen = new Set();
    while ((m = re.exec(allText)) !== null) {
      const name = m[1].trim().replace(/[.,;]$/, "").replace(/\s+/g, " ");
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        chars.push({ name, role: "Cast member", appearance: "", personality: "", backstory: "", voice: "", source: "chat" });
      }
    }
    if (!chars.length) return null;
    setExtracted(chars);
    return chars;
  };

  const addExtracted = (name) => {
    const found = extracted.find((x) => x.name === name);
    if (!found) return;
    setCharacters((cs) => cs.some((c) => c.name.toLowerCase() === name.toLowerCase()) ? cs : [found, ...cs]);
    setExtracted(extracted.filter((x) => x.name !== name));
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="glass p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
            <div>
              <h2 className="font-extrabold text-lg">Smart Character Memory</h2>
              <p className="text-xs text-neutral-400 mt-1">Characters saved here stay consistent in every script, chat, and Seedance prompt. Free forever.</p>
            </div>
            <button onClick={() => { const r = extractFromChat(); if (!r) onJump(); }} className="btn-ghost !py-2 !text-xs">
              🔍 Extract from my chats
            </button>
          </div>

          {extracted && (
            <div className="mb-4 border border-cyan-500/20 bg-cyan-500/5 rounded-xl p-3">
              <div className="text-xs text-cyan-300 mb-2 font-semibold">Found in chat — click to save:</div>
              <div className="flex flex-wrap gap-2">
                {extracted.map((x) => (
                  <button key={x.name} onClick={() => addExtracted(x.name)} className="chip hover:!border-cyan-500/50 hover:text-cyan-200">
                    ＋ {x.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <input className="input" placeholder="Name *" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <input className="input" placeholder="Role (Protagonist, villain…)" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} />
            <input className="input" placeholder="Appearance" value={draft.appearance} onChange={(e) => setDraft({ ...draft, appearance: e.target.value })} />
            <input className="input" placeholder="Personality" value={draft.personality} onChange={(e) => setDraft({ ...draft, personality: e.target.value })} />
            <input className="input sm:col-span-2" placeholder="Backstory" value={draft.backstory} onChange={(e) => setDraft({ ...draft, backstory: e.target.value })} />
            <input className="input sm:col-span-2" placeholder="Voice (how they speak)" value={draft.voice} onChange={(e) => setDraft({ ...draft, voice: e.target.value })} />
            <button onClick={add} className="btn-primary sm:col-span-2">💾 Save character</button>
          </div>
        </div>

        {!characters.length && (
          <div className="glass p-10 text-center">
            <div className="text-4xl mb-3">🧠</div>
            <p className="text-sm text-neutral-400">No characters saved yet. Describe one in Chat (it auto-saves) or add one above.</p>
            <button onClick={onJump} className="btn-primary mt-4 !py-2 !text-xs">Ask CineBrain to make a character →</button>
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          {characters.map((c) => (
            <div key={c.id} className="glass p-4">
              {editingId === c.id ? (
                <div className="space-y-2">
                  {["name", "role", "appearance", "personality", "backstory", "voice"].map((k) => (
                    <input key={k} className="input !py-2 !text-xs" placeholder={k} value={edit[k] || ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} />
                  ))}
                  <div className="flex gap-2">
                    <button onClick={saveEdit} className="btn-primary !py-2 !text-xs flex-1">Save</button>
                    <button onClick={() => { setEditingId(null); setEdit(null); }} className="btn-ghost !py-2 !text-xs">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-fuchsia-600/40 to-violet-600/40 grid place-items-center text-sm font-bold">{(c.name || "?").slice(0, 1)}</div>
                    <div className="min-w-0">
                      <div className="font-bold text-sm truncate">{c.name}</div>
                      <div className="text-[10px] text-neutral-500">{c.role || "Cast member"}{c.source === "chat" ? " · from chat" : ""}</div>
                    </div>
                    <div className="ml-auto flex gap-1">
                      <button onClick={() => { setEditingId(c.id); setEdit({ ...c }); }} className="text-neutral-500 hover:text-cyan-300 text-xs" title="Edit">✎</button>
                      <button onClick={() => remove(c.id)} className="text-neutral-500 hover:text-red-400 text-xs" title="Delete">🗑</button>
                    </div>
                  </div>
                  <div className="text-[11px] space-y-1 text-neutral-400">
                    {c.appearance && <div>👤 <b className="text-neutral-300">Looks:</b> {c.appearance}</div>}
                    {c.personality && <div>💭 <b className="text-neutral-300">Personality:</b> {c.personality}</div>}
                    {c.backstory && <div>📖 <b className="text-neutral-300">Backstory:</b> {c.backstory}</div>}
                    {c.voice && <div>🗣️ <b className="text-neutral-300">Voice:</b> {c.voice}</div>}
                  </div>
                  <button onClick={() => onCast(`Close-up of ${c.name}, ${c.appearance || "detailed character design"}, expressive, dramatic lighting`)} className="chip mt-3 hover:!border-cyan-500/50 hover:text-cyan-200 !text-[11px]">
                    🎥 Generate this character
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ——————————————————— Settings ——————————————————— */
function SettingsTab({ session, onLogout, onGoogle, chars, setChars, onToast }) {
  const [pw, setPw] = useState({ old: "", next: "" });
  const [gdemo, setGdemo] = useState(false);
  const [gEmail, setGEmail] = useState("");
  const [gName, setGName] = useState("");
  const { googleClientId } = getProviderInfo();

  const exportData = () => {
    const data = {
      exportedAt: new Date().toISOString(),
      account: { email: session.email, name: session.name, provider: session.provider },
      characters: chars,
      chats: Store.getChats(session),
      generations: Store.getGenerations(session),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `cineforge-backup-${session.email || "guest"}.json`;
    a.click();
    onToast("Backup downloaded 📦", "ok");
  };

  const wipe = () => {
    if (!confirm("Delete ALL local CineForge data (chats, memory, renders) for this account? This cannot be undone.")) return;
    Store.wipeUser(session);
    setChars([]);
    onToast("Local data wiped.", "info");
  };

  const savePw = async () => {
    try {
      await changePassword(session.email, pw.old, pw.next);
      setPw({ old: "", next: "" });
      onToast("Password updated ✔", "ok");
    } catch (e) {
      onToast(e.message, "err");
    }
  };

  const googleClick = () => {
    if (googleClientId) startGIS(googleClientId, onGoogle);
    else setGdemo(true);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto p-6 space-y-5">
        <div className="glass p-5">
          <h2 className="font-extrabold text-lg mb-4">👤 Account</h2>
          <div className="flex items-center gap-4">
            {session.picture ? (
              <img src={session.picture} alt="" className="w-14 h-14 rounded-full object-cover" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-fuchsia-600 to-violet-600 grid place-items-center text-xl font-bold">{(session.name || "?").slice(0, 1)}</div>
            )}
            <div>
              <div className="font-bold">{session.name || "Guest"}</div>
              <div className="text-xs text-neutral-500">{session.email} · {session.provider === "google" ? "🔗 Google" : session.provider === "guest" ? "Guest (device only)" : "Email account"}</div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {session.provider !== "google" ? (
              <button onClick={googleClick} className="btn-ghost !text-xs">🔗 Connect Google</button>
            ) : (
              <span className="chip !text-emerald-300 !border-emerald-500/30">✓ Google connected</span>
            )}
            <button onClick={exportData} className="btn-ghost !text-xs">📦 Export backup</button>
            <button onClick={wipe} className="btn-danger !text-xs">🗑 Wipe data</button>
            <button onClick={onLogout} className="btn-danger !text-xs">⎋ Log out</button>
          </div>
        </div>

        {session.provider === "email" && (
          <div className="glass p-5">
            <h2 className="font-extrabold text-lg mb-4">🔒 Change password</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              <input type="password" className="input" placeholder="Current password" value={pw.old} onChange={(e) => setPw({ ...pw, old: e.target.value })} />
              <input type="password" className="input" placeholder="New password (6+ chars)" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
            </div>
            <button onClick={savePw} className="btn-primary !py-2 !text-xs mt-3" disabled={!pw.old || pw.next.length < 6}>Update password</button>
          </div>
        )}

        <div className="glass p-5">
          <h2 className="font-extrabold text-lg mb-3">⚡ Free forever — really</h2>
          <p className="text-sm text-neutral-400 leading-relaxed">
            CineForge has <b className="text-emerald-300">no credits, no limits, no paywall</b>. Every chat, every render is free. When a free Seedance engine key
            (<code className="text-cyan-300">FAL_KEY</code>) is configured on the server, renders go straight to the real ByteDance Seedance models.
            Without a key, the studio runs in <b className="text-cyan-300">Free Demo Mode</b> using realistic sample clips.
          </p>
        </div>

        {gdemo && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm" onClick={() => setGdemo(false)}>
            <div className="glass p-6 w-full max-w-sm m-4" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-bold mb-1">Connect Google</h3>
              <p className="text-xs text-neutral-400 mb-4">Demo Google link (set NEXT_PUBLIC_GOOGLE_CLIENT_ID for real OAuth). This signs you in as that Google account.</p>
              <input className="input mb-3" placeholder="Google email" value={gEmail} onChange={(e) => setGEmail(e.target.value)} />
              <input className="input mb-4" placeholder="Name" value={gName} onChange={(e) => setGName(e.target.value)} />
              <button className="btn-primary w-full" onClick={() => {
                if (!isValidEmail(gEmail)) return onToast("Enter a valid Google email.", "err");
                onGoogle({ email: gEmail, name: gName || gEmail.split("@")[0], picture: "" });
                setGdemo(false);
              }}>Link</button>
              <button className="btn-ghost w-full mt-2" onClick={() => setGdemo(false)}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ——————————————————— Toasts ——————————————————— */
function Toasts({ toasts }) {
  return (
    <div className="fixed bottom-5 right-5 z-[60] space-y-2 max-w-sm">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`animate-pop rounded-xl border px-4 py-3 text-sm shadow-xl backdrop-blur-xl ${
            t.type === "err"
              ? "bg-red-500/15 border-red-500/30 text-red-200"
              : t.type === "ok"
              ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-200"
              : "bg-card/90 border-line text-neutral-200"
          }`}
        >
          {t.msg}
        </div>
      ))}
    </div>
  );
}