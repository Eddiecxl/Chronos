(async () => {
  const CONFIG_KEY = "pl900-admin-config-v1";
  const DB_NAME = "pl900-trainer-admin";
  const CONFIG_FILE = "pl900-trainer-config.json";
  const openConfigDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("settings");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const loadAdminConfig = async () => {
    if (/^https?:$/.test(location.protocol)) {
      try {
        const response = await fetch(`${CONFIG_FILE}?v=${Date.now()}`, { cache: "no-store" });
        if (response.ok) return await response.json();
      } catch (error) { console.warn("Trainer-folder configuration not found; using browser copy", error); }
    }
    try {
      const db = await openConfigDb();
      const transaction = db.transaction("settings");
      const store = transaction.objectStore("settings");
      const read = key => new Promise((resolve, reject) => { const request = store.get(key); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
      const [value, folderHandle] = await Promise.all([read("config"), read("trainerDirectory")]);
      db.close();
      if (folderHandle && await folderHandle.queryPermission({ mode: "read" }) === "granted") {
        try { const fileHandle = await folderHandle.getFileHandle(CONFIG_FILE); return JSON.parse(await (await fileHandle.getFile()).text()); }
        catch (error) { console.warn("Trainer-folder configuration unavailable; using browser copy", error); }
      }
      if (value) return value;
    } catch (error) { console.warn("IndexedDB configuration unavailable", error); }
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}; } catch { return {}; }
  };
  const adminConfig = await loadAdminConfig();
  const auditQuestions = window.PL900_QUESTION_AUDIT?.questions || {};
  function sourceAnswer(q) {
    if (q.answer) return q.answer;
    const match = (q.search || "").match(/(?:Correct|Suggested)\s+Answe.{0,6}?\s*([A-F](?:\s*[,/&+]?\s*[A-F])*)\b/i);
    return match ? [...new Set(match[1].toUpperCase().match(/[A-F]/g) || [])].join("") : "";
  }
  const deletedQuestions = new Set((adminConfig.deletedQuestions || []).map(Number));
  const addedQuestions = Object.values(adminConfig.addedQuestions || {});
  const questions = [...(window.PL900_QUESTIONS || []), ...addedQuestions].filter(source => !deletedQuestions.has(Number(source.number))).map(source => {
    const q = { ...source, ...(adminConfig.questions?.[source.number] || {}) };
    const audited = auditQuestions[source.number] || {};
    q.promptImages = (q.promptImages || []).filter(path => !/q(?:181|188)-2\.jpg$/i.test(path));
    q.answer = sourceAnswer(q) || audited.answer || "";
    if (!adminConfig.questions?.[source.number]?.choices && audited.choices?.length) q.choices = audited.choices;
    if (audited.type === "choice") q.mode = "choice";
    if (q.choices?.length && q.answer) {
      q.choices = [...new Set([...q.choices, ...q.answer])].sort();
      q.mode = "choice";
    }
    return q;
  }).sort((a, b) => a.number - b.number);
  const interactions = { ...(window.PL900_INTERACTIONS || {}) };
  Object.entries(auditQuestions).forEach(([number, audited]) => {
    if (audited.interaction) interactions[number] = { ...(interactions[number] || {}), ...audited.interaction };
  });
  Object.entries(adminConfig.interactions || {}).forEach(([number, override]) => {
    interactions[number] = { ...(interactions[number] || {}), ...override };
  });
  // A new key deliberately starts every repaired answer area clean.
  const STORAGE_KEY = "pl900-trainer-v4-complete-clean";
  const $ = (id) => document.getElementById(id);
  const els = {
    list: $("questionList"), search: $("searchInput"), filters: $("filters"), done: $("doneCount"), score: $("scorePercent"),
    progressText: $("progressText"), progressBar: $("progressBar"), position: $("positionLabel"), title: $("questionTitle"),
    prompts: $("promptImages"), interaction: $("interaction"), answerPanel: $("answerPanel"), answers: $("answerImages"),
    viewer: $("questionViewer"), questionView: $("questionViewBtn"), answerView: $("answerViewBtn"), fitPage: $("fitPageBtn"), fitWidth: $("fitWidthBtn"),
    zoomOut: $("zoomOutBtn"), zoomIn: $("zoomInBtn"), zoomLabel: $("zoomLabel"),
    questionCard: $("questionCard"), mobilePaneSwitch: $("mobilePaneSwitch"), mobileQuestionPane: $("mobileQuestionPaneBtn"), mobileAnswerPane: $("mobileAnswerPaneBtn"),
    answerSummary: $("answerSummary"), review: $("reviewBtn"), prev: $("prevBtn"), next: $("nextBtn"), nav: $("navPosition"),
    surprise: $("surpriseBtn"), reset: $("resetBtn"), sidebar: $("sidebar"), menu: $("menuBtn"), scrim: $("scrim"), admin: $("adminConfigLink")
  };
  let saved = load();
  const requestedQuestion = Number((location.hash.match(/^#q(\d+)$/) || [])[1]);
  let current = Math.max(0, questions.findIndex(q => q.number === requestedQuestion));
  let selected = new Set();
  let filter = "all";
  let query = "";
  const defaultViewerZoom = matchMedia("(max-width: 560px)").matches ? 1.25 : 1;
  let viewerZoom = defaultViewerZoom;

  function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; } }
  function persist() { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); }
  function record(q) { return saved[q.number] || (saved[q.number] = {}); }
  function completed(r) { return r.result === "correct" || r.result === "wrong"; }
  function matching() {
    return questions.filter(q => {
      const r = saved[q.number] || {};
      const statusOk = filter === "all" || (filter === "open" && !completed(r)) || (filter === "review" && r.review);
      const queryOk = !query || String(questions.indexOf(q) + 1).includes(query) || String(q.number).includes(query) || q.search.toLowerCase().includes(query);
      return statusOk && queryOk;
    });
  }
  function imageStack(target, paths, alt) {
    target.innerHTML = "";
    paths.forEach((path, i) => { const img = new Image(); img.src = path; img.alt = `${alt}${paths.length > 1 ? `, part ${i + 1}` : ""}`; img.loading = i ? "lazy" : "eager"; img.decoding = "async"; target.appendChild(img); });
  }
  function renderList(force = false) {
    if (!force && !els.sidebar.classList.contains("open")) return;
    const visible = matching();
    els.list.innerHTML = "";
    visible.forEach(q => {
      const r = saved[q.number] || {};
      const b = document.createElement("button");
      b.className = `q-jump${q === questions[current] ? " current" : ""}${r.result ? ` ${r.result}` : ""}${r.review ? " review" : ""}`;
      b.textContent = q.number;
      b.title = `Question ${q.number}`;
      b.onclick = () => { current = questions.indexOf(q); closeMenu(); render(); };
      els.list.appendChild(b);
    });
  }
  function renderStats() {
    const records = questions.map(q => saved[q.number] || {});
    const done = records.filter(completed).length;
    const correct = records.filter(r => r.result === "correct").length;
    els.done.textContent = done;
    els.score.textContent = done ? `${Math.round(correct / done * 100)}%` : "—";
    els.progressText.textContent = `${done} / ${questions.length}`;
    els.progressBar.style.width = `${done / questions.length * 100}%`;
  }
  function reveal(q, summary) {
    els.answerSummary.textContent = summary || (q.answer ? `Correct answer: ${q.answer.split("").join(", ")}` : "Source answer");
    imageStack(els.answers, q.answerImages, `Answer for question ${q.number}`);
    els.answerView.hidden = false;
    setMobilePane("question");
    showViewer("answer");
  }
  function showViewer(mode) {
    const answer = mode === "answer" && !els.answerView.hidden;
    els.prompts.hidden = answer;
    els.answerPanel.hidden = !answer;
    els.questionView.classList.toggle("active", !answer);
    els.answerView.classList.toggle("active", answer);
    els.viewer.scrollTop = 0;
    els.viewer.scrollLeft = 0;
  }
  function resetViewer() {
    els.answerView.hidden = true;
    els.answerPanel.hidden = true;
    els.prompts.hidden = false;
    showViewer("question");
  }
  function setViewerFit(mode) {
    const page = mode === "page";
    if (!page) setViewerZoom(1);
    els.viewer.classList.toggle("fit-page", page);
    els.viewer.classList.toggle("fit-width", !page);
    els.fitPage.classList.toggle("active", page);
    els.fitWidth.classList.toggle("active", !page);
    els.viewer.scrollTop = 0;
    els.viewer.scrollLeft = 0;
  }
  function setViewerZoom(value) {
    viewerZoom = Math.max(.75, Math.min(2.5, Math.round(value * 4) / 4));
    els.viewer.style.setProperty("--viewer-zoom", viewerZoom);
    els.zoomLabel.textContent = `${Math.round(viewerZoom * 100)}%`;
    els.zoomOut.disabled = viewerZoom <= .75;
    els.zoomIn.disabled = viewerZoom >= 2.5;
    if (viewerZoom !== 1) {
      els.viewer.classList.remove("fit-page");
      els.viewer.classList.add("fit-width");
      els.fitPage.classList.remove("active");
      els.fitWidth.classList.add("active");
    }
  }
  function setMobilePane(mode) {
    const answer = mode === "answer";
    els.questionCard.dataset.mobilePane = answer ? "answer" : "question";
    els.mobileQuestionPane.classList.toggle("active", !answer);
    els.mobileAnswerPane.classList.toggle("active", answer);
    els.mobileQuestionPane.setAttribute("aria-pressed", String(!answer));
    els.mobileAnswerPane.setAttribute("aria-pressed", String(answer));
    (answer ? els.interaction : els.viewer).scrollTop = 0;
  }
  function questionKind(q) {
    if (q.acceptedAnswers?.length) return "admintext";
    if (interactions[q.number]?.type) return interactions[q.number].type;
    if (/DRAG\s*(?:DROP|OROP)|Select and Place/i.test(q.search)) return "dragdrop";
    if (/HOTSPOT|Hot Area|select Yes if|select the appropriate option/i.test(q.search)) return "hotspot";
    return q.mode;
  }
  function selfAssessment(q, r, row) {
    row.innerHTML = "";
    const yes = document.createElement("button"); yes.className = "action"; yes.textContent = "I got it right";
    const no = document.createElement("button"); no.className = "action self-wrong"; no.textContent = "Needs another pass";
    const mark = result => {
      r.result = result; r.revealed = true; persist(); renderStats(); renderList();
      const msg = document.createElement("span"); msg.className = `result ${result === "correct" ? "good" : "bad"}`;
      msg.textContent = result === "correct" ? "Locked in." : "Marked for another pass."; row.replaceChildren(msg);
    };
    yes.onclick = () => mark("correct"); no.onclick = () => mark("wrong"); row.append(yes, no);
  }
  function makeStage() {
    const img = els.prompts.querySelector("img");
    if (!img) return null;
    const stage = document.createElement("div"); stage.className = "interactive-stage";
    img.before(stage); stage.appendChild(img);
    const overlay = document.createElement("div"); overlay.className = "interaction-overlay"; stage.appendChild(overlay);
    return { stage, overlay, img };
  }
  function renderHotspot(q, r) {
    const p = document.createElement("p"); p.className = "instruction mode-instruction";
    p.innerHTML = "<strong>Hotspot mode.</strong> Click the option cells or locations directly on the image. Click a marker again to remove it.";
    const stageParts = makeStage();
    const row = document.createElement("div"); row.className = "action-row wrap-actions";
    const count = document.createElement("span"); count.className = "selection-count";
    const undo = document.createElement("button"); undo.className = "mini-action"; undo.textContent = "Undo";
    const clear = document.createElement("button"); clear.className = "mini-action"; clear.textContent = "Clear";
    const submit = document.createElement("button"); submit.className = "action"; submit.textContent = "Submit hotspot";
    r.hotspots = Array.isArray(r.hotspots) ? r.hotspots : [];
    const redraw = () => {
      if (!stageParts) return;
      stageParts.overlay.innerHTML = "";
      r.hotspots.forEach((point, index) => {
        const mark = document.createElement("button"); mark.className = "hotspot-mark"; mark.textContent = "✓";
        mark.style.left = `${point.x * 100}%`; mark.style.top = `${point.y * 100}%`; mark.title = "Remove this selection";
        mark.onclick = e => { e.stopPropagation(); r.hotspots.splice(index, 1); persist(); redraw(); };
        stageParts.overlay.appendChild(mark);
      });
      count.textContent = `${r.hotspots.length} selection${r.hotspots.length === 1 ? "" : "s"}`;
      submit.disabled = !r.hotspots.length; undo.disabled = !r.hotspots.length; clear.disabled = !r.hotspots.length;
    };
    if (stageParts) stageParts.overlay.onclick = e => {
      if (e.target !== stageParts.overlay) return;
      const box = stageParts.overlay.getBoundingClientRect();
      r.hotspots.push({ x: (e.clientX - box.left) / box.width, y: (e.clientY - box.top) / box.height });
      persist(); redraw();
    };
    undo.onclick = () => { r.hotspots.pop(); persist(); redraw(); };
    clear.onclick = () => { r.hotspots = []; persist(); redraw(); };
    submit.onclick = () => { r.revealed = true; persist(); reveal(q, "Exact hotspot answer"); selfAssessment(q, r, row); };
    row.append(count, undo, clear, submit); els.interaction.append(p, row); redraw();
    if (r.revealed || completed(r)) reveal(q, "Exact hotspot answer");
  }
  function renderNativeAnswerControls(q, r) {
    const data = interactions[q.number] || {};
    const controlStyle = data.controlStyle || (/select the appropriate option|drop-?down/i.test(q.search || "") ? "dropdown" : "radio");
    const boxAnswers = [...String(q.search || "").matchAll(/Box\s*[0-9Il]+\s*:\s*(Yes|No)/gi)].map(match => match[1][0].toUpperCase() + match[1].slice(1).toLowerCase());
    let controls = Array.isArray(data.controls) ? data.controls : [];
    if (!controls.length && boxAnswers.length) controls = boxAnswers.map((correct, index) => ({ label: `Statement ${index + 1}`, options: ["Yes", "No"], correct }));
    if (!controls.length) {
      const count = Math.max(1, data.targets?.length || 1);
      const options = /select Yes if|Otherwise, select No/i.test(q.search || "") ? ["Yes", "No"] : (data.options?.length ? data.options : ["Option A", "Option B", "Option C", "Option D"]);
      controls = Array.from({ length: count }, (_, index) => ({ label: `Answer ${index + 1}`, options, correct: "" }));
    }
    r.controlAnswers = Array.isArray(r.controlAnswers) && r.controlAnswers.length === controls.length ? r.controlAnswers : Array(controls.length).fill("");
    const instruction = document.createElement("p"); instruction.className = "instruction mode-instruction";
    instruction.innerHTML = `<strong>Answer area.</strong> Use the real ${controlStyle === "dropdown" ? "dropdown menus" : "circle buttons"} below. The image is reference-only.`;
    const workspace = createExamWorkspace("ANSWER AREA", controlStyle === "dropdown" ? "Choose from each menu" : "Select one answer per row");
    const form = document.createElement("div"); form.className = "native-answer-form";
    const actions = document.createElement("div"); actions.className = "action-row";
    const submit = document.createElement("button"); submit.className = "action"; submit.textContent = "Check answer";
    const update = () => { submit.disabled = r.controlAnswers.some(answer => !answer); persist(); };
    controls.forEach((control, index) => {
      const group = document.createElement("fieldset"); group.className = "native-answer-row";
      const legend = document.createElement("legend"); legend.textContent = control.label || `Answer ${index + 1}`; group.appendChild(legend);
      if (controlStyle === "dropdown") {
        const select = document.createElement("select"); select.className = "answer-select"; select.setAttribute("aria-label", control.label || `Answer ${index + 1}`);
        select.innerHTML = `<option value="">Choose an answer...</option>`;
        (control.options || []).forEach(option => { const item = document.createElement("option"); item.value = option; item.textContent = option; select.appendChild(item); });
        select.value = r.controlAnswers[index] || ""; select.onchange = () => { r.controlAnswers[index] = select.value; update(); }; group.appendChild(select);
      } else {
        const options = document.createElement("div"); options.className = "circle-options";
        (control.options || []).forEach(option => {
          const label = document.createElement("label"); label.className = "circle-option";
          const input = document.createElement("input"); input.type = "radio"; input.name = `q${q.number}-row${index}`; input.value = option; input.checked = r.controlAnswers[index] === option;
          input.onchange = () => { r.controlAnswers[index] = option; update(); };
          const circle = document.createElement("span"); circle.className = "real-circle"; const text = document.createElement("span"); text.textContent = option;
          label.append(input, circle, text); options.appendChild(label);
        });
        group.appendChild(options);
      }
      form.appendChild(group);
    });
    submit.onclick = () => {
      const gradable = controls.every(control => control.correct);
      if (gradable) {
        const ok = controls.every((control, index) => String(control.correct).trim().toLowerCase() === String(r.controlAnswers[index]).trim().toLowerCase());
        systemGrade(q, r, ok, actions, "Source answer");
      } else {
        r.revealed = true; persist(); reveal(q, "Source answer"); selfAssessment(q, r, actions);
      }
    };
    actions.appendChild(submit); workspace.appendChild(form); els.interaction.append(instruction, workspace, actions); update();
    if (completed(r)) reveal(q, "Source answer");
  }

  function dragItems(q) {
    if (q.number === 324) return ["Entity", "Trigger phrase", "Variable"];
    const pieces = q.search.split("|").map(x => x.trim()).filter(Boolean);
    const stop = pieces.findIndex(x => /Suggested Answer|Correct Answer|Hide Answer|Hide Solution/i.test(x));
    const select = pieces.findIndex(x => /Select and Place/i.test(x));
    let pool = pieces.slice(select >= 0 ? select + 1 : Math.max(0, (stop < 0 ? pieces.length : stop) - 14), stop < 0 ? pieces.length : stop);
    const header = /^(Answer Area|Actions?|Tools?|Terms?|Options?|Features?|Responses?|Applications?|Admin centers?|Control actions?|Select and Place:?|Function|Purpose|Requirement|Scenario)$/i;
    const noise = /Question|Topic|Discussion|NOTE|Each correct|drag the|move the|Which |What |You need|Actual exam|All PL|DRAG/i;
    pool = pool.filter(x => x.length >= 2 && x.length <= 88 && !header.test(x) && !noise.test(x));
    const deduped = [...new Map(pool.map(x => [x.toLowerCase(), x])).values()];
    if (deduped.length > 12) return deduped.filter(x => x.length < 58).slice(0, 12);
    return deduped.slice(0, 12);
  }
  function renderDragDrop(q, r) {
    const items = dragItems(q);
    const p = document.createElement("p"); p.className = "instruction mode-instruction";
    p.innerHTML = "<strong>Drag-and-drop mode.</strong> Drag reusable answer cards onto the matching boxes or sequence positions in the image. Drag a placed card again to move it.";
    const workspace = createExamWorkspace("SELECT & PLACE", "Interactive question board");
    const stage = document.createElement("div"); stage.className = "interactive-stage graded-stage";
    const stageImage = new Image(); stageImage.src = q.promptImages[0]; stageImage.alt = `Interactive board for question ${q.number}`;
    const stageOverlay = document.createElement("div"); stageOverlay.className = "interaction-overlay drag-overlay";
    stage.append(stageImage, stageOverlay); workspace.appendChild(stage);
    const stageParts = { stage, overlay: stageOverlay, img: stageImage };
    r.placements = Array.isArray(r.placements) ? r.placements : [];
    const palette = document.createElement("div"); palette.className = "drag-palette";
    const row = document.createElement("div"); row.className = "action-row wrap-actions";
    const count = document.createElement("span"); count.className = "selection-count";
    const undo = document.createElement("button"); undo.className = "mini-action"; undo.textContent = "Undo";
    const clear = document.createElement("button"); clear.className = "mini-action"; clear.textContent = "Clear board";
    const submit = document.createElement("button"); submit.className = "action"; submit.textContent = "Submit arrangement";
    const beginDrag = (label, placementIndex, event) => {
      event.preventDefault();
      const ghost = document.createElement("div"); ghost.className = "drag-ghost"; ghost.textContent = label; document.body.appendChild(ghost);
      const move = ev => { ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`; };
      const up = ev => {
        document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up); ghost.remove();
        if (!stageParts) return;
        const box = stageParts.overlay.getBoundingClientRect();
        if (ev.clientX >= box.left && ev.clientX <= box.right && ev.clientY >= box.top && ev.clientY <= box.bottom) {
          const placed = { label, x: (ev.clientX - box.left) / box.width, y: (ev.clientY - box.top) / box.height };
          if (placementIndex == null) r.placements.push(placed); else r.placements[placementIndex] = placed;
          persist(); redraw();
        }
      };
      move(event); document.addEventListener("pointermove", move); document.addEventListener("pointerup", up, { once: true });
    };
    items.forEach(label => {
      const card = document.createElement("button"); card.className = "drag-card"; card.innerHTML = `<span>⠿</span>${label}`;
      card.onpointerdown = e => beginDrag(label, null, e); palette.appendChild(card);
    });
    const redraw = () => {
      if (stageParts) {
        stageParts.overlay.innerHTML = "";
        r.placements.forEach((placed, index) => {
          const card = document.createElement("button"); card.className = "placed-card"; card.textContent = placed.label;
          card.style.left = `${placed.x * 100}%`; card.style.top = `${placed.y * 100}%`;
          card.title = "Drag to move; double-click to remove";
          card.onpointerdown = e => beginDrag(placed.label, index, e);
          card.ondblclick = e => { e.preventDefault(); r.placements.splice(index, 1); persist(); redraw(); };
          stageParts.overlay.appendChild(card);
        });
      }
      count.textContent = `${r.placements.length} card${r.placements.length === 1 ? "" : "s"} placed`;
      submit.disabled = !r.placements.length; undo.disabled = !r.placements.length; clear.disabled = !r.placements.length;
    };
    undo.onclick = () => { r.placements.pop(); persist(); redraw(); };
    clear.onclick = () => { r.placements = []; persist(); redraw(); };
    submit.onclick = () => { r.revealed = true; persist(); reveal(q, "Exact drag-and-drop answer"); selfAssessment(q, r, row); };
    row.append(count, undo, clear, submit); els.interaction.append(p, palette, workspace, row); redraw();
    if (r.revealed || completed(r)) reveal(q, "Exact drag-and-drop answer");
  }
  function systemGrade(q, r, ok, row, label) {
    r.result = ok ? "correct" : "wrong";
    r.revealed = true;
    persist();
    const banner = document.createElement("div");
    banner.className = `grade-banner ${ok ? "correct" : "wrong"}`;
    banner.innerHTML = `<span>${ok ? "✓" : "×"}</span><div><strong>${ok ? "Correct" : "Not quite"}</strong><small>${ok ? "Your answer matches the grading key." : "Compare your response with the source solution below."}</small></div>`;
    row.replaceChildren(banner);
    reveal(q, label);
    renderStats();
    renderList();
  }

  function createExamWorkspace(label, title) {
    const workspace = document.createElement("div");
    workspace.className = "exam-workspace";
    workspace.innerHTML = `<div class="workspace-title"><span>${label}</span><strong>${title}</strong></div>`;
    return workspace;
  }

  function renderHotspotGraded(q, r) {
    const data = interactions[q.number];
    const instruction = document.createElement("p");
    instruction.className = "instruction mode-instruction";
    instruction.innerHTML = `<strong>Hotspot answer area.</strong> Select exactly ${data.targets.length} location${data.targets.length === 1 ? "" : "s"}. Click a marker again to remove it.`;
    const workspace = createExamWorkspace("HOTSPOT", "Answer Area");
    workspace.classList.add("hotspot-workspace");
    const stage = document.createElement("div");
    stage.className = "interactive-stage graded-stage";
    const image = new Image();
    image.src = data.image;
    image.alt = `Interactive hotspot for question ${q.number}`;
    const overlay = document.createElement("div");
    overlay.className = "interaction-overlay";
    stage.append(image, overlay);
    workspace.appendChild(stage);
    const controls = document.createElement("div"); controls.className = "action-row wrap-actions";
    const count = document.createElement("span"); count.className = "selection-count";
    const undo = document.createElement("button"); undo.className = "mini-action"; undo.textContent = "Undo";
    const clear = document.createElement("button"); clear.className = "mini-action"; clear.textContent = "Clear";
    const submit = document.createElement("button"); submit.className = "action"; submit.textContent = "Check answer";
    r.hotspots = Array.isArray(r.hotspots) ? r.hotspots : [];
    const redraw = () => {
      overlay.innerHTML = "";
      r.hotspots.forEach((point, index) => {
        const marker = document.createElement("button"); marker.className = "hotspot-mark"; marker.textContent = "✓";
        marker.style.left = `${point.x * 100}%`; marker.style.top = `${point.y * 100}%`; marker.title = "Remove selection";
        marker.onclick = event => { event.stopPropagation(); r.hotspots.splice(index, 1); persist(); redraw(); };
        overlay.appendChild(marker);
      });
      count.textContent = `${r.hotspots.length} / ${data.targets.length} selected`;
      submit.disabled = r.hotspots.length !== data.targets.length;
      undo.disabled = clear.disabled = !r.hotspots.length;
    };
    overlay.onclick = event => {
      if (event.target !== overlay || r.hotspots.length >= data.targets.length) return;
      const box = overlay.getBoundingClientRect();
      r.hotspots.push({ x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height });
      persist(); redraw();
    };
    undo.onclick = () => { r.hotspots.pop(); persist(); redraw(); };
    clear.onclick = () => { r.hotspots = []; persist(); redraw(); };
    submit.onclick = () => {
      const unused = new Set(data.targets.map((_, index) => index));
      const ok = r.hotspots.every(point => {
        const match = [...unused].find(index => {
          const target = data.targets[index];
          return point.x >= target.x1 && point.x <= target.x2 && point.y >= target.y1 && point.y <= target.y2;
        });
        if (match === undefined) return false;
        unused.delete(match);
        return true;
      }) && unused.size === 0;
      systemGrade(q, r, ok, controls, "Grading key — hotspot");
    };
    controls.append(count, undo, clear, submit);
    els.interaction.append(instruction, workspace, controls);
    redraw();
    if (completed(r)) reveal(q, "Grading key — hotspot");
  }

  function renderDragDropGraded(q, r) {
    const data = interactions[q.number];
    const instruction = document.createElement("p");
    instruction.className = "instruction mode-instruction";
    instruction.innerHTML = "<strong>Select and place.</strong> Tap a card, then tap a numbered slot — or drag it. Cards can be reused.";
    r.dragAnswers = Array.isArray(r.dragAnswers) && r.dragAnswers.length === data.correct.length ? r.dragAnswers : Array(data.correct.length).fill(null);
    const palette = document.createElement("div"); palette.className = "drag-palette luxury-palette";
    const workspace = createExamWorkspace("SELECT & PLACE", "Answer Area");
    workspace.classList.add("drop-workspace");
    const slots = document.createElement("div"); slots.className = "drop-slots"; workspace.appendChild(slots);
    const controls = document.createElement("div"); controls.className = "action-row wrap-actions";
    const count = document.createElement("span"); count.className = "selection-count";
    const undo = document.createElement("button"); undo.className = "mini-action"; undo.textContent = "Undo";
    const clear = document.createElement("button"); clear.className = "mini-action"; clear.textContent = "Clear all";
    const submit = document.createElement("button"); submit.className = "action"; submit.textContent = "Check answer";
    let selectedCard = null;
    const updateSelectedCard = () => [...palette.children].forEach(card => card.classList.toggle("selected-card", card.dataset.label === selectedCard));
    const beginDrag = (label, fromSlot, event) => {
      event.preventDefault();
      const ghost = document.createElement("div"); ghost.className = "drag-ghost"; ghost.textContent = label; document.body.appendChild(ghost);
      const move = ev => { ghost.style.left = `${ev.clientX}px`; ghost.style.top = `${ev.clientY}px`; };
      const up = ev => {
        document.removeEventListener("pointermove", move); ghost.remove();
        const target = document.elementFromPoint(ev.clientX, ev.clientY)?.closest(".drop-slot");
        if (!target) return;
        if (fromSlot !== null) r.dragAnswers[fromSlot] = null;
        r.dragAnswers[Number(target.dataset.slot)] = label;
        persist(); redraw();
      };
      move(event);
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up, { once: true });
    };
    data.options.forEach(label => {
      const card = document.createElement("button"); card.className = "drag-card"; card.innerHTML = `<span>⠿</span>${label}`;
      card.dataset.label = label;
      card.onclick = () => { selectedCard = selectedCard === label ? null : label; updateSelectedCard(); };
      card.onpointerdown = event => { if (event.pointerType === "mouse") beginDrag(label, null, event); }; palette.appendChild(card);
    });
    const redraw = () => {
      slots.innerHTML = "";
      r.dragAnswers.forEach((answer, index) => {
        const slot = document.createElement("div"); slot.className = `drop-slot${answer ? " filled" : ""}`; slot.dataset.slot = index;
        slot.innerHTML = `<span class="slot-number">${index + 1}</span><div>${answer || "Drop answer here"}</div>`;
        slot.onclick = () => {
          if (!selectedCard) return;
          r.dragAnswers[index] = selectedCard;
          persist(); redraw();
        };
        if (answer) {
          slot.onpointerdown = event => { if (event.pointerType === "mouse") beginDrag(answer, index, event); };
          slot.ondblclick = () => { r.dragAnswers[index] = null; persist(); redraw(); };
        }
        slots.appendChild(slot);
      });
      const placed = r.dragAnswers.filter(Boolean).length;
      count.textContent = `${placed} / ${data.correct.length} placed`;
      submit.disabled = placed !== data.correct.length;
      undo.disabled = clear.disabled = !placed;
    };
    undo.onclick = () => { const index = r.dragAnswers.findLastIndex(Boolean); if (index >= 0) r.dragAnswers[index] = null; persist(); redraw(); };
    clear.onclick = () => { r.dragAnswers = Array(data.correct.length).fill(null); selectedCard = null; updateSelectedCard(); persist(); redraw(); };
    const normalize = value => String(value).toLowerCase().replace(/[^a-z0-9]/g, "").replaceAll("0", "o");
    submit.onclick = () => {
      const ok = r.dragAnswers.every((answer, index) => normalize(answer) === normalize(data.correct[index]));
      systemGrade(q, r, ok, controls, "Grading key — drag and drop");
    };
    controls.append(count, undo, clear, submit);
    els.interaction.append(instruction, palette, workspace, controls);
    redraw();
    if (completed(r)) reveal(q, "Grading key — drag and drop");
  }

  function renderAdminTextGraded(q, r) {
    const instruction = document.createElement("p"); instruction.className = "instruction mode-instruction";
    instruction.innerHTML = "<strong>Configured answer box.</strong> Enter your answer, then let the system grade it against the admin key.";
    const workspace = createExamWorkspace("ANSWER BOX", "Your answer");
    const field = document.createElement("textarea"); field.className = "learner-answer"; field.rows = 3; field.placeholder = "Type your answer here…"; field.value = r.textAnswer || "";
    workspace.appendChild(field);
    const controls = document.createElement("div"); controls.className = "action-row";
    const submit = document.createElement("button"); submit.className = "action"; submit.textContent = "Check answer"; submit.disabled = !field.value.trim();
    field.oninput = () => { r.textAnswer = field.value; persist(); submit.disabled = !field.value.trim(); };
    const normalize = value => String(value).trim().toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ]/g, "");
    submit.onclick = () => { const ok = q.acceptedAnswers.some(answer => normalize(answer) === normalize(field.value)); systemGrade(q, r, ok, controls, "Admin grading key"); };
    controls.appendChild(submit); els.interaction.append(instruction, workspace, controls);
    if (completed(r)) reveal(q, "Admin grading key");
  }

  function renderInteraction(q) {
    const r = record(q);
    selected = new Set();
    els.interaction.innerHTML = "";
    els.answerPanel.hidden = true;
    const kind = questionKind(q);
    if (kind === "hotspot") {
      renderNativeAnswerControls(q, r);
    } else if (kind === "dragdrop") {
      const drag = interactions[q.number] || {};
      if (Array.isArray(drag.options) && drag.options.length && Array.isArray(drag.correct) && drag.correct.length) renderDragDropGraded(q, r);
      else renderDragDrop(q, r);
    } else if (kind === "admintext") {
      renderAdminTextGraded(q, r);
    } else if (q.mode === "choice") {
      const p = document.createElement("p"); p.className = "instruction"; p.textContent = q.answer.length > 1 ? "Select all answers that apply, then submit." : "Choose one answer, then submit.";
      const choices = document.createElement("div"); choices.className = "choice-row";
      const actionRow = document.createElement("div"); actionRow.className = "action-row";
      const submit = document.createElement("button"); submit.className = "action"; submit.textContent = "Check answer"; submit.disabled = true;
      q.choices.forEach(letter => {
        const b = document.createElement("button"); b.className = "choice"; b.textContent = letter;
        b.onclick = () => { if (q.answer.length === 1) selected.clear(); selected.has(letter) ? selected.delete(letter) : selected.add(letter); [...choices.children].forEach(x => x.classList.toggle("selected", selected.has(x.textContent))); submit.disabled = !selected.size; };
        choices.appendChild(b);
      });
      submit.onclick = () => {
        const picked = [...selected].sort().join("");
        if (!q.answer) {
          r.selectedChoice = picked; r.revealed = true; persist(); reveal(q, "Source answer"); selfAssessment(q, r, actionRow); return;
        }
        const ok = picked === q.answer.split("").sort().join("");
        r.result = ok ? "correct" : "wrong"; persist();
        [...choices.children].forEach(b => { b.disabled = true; if (q.answer.includes(b.textContent)) b.classList.add("correct"); else if (selected.has(b.textContent)) b.classList.add("wrong"); });
        submit.remove(); const result = document.createElement("span"); result.className = `result ${ok ? "good" : "bad"}`; result.textContent = ok ? "Correct — nicely done." : `Not quite. The source answer is ${q.answer.split("").join(", ")}.`; actionRow.appendChild(result);
        reveal(q); renderStats(); renderList();
      };
      els.interaction.append(p, choices, actionRow); actionRow.appendChild(submit);
      if (completed(r)) reveal(q);
    } else {
      const p = document.createElement("p"); p.className = "instruction"; p.textContent = "Enter your answer before checking the source solution. Your response stays private in this browser.";
      const workspace = createExamWorkspace("YOUR RESPONSE", "Answer area");
      const field = document.createElement("textarea"); field.className = "learner-answer"; field.rows = 4; field.placeholder = "Type your answer here..."; field.value = r.textAnswer || "";
      workspace.appendChild(field);
      const row = document.createElement("div"); row.className = "action-row";
      const revealBtn = document.createElement("button"); revealBtn.className = "action"; revealBtn.textContent = completed(r) ? "Show source answer" : "Check source answer"; revealBtn.disabled = !field.value.trim() && !completed(r);
      field.oninput = () => { r.textAnswer = field.value; persist(); revealBtn.disabled = !field.value.trim(); };
      revealBtn.onclick = () => {
        reveal(q); row.innerHTML = "";
        const yes = document.createElement("button"); yes.className = "action"; yes.textContent = "I got it right";
        const no = document.createElement("button"); no.className = "action self-wrong"; no.textContent = "Needs another pass";
        yes.onclick = () => mark("correct"); no.onclick = () => mark("wrong"); row.append(yes, no);
      };
      const mark = result => { r.result = result; persist(); renderStats(); renderList(); const msg = document.createElement("span"); msg.className = `result ${result === "correct" ? "good" : "bad"}`; msg.textContent = result === "correct" ? "Locked in." : "Marked for another pass."; row.replaceChildren(msg); };
      row.appendChild(revealBtn); els.interaction.append(p, workspace, row);
      if (completed(r)) reveal(q);
    }
  }
  function render() {
    const q = questions[current]; if (!q) return;
    const r = record(q);
    setMobilePane("question");
    setViewerZoom(defaultViewerZoom);
    resetViewer();
    els.position.textContent = `QUESTION ${current + 1} OF ${questions.length}`;
    els.title.textContent = `Question ${q.number}`;
    els.admin.href = `admin.html#q${q.number}`;
    if (location.hash !== `#q${q.number}`) history.replaceState(null, "", `#q${q.number}`);
    els.review.classList.toggle("active", !!r.review); els.review.firstChild.textContent = r.review ? "★ " : "☆ ";
    imageStack(els.prompts, q.promptImages, `Question ${q.number}`);
    if (q.customQuestion) {
      const custom = document.createElement("section");
      custom.className = "custom-question-copy";
      custom.innerHTML = `<span>ADMIN OVERRIDE</span><p></p>`;
      custom.querySelector("p").textContent = q.customQuestion;
      els.prompts.prepend(custom);
    }
    renderInteraction(q); renderList(); renderStats();
    els.nav.textContent = `${current + 1} of ${questions.length}`; els.prev.disabled = current === 0; els.next.disabled = current === questions.length - 1;
    els.interaction.scrollTop = 0;
    els.viewer.scrollTop = 0;
  }
  function move(delta) { current = Math.max(0, Math.min(questions.length - 1, current + delta)); render(); }
  function closeMenu() { els.sidebar.classList.remove("open"); els.scrim.classList.remove("show"); }
  els.prev.onclick = () => move(-1); els.next.onclick = () => move(1);
  els.review.onclick = () => { const r = record(questions[current]); r.review = !r.review; persist(); render(); };
  els.surprise.onclick = () => { const open = questions.map((q, i) => [q, i]).filter(([q]) => !completed(saved[q.number] || {})); const pool = open.length ? open : questions.map((q, i) => [q, i]); current = pool[Math.floor(Math.random() * pool.length)][1]; render(); };
  els.search.oninput = e => { query = e.target.value.trim().toLowerCase(); renderList(true); };
  els.filters.onclick = e => { const b = e.target.closest("button[data-filter]"); if (!b) return; filter = b.dataset.filter; [...els.filters.children].forEach(x => x.classList.toggle("active", x === b)); renderList(true); };
  els.reset.onclick = () => { if (confirm("Reset all answers and review marks?")) { saved = {}; persist(); current = 0; render(); } };
  els.menu.onclick = () => { renderList(true); els.sidebar.classList.add("open"); els.scrim.classList.add("show"); }; els.scrim.onclick = closeMenu;
  els.questionView.onclick = () => showViewer("question");
  els.answerView.onclick = () => showViewer("answer");
  els.fitPage.onclick = () => setViewerFit("page");
  els.fitWidth.onclick = () => setViewerFit("width");
  els.zoomOut.onclick = () => setViewerZoom(viewerZoom - .25);
  els.zoomIn.onclick = () => setViewerZoom(viewerZoom + .25);
  els.mobileQuestionPane.onclick = () => setMobilePane("question");
  els.mobileAnswerPane.onclick = () => setMobilePane("answer");
  document.addEventListener("keydown", e => { if (e.target.matches("input, textarea, select, button")) return; if (e.key === "ArrowRight") move(1); if (e.key === "ArrowLeft") move(-1); });
  render();
})();
