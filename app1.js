const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const AMP = String.fromCharCode(38), Q = String.fromCharCode(34), SQ = String.fromCharCode(39);
const ESC_MAP = {}; ESC_MAP["&"] = AMP+"amp;"; ESC_MAP["<"] = AMP+"lt;"; ESC_MAP[">"] = AMP+"gt;"; ESC_MAP[Q] = AMP+"quot;"; ESC_MAP[SQ] = AMP+"#39;";
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ESC_MAP[c]);
const now = () => new Date().toISOString();
const fmtTime = iso => { const d = new Date(iso); return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function toast(msg, kind) {
  const t = document.createElement("div");
  t.className = "toast " + (kind || "");
  t.textContent = msg;
  $("#toast-wrap").appendChild(t);
  setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .3s"; setTimeout(() => t.remove(), 320); }, 2600);
}

/* ---------- state (localStorage database) ---------- */
const DB_KEY = "samarth.web.v1";
const DEFAULT_STATE = {
  settings: {
    provider: "local",            // local | openai | groq | openrouter | together | custom | anthropic | google | ollama
    keys: { openai: "", groq: "", openrouter: "", together: "", custom: "", anthropic: "", google: "", ollama: "" },
    customBaseUrl: "",
    model: "",
    temperature: 0.7,
    ttsEnabled: false,
    voiceRate: 1,
    memoryEnabled: true,
    tavilyKey: "",
    theme: "dark",
  },
  conversations: [],   // {id,title,mode,model,createdAt,messages:[{id,role,content,sources,mode,model,ts}]}
  projects: [],       // {id,name,description,notes:[{id,title,content,ts}],createdAt}
  files: [],           // {id,name,type,size,text,ts}  (text extracted client-side)
  canvases: [],        // {id,title,content,versions:[{content,ts}],ts}
  builders: [],        // {id,description,files:[{path,content}],ts}
  images: [],          // {id,prompt,url(dataURL),ts}
  assistants: [],      // {id,name,description,personality,systemPrompt,responseStyle}
  memories: [],       // {id,content,ts}
  automations: [],     // {id,name,intervalMin,instructions,enabled,history:[{ts,status,output}]}
  studySets: [],       // {id,type,topic,items,ts}
  studyProgress: [],   // {ts,topic,score,total}
  usage: { messages: 0, research: 0, agent: 0, images: 0, quiz: 0, files: 0, dataMs: 0 },
};

let S = loadState();
function loadState() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_STATE));
    const st = JSON.parse(raw);
    return { ...JSON.parse(JSON.stringify(DEFAULT_STATE)), ...st, settings: { ...DEFAULT_STATE.settings, ...(st.settings || {}) }, usage: { ...DEFAULT_STATE.usage, ...(st.usage || {}) } };
  } catch { return JSON.parse(JSON.stringify(DEFAULT_STATE)); }
}
function save() { try { localStorage.setItem(DB_KEY, JSON.stringify(S)); } catch (e) { toast("Storage full \u2014 export & clear old data in Settings", "err"); } }
function bump(k) { S.usage[k] = (S.usage[k] || 0) + 1; save(); }

/* ---------- markdown (compact, safe subset) ---------- */
function mdToHtml(src) {
  if (!src) return "";
  const blocks = [];
  let text = String(src).replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    blocks.push(`<pre><code>${esc(code.replace(/\n$/, ""))}</code></pre>`);
    return "\u0000B" + (blocks.length - 1) + "\u0000";
  });
  text = esc(text);
  // tables
  text = text.replace(/(^\|.+\|$\n?)+/gm, tbl => {
    const rows = tbl.trim().split("\n").map(r => r.split("|").slice(1, -1).map(c => c.trim()));
    if (rows.length < 2 || !/^[\s:|-]+$/.test(rows[1].join(""))) return tbl;
    const head = rows[0], body = rows.slice(2);
    return `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join("")}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  });
  text = text
    .replace(/^#### (.*)$/gm, "<h4>$1</h4>").replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>").replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/^> (.*)$/gm, "<blockquote>$1</blockquote>")
    .replace(/^\s*[-*] (.*)$/gm, "<li>$1</li>")
    .replace(/^\s*\d+\. (.*)$/gm, "<li data-ol>$1</li>")
    .replace(/(<li>[\s\S]*?<\/li>)(?![\s\S]*?<li)/g, m => m) // keep
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|\s)\*([^*\n]+)\*/g, "$1<i>$2</i>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  // group consecutive <li>
  text = text.replace(/(<li(?: data-ol)?>.*<\/li>\n?)+/g, m => (m.includes("data-ol") ? "<ol>" + m.replace(/ data-ol/g, "") + "</ol>" : "<ul>" + m + "</ul>"));
  // paragraphs
  const parts = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  text = parts.map(p => /^<(h\d|ul|ol|pre|blockquote|table)/.test(p) ? p : `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("");
  return text.replace(/\u0000B(\d+)\u0000/g, (_, i) => blocks[+i]);
}
