/* ============================================================
   MODAL
   ============================================================ */
function openModal(html) { $("#modal").innerHTML = html; $("#modal-back").classList.add("open"); }
function closeModal() { $("#modal-back").classList.remove("open"); }
window.closeModal = closeModal;
$("#modal-back").addEventListener("click", e => { if (e.target.id === "modal-back") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

/* ============================================================
   PAGE RENDERERS
   ============================================================ */
const renderers = {};

/* ---------- HOME tools grid ---------- */
const TOOLS = [
  { nav: "chat", mode: "search", icon: "\ud83d\udd0e", name: "Search", desc: "Web-grounded answers" },
  { nav: "chat", mode: "research", icon: "\ud83d\udd2c", name: "Research", desc: "Cited deep reports" },
  { nav: "chat", mode: "agent", icon: "\ud83e\udd16", name: "Agent", desc: "Multi-step tasks" },
  { nav: "chat", mode: "coding", icon: "\ud83d\udcbb", name: "Coding", desc: "Write & debug code" },
  { nav: "chat", mode: "study", icon: "\ud83c\udf93", name: "Study", desc: "Learn step by step" },
  { nav: "images", icon: "\ud83c\udfa8", name: "Images", desc: "Generate visuals" },
  { nav: "builder", icon: "\ud83c\udfd7\ufe0f", name: "App builder", desc: "Idea \u2192 working app" },
  { nav: "data", icon: "\ud83d\udcca", name: "Data", desc: "CSV insights & charts" },
  { nav: "canvas", icon: "\ud83d\udcdd", name: "Canvas", desc: "Docs with versions" },
  { nav: "projects", icon: "\ud83d\uddc2\ufe0f", name: "Projects", desc: "Group your work" },
  { nav: "assistants", icon: "\ud83e\udde9", name: "Custom AI", desc: "Your own assistants" },
  { nav: "automations", icon: "\u26a1", name: "Automations", desc: "Scheduled AI runs" },
];
function renderTools() {
  $("#tools-grid").innerHTML = TOOLS.map(t =>
    `<button class="tool-card-home" data-nav="${t.nav}" ${t.mode ? `data-mode="${t.mode}"` : ""}>
      <div class="t-icon">${t.icon}</div><div class="t-name">${t.name}</div><div class="t-desc">${t.desc}</div>
    </button>`).join("");
}

/* ---------- PROJECTS ---------- */
let currentProjectId = null;
renderers.projects = () => {
  const el = $("#page-projects");
  const p = currentProjectId && S.projects.find(x => x.id === currentProjectId);
  if (p) {
    el.innerHTML = `
      <button class="btn sm" onclick="currentProjectId=null;renderers.projects()">\u2190 All projects</button>
      <div style="margin:14px 0 4px" class="h1">${esc(p.name)}</div>
      <p class="muted" style="font-size:13px;margin-bottom:14px">${esc(p.description || "")}</p>
      <div class="row" style="margin-bottom:14px">
        <button class="btn primary sm" onclick="newProjectNote()">\uff0b Add note</button>
        <button class="btn sm" onclick="askAboutProject()">\ud83d\udcac Ask about this project</button>
      </div>
      ${(p.notes || []).map(n => `
        <div class="list-item">
          <div class="grow"><b>${esc(n.title)}</b>
            <div class="muted" style="font-size:12.5px;white-space:pre-wrap;margin-top:4px">${esc((n.content || "").slice(0, 300))}${(n.content || "").length > 300 ? "\u2026" : ""}</div>
          </div>
          <button class="btn sm" onclick="delNote('${n.id}')">\ud83d\uddd1</button>
        </div>`).join("") || `<div class="empty"><div class="e-icon">\ud83d\udd2c\ufe0f</div>No notes yet \u2014 notes are automatically used as context when you chat inside this project.</div>`}`;
    return;
  }
  el.innerHTML = `
    <div class="row" style="margin-bottom:16px"><div class="h1 grow">Projects</div>
      <button class="btn primary" onclick="newProject()">\uff0b New project</button></div>
    ${S.projects.map(pr => `
      <div class="list-item" style="cursor:pointer" onclick="currentProjectId='${pr.id}';renderers.projects()">
        <div class="grow"><b>${esc(pr.name)}</b>
          <div class="muted" style="font-size:12px">${(pr.notes || []).length} notes \u00b7 ${fmtTime(pr.createdAt)}</div></div>
        <span>\u2192</span>
      </div>`).join("") || `<div class="empty"><div class="e-icon">\ud83d\uddc2\ufe0f</div>Create projects to group chats, files and notes \u2014 project notes become AI context.</div>`}`;
};
window.newProject = () => {
  openModal(`<div class="h2">New project</div>
    <label class="fl">Name</label><input id="np-name" placeholder="e.g. JEE prep">
    <label class="fl">Description</label><textarea id="np-desc" placeholder="Optional"></textarea>
    <button class="btn primary" style="margin-top:14px" onclick="createProject()">Create</button>`);
};
window.createProject = () => {
  const name = $("#np-name").value.trim(); if (!name) return;
  S.projects.unshift({ id: uid(), name, description: $("#np-desc").value.trim(), notes: [], createdAt: now() });
  save(); closeModal(); renderers.projects(); toast("Project created", "ok");
};
window.newProjectNote = () => {
  openModal(`<div class="h2">Add note</div>
    <label class="fl">Title</label><input id="nn-title" placeholder="e.g. Weak chapters list">
    <label class="fl">Content</label><textarea id="nn-content" style="min-height:120px"></textarea>
    <button class="btn primary" style="margin-top:14px" onclick="createNote()">Add</button>`);
};
window.createNote = () => {
  const p = S.projects.find(x => x.id === currentProjectId); if (!p) return;
  const t = $("#nn-title").value.trim(); if (!t) return;
  p.notes.unshift({ id: uid(), title: t, content: $("#nn-content").value, ts: now() });
  save(); closeModal(); renderers.projects();
};
window.delNote = id => { const p = S.projects.find(x => x.id === currentProjectId); p.notes = p.notes.filter(n => n.id !== id); save(); renderers.projects(); };
window.askAboutProject = () => {
  const p = S.projects.find(x => x.id === currentProjectId);
  const conv = ensureConv("chat");
  const noteCtx = (p.notes || []).map(n => n.title + ":\n" + n.content).join("\n---\n");
  conv.messages.push({ id: uid(), role: "system", content: "Project context:\n" + (noteCtx || "(no notes)"), ts: now() });
  nav("chat");
  toast("Project context added to this chat");
};

/* ---------- FILES ---------- */
renderers.files = () => {
  const el = $("#page-files");
  el.innerHTML = `
    <div class="row" style="margin-bottom:16px"><div class="h1 grow">Files</div>
      <button class="btn primary" onclick="uploadFile()">\u2b06 Upload</button></div>
    <p class="muted" style="font-size:12.5px;margin-bottom:12px">Files stay on this device. Text files can be attached to any chat; CSVs feed Data analysis.</p>
    ${S.files.map(f => `
      <div class="list-item">
        <div class="grow"><b>${esc(f.name)}</b>
          <div class="muted" style="font-size:12px">${(f.size / 1024).toFixed(1)} KB \u00b7 ${f.text ? f.text.length.toLocaleString() + " chars extracted" : "binary/image"} \u00b7 ${fmtTime(f.ts)}</div></div>
        <button class="btn sm" onclick="previewFile('${f.id}')">View</button>
        <button class="btn sm" onclick="S.files=S.files.filter(x=>x.id!=='${f.id}');save();renderers.files()">\ud83d\uddd1</button>
      </div>`).join("") || `<div class="empty"><div class="e-icon">\ud83d\udcc1</div>No files yet. Upload text, code, CSV, JSON or images.</div>`}`;
};
window.uploadFile = () => {
  const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true;
  inp.onchange = () => {
    Array.from(inp.files || []).forEach(f => {
      const r = new FileReader();
      r.onload = () => {
        const isText = f.type.startsWith("text") || /\.(txt|md|csv|json|js|ts|py|html|css|java|c|cpp|xml|yml|yaml)$/i.test(f.name);
        const file = { id: uid(), name: f.name, type: f.type || "file", size: f.size, text: isText ? String(r.result).slice(0, 120000) : "", ts: now() };
        if (f.type.startsWith("image/")) file.dataUrl = r.result;
        S.files.unshift(file); save();
      };
      if (f.type.startsWith("image/")) r.readAsDataURL(f); else r.readAsText(f);
    });
    bump("files");
    setTimeout(() => { renderers.files(); toast("Files uploaded", "ok"); }, 400);
  };
  inp.click();
};
window.previewFile = id => {
  const f = S.files.find(x => x.id === id); if (!f) return;
  openModal(`<div class="h2">${esc(f.name)}</div>
    ${f.dataUrl ? `<img src="${f.dataUrl}" style="max-width:100%;border-radius:12px">` : ""}
    <pre style="white-space:pre-wrap;font-size:12px;max-height:400px;overflow:auto;margin-top:10px;color:var(--muted)">${esc((f.text || "(no text extracted \u2014 binary file)").slice(0, 5000))}</pre>`);
};

/* ---------- DATA ANALYSIS ---------- */
let currentDataset = null;
renderers.data = () => {
  const el = $("#page-data");
  el.innerHTML = `
    <div class="row" style="margin-bottom:16px"><div class="h1 grow">Data analysis</div>
      <button class="btn primary" onclick="uploadCsv()">\u2b06 Upload CSV</button></div>
    <div id="data-body">${currentDataset ? "" : `<div class="empty"><div class="e-icon">\ud83d\udcca</div>Upload a CSV to profile columns, spot anomalies, draw charts and ask questions about your data.<br><br><span class="faint" style="font-size:12px">Try a sample: </span><button class="chip" onclick="loadSampleCsv()">load sample sales data</button></div>`}</div>`;
  if (currentDataset) renderDataset();
};
window.uploadCsv = () => {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = ".csv,text/csv";
  inp.onchange = () => {
    const f = inp.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => { currentDataset = parseCsv(String(r.result)); renderers.data(); };
    r.readAsText(f);
  };
  inp.click();
};
window.loadSampleCsv = () => {
  const rows = [["month", "sales", "expenses", "region"],];
  const regions = ["North", "South", "East", "West"];
  let d = new Date(2024, 0, 1), sales = 40000;
  for (let i = 0; i < 24; i++) {
    sales = Math.max(15000, sales + (Math.sin(i / 3.2) * 9000) + (Math.random() * 6000 - 2500));
    rows.push([d.toISOString().slice(0, 7), Math.round(sales), Math.round(sales * (0.55 + Math.random() * 0.25)), regions[i % 4]]);
    d.setMonth(d.getMonth() + 1);
  }
  rows[8][1] = 182000; // anomaly
  currentDataset = parseCsv(rows.map(r => r.join(",")).join("\n"));
  renderers.data(); toast("Sample data loaded", "ok");
};
function parseCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(l => l.trim());
  const delim = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ";" : ",";
  const split = l => { const out = []; let cur = "", q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === delim && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out.map(s => s.trim()); };
  const headers = split(lines[0]).map((h, i) => h || "col" + (i + 1));
  const rows = lines.slice(1).map(l => {
    const cells = split(l); const o = {};
    headers.forEach((h, i) => { const v = cells[i] ?? ""; const n = Number(v); o[h] = (v !== "" && !isNaN(n) && /^-?\d*\.?\d+$/.test(v)) ? n : v; });
    return o;
  });
  // profile
  const columns = headers.map(h => {
    const vals = rows.map(r => r[h]);
    const nums = vals.filter(v => typeof v === "number");
    const type = nums.length >= vals.length * 0.8 ? "number" : "string";
    let stats = null;
    if (type === "number" && nums.length) {
      const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
      const std = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length);
      stats = { mean, std, min: Math.min(...nums), max: Math.max(...nums) };
    }
    return { name: h, type, unique: new Set(vals.map(String)).size, missing: vals.filter(v => v === "" || v == null).length, stats };
  });
  return { headers, rows, columns, name: "dataset" };
}
function renderDataset() {
  const ds = currentDataset; if (!ds) return;
  const numeric = ds.columns.filter(c => c.type === "number").map(c => c.name);
  $("#data-body").innerHTML = `
    <div class="grid2" style="margin-bottom:14px">
      <div class="card"><div class="muted" style="font-size:11px">ROWS</div><div style="font-size:26px;font-weight:800">${ds.rows.length}</div></div>
      <div class="card"><div class="muted" style="font-size:11px">COLUMNS</div><div style="font-size:26px;font-weight:800">${ds.columns.length}</div></div>
    </div>
    <div class="card" style="margin-bottom:14px"><div class="h2">Columns</div>
      <table class="data"><tr><th>Column</th><th>Type</th><th>Unique</th><th>Missing</th><th>Mean</th><th>Min</th><th>Max</th></tr>
      ${ds.columns.map(c => `<tr><td><b>${esc(c.name)}</b></td><td>${c.type === "number" ? "\ud83d\udd22 number" : "\ud83d\udd24 text"}</td><td>${c.unique}</td><td>${c.missing}</td>
        <td>${c.stats ? c.stats.mean.toFixed(1) : "\u2014"}</td><td>${c.stats ? c.stats.min : "\u2014"}</td><td>${c.stats ? c.stats.max : "\u2014"}</td></tr>`).join("")}</table></div>
    <div class="card" style="margin-bottom:14px"><div class="h2">Anomalies (z-score > 3)</div><div id="anomalies">${detectAnomalies(ds).map(a => `<div style="font-size:12.5px;padding:4px 0">\u26a0\ufe0f Row ${a.row}: <b>${esc(a.col)}</b> = ${a.value} (z=${a.z.toFixed(1)})</div>`).join("") || '<span class="muted">None found \u2713</span>'}</div></div>
    <div class="card" style="margin-bottom:14px"><div class="h2">Chart</div>
      <div class="row" style="flex-wrap:wrap;margin-bottom:8px">
        <select id="chart-x" style="width:auto">${ds.headers.map(h => `<option ${numeric.includes(h) ? "" : "selected"}>${esc(h)}</option>`).join("")}</select>
        <span class="muted" style="font-size:12px">vs</span>
        <select id="chart-y" style="width:auto">${ds.headers.map(h => `<option ${numeric[0] === h ? "selected" : ""}>${esc(h)}</option>`).join("")}</select>
        <button class="btn sm" onclick="drawChart()">Draw</button>
      </div>
      <div class="chart-box"><canvas id="chart-canvas" height="260"></canvas></div></div>
    <div class="card"><div class="h2">Ask about this data</div>
      <div class="row"><input id="data-q" placeholder="e.g. Which month had the best sales-to-expense ratio?"><button class="btn primary" onclick="askData()">Ask</button></div>
      <div id="data-answer" style="margin-top:12px"></div></div>`;
  setTimeout(drawChart, 50);
}
function detectAnomalies(ds) {
  const out = [];
  for (const c of ds.columns) {
    if (c.type !== "number" || !c.stats || !c.stats.std) continue;
    ds.rows.forEach((r, i) => {
      const v = r[c.name];
      if (typeof v === "number") {
        const z = Math.abs((v - c.stats.mean) / c.stats.std);
        if (z > 3) out.push({ row: i + 1, col: c.name, value: v, z });
      }
    });
  }
  return out.slice(0, 12);
}
window.drawChart = () => {
  const ds = currentDataset; if (!ds) return;
  const xName = $("#chart-x").value, yName = $("#chart-y").value;
  const cv = $("#chart-canvas"); if (!cv) return;
  const ctx = cv.getContext("2d");
  cv.width = cv.parentElement.clientWidth - 20;
  const W = cv.width, H = cv.height, pad = 42;
  ctx.clearRect(0, 0, W, H);
  const pts = ds.rows.map(r => ({ x: r[xName], y: Number(r[yName]) })).filter(p => !isNaN(p.y));
  if (!pts.length) return;
  const yMin = Math.min(...pts.map(p => p.y)), yMax = Math.max(...pts.map(p => p.y));
  const style = getComputedStyle(document.documentElement);
  const grid = style.getPropertyValue("--line-2") || "#333", muted = style.getPropertyValue("--muted") || "#999";
  // grid
  ctx.strokeStyle = grid; ctx.fillStyle = muted; ctx.font = "10px sans-serif"; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad + (H - 2 * pad) * (i / 4);
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(W - 8, y); ctx.stroke();
    ctx.fillText(shortNum(yMax - (yMax - yMin) * (i / 4)), 2, y + 3);
  }
  const px = i => pad + (W - pad - 14) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
  const py = v => pad + (H - 2 * pad) * (1 - (v - yMin) / ((yMax - yMin) || 1));
  const grad = ctx.createLinearGradient(0, pad, 0, H - pad);
  grad.addColorStop(0, "rgba(124,92,255,.45)"); grad.addColorStop(1, "rgba(14,165,233,.03)");
  ctx.beginPath(); ctx.moveTo(px(0), H - pad);
  pts.forEach((p, i) => ctx.lineTo(px(i), py(p.y)));
  ctx.lineTo(px(pts.length - 1), H - pad); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(px(i), py(p.y)) : ctx.moveTo(px(i), py(p.y)));
  ctx.strokeStyle = "#7C5CFF"; ctx.lineWidth = 2.2; ctx.stroke();
  pts.forEach((p, i) => { ctx.beginPath(); ctx.arc(px(i), py(p.y), 3, 0, 7); ctx.fillStyle = "#A78BFA"; ctx.fill(); });
  // x labels (thinned)
  ctx.fillStyle = muted;
  const step = Math.max(1, Math.ceil(pts.length / 8));
  pts.forEach((p, i) => { if (i % step === 0) ctx.fillText(String(p.x).slice(0, 8), px(i) - 12, H - 14); });
};
function shortNum(n) { return Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + "M" : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(1) + "k" : Math.round(n); }
window.askData = async () => {
  const q = $("#data-q").value.trim(); if (!q || !currentDataset) return;
  const ds = currentDataset;
  const profile = `Dataset columns:\n` + ds.columns.map(c => `${c.name} (${c.type}, unique=${c.unique}${c.stats ? `, mean=${c.stats.mean.toFixed(1)}, min=${c.stats.min}, max=${c.stats.max}` : ""})`).join("\n")
    + `\n\nFirst 15 rows (JSON):\n` + JSON.stringify(ds.rows.slice(0, 15));
  const out = $("#data-answer");
  out.innerHTML = '<span class="dots"><span></span><span></span><span></span></span>';
  let acc = "";
  streamChat([
    { role: "system", content: "You are Samarth, a data analyst. Answer questions about the user's dataset precisely, in markdown. If data is insufficient, say so." },
    { role: "user", content: profile + "\n\nQuestion: " + q },
  ], { onDelta: d => { acc += d; out.innerHTML = mdToHtml(acc); }, onDone: () => { out.innerHTML = mdToHtml(acc); bump("messages"); }, onError: e => out.innerHTML = "\u26a0\ufe0f " + e });
};
