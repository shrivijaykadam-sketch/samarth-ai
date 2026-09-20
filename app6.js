/* ---------- CANVAS ---------- */
let currentCanvasId = null;
renderers.canvas = () => {
  const el = $("#page-canvas");
  const c = currentCanvasId && S.canvases.find(x => x.id === currentCanvasId);
  if (c) {
    el.innerHTML = `
      <button class="btn sm" onclick="currentCanvasId=null;renderers.canvas()">\u2190 All documents</button>
      <div class="row" style="margin:14px 0 10px"><div class="h1 grow">${esc(c.title)}</div>
        <button class="btn sm" onclick="aiWriteCanvas()">\u2726 AI write</button>
        <button class="btn sm" onclick="saveCanvas()">\ud83d\udcb0 Save</button>
        <button class="btn sm" onclick="showVersions()">\ud83d\udd59 Versions</button></div>
      <textarea id="canvas-editor" style="min-height:380px;font-family:Consolas,monospace;font-size:13px">${esc(c.content)}</textarea>
      <div class="h2" style="margin-top:16px">Preview</div>
      <div class="card msg-text" id="canvas-preview"></div>`;
    const render = () => $("#canvas-preview").innerHTML = mdToHtml($("#canvas-editor").value);
    $("#canvas-editor").oninput = render; render();
    return;
  }
  el.innerHTML = `
    <div class="row" style="margin-bottom:16px"><div class="h1 grow">Canvas</div>
      <button class="btn primary" onclick="newCanvas()">\uff0b New document</button></div>
    ${S.canvases.map(x => `
      <div class="list-item" style="cursor:pointer" onclick="currentCanvasId='${x.id}';renderers.canvas()">
        <div class="grow"><b>${esc(x.title)}</b><div class="muted" style="font-size:12px">${(x.versions || []).length} versions \u00b7 ${fmtTime(x.ts)}</div></div><span>\u2192</span>
      </div>`).join("") || `<div class="empty"><div class="e-icon">\ud83d\udcdd</div>Draft documents and code with AI assistance. Every save creates a version you can restore.</div>`}`;
};
window.newCanvas = () => {
  openModal(`<div class="h2">New document</div>
    <label class="fl">Title</label><input id="nc-title" placeholder="e.g. Project report">
    <button class="btn primary" style="margin-top:14px" onclick="createCanvas()">Create</button>`);
};
window.createCanvas = () => {
  const t = $("#nc-title").value.trim() || "Untitled";
  S.canvases.unshift({ id: uid(), title: t, content: "", versions: [], ts: now() });
  currentCanvasId = S.canvases[0].id; save(); closeModal(); renderers.canvas();
};
window.saveCanvas = () => {
  const c = S.canvases.find(x => x.id === currentCanvasId); if (!c) return;
  c.content = $("#canvas-editor").value;
  c.versions.unshift({ content: c.content, ts: now() }); c.versions = c.versions.slice(0, 10);
  c.ts = now(); save(); toast("Saved (version " + c.versions.length + ")", "ok");
};
window.aiWriteCanvas = async () => {
  const c = S.canvases.find(x => x.id === currentCanvasId); if (!c) return;
  openModal(`<div class="h2">\u2726 AI write</div>
    <label class="fl">What should Samarth write?</label>
    <textarea id="cw-instr" placeholder="e.g. an outline, then expand section 2"></textarea>
    <button class="btn primary" style="margin-top:12px" onclick="doAiWriteCanvas()">Write</button>`);
};
window.doAiWriteCanvas = async () => {
  const instr = $("#cw-instr").value.trim(); closeModal();
  const c = S.canvases.find(x => x.id === currentCanvasId); if (!c || !instr) return;
  const ed = $("#canvas-editor");
  let acc = ed.value ? ed.value + "\n\n" : "";
  const baseLen = acc.length;
  streamChat([
    { role: "system", content: "You are Samarth, an expert writer. Continue/rewrite the user's document per instruction. Output ONLY markdown document content, no commentary." },
    { role: "user", content: `Current document:\n${ed.value || "(empty)"}\n\nInstruction: ${instr}` },
  ], { onDelta: d => { acc += d; ed.value = acc; $("#canvas-preview").innerHTML = mdToHtml(acc); }, onDone: () => { c.content = acc; save(); toast("Done \u2014 review & save", "ok"); bump("messages"); }, onError: e => toast(e, "err") });
};
window.showVersions = () => {
  const c = S.canvases.find(x => x.id === currentCanvasId);
  openModal(`<div class="h2">Versions</div>` + (c.versions || []).map((v, i) => `
    <div class="list-item"><div class="grow"><b>Version ${c.versions.length - i}</b><div class="muted" style="font-size:12px">${fmtTime(v.ts)}</div></div>
    <button class="btn sm" onclick="restoreVersion(${i})">Restore</button></div>`).join("") + `<p class="muted" style="font-size:12px">Last 10 versions kept.</p>`);
};
window.restoreVersion = i => {
  const c = S.canvases.find(x => x.id === currentCanvasId);
  $("#canvas-editor").value = c.versions[i].content;
  $("#canvas-preview").innerHTML = mdToHtml(c.versions[i].content);
  closeModal(); toast("Restored \u2014 save to keep");
};

/* ---------- APP BUILDER ---------- */
let currentBuilderId = null;
renderers.builder = () => {
  const el = $("#page-builder");
  const b = currentBuilderId && S.builders.find(x => x.id === currentBuilderId);
  if (b) {
    const activeIdx = window._bTab || 0;
    const files = b.files || [];
    const file = files[activeIdx] || files[0];
    window._bTab = files.indexOf(file);
    const hasHtml = files.some(f => f.path.endsWith(".html"));
    el.innerHTML = `
      <button class="btn sm" onclick="currentBuilderId=null;renderers.builder()">\u2190 All builds</button>
      <div class="h1" style="margin:14px 0 4px">${esc(b.description).slice(0, 60)}</div>
      <p class="muted" style="font-size:12.5px;margin-bottom:12px">${files.length} files</p>
      <div class="row" style="flex-wrap:wrap">
        <button class="btn sm primary" onclick="iterateBuilder()">\u2726 Iterate</button>
        <button class="btn sm" onclick="downloadBuilder()">\u2b07 Download all</button>
        ${hasHtml ? `<button class="btn sm" onclick="previewBuilder()">\ud83d\udc41 Preview</button>` : ""}
      </div>
      <div id="builder-files">${files.map((f, i) => `<span class="file-tab ${i === window._bTab ? "active" : ""}" onclick="_bTab=${i};renderers.builder()">${esc(f.path)}</span>`).join("")}</div>
      ${file ? `<textarea id="bf-editor" style="min-height:320px;font-family:Consolas,monospace;font-size:12.5px">${esc(file.content)}</textarea>
      <button class="btn sm" style="margin-top:8px" onclick="saveBuilderFile('${esc(file.path)}')">\ud83d\udcb0 Save file</button>` : ""}`;
    return;
  }
  el.innerHTML = `
    <div class="h1" style="margin-bottom:4px">App builder</div>
    <p class="muted" style="font-size:13px;margin-bottom:16px">Describe an app or website \u2014 get working files you can edit, preview and download.</p>
    <div class="card">
      <textarea id="builder-desc" placeholder="e.g. A simple expense tracker with add/delete and a monthly total, in one HTML file, dark theme, \u20b9 amounts"></textarea>
      <button class="btn primary" style="margin-top:10px" onclick="generateBuild()">\ud83c\udfd7\ufe0f Build it</button>
    </div>
    ${S.builders.map(x => `
      <div class="list-item" style="cursor:pointer;margin-top:10px" onclick="currentBuilderId='${x.id}';_bTab=0;renderers.builder()">
        <div class="grow"><b>${esc(x.description).slice(0, 70)}</b><div class="muted" style="font-size:12px">${x.files.length} files \u00b7 ${fmtTime(x.ts)}</div></div><span>\u2192</span>
      </div>`).join("")}`;
};
window.generateBuild = async () => {
  const desc = $("#builder-desc").value.trim(); if (!desc) return;
  const out = $("#builder-desc");
  out.disabled = true;
  let acc = "";
  toast("Generating\u2026 this can take a minute");
  await new Promise(resolve => {
    streamChat([
      { role: "system", content: "You are an expert full-stack engineer. Generate a complete, working project as JSON: {\"files\":[{\"path\":\"index.html\",\"content\":\"...\"}]}. Keep it small and self-contained (inline CSS/JS, CDN allowed, no build step). Return ONLY JSON, no markdown fences." },
      { role: "user", content: desc },
    ], { onDelta: d => acc += d, onDone: resolve, onError: e => { toast(e, "err"); resolve(); } });
  });
  out.disabled = false;
  let files = [];
  try { files = (JSON.parse(extractJson(acc)).files || []).filter(f => f.path && typeof f.content === "string"); } catch {}
  if (!files.length) files = [{ path: "index.html", content: fallbackApp(desc, acc) }];
  S.builders.unshift({ id: uid(), description: desc, files: files.slice(0, 12), ts: now() });
  save(); currentBuilderId = S.builders[0].id; window._bTab = 0;
  renderers.builder(); toast("Build ready \u2014 " + files.length + " files", "ok");
};
function fallbackApp(desc, aiText) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Generated app</title>
<style>body{font-family:sans-serif;background:#0B0D12;color:#E7E9F0;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}
.c{max-width:560px;padding:32px;background:#151926;border-radius:16px;border:1px solid rgba(255,255,255,.1)}
h1{margin:0 0 10px;font-size:20px}p{color:#9AA1B5;font-size:14px;line-height:1.6}</style></head><body>
<div class="c"><h1>\u2726 Samarth build</h1><p>Requested: <b>${esc(desc)}</b></p>
<p>The AI response could not be parsed into files (offline model or parse error). Edit this file, or retry with a real provider key in Settings.</p></div></body></html>`;
}
window.saveBuilderFile = path => {
  const b = S.builders.find(x => x.id === currentBuilderId); if (!b) return;
  const f = b.files.find(x => x.path === path); if (!f) return;
  f.content = $("#bf-editor").value; save(); toast("File saved", "ok");
};
window.iterateBuilder = async () => {
  const b = S.builders.find(x => x.id === currentBuilderId); if (!b) return;
  openModal(`<div class="h2">Iterate</div>
    <label class="fl">What should change?</label><textarea id="bi-instr" placeholder="e.g. add a dark/light toggle"></textarea>
    <button class="btn primary" style="margin-top:12px" onclick="doIterateBuilder()">Apply</button>`);
};
window.doIterateBuilder = async () => {
  const instr = $("#bi-instr").value.trim(); closeModal();
  const b = S.builders.find(x => x.id === currentBuilderId); if (!b || !instr) return;
  toast("Iterating\u2026");
  let acc = "";
  await new Promise(resolve => {
    streamChat([
      { role: "system", content: "You are an expert engineer iterating on a project. Return ONLY JSON with the SAME shape {\"files\":[...]}, containing ONLY changed or new files." },
      { role: "user", content: `Project: ${b.description}\n\nFiles:\n${b.files.map(f => "--- " + f.path + " ---\n" + f.content.slice(0, 6000)).join("\n\n")}\n\nChange: ${instr}` },
    ], { onDelta: d => acc += d, onDone: resolve, onError: e => { toast(e, "err"); resolve(); } });
  });
  let changed = [];
  try { changed = (JSON.parse(extractJson(acc)).files || []).filter(f => f.path && typeof f.content === "string"); } catch {}
  changed.slice(0, 10).forEach(nf => {
    const ex = b.files.find(f => f.path === nf.path);
    if (ex) ex.content = nf.content; else b.files.push(nf);
  });
  b.ts = now(); save(); renderers.builder();
  toast(changed.length ? "Updated " + changed.length + " file(s)" : "No parseable changes \u2014 try again", changed.length ? "ok" : "err");
};
window.previewBuilder = () => {
  const b = S.builders.find(x => x.id === currentBuilderId); if (!b) return;
  let html = b.files.find(f => f.path.endsWith(".html"))?.content || "";
  // inline local css/js references
  b.files.filter(f => f.path.endsWith(".css")).forEach(f => { html = html.replace(new RegExp(`<link[^>]*href=["']\\.?/?${f.path.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}["'][^>]*>`, "i"), `<style>${f.content}</style>`); });
  b.files.filter(f => f.path.endsWith(".js")).forEach(f => { html = html.replace(new RegExp(`<script[^>]*src=["']\\.?/?${f.path.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}["'][^>]*><\/script>`, "i"), `<script>${f.content}<\/` + "script>"); });
  openModal(`<div class="h2">\ud83d\udc41 Live preview</div><iframe id="preview-frame" sandbox="allow-scripts allow-modals allow-forms"></iframe>`);
  $("#preview-frame").srcdoc = html;
};
window.downloadBuilder = () => {
  const b = S.builders.find(x => x.id === currentBuilderId); if (!b) return;
  b.files.forEach(f => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([f.content], { type: "text/plain" }));
    a.download = f.path.replace(/\//g, "_");
    a.click(); URL.revokeObjectURL(a.href);
  });
  toast("Downloading " + b.files.length + " files");
};

/* ---------- IMAGES ---------- */
renderers.images = () => {
  const el = $("#page-images");
  el.innerHTML = `
    <div class="h1" style="margin-bottom:4px">Images</div>
    <p class="muted" style="font-size:12.5px;margin-bottom:14px">${S.settings.provider === "openai" && S.settings.keys.openai ? "OpenAI image generation is active." : "Offline art mode: deterministic gradient art from your prompt. Add an OpenAI key in Settings for photorealistic AI images."}</p>
    <div class="card" style="margin-bottom:16px">
      <div class="row"><input id="img-prompt" placeholder="Describe the image\u2026 e.g. a lantern-lit Mumbai street in monsoon rain, warm reflections" onkeydown="if(event.key==='Enter')genImage()">
      <button class="btn primary" onclick="genImage()">\ud83c\udfa8 Generate</button></div>
    </div>
    <div id="img-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px">
      ${S.images.map(im => `<div class="card" style="padding:10px">
        <img src="${im.url}" style="width:100%;border-radius:10px" loading="lazy">
        <div class="muted" style="font-size:11px;margin-top:7px">${esc(im.prompt).slice(0, 90)}</div>
        <div class="row" style="margin-top:6px">
          <a class="btn sm" href="${im.url}" download="samarth-image.png">\u2b07</a>
          <button class="btn sm" onclick="remixImage('${im.id}')">\u2726 Remix</button>
        </div></div>`).join("")}
    </div>
    ${!S.images.length ? `<div class="empty"><div class="e-icon">\ud83c\udfa8</div>No images yet \u2014 describe one above.</div>` : ""}`;
};
window.genImage = async () => {
  const p = $("#img-prompt").value.trim(); if (!p) return;
  $("#img-prompt").value = "";
  toast("Generating\u2026");
  try {
    const url = await generateImage(p, "1024x1024");
    S.images.unshift({ id: uid(), prompt: p, url, ts: now() }); save(); bump("images");
    renderers.images(); toast("Image ready", "ok");
  } catch (e) { toast(e.message || String(e), "err"); }
};
window.remixImage = id => {
  const im = S.images.find(x => x.id === id); if (!im) return;
  $("#img-prompt").value = "Variation of: " + im.prompt + " \u2014 try a new mood and palette";
  $("#img-prompt").focus();
};
