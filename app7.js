/* ---------- STUDY ---------- */
let quizState = null, flashState = null;
renderers.study = () => {
  const el = $("#page-study");
  if (quizState) { renderQuiz(el); return; }
  if (flashState) { renderFlash(el); return; }
  const totalQ = S.studyProgress.reduce((s, a) => s + a.total, 0), totalS = S.studyProgress.reduce((s, a) => s + a.score, 0);
  el.innerHTML = `
    <div class="h1" style="margin-bottom:4px">Study mode</div>
    <p class="muted" style="font-size:12.5px;margin-bottom:16px">Quizzes, flashcards and progress tracking \u2014 great for Class 9 & 10.</p>
    <div class="card" style="margin-bottom:14px">
      <input id="study-topic" placeholder="What are you studying? e.g. Chemical Reactions and Equations \u2014 Class 10" onkeydown="if(event.key==='Enter')makeQuiz()">
      <div class="row" style="margin-top:10px">
        <button class="btn primary grow" onclick="makeQuiz()">\ud83d\udcdd Generate quiz</button>
        <button class="btn grow" onclick="makeFlash()">\ud83c\udccf Flashcards</button>
      </div>
    </div>
    ${S.studyProgress.length ? `<div class="card" style="margin-bottom:14px"><div class="h2">Progress</div>
      <div class="row" style="gap:24px">
        <div><div style="font-size:26px;font-weight:800">${totalQ ? Math.round(totalS / totalQ * 100) : 0}%</div><div class="muted" style="font-size:11px">avg score</div></div>
        <div><div style="font-size:26px;font-weight:800">${S.studyProgress.length}</div><div class="muted" style="font-size:11px">attempts</div></div>
      </div>
      <div style="margin-top:10px">${topicStats().map(t => `
        <div style="margin-bottom:8px"><div class="row" style="font-size:12px"><span>${esc(t.topic).slice(0, 40)}</span><span class="muted grow" style="text-align:right">${Math.round(t.avg * 100)}%</span></div>
        <div class="progress-bar"><div style="width:${Math.round(t.avg * 100)}%"></div></div></div>`).join("")}</div></div>` : ""}
    ${S.studySets.map(st => `
      <div class="list-item" style="cursor:pointer" onclick="openStudySet('${st.id}')">
        <div class="grow"><b>${esc(st.topic).slice(0, 70)}</b><div class="muted" style="font-size:12px">${st.type === "quiz" ? "\ud83d\udcdd quiz" : "\ud83c\udccf flashcards"} \u00b7 ${fmtTime(st.ts)}</div></div><span>\u2192</span>
      </div>`).join("")}`;
};
function topicStats() {
  const m = {};
  S.studyProgress.forEach(a => { (m[a.topic] = m[a.topic] || []).push(a.total ? a.score / a.total : 0); });
  return Object.entries(m).map(([topic, arr]) => ({ topic, avg: arr.reduce((a, b) => a + b, 0) / arr.length })).sort((a, b) => b.avg - a.avg).slice(0, 6);
}
window.makeQuiz = async () => {
  const topic = $("#study-topic").value.trim(); if (!topic) return;
  await genStudySet(topic, "quiz");
};
window.makeFlash = async () => {
  const topic = $("#study-topic").value.trim(); if (!topic) return;
  await genStudySet(topic, "flashcards");
};
async function genStudySet(topic, type) {
  toast("Generating " + type + "\u2026");
  let acc = "";
  await new Promise(resolve => {
    const schema = type === "quiz"
      ? '{"title":"...","questions":[{"question":"...","options":["A","B","C","D"],"answerIndex":0,"explanation":"..."}]}'
      : '{"cards":[{"front":"...","back":"..."}]}';
    streamChat([
      { role: "system", content: `You create high-quality study ${type} for the given topic. ${type === "quiz" ? "5 questions, 4 options each, answerIndex 0-3, short explanation." : "6 cards, front = term/question, back = concise answer."} Reply ONLY JSON with this shape: ${schema}` },
      { role: "user", content: "Topic: " + topic },
    ], { onDelta: d => acc += d, onDone: resolve, onError: e => { toast(e, "err"); resolve(); }, jsonMode: true, jsonHint: type === "quiz" ? JSON.stringify(sampleQuiz(topic)) : JSON.stringify({ cards: [{ front: "Sample question", back: "Sample answer \u2014 connect a real AI provider in Settings for real quizzes." }] }) });
  });
  let items;
  try { items = JSON.parse(extractJson(acc)); } catch { items = type === "quiz" ? sampleQuiz(topic) : { cards: [{ front: topic, back: "Connect a real AI provider in Settings for rich flashcards." }] }; }
  const set = { id: uid(), type, topic, items, ts: now() };
  S.studySets.unshift(set); save();
  if (type === "quiz") { quizState = { set, answers: {}, submitted: false }; } else { flashState = { set, idx: 0, flipped: false }; }
  renderers.study();
}
function sampleQuiz(topic) {
  return { title: topic, questions: [1, 2, 3, 4, 5].map(i => ({
    question: `Sample question ${i} about ${topic}?`, options: ["Option A", "Option B", "Option C", "Option D"], answerIndex: i % 4,
    explanation: "Offline sample quiz \u2014 add an AI provider key in Settings for real questions." })) };
}
function renderQuiz(el) {
  const { set, answers, submitted } = quizState;
  const qs = set.items.questions || [];
  el.innerHTML = `
    <button class="btn sm" onclick="quizState=null;renderers.study()">\u2190 Study</button>
    <div class="h1" style="margin:14px 0 14px">${esc(set.items.title || set.topic)}</div>
    ${qs.map((q, qi) => `
      <div class="card" style="margin-bottom:12px">
        <b style="font-size:14px">${qi + 1}. ${esc(q.question)}</b>
        <div style="margin-top:8px">${(q.options || []).map((o, oi) => {
          const sel = answers[qi] === oi;
          const right = submitted && oi === q.answerIndex, wrong = submitted && sel && oi !== q.answerIndex;
          return `<button class="quiz-opt ${right ? "right" : wrong ? "wrong" : sel ? "sel" : ""}" ${submitted ? "disabled" : ""} onclick="answerQuiz(${qi},${oi})">${esc(o)}</button>`;
        }).join("")}</div>
        ${submitted && q.explanation ? `<div class="muted" style="font-size:12.5px;margin-top:8px;padding:8px;background:var(--bg-3);border-radius:8px">\ud83d\udca1 ${esc(q.explanation)}</div>` : ""}
      </div>`).join("")}
    ${submitted
      ? `<button class="btn primary" style="width:100%" onclick="quizState=null;renderers.study()">Done</button>`
      : `<button class="btn primary" style="width:100%" onclick="submitQuiz()">Submit answers</button>`}`;
}
window.answerQuiz = (qi, oi) => { quizState.answers[qi] = oi; renderers.study(); };
window.submitQuiz = () => {
  const qs = quizState.set.items.questions || [];
  const score = qs.reduce((s, q, i) => s + (quizState.answers[i] === q.answerIndex ? 1 : 0), 0);
  S.studyProgress.unshift({ ts: now(), topic: quizState.set.topic, score, total: qs.length });
  save(); bump("quiz");
  quizState.submitted = true; renderers.study();
  toast(`Score: ${score}/${qs.length}`, score / qs.length >= 0.6 ? "ok" : "err");
};
function renderFlash(el) {
  const { set, idx, flipped } = flashState;
  const cards = set.items.cards || [];
  const card = cards[idx % (cards.length || 1)];
  el.innerHTML = `
    <button class="btn sm" onclick="flashState=null;renderers.study()">\u2190 Study</button>
    <div class="muted" style="text-align:center;font-size:12px;margin:18px 0 10px">${esc(set.topic)} \u00b7 card ${idx + 1}/${cards.length}</div>
    <div class="card flashcard" onclick="flashState.flipped=!flashState.flipped;renderers.study()">${esc(flipped ? (card?.back || "") : (card?.front || ""))}</div>
    <div class="row" style="margin-top:16px">
      <button class="btn grow" ${idx === 0 ? "disabled" : ""} onclick="flipNav(-1)">\u2190 Prev</button>
      <button class="btn primary grow" onclick="flipNav(1)">Next \u2192</button>
    </div>
    <p class="faint" style="text-align:center;font-size:11.5px;margin-top:12px">Click the card to flip</p>`;
}
window.flipNav = d => { flashState.idx = Math.max(0, (flashState.idx + d) % (flashState.set.items.cards || []).length); flashState.flipped = false; renderers.study(); };
window.openStudySet = id => {
  const st = S.studySets.find(x => x.id === id); if (!st) return;
  if (st.type === "quiz") quizState = { set: st, answers: {}, submitted: false };
  else flashState = { set: st, idx: 0, flipped: false };
  renderers.study();
};

/* ---------- ASSISTANTS ---------- */
renderers.assistants = () => {
  $("#page-assistants").innerHTML = `
    <div class="row" style="margin-bottom:16px"><div class="h1 grow">Custom AI</div>
      <button class="btn primary" onclick="newAssistant()">\uff0b Build your AI</button></div>
    ${S.assistants.map(a => `
      <div class="list-item">
        <div style="font-size:22px">\ud83e\udd16</div>
        <div class="grow"><b>${esc(a.name)}</b><div class="muted" style="font-size:12px">${esc(a.description || "")}</div></div>
        <button class="btn sm primary" onclick="chatAssistant('${a.id}')">\ud83d\udcac Chat</button>
        <button class="btn sm" onclick="editAssistant('${a.id}')">\u270f\ufe0f</button>
        <button class="btn sm" onclick="S.assistants=S.assistants.filter(x=>x.id!=='${a.id}');save();renderers.assistants()">\ud83d\uddd1</button>
      </div>`).join("") || `<div class="empty"><div class="e-icon">\ud83e\udde9</div>Build your own assistant \u2014 persona, instructions, style \u2014 then chat with it anytime.</div>`}`;
};
window.newAssistant = () => openAssistantModal(null);
window.editAssistant = id => openAssistantModal(S.assistants.find(a => a.id === id));
function openAssistantModal(a) {
  window._ea = a || null;
  openModal(`<div class="h2">${a ? "Edit" : "Build your AI"} ${a ? "\u2014 " + esc(a.name) : ""}</div>
    <label class="fl">Name</label><input id="as-name" value="${esc(a?.name || "")}" placeholder="e.g. Study Tutor">
    <label class="fl">Description</label><input id="as-desc" value="${esc(a?.description || "")}" placeholder="What is it for?">
    <label class="fl">Personality</label><input id="as-persona" value="${esc(a?.personality || "")}" placeholder="e.g. patient, Socratic, funny">
    <label class="fl">System instructions</label><textarea id="as-sys" placeholder="How should it behave?">${esc(a?.systemPrompt || "")}</textarea>
    <button class="btn primary" style="margin-top:14px" onclick="saveAssistant()">Save</button>`);
}
window.saveAssistant = () => {
  const name = $("#as-name").value.trim(); if (!name) return;
  if (window._ea) {
    Object.assign(window._ea, { name, description: $("#as-desc").value.trim(), personality: $("#as-persona").value.trim(), systemPrompt: $("#as-sys").value });
  } else {
    S.assistants.unshift({ id: uid(), name, description: $("#as-desc").value.trim(), personality: $("#as-persona").value.trim(), systemPrompt: $("#as-sys").value });
  }
  save(); closeModal(); renderers.assistants(); toast("Assistant saved", "ok");
};
window.chatAssistant = id => {
  const a = S.assistants.find(x => x.id === id); if (!a) return;
  const conv = ensureConv("chat");
  conv.title = "\ud83e\udd16 " + a.name;
  conv.messages.push({ id: uid(), role: "system", content: `You are "${a.name}". ${a.systemPrompt || ""} Personality: ${a.personality || "warm and clear"}.`, ts: now() });
  save(); renderConvList(); nav("chat");
};

/* ---------- MEMORY ---------- */
renderers.memory = () => {
  $("#page-memory").innerHTML = `
    <div class="row" style="margin-bottom:4px"><div class="h1 grow">Memory</div>
      <div class="toggle ${S.settings.memoryEnabled ? "on" : ""}" onclick="S.settings.memoryEnabled=!S.settings.memoryEnabled;save();renderers.memory()"></div></div>
    <p class="muted" style="font-size:12.5px;margin-bottom:14px">What Samarth remembers about you \u2014 your data, your control. ${S.settings.memoryEnabled ? "" : "<b style='color:var(--ember)'>Currently OFF \u2014 chats won't use memory.</b>"}</p>
    <div class="card" style="margin-bottom:14px">
      <div class="row"><input id="mem-in" placeholder="Remember that\u2026 e.g. I prefer concise answers and I'm preparing for JEE" onkeydown="if(event.key==='Enter')addMemory()">
      <button class="btn primary" onclick="addMemory()">\uff0b</button></div>
    </div>
    ${S.memories.map(m => `
      <div class="list-item"><div class="grow" style="font-size:13.5px">${esc(m.content)}</div>
        <button class="btn sm" onclick="S.memories=S.memories.filter(x=>x.id!=='${m.id}');save();renderers.memory()">\ud83d\uddd1</button></div>`).join("")
    || `<div class="empty"><div class="e-icon">\ud83e\udde0</div>No memories yet. Add preferences and facts Samarth should know.</div>`}`;
};
window.addMemory = () => {
  const v = $("#mem-in").value.trim(); if (!v) return;
  S.memories.push({ id: uid(), content: v, ts: now() });
  if (!S.settings.memoryEnabled) { S.settings.memoryEnabled = true; toast("Memory enabled"); }
  save(); renderers.memory();
};

/* ---------- AUTOMATIONS ---------- */
renderers.automations = () => {
  $("#page-automations").innerHTML = `
    <div class="row" style="margin-bottom:4px"><div class="h1 grow">Automations</div>
      <button class="btn primary" onclick="newAutomation()">\uff0b New</button></div>
    <p class="muted" style="font-size:12.5px;margin-bottom:14px">Scheduled AI runs. This website runs in your browser, so automations fire while a Samarth tab is open.</p>
    ${S.automations.map(a => `
      <div class="list-item">
        <div class="toggle ${a.enabled ? "on" : ""}" onclick="toggleAutomation('${a.id}')"></div>
        <div class="grow"><b>${esc(a.name)}</b>
          <div class="muted" style="font-size:12px">every ${a.intervalMin >= 60 ? (a.intervalMin / 60) + "h" : a.intervalMin + "min"} \u00b7 ${esc(a.instructions).slice(0, 80)}</div>
          ${(a.history || []).slice(0, 1).map(h => `<div class="faint" style="font-size:11px">${fmtTime(h.ts)}: ${esc((h.output || "").slice(0, 120))}</div>`).join("")}</div>
        <button class="btn sm" onclick="runAutomation('${a.id}')">\u25b6 Run</button>
        <button class="btn sm" onclick="showAutoHistory('${a.id}')">\ud83d\udd59</button>
        <button class="btn sm" onclick="S.automations=S.automations.filter(x=>x.id!=='${a.id}');save();renderers.automations()">\ud83d\uddd1</button>
      </div>`).join("") || `<div class="empty"><div class="e-icon">\u26a1</div>e.g. "Every 2 hours, summarize the latest AI news" \u2014 runs while this tab is open.</div>`}`;
};
window.newAutomation = () => {
  openModal(`<div class="h2">New automation</div>
    <label class="fl">Name</label><input id="au-name" placeholder="AI news digest">
    <label class="fl">Instructions</label><textarea id="au-instr" placeholder="Search for the latest AI news and write a 5-point digest."></textarea>
    <label class="fl">Run every</label>
    <select id="au-interval"><option value="60">1 hour</option><option value="180">3 hours</option><option value="360">6 hours</option><option value="1440">1 day</option></select>
    <button class="btn primary" style="margin-top:14px" onclick="createAutomation()">Create</button>`);
};
window.createAutomation = () => {
  const name = $("#au-name").value.trim(); if (!name) return;
  S.automations.unshift({ id: uid(), name, instructions: $("#au-instr").value, intervalMin: Number($("#au-interval").value), enabled: true, lastRun: 0, history: [] });
  save(); closeModal(); renderers.automations(); toast("Automation created", "ok");
};
window.toggleAutomation = id => { const a = S.automations.find(x => x.id === id); a.enabled = !a.enabled; save(); renderers.automations(); };
window.runAutomation = async id => {
  const a = S.automations.find(x => x.id === id); if (!a) return;
  toast("Running " + a.name + "\u2026");
  let acc = "";
  const results = await webSearch(a.instructions.slice(0, 100), 3);
  await new Promise(resolve => {
    streamChat([
      { role: "system", content: "You are Samarth running a scheduled automation. Complete the task and output the result in markdown." },
      { role: "user", content: a.instructions + (results.length ? "\n\nSearch results:\n" + results.map((r, i) => `[${i + 1}] ${r.title} \u2014 ${r.snippet}`).join("\n") : "") },
    ], { onDelta: d => acc += d, onDone: resolve, onError: () => resolve() });
  });
  a.history = a.history || [];
  a.history.unshift({ ts: now(), output: acc || "(no output)" });
  a.history = a.history.slice(0, 20); a.lastRun = Date.now(); save();
  renderers.automations(); toast("Automation ran \u2014 see history", "ok");
};
window.showAutoHistory = id => {
  const a = S.automations.find(x => x.id === id);
  openModal(`<div class="h2">\ud83d\udd59 ${esc(a.name)}</div>` + (a.history || []).map(h => `
    <div class="list-item"><div class="grow"><div class="muted" style="font-size:11px">${fmtTime(h.ts)}</div>
    <div class="msg-text" style="font-size:12.5px">${mdToHtml(h.output.slice(0, 1500))}</div></div></div>`).join("") || "<p class='muted'>No runs yet.</p>");
};
setInterval(() => {
  S.automations.forEach(a => {
    if (a.enabled && Date.now() - (a.lastRun || 0) > a.intervalMin * 60000 && a.history?.length >= 0) {
      if (a.lastRun || document.visibilityState === "visible") runAutomation(a.id);
    }
  });
}, 60000);

/* ---------- USAGE ---------- */
renderers.usage = () => {
  const u = S.usage;
  const counts = { chats: S.conversations.length, projects: S.projects.length, files: S.files.length, images: S.images.length, memories: S.memories.length, assistants: S.assistants.length, study: S.studySets.length };
  $("#page-usage").innerHTML = `
    <div class="h1" style="margin-bottom:4px">Usage</div>
    <p class="muted" style="font-size:12.5px;margin-bottom:16px">This website runs on your device, so there are no server quotas \u2014 the provider you connect bills directly to your own key.</p>
    <div class="grid3" style="margin-bottom:14px">
      ${[["\ud83d\udcac Messages", u.messages], ["\ud83d\udd2c Research runs", u.research], ["\ud83e\udd16 Agent runs", u.agent], ["\ud83c\udfa8 Images", u.images], ["\ud83c\udf93 Quizzes taken", u.quiz], ["\ud83d\udcc1 Files uploaded", u.files]]
        .map(([l, v]) => `<div class="card" style="text-align:center"><div style="font-size:24px;font-weight:800">${v || 0}</div><div class="muted" style="font-size:11px">${l}</div></div>`).join("")}
    </div>
    <div class="card"><div class="h2">Library</div>
      ${Object.entries(counts).map(([k, v]) => `<div class="kv"><span class="muted">${k}</span><b>${v}</b></div>`).join("")}
      <div style="margin-top:14px" class="row"><button class="btn sm" onclick="exportData()">\u2b07 Export all data (JSON)</button>
      <button class="btn sm" style="border-color:rgba(248,113,113,.4);color:var(--red)" onclick="if(confirm('Erase ALL Samarth data in this browser?')){localStorage.removeItem('${DB_KEY}');location.reload()}">\ud83d\uddd1 Erase everything</button></div>
    </div>`;
};
window.exportData = () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: "application/json" }));
  a.download = "samarth-ai-backup.json"; a.click(); URL.revokeObjectURL(a.href);
  toast("Backup downloaded", "ok");
};

/* ---------- SETTINGS ---------- */
renderers.settings = () => {
  const s = S.settings, k = s.keys;
  const provRow = (id, label, hint) => `
    <div class="list-item"><div class="grow"><b>${label}</b><div class="muted" style="font-size:11.5px">${hint}</div></div>
      <div class="toggle ${s.provider === id ? "on" : ""}" onclick="S.settings.provider='${id}';save();renderers.settings();updateProviderBadge()"></div></div>`;
  $("#page-settings").innerHTML = `
    <div class="h1" style="margin-bottom:16px">Settings</div>
    <div class="card" style="margin-bottom:14px">
      <div class="h2">AI provider</div>
      ${provRow("local", "Samarth Local (built-in)", "Offline, no key needed \u2014 great for trying everything")}
      ${provRow("openai", "OpenAI", "GPT-4o / 4o-mini \u00b7 also enables image generation")}
      ${provRow("groq", "Groq", "Free tier, very fast Llama models")}
      ${provRow("openrouter", "OpenRouter", "One key, hundreds of models")}
      ${provRow("together", "Together AI", "Open models")}
      ${provRow("anthropic", "Anthropic", "Claude models")}
      ${provRow("google", "Google AI", "Gemini models")}
      ${provRow("custom", "Custom / self-hosted", "Any OpenAI-compatible endpoint (vLLM, LM Studio\u2026), or Ollama via base URL")}
      <label class="fl">API key \u2014 stored only in this browser (localStorage), sent directly to the provider</label>
      <input id="set-key" type="password" placeholder="${s.provider === "openai" ? "sk-\u2026" : "paste key\u2026"}" value="${esc(k[s.provider] || "")}" oninput="S.settings.keys[S.settings.provider]=this.value;save();updateProviderBadge()">
      ${s.provider === "custom" ? `<label class="fl">Base URL (OpenAI-compatible, or http://localhost:11434/v1 for Ollama)</label>
        <input value="${esc(s.customBaseUrl)}" oninput="S.settings.customBaseUrl=this.value.trim();save()">` : ""}
      <label class="fl">Model (blank = provider default; click the model name in chat to pick)</label>
      <input value="${esc(s.model)}" oninput="S.settings.model=this.value.trim();save();updateProviderBadge()">
      <label class="fl">Temperature: <span id="temp-val">${s.temperature}</span></label>
      <input type="range" min="0" max="2" step="0.1" value="${s.temperature}" oninput="S.settings.temperature=Number(this.value);document.getElementById('temp-val').textContent=this.value;save()">
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="h2">Web search</div>
      <label class="fl">Tavily API key (optional \u2014 without it, research/search use offline placeholder results)</label>
      <input type="password" value="${esc(s.tavilyKey)}" placeholder="tvly-\u2026" oninput="S.settings.tavilyKey=this.value;save()">
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="h2">Preferences</div>
      <label class="fl">Read-aloud speed: ${s.voiceRate}\u00d7</label>
      <input type="range" min="0.5" max="2" step="0.1" value="${s.voiceRate}" oninput="S.settings.voiceRate=Number(this.value);save()">
      <div class="kv" style="margin-top:10px"><span class="muted">Theme</span>
        <span><span class="chip ${!document.documentElement.classList.contains("light") ? "active" : ""}" onclick="document.documentElement.classList.remove('light');S.settings.theme='dark';save()">\ud83c\udf19 Dark</span>
        <span class="chip ${document.documentElement.classList.contains("light") ? "active" : ""}" onclick="document.documentElement.classList.add('light');S.settings.theme='light';save()">\u2600\ufe0f Light</span></span></div>
    </div>
    <div class="card" style="margin-bottom:14px">
      <div class="h2">Privacy</div>
      <p class="muted" style="font-size:12.5px">Everything \u2014 conversations, files, projects, keys \u2014 lives in this browser's localStorage only. No server, no analytics, no tracking. Requests go directly from your device to the AI provider you configure. Clearing site data erases it all.</p>
    </div>`;
};

/* ---------- burger + init ---------- */
$("#burger").onclick = () => $("#sidebar").classList.toggle("hidden");
renderTools();
if (S.settings.theme === "light") { document.documentElement.classList.add("light"); $("#theme-btn").textContent = "\u2600\ufe0f"; }
renderConvList();
updateModeBtn();
updateProviderBadge();
console.log("%c\u2726 Samarth AI \u2014 One AI. Every Possibility.", "color:#A78BFA;font-weight:bold");
