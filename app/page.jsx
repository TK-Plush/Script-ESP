import Link from "next/link";

const FEATURES = [
  { icon: "🎬", title: "AI Movie Director", desc: "Chat with CineBrain — it writes screenplays, builds shot lists, and crafts perfect Seedance prompts." },
  { icon: "🧠", title: "Smart Character Memory", desc: "Save characters once. Every script and video keeps them consistent — looks, voice, personality." },
  { icon: "🎥", title: "All Seedance Versions", desc: "Seedance 1.0 Pro / Lite / Fast, 1.5 Pro Audio, 2.0 / Fast / Mini, and 2.5 — text, image & reference to video." },
  { icon: "💬", title: "Unlimited Chats", desc: "Start a new chat anytime. Full history saved to your account on this device." },
  { icon: "🔗", title: "Google + Email Accounts", desc: "Sign in with Google or create an email account in seconds. Your data stays yours." },
  { icon: "∞", title: "FREE FOREVER", desc: "No credits. No limits. No paywall. The generator runs free, always." },
];

const MODELS = [
  ["Seedance 2.5", "Newest"],
  ["Seedance 2.0", "Flagship"],
  ["Seedance 2.0 Fast", "Fast"],
  ["Seedance 2.0 Mini", "Budget"],
  ["Seedance 1.5 Pro", "Audio"],
  ["Seedance 1.0 Pro", "Classic"],
  ["Seedance 1.0 Lite", "Legacy"],
  ["Image → Video", "Animate"],
  ["Reference → Video", "Multimodal"],
];

export default function Landing() {
  return (
    <main className="min-h-screen bg-ink text-neutral-100 overflow-x-hidden relative">
      {/* BG glow */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-violet-700/25 blur-[140px] rounded-full" />
      <div className="pointer-events-none absolute top-[45%] right-[-200px] w-[500px] h-[500px] bg-cyan-600/15 blur-[130px] rounded-full" />

      {/* Nav */}
      <nav className="relative z-10 max-w-6xl mx-auto flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-600 to-cyan-500 grid place-items-center shadow-lg shadow-violet-900/50">
            <span className="text-lg">🎬</span>
          </div>
          <span className="text-lg font-extrabold tracking-tight">
            Cine<span className="gradient-text">Forge</span> AI
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="chip !text-emerald-300 !border-emerald-500/30 !bg-emerald-500/10">∞ Free Forever · No Credits</span>
          <Link href="/studio" className="btn-primary">
            Launch Studio →
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative z-10 max-w-5xl mx-auto px-6 pt-16 pb-20 text-center">
        <div className="inline-flex items-center gap-2 chip !py-1.5 !text-xs mb-6 animate-float">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          Powered by ByteDance Seedance — every version, one studio
        </div>
        <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05]">
          Write it. <span className="gradient-text">Generate it.</span>
          <br />
          Make it a <span className="text-white underline decoration-violet-500/60 decoration-4 underline-offset-8">real movie.</span>
        </h1>
        <p className="mt-6 text-lg text-neutral-400 max-w-2xl mx-auto">
          CineForge pairs a genius AI screenwriter with the full Seedance video
          family. Chat your story into a screenplay, then render cinematic
          clips — <span className="text-emerald-300 font-semibold">free, unlimited, no credits, forever</span>.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4 flex-wrap">
          <Link href="/studio" className="btn-primary !px-8 !py-4 !text-base">
            🎬 Start Creating — Free
          </Link>
          <span className="text-sm text-neutral-500">No credit card · No credits · No limits</span>
        </div>

        {/* Model chips */}
        <div className="mt-14 flex flex-wrap justify-center gap-2 max-w-3xl mx-auto">
          {MODELS.map(([name, tag]) => (
            <span key={name} className="chip !py-1.5">
              {name} <span className="text-[10px] uppercase tracking-wider text-violet-300 bg-violet-500/10 rounded px-1.5 py-0.5">{tag}</span>
            </span>
          ))}
        </div>
      </header>

      {/* Features */}
      <section className="relative z-10 max-w-6xl mx-auto px-6 pb-24">
        <div className="grid md:grid-cols-3 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="glass p-6 hover:border-violet-500/40 transition group">
              <div className="text-3xl mb-4 group-hover:scale-110 transition inline-block">{f.icon}</div>
              <h3 className="card-title !text-base mb-2">{f.title}</h3>
              <p className="text-sm text-neutral-400 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="relative z-10 max-w-4xl mx-auto px-6 pb-24">
        <div className="glass p-10 text-center shine">
          <h2 className="text-3xl md:text-4xl font-extrabold">
            Your movie is <span className="gradient-text">one chat away.</span>
          </h2>
          <p className="mt-3 text-neutral-400">
            Free forever means <em className="text-fuchsia-300">free forever</em>. Build your cast in Memory,
            chat your story, hit Generate.
          </p>
          <Link href="/studio" className="btn-primary !px-8 !py-4 !text-base mt-7">
            Open the Studio →
          </Link>
        </div>
      </section>

      <footer className="relative z-10 border-t border-line py-8 text-center text-xs text-neutral-500">
        CineForge AI · Free forever · Not affiliated with ByteDance or fal.ai · Seedance is a ByteDance model
      </footer>
    </main>
  );
}