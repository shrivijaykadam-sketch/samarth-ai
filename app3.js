/* ============================================================
   NAVIGATION
   ============================================================ */
const PAGES = {
  home: { title: "Home" }, chat: { title: "Chat" }, projects: { title: "Projects" },
  files: { title: "Files" }, data: { title: "Data analysis" }, canvas: { title: "Canvas" },
  builder: { title: "App builder" }, images: { title: "Images" }, study: { title: "Study mode" },
  assistants: { title: "Custom AI" }, memory: { title: "Memory" }, automations: { title: "Automations" },
  usage: { title: "Usage" }, settings: { title: "Settings" },
};
let currentPage = "home";

function nav(page, opts) {
  opts = opts || {};
  currentPage = page;
  $$(".page").forEach(p => p.classList.remove("active"));
  if (page === "chat") {
    $("#chat-page").classList.add("active");
    $("#content").style.overflow = "hidden";
    if (opts.conversationId !== undefined) currentConvId = opts.conversationId;
    if (opts.mode) chatMode = opts.mode;
    renderChat();
    setTimeout(() => $("#chat-input").focus(), 60);
  } else {
    $("#chat-page").classList.remove("active");
    $("#content").style.overflow = "";
    const el = $("#page-" + page);
    if (el) el.classList.add("active");
    renderers[page] && renderers[page]();
  }
  $("#page-title").textContent = PAGES[page] ? PAGES[page].title : "Samarth AI";
  $$(".sb-item").forEach(it => it.classList.toggle("active", it.dataset.nav === page && !(page === "chat" && it.dataset.mode && it.dataset.mode !== "chat")));
  if (window.innerWidth <= 860) $("#sidebar").classList.add("hidden");
  updateProviderBadge();
}
document.addEventListener("click", e => {
  const item = e.target.closest("[data-nav],[data-q]");
  if (!item || e.target.closest(".del")) return;
  const navTo = item.dataset.nav || (item.dataset.q ? "chat" : null);
  if (navTo) nav(navTo, { mode: item.dataset.mode, conversationId: (item.dataset.mode || item.dataset.q) ? null : undefined });
  if (item.dataset.q) setTimeout(() => { const i = $("#chat-input"); if (i) { i.value = item.dataset.q; sendChat(); } }, 140);
});

/* ---------- sidebar conversations ---------- */
let currentConvId = null;
function renderConvList() {
  const el = $("#conv-list");
  el.innerHTML = "";
  if (!S.conversations.length) return;
  S.conversations.slice(0, 30).forEach(c => {
    const d = document.createElement("div");
    d.className = "conv-item" + (c.id === currentConvId ? " active" : "");
    d.textContent = c.title || "New chat";
    d.title = c.title;
    d.onclick = () => nav("chat", { conversationId: c.id });
    const del = document.createElement("span");
    del.className = "del"; del.textContent = "\u2715";
    del.onclick = ev => {
      ev.stopPropagation();
      S.conversations = S.conversations.filter(x => x.id !== c.id);
      if (currentConvId === c.id) currentConvId = null;
      save(); renderConvList(); if (currentPage === "chat") renderChat();
    };
    d.appendChild(del);
    el.appendChild(d);
  });
}
function getConv(id) { return S.conversations.find(c => c.id === id); }
function ensureConv(mode) {
  let c = getConv(currentConvId);
  if (!c) {
    c = { id: uid(), title: "New chat", mode: mode || "auto", model: currentModel(), createdAt: now(), messages: [] };
    S.conversations.unshift(c); currentConvId = c.id; save(); renderConvList();
  }
  return c;
}

/* ============================================================
   CHAT — modes, streaming, voice, attachments
   ============================================================ */
const MODES = {
  auto:     { label: "Auto",     sys: "You are Samarth, a brilliant, warm AI assistant. Give clear, well-structured, accurate answers in markdown. Be concise by default; go deeper when asked." },
  search:   { label: "Search",   sys: "You are Samarth in Search mode. Answer briefly and directly, then list key facts. Markdown." },
  research: { label: "Research", sys: "You are Samarth in Research mode. Write a thorough, well-organized report in markdown with a summary, findings and a conclusion. Cite sources inline as [n]." },
  agent:    { label: "Agent",    sys: "You are Samarth in Agent mode. Work through the task step by step, stating each step briefly, then deliver the final result." },
  coding:   { label: "Coding",   sys: "You are Samarth in Coding mode. Write clean, production-quality code with brief explanations. Always use fenced code blocks with language tags." },
  study:    { label: "Study",    sys: "You are Samarth in Study mode. Explain step by step, check understanding with a small question, and use examples a Class 9-10 student in India would relate to." },
};
let chatMode = "auto";
let streaming = null;      // active stream ctl
let pendingAttachments = []; // file ids
let listening = false, ttsOn = false;

function updateModeBtn() { $("#mode-btn").textContent = "\u26a1 " + MODES[chatMode].label; }
$("#mode-btn").onclick = () => {
  const keys = Object.keys(MODES);
  chatMode = keys[(keys.indexOf(chatMode) + 1) % keys.length];
  updateModeBtn(); toast("Mode: " + MODES[chatMode].label);
};
$("#model-btn").onclick = () => openModelModal();
$("#theme-btn").onclick = () => {
  const light = !document.documentElement.classList.contains("light");
  document.documentElement.classList.toggle("light", light);
  S.settings.theme = light ? "light" : "dark"; save();
  $("#theme-btn").textContent = light ? "\u2600\ufe0f" : "\ud83c\udf19";
};

function updateProviderBadge() {
  const names = { local: "Samarth Local", openai: "OpenAI", groq: "Groq", openrouter: "OpenRouter", together: "Together", custom: "Custom API", anthropic: "Anthropic", google: "Google AI", ollama: "Ollama" };
  const pc = providerConfig();
  const b = $("#provider-badge");
  b.textContent = (pc && pc.type !== "local") ? (names[S.settings.provider] || "API") + (S.settings.model ? " \u00b7 " + S.settings.model.split("/").pop().slice(0, 18) : "") : "Samarth Local";
  b.className = "badge" + (pc && pc.type !== "local" ? " ok" : " warn");
}

/* ---------- model picker ---------- */
function openModelModal() {
  const pc = providerConfig();
  if (!pc || pc.type === "local") {
    openModal(`<div class="h2">Connect a model</div>
    <p class="muted" style="font-size:13px">You're on the built-in <b>Samarth Local</b> model (offline, deterministic \u2014 every feature works for demos).<br><br>For real AI: open <b>\u2699\ufe0f Settings</b> and paste a key for OpenAI, Groq, Google, Anthropic, OpenRouter, Together, or your own OpenAI-compatible server / local Ollama. Keys are stored only in this browser.</p>
    <button class="btn primary" style="margin-top:14px" onclick="closeModal(); nav('settings')">Open Settings</button>`);
    return;
  }
  const models = pc.models || [];
  const list = models.map(m => `<label class="list-item" style="cursor:pointer"><input type="radio" name="mdl" value="${esc(m)}" ${S.settings.model === m ? "checked" : ""}><div><b style="font-family:Consolas,monospace;font-size:12.5px">${esc(m)}</b></div></label>`).join("");
  openModal(`<div class="h2">Choose model</div>
    <form id="model-form">${list}
    <label class="list-item" style="cursor:pointer"><input type="radio" name="mdl" value="" ${!S.settings.model ? "checked" : ""}><div><b>Provider default</b><div class="muted" style="font-size:12px">${models[0] || "auto-select"}</div></div></label></form>
    <label class="fl">Or type an exact model id</label>
    <input id="custom-model" placeholder="e.g. gpt-4o-2024-11-20" value="${esc(S.settings.model)}">
    <button class="btn primary" style="margin-top:14px" onclick="saveModelFromModal()">Save</button>`);
}
function saveModelFromModal() {
  const sel = ($$('input[name=mdl]:checked')[0] || {}).value;
  const typed = $("#custom-model").value.trim();
  S.settings.model = typed || sel || "";
  save(); updateProviderBadge(); closeModal(); toast("Model saved", "ok");
}

/* ---------- attachments ---------- */
$("#attach-btn").onclick = () => {
  const inp = document.createElement("input");
  inp.type = "file"; inp.multiple = true;
  inp.onchange = () => {
    Array.from(inp.files || []).forEach(f => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = (f.type.startsWith("text") || /\.(txt|md|csv|json|js|ts|py|html|css|java|c|cpp|xml|yml|yaml)$/i.test(f.name)) ? String(reader.result).slice(0, 60000) : "";
        const file = { id: uid(), name: f.name, type: f.type || "file", size: f.size, text, ts: now() };
        if (f.type.startsWith("image/")) file.dataUrl = reader.result;
        S.files.unshift(file); save(); pendingAttachments.push(file.id);
        renderAttachPreview(); toast("Attached: " + f.name, "ok");
      };
      if (f.type.startsWith("image/")) reader.readAsDataURL(f); else reader.readAsText(f);
    });
  };
  inp.click();
};
function renderAttachPreview() {
  $("#attach-preview").innerHTML = pendingAttachments.map(id => {
    const f = S.files.find(x => x.id === id);
    return f ? `<span class="attach-pill">\ud83d\udcc4 ${esc(f.name)} <span style="cursor:pointer" onclick="removeAttach('${id}')">\u2715</span></span>` : "";
  }).join("");
}
window.removeAttach = id => { pendingAttachments = pendingAttachments.filter(x => x !== id); renderAttachPreview(); };

/* ---------- voice ---------- */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
$("#speak-btn").onclick = () => {
  if (!SR) return toast("Voice input not supported in this browser");
  if (listening) return;
  const r = new SR(); r.lang = "en-IN"; r.interimResults = false;
  listening = true; $("#speak-btn").textContent = "\ud83d\udd34";
  r.onresult = e => { $("#chat-input").value += (e.results[0][0].transcript || ""); $("#chat-input").focus(); };
  r.onend = () => { listening = false; $("#speak-btn").textContent = "\ud83c\udf99\ufe0f"; };
  r.onerror = () => { listening = false; $("#speak-btn").textContent = "\ud83c\udf99\ufe0f"; };
  r.start();
};
$("#tts-btn").onclick = () => { ttsOn = !ttsOn; $("#tts-btn").style.color = ttsOn ? "var(--brand-2)" : ""; toast("Read-aloud " + (ttsOn ? "on" : "off")); };
function speak(text) {
  if (!ttsOn || !window.speechSynthesis) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[#*`>\[\]()]/g, "").slice(0, 1200));
  u.rate = S.settings.voiceRate || 1;
  speechSynthesis.speak(u);
}

/* ---------- composer ---------- */
const chatInput = $("#chat-input");
chatInput.addEventListener("input", () => { chatInput.style.height = "auto"; chatInput.style.height = Math.min(chatInput.scrollHeight, 180) + "px"; });
chatInput.addEventListener("keydown", e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } });
$("#send-btn").onclick = () => { if (streaming) { streaming.abort(); streaming = null; $("#send-btn").textContent = "\u27a4"; } else sendChat(); };

function renderChat() {
  updateModeBtn();
  const inner = $("#chat-inner");
  const conv = getConv(currentConvId);
  if (!conv || !conv.messages.length) {
    inner.innerHTML = `
      <div class="hero" style="padding-top:80px">
        <h1>How can I help, <span>today?</span></h1>
        <p>Mode: <b>${MODES[chatMode].label}</b> \u00b7 Model: <b>${esc(currentModel() || "Samarth Local")}</b></p>
      </div>
      <div class="suggest-grid" style="max-width:640px">
        <button class="suggest" data-q="Explain photosynthesis with a diagram description I can draw">\ud83c\udf31 <span class="s-title">Explain a concept</span><span class="s-hint">clear, structured notes</span></button>
        <button class="suggest" data-q="Write a Python function that finds the median of a list without sorting it fully, with tests">\ud83d\udcbb <span class="s-title">Write code</span><span class="s-hint">with tests included</span></button>
        <button class="suggest" data-q="Research the current state of solid-state batteries">\ud83d\udd2c <span class="s-title">Deep research</span><span class="s-hint">cited multi-source report</span></button>
        <button class="suggest" data-q="Create a 5-question quiz on the Indian freedom struggle">\ud83c\udf93 <span class="s-title">Make a quiz</span><span class="s-hint">study mode, with answers</span></button>
      </div>`;
    return;
  }
  inner.innerHTML = "";
  conv.messages.forEach(m => inner.appendChild(messageEl(m)));
  scrollChat(true);
}
function messageEl(m) {
  const div = document.createElement("div");
  div.className = "msg";
  const isUser = m.role === "user";
  div.innerHTML = `
    <div class="avatar ${isUser ? "user" : "ai"}">${isUser ? "You" : "\u2726"}</div>
    <div class="msg-body">
      <div class="msg-role">${isUser ? "You" : (m.model || "Samarth")}</div>
      <div class="msg-text"></div>
      ${m.sources && m.sources.length ? `<div style="margin-top:8px">${m.sources.map((s, i) => `<a class="src-pill" href="${esc(s.url)}" target="_blank" rel="noopener">[${i + 1}] ${esc((s.title || s.url).slice(0, 48))}</a>`).join("")}</div>` : ""}
      <div class="msg-actions">
        <button data-act="copy">\u29c9 Copy</button>
        ${!isUser ? `<button data-act="speak">\ud83d\udd0a Read</button>` : ""}
        <button data-act="del">\ud83d\uddd1</button>
      </div>
    </div>`;
  const body = $(".msg-text", div);
  if (m.html !== undefined) body.innerHTML = m.html; else body.innerHTML = mdToHtml(m.content);
  div.addEventListener("click", e => {
    const act = e.target.closest("button")?.dataset?.act;
    if (act === "copy") { navigator.clipboard?.writeText(m.content).then(() => toast("Copied", "ok")); }
    if (act === "speak") speak(m.content);
    if (act === "del") {
      const conv = getConv(currentConvId);
      conv.messages = conv.messages.filter(x => x.id !== m.id); save(); renderChat();
    }
  });
  return div;
}
function scrollChat(force) {
  const sc = $("#chat-scroll");
  if (force || sc.scrollHeight - sc.scrollTop - sc.clientHeight < 140) sc.scrollTop = sc.scrollHeight;
}
