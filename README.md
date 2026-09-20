# Samarth AI — One AI. Every Possibility.

Your private AI workspace, running **entirely in your browser**. No backend, no database, no tracking — everything (conversations, files, projects, API keys) is stored only in your browser's localStorage.

**Live site:** https://shrivijaykadam-sketch.github.io/samarth-ai/

## Features

- **Chat** — streaming replies, 6 modes (Auto / Search / Research / Agent / Coding / Study), file attachments, voice input & read-aloud
- **Research** — multi-source reports with citations (Tavily key optional)
- **Agent** — plans multi-step tasks and runs tools (search, documents, images)
- **App builder** — describe an app → editable files → live preview → download
- **Data analysis** — CSV profiling, anomalies, charts, Q&A over your data
- **Canvas** — AI-assisted documents with version history
- **Images** — generation with an offline art mode
- **Study** — quizzes, flashcards, progress tracking
- **Projects, Custom assistants, Memory, Automations, Usage, Settings**

## Using your own AI provider

The site works out of the box on the built-in **Samarth Local** offline model. For real AI, open ⚙️ Settings and paste a key for any of:

- OpenAI (also enables image generation)
- Groq (free tier)
- OpenRouter (one key, many models)
- Together AI
- Anthropic (Claude)
- Google AI (Gemini)
- Any OpenAI-compatible endpoint or local Ollama

Keys are stored only in your browser and sent directly from your device to the provider — nothing passes through any other server.

## Run locally

Just open `index.html` in any modern browser, or serve the folder statically (`python3 -m http.server`).

## Deploy

It's a static site — any static host works (GitHub Pages, Netlify, Vercel, Cloudflare Pages).
