/* ============================================================
   AI CLIENT — direct browser → provider calls.
   Your key is stored ONLY in this browser's localStorage.
   ============================================================ */
function providerConfig() {
  const s = S.settings, k = S.settings.keys;
  switch (s.provider) {
    case "openai":    return k.openai ? { url: "https://api.openai.com/v1", key: k.openai, type: "openai", models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"] } : null;
    case "groq":      return k.groq ? { url: "https://api.groq.com/openai/v1", key: k.groq, type: "openai", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"] } : null;
    case "openrouter":return k.openrouter ? { url: "https://openrouter.ai/api/v1", key: k.openrouter, type: "openai", models: ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "google/gemini-flash-1.5", "meta-llama/llama-3.3-70b-instruct"] } : null;
    case "together":  return k.together ? { url: "https://api.together.xyz/v1", key: k.together, type: "openai", models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct-Turbo"] } : null;
    case "custom":    return (k.custom && s.customBaseUrl) ? { url: s.customBaseUrl.replace(/\/$/, ""), key: k.custom, type: "openai", models: [] } : null;
    case "anthropic": return k.anthropic ? { url: "https://api.anthropic.com/v1", key: k.anthropic, type: "anthropic", models: ["claude-sonnet-4-20250514", "claude-3-5-haiku-20241022", "claude-3-5-sonnet-20241022"] } : null;
    case "google":    return k.google ? { url: "https://generativelanguage.googleapis.com/v1beta", key: k.google, type: "google", models: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"] } : null;
    case "ollama":    return { url: (s.customBaseUrl || "http://localhost:11434") + "/v1", key: "", type: "openai", models: ["llama3.2", "qwen2.5", "mistral"] };
    default:          return { type: "local" };
  }
}
function currentModel() {
  const pc = providerConfig();
  if (!pc) return "local";
  if (S.settings.model) return S.settings.model;
  return pc.models && pc.models[0] ? pc.models[0] : "";
}

/* streamChat(messages, {onDelta, onDone, onError}) — returns an AbortController-like {abort} */
function streamChat(messages, opts) {
  opts = opts || {};
  const pc = providerConfig();
  const model = currentModel();
  let aborted = false, ctrl = null;
  const ctl = { abort() { aborted = true; try { ctrl && ctrl.abort(); } catch {} } };

  if (!pc || pc.type === "local") {
    // ---------- Samarth Local: built-in offline model ----------
    (async () => {
      const out = samarthLocal(messages, opts);
      for (const chunk of out.match(/.{1,3}/gs) || []) {
        if (aborted) return;
        await sleep(14);
        opts.onDelta && opts.onDelta(chunk);
      }
      opts.onDone && opts.onDone();
    })();
    return ctl;
  }

  (async () => {
    try {
      if (pc.type === "openai") {
        ctrl = new AbortController();
        const res = await fetch(pc.url + "/chat/completions", {
          method: "POST", signal: ctrl.signal,
          headers: { "Content-Type": "application/json", "Authorization": "Bearer " + pc.key },
          body: JSON.stringify({ model, messages, stream: true, temperature: S.settings.temperature }),
        });
        if (!res.ok) throw new Error((await res.text().catch(() => "")) || "Provider error " + res.status);
        await readSSE(res, ev => {
          if (ev === "[DONE]") return;
          try { const j = JSON.parse(ev); const d = j.choices?.[0]?.delta?.content; if (d) opts.onDelta && opts.onDelta(d); } catch {}
        });
        opts.onDone && opts.onDone();
      } else if (pc.type === "anthropic") {
        ctrl = new AbortController();
        const sys = messages.filter(m => m.role === "system").map(m => m.content).join("\n");
        const msgs = messages.filter(m => m.role !== "system");
        const res = await fetch(pc.url + "/messages", {
          method: "POST", signal: ctrl.signal,
          headers: { "Content-Type": "application/json", "x-api-key": pc.key, "anthropic-version": "2023-06-01", "anthropic-dangerous-direct-browser-access": "true" },
          body: JSON.stringify({ model, max_tokens: 4096, system: sys || undefined, messages: msgs, stream: true }),
        });
        if (!res.ok) throw new Error((await res.text().catch(() => "")) || "Provider error " + res.status);
        await readSSE(res, ev => {
          try { const j = JSON.parse(ev); if (j.type === "content_block_delta" && j.delta?.text) opts.onDelta && opts.onDelta(j.delta.text); } catch {}
        });
        opts.onDone && opts.onDone();
      } else if (pc.type === "google") {
        ctrl = new AbortController();
        const sys = messages.find(m => m.role === "system")?.content;
        const contents = messages.filter(m => m.role !== "system").map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: String(m.content ?? "") }] }));
        const res = await fetch(`${pc.url}/models/${model}:streamGenerateContent?alt=sse&key=${pc.key}`, {
          method: "POST", signal: ctrl.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents, systemInstruction: sys ? { parts: [{ text: sys }] } : undefined, generationConfig: { temperature: S.settings.temperature } }),
        });
        if (!res.ok) throw new Error((await res.text().catch(() => "")) || "Provider error " + res.status);
        await readSSE(res, ev => {
          try { const j = JSON.parse(ev); const t = j.candidates?.[0]?.content?.parts?.map(p => p.text).join("") || ""; if (t) opts.onDelta && opts.onDelta(t); } catch {}
        });
        opts.onDone && opts.onDone();
      }
    } catch (e) {
      if (aborted) { opts.onDone && opts.onDone(); return; }
      opts.onError && opts.onError(e.message || String(e));
    }
  })();
  return ctl;
}

async function readSSE(res, onEvent) {
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n"); buf = lines.pop();
    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith("data:")) onEvent(t.slice(5).trim());
    }
  }
}

/* ---------- Samarth Local: offline deterministic model ---------- */
function samarthLocal(messages, opts) {
  const last = [...messages].reverse().find(m => m.role === "user");
  const q = String(last?.content || "").slice(0, 500);
  const topic = q.replace(/\s+/g, " ").trim() || "your question";
  const mode = (opts && opts.modeLabel) || "chat";

  if (opts && opts.jsonMode) {
    return opts.jsonHint || "{}";
  }
  const intros = {
    chat: `Here's a helpful take on **${topic}**:`,
    search: `Quick answer on **${topic}** (offline mode \u2014 add a search API key in Settings for live web results):`,
    coding: `Let's build it. For **${topic}**, here's a clean approach:`,
    study: `Let's study **${topic}** step by step:`,
    agent: `Here's my plan for **${topic}**:`,
    research: `## Report \u2014 ${topic}\n\n*Offline mode: connect a search API key in Settings for a live, cited research report.*`,
  };
  const body = `
**Key idea.** ${topic} is best understood by breaking it into parts, looking at how they connect, and testing your understanding with examples.

**How I'd approach it**
1. Start with the simplest version of the problem.
2. Note what changes when you scale it up.
3. Look for a pattern \u2014 most ideas repeat structure.
4. Verify with one concrete example end-to-end.

**A concrete example.** Imagine you're explaining ${topic} to a friend over chai: you'd use one story, one number, and one picture. If you can do that, you understand it.

**Next steps.** Ask me to go deeper on any point, generate a quiz on this topic (Study tool), or switch to Research mode with a search key configured for live sources.

> You're on the built-in **Samarth Local** model \u2014 it works fully offline so every feature of this site is testable. For real AI answers, open **\u2699\ufe0f Settings** and paste any provider key (OpenAI, Groq, Google, Anthropic, OpenRouter, Together, or your own OpenAI-compatible endpoint). Your key never leaves this browser.`;
  const footer = mode === "research" ? `\n\n---\n*Sources: offline mode \u2014 none fetched.*` : "";
  return (intros[mode] || intros.chat) + "\n" + body + footer;
}

/* ---------- web search (Tavily if configured, else offline) ---------- */
async function webSearch(query, k) {
  k = k || 5;
  const key = S.settings.tavilyKey;
  if (!key) return offlineSearch(query, k);
  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, query, max_results: k, include_answer: false }),
    });
    if (!res.ok) throw new Error("search failed");
    const j = await res.json();
    return (j.results || []).map((r, i) => ({ title: r.title, url: r.url, snippet: (r.content || "").slice(0, 400) }));
  } catch {
    return offlineSearch(query, k);
  }
}
function offlineSearch(query, k) {
  const q = query.toLowerCase();
  const seeds = [
    { t: "Wikipedia \u2014 free encyclopedia", u: "https://en.wikipedia.org/wiki/Special:Search?search=" },
    { t: "Stack Overflow \u2014 programming Q&A", u: "https://stackoverflow.com/search?q=" },
    { t: "Arxiv \u2014 research preprints", u: "https://arxiv.org/search/?query=" },
    { t: "GitHub \u2014 open source code", u: "https://github.com/search?q=" },
    { t: "Google Scholar", u: "https://scholar.google.com/scholar?q=" },
  ];
  return seeds.slice(0, k).map(s => ({
    title: s.t + ": " + query,
    url: s.u + encodeURIComponent(query),
    snippet: "Offline result \u2014 add a Tavily API key in Settings for live search snippets. This link searches the source directly.",
  }));
}

/* ---------- image generation (OpenAI if key, else deterministic art) ---------- */
async function generateImage(prompt, size) {
  const pc = S.settings.keys.openai && S.settings.provider === "openai" ? true : false;
  if (pc) {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + S.settings.keys.openai },
      body: JSON.stringify({ model: "gpt-image-1", prompt, size: size || "1024x1024" }),
    });
    if (!res.ok) throw new Error("Image generation failed (" + res.status + ")");
    const j = await res.json();
    const b64 = j.data?.[0]?.b64_json;
    return b64 ? "data:image/png;base64," + b64 : (j.data?.[0]?.url || placeholderImage(prompt));
  }
  return placeholderImage(prompt);
}
function placeholderImage(prompt) {
  // deterministic gradient art from the prompt hash — offline, original
  let h = 0; for (const c of prompt) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = h % 360, hue2 = (hue + 60 + (h >> 8) % 120) % 360;
  const shapes = [];
  for (let i = 0; i < 6; i++) {
    const x = ((h >> (i * 3)) % 80) + 10, y = ((h >> (i * 5)) % 80) + 10, r = ((h >> (i * 2)) % 22) + 8, o = (0.25 + ((h >> i) % 5) * 0.1).toFixed(2);
    shapes.push(`<circle cx="${x}%" cy="${y}%" r="${r}%" fill="hsl(${(hue + i * 40) % 360},70%,60%)" opacity="${o}"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="hsl(${hue},65%,22%)"/><stop offset="1" stop-color="hsl(${hue2},70%,30%)"/>
    </linearGradient></defs>
    <rect width="1024" height="1024" fill="url(#g)"/>${shapes.join("")}
    <text x="50%" y="52%" text-anchor="middle" font-family="sans-serif" font-size="40" font-weight="700" fill="rgba(255,255,255,.92)">Samarth AI</text>
    <text x="50%" y="60%" text-anchor="middle" font-family="sans-serif" font-size="20" fill="rgba(255,255,255,.75)">${esc(prompt).slice(0, 60)}</text>
  </svg>`;
  return "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
}
