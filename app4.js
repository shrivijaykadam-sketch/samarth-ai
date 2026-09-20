/* ---------- system prompt builder ---------- */
function buildSystem(mode) {
  let sys = MODES[mode] ? MODES[mode].sys : MODES.auto.sys;
  if (S.settings.memoryEnabled && S.memories.length) {
    sys += "\n\nKnown facts about the user (memory):\n" + S.memories.slice(-15).map(m => "- " + m.content).join("\n");
  }
  return sys;
}
function detectIntent(text) {
  const t = text.toLowerCase();
  if (/^(research|do research|find out about|report on|deep dive)/.test(t) || /latest|current|today|2024|2025|2026|news|price of/.test(t)) return "search";
  if (/^build me|^create an? (app|website|game|tool)|make me an? (app|website)|^code me/.test(t)) return "coding";
  if (/quiz|flashcard|test me|practice questions|study/.test(t)) return "study";
  if (/write.*document|draft.*report|write.*essay|write.*email|write.*letter/.test(t)) return "chat";
  return "chat";
}

/* ---------- send ---------- */
async function sendChat() {
  const text = chatInput.value.trim();
  if (!text || streaming) return;
  chatInput.value = ""; chatInput.style.height = "auto";
  const conv = ensureConv(chatMode);
  const mode = chatMode === "auto" ? detectIntent(text) : chatMode;

  const userMsg = { id: uid(), role: "user", content: text, ts: now() };
  conv.messages.push(userMsg);
  if (conv.title === "New chat") { conv.title = text.slice(0, 44) + (text.length > 44 ? "\u2026" : ""); renderConvList(); }
  const attachFiles = pendingAttachments.map(id => S.files.find(f => f.id === id)).filter(Boolean);
  pendingAttachments = []; renderAttachPreview();
  save(); renderChat();

  try {
    if (mode === "research") await runResearchFlow(conv, text, attachFiles);
    else if (mode === "agent") await runAgentFlow(conv, text, attachFiles);
    else await runChatFlow(conv, text, mode, attachFiles);
  } catch (e) {
    conv.messages.push({ id: uid(), role: "assistant", content: "\u26a0\ufe0f " + (e.message || e), ts: now() });
  }
  save();
}

/* ---------- plain chat flow (with search grounding for search mode) ---------- */
async function runChatFlow(conv, text, mode, attachFiles) {
  let sources = null;
  let userContent = text;
  if (attachFiles && attachFiles.length) {
    userContent += "\n\n" + attachFiles.map(f => `--- Attached file: ${f.name} ---\n${(f.text || "(binary/image file)").slice(0, 20000)}`).join("\n\n");
  }

  const status = addStatusLine(conv);
  if (mode === "search") {
    status("\ud83d\udd0e Searching the web\u2026");
    const results = await webSearch(text, 5);
    if (results.length) {
      sources = results;
      userContent = `Question: ${text}\n\nSearch results (cite as [n]):\n` + results.map((r, i) => `[${i + 1}] ${r.title} \u2014 ${r.url}\n${r.snippet}`).join("\n\n");
    }
    status(null);
  }

  const lastUser = conv.messages.filter(m => m.role === "user").pop();
  const aiMsg = { id: uid(), role: "assistant", content: "", model: currentModel() || "Samarth Local", sources, ts: now(), mode };
  conv.messages.push(aiMsg);
  renderChat(); bump("messages");
  status("\u2726 Thinking\u2026");

  const history = conv.messages.filter(m => m !== lastUser && m.content).slice(-12).map(m => ({ role: m.role, content: m.content }));
  await streamToMessage(conv, aiMsg, [
    { role: "system", content: buildSystem(mode) },
    ...history,
    { role: "user", content: userContent },
  ], { modeLabel: mode });
  status(null);
}

/* ---------- research flow: search → read → synthesize ---------- */
async function runResearchFlow(conv, text) {
  const status = addStatusLine(conv);
  status("\ud83d\udd0e Searching multiple sources\u2026");
  let results = [];
  try { results = await webSearch(text, 6); } catch { results = []; }

  // try reading pages for real content (r.jina.ai is CORS-open; silent fail offline)
  status("\ud83d\udcd6 Reading top sources\u2026");
  const read = await Promise.all(results.slice(0, 4).map(async r => {
    try {
      const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), 9000);
      const res = await fetch("https://r.jina.ai/" + r.url, { signal: ctrl.signal });
      clearTimeout(to);
      const txt = await res.text();
      return { ...r, content: txt.slice(0, 4000).replace(/\s+/g, " ") };
    } catch { return r; }
  }));

  const aiMsg = { id: uid(), role: "assistant", content: "", model: currentModel() || "Samarth Local", sources: read, ts: now(), mode: "research" };
  conv.messages.push(aiMsg); renderChat(); bump("research");

  const context = read.map((r, i) => `[${i + 1}] ${r.title} (${r.url})\n${r.content || r.snippet}`).join("\n\n");
  await streamToMessage(conv, aiMsg, [
    { role: "system", content: buildSystem("research") },
    { role: "user", content: `Research topic: ${text}\n\nSources:\n${context}\n\nWrite a structured research report: ## Summary (3-4 bullets), ## Key findings (detailed, cite [n]), ## Contradictions/open questions, ## Conclusion. If sources are offline placeholders, write the best report you can and say sources were offline.` },
  ], { modeLabel: "research" });
  status(null);
}

/* ---------- agent flow: plan → tools → deliver ---------- */
async function runAgentFlow(conv, text) {
  const status = addStatusLine(conv);
  status("\ud83e\uddde Planning steps\u2026");
  const allowed = ["web_search", "write_document", "generate_image", "final_answer"];
  const planCtl = await new Promise(resolve => {
    let out = "";
    const c = streamChat([
      { role: "system", content: `You are a task planner. Break the goal into 3-5 steps. Each step: use a tool. Tools: web_search(query), write_document(filename), generate_image(prompt), final_answer. Reply ONLY JSON: {"steps":[{"tool":"web_search","input":{"query":"..."}}]}` },
      { role: "user", content: text },
    ], { onDelta: d => out += d, onDone: () => resolve({ out }), onError: e => resolve({ out, e }), jsonMode: true, jsonHint: JSON.stringify({ steps: [{ tool: "web_search", input: { query: text } }, { tool: "final_answer", input: {} }] }) });
  });
  let plan = [];
  try { plan = (JSON.parse(extractJson(planCtl.out)).steps || []).slice(0, 6); } catch { }
  if (!plan.length) plan = [{ tool: "web_search", input: { query: text } }, { tool: "final_answer", input: {} }];

  const findings = [];
  let stepHtml = "";
  for (const step of plan) {
    const tool = step.tool || "final_answer";
    if (tool === "web_search") {
      status("\ud83d\udd0e " + (step.input?.query || text));
      const results = await webSearch(step.input?.query || text, 4);
      findings.push("Search results for '" + (step.input?.query || text) + "':\n" + results.map((r, i) => `[${i + 1}] ${r.title} \u2014 ${r.snippet}`).join("\n"));
      stepHtml += `<div class="tool-card">\ud83d\udd0e <b>web_search</b> \u2014 ${(step.input?.query || text)} \u2192 ${results.length} results</div>`;
    } else if (tool === "generate_image") {
      status("\ud83c\udfa8 Generating image\u2026");
      const url = await generateImage(step.input?.prompt || text, "512x512");
      S.images.unshift({ id: uid(), prompt: step.input?.prompt || text, url, ts: now() }); save();
      findings.push("[an image was generated and saved to the Images page]");
      stepHtml += `<div class="tool-card">\ud83c\udfa8 <b>generate_image</b> \u2014 saved to \ud83c\udfa8 Images</div>`;
    } else if (tool === "write_document") {
      status("\ud83d\udcdd Writing document\u2026");
      findings.push("[a document must be drafted in the final answer: " + (step.input?.filename || "deliverable.md") + "]");
      stepHtml += `<div class="tool-card">\ud83d\udcdd <b>write_document</b> \u2014 ${esc(step.input?.filename || "deliverable.md")}</div>`;
    }
    if (stepHtml) { const convNow = getConv(currentConvId); convNow.messages.push({ id: uid(), role: "assistant", content: stepHtml, html: stepHtml, ts: now() }); renderChat(); stepHtml = ""; }
  }

  status("\u2726 Composing final answer\u2026");
  const aiMsg = { id: uid(), role: "assistant", content: "", model: currentModel() || "Samarth Local", ts: now(), mode: "agent" };
  conv.messages.push(aiMsg); renderChat(); bump("agent");
  await streamToMessage(conv, aiMsg, [
    { role: "system", content: buildSystem("agent") },
    { role: "user", content: `Goal: ${text}\n\nWork so far (tool outputs):\n${findings.join("\n\n") || "(no tools used)"}\n\nNow produce the final deliverable for the user. If a document was requested, write it in full in markdown.` },
  ], { modeLabel: "agent" });
  status(null);
}

function extractJson(text) {
  const m = text.match(/\{[\s\S]*\}/); return m ? m[0] : text;
}

/* ---------- streaming into a message bubble ---------- */
function streamToMessage(conv, aiMsg, messages, opts) {
  return new Promise(resolve => {
    const el = messageEl({ ...aiMsg, content: "", html: "" });
    el.querySelector(".msg-text").innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
    $("#chat-inner").appendChild(el); scrollChat(true);
    let acc = "";
    let lastRender = 0;
    streaming = streamChat(messages, {
      ...opts,
      onDelta: d => {
        acc += d;
        const t = Date.now();
        if (t - lastRender > 90) { lastRender = t; el.querySelector(".msg-text").innerHTML = mdToHtml(acc); scrollChat(); }
      },
      onDone: () => {
        el.querySelector(".msg-text").innerHTML = mdToHtml(acc);
        aiMsg.content = acc; aiMsg.html = mdToHtml(acc);
        conv.messages = conv.messages.map(m => m.id === aiMsg.id ? aiMsg : m);
        streaming = null; $("#send-btn").textContent = "\u27a4";
        save(); scrollChat(); speak(acc);
        resolve();
      },
      onError: e => {
        aiMsg.content = "\u26a0\ufe0f " + e + "\n\n*Check your API key and model in Settings. (The request goes directly from your browser to the provider.)*";
        aiMsg.html = mdToHtml(aiMsg.content);
        conv.messages = conv.messages.map(m => m.id === aiMsg.id ? aiMsg : m);
        streaming = null; save(); renderChat(); resolve();
      },
    });
    $("#send-btn").textContent = "\u25a0";
  });
}

/* status line that appears above chat while a flow runs */
function addStatusLine(conv) {
  let el = null;
  const fn = text => {
    if (!text) { if (el) el.remove(); el = null; return; }
    if (!el) {
      el = document.createElement("div");
      el.className = "step-line";
      $("#chat-inner").appendChild(el); scrollChat(true);
    }
    el.textContent = text;
  };
  return fn;
}
