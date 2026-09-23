# 🎬 CineForge AI — Free Forever AI Movie & Video Studio

Chat with a smart AI movie director, build character memory, and generate cinematic videos with **all Seedance model versions** (ByteDance) — completely unlimited, **no credits, no paywall, free forever**.

## ✨ Features

- 💬 **Smart AI movie chat** — CineBrain writes screenplays, shot lists, and Seedance-ready prompts.
- 🧠 **Character memory** — save characters once; they stay consistent across chat, scripts, and video prompts.
- 🎥 **All Seedance versions** — Seedance 2.5, 2.0 / Fast / Mini, 1.5 Pro (audio), 1.0 Pro / Fast / Lite. Text→Video, Image→Video, Reference→Video.
- 🔗 **Accounts** — Google connect + email/password accounts (hashed locally, PBKDF2).
- 💬 **Unlimited chats** with full history, new chat anytime.
- ⚡ **FREE FOREVER** — no credit system. Works out of the box in Free Demo Mode, and upgrades to real Seedance generation the moment you add a key.

## 🚀 Deploy to Vercel

```bash
npm install
npm run build
npx vercel --prod --token YOUR_VERCEL_TOKEN --yes
```

## 🔑 Optional environment variables (add in Vercel → Project → Settings → Environment Variables)

| Variable | Purpose |
|---|---|
| `FAL_KEY` | fal.ai API key → enables **real Seedance generation** (all versions). Get one at fal.ai. Without it the app runs Free Demo Mode with sample clips. |
| `OPENAI_API_KEY` | Makes chat replies much smarter (GPT-4o-mini). Optional — a built-in offline screenwriting engine works with zero keys. |
| `OPENAI_BASE_URL` | Optional: any OpenAI-compatible endpoint (e.g. Groq, OpenRouter, llama.cpp). |
| `OPENAI_MODEL` | Default `gpt-4o-mini`. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Enables real Google OAuth one-tap sign-in (Google Cloud Console → Credentials → OAuth client → Web app; add your Vercel domain to authorized origins). Without it, Google connect uses a demo link. |

Add keys non-interactively, e.g.:

```bash
echo "YOUR_FAL_KEY" | npx vercel env add FAL_KEY production --token YOUR_VERCEL_TOKEN
```

## 🧠 How "free forever" works

- All accounts, chats, memory, and history live in your browser — zero infrastructure cost.
- `/api/video` proxies to the Seedance queue on fal.ai when `FAL_KEY` is set.
- Without a key, the studio runs in **Free Demo Mode**: every render returns instantly, free, unlimited, forever.

Built with Next.js 14 · Tailwind · zero backend dependencies.