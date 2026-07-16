(async () => {
  const CONFIG_KEY = "pl900-admin-config-v1";
  const DB_NAME = "pl900-trainer-admin";
  const CONFIG_FILE = "pl900-trainer-config.json";
  const baseQuestions = window.PL900_QUESTIONS || [];
  const baseInteractions = window.PL900_INTERACTIONS || {};
  const auditQuestions = window.PL900_QUESTION_AUDIT?.questions || {};
  const $ = id => document.getElementById(id);
  const els = {
    search: $("adminSearch"), list: $("adminQuestionList"), count: $("overrideCount"), title: $("editorTitle"), type: $("typeBadge"),
    number: $("questionNumber"), questionType: $("questionType"), custom: $("customQuestion"), transcript: $("sourceTranscript"),
    choiceEditor: $("choiceEditor"), choiceOptions: $("choiceOptions"), choiceAnswer: $("choiceAnswer"), dragEditor: $("dragEditor"),
    dragOptions: $("dragOptions"), dragCorrect: $("dragCorrect"), hotspotEditor: $("hotspotEditor"), textEditor: $("textEditor"),
    accepted: $("acceptedAnswers"), tolerance: $("targetTolerance"), toleranceValue: $("targetToleranceValue"), targetBoard: $("targetBoard"),
    controlStyle: $("controlStyle"), answerControls: $("answerControls"),
    targetImage: $("targetImage"), targetOverlay: $("targetOverlay"), targetCount: $("targetCount"), clearTargets: $("clearTargetsBtn"),
    save: $("saveBtn"), state: $("saveState"), reset: $("resetQuestionBtn"), remove: $("deleteQuestionBtn"), duplicate: $("duplicateQuestionBtn"),
    add: $("addQuestionBtn"), importBtn: $("importBtn"), exportBtn: $("exportBtn"), importFile: $("importFile"), preview: $("previewBtn"),
    qImageFile: $("questionImageFile"), aImageFile: $("answerImageFile"), chooseQImage: $("chooseQuestionImageBtn"), chooseAImage: $("chooseAnswerImageBtn"),
    clearQImage: $("clearQuestionImageBtn"), clearAImage: $("clearAnswerImageBtn"), qImagePreview: $("questionImagePreview"), aImagePreview: $("answerImagePreview"),
    connectFolder: $("connectFolderBtn"), folderStatus: $("folderStatus"), toast: $("adminToast"),
    pasteModal: $("pasteModal"), pastePreview: $("pasteModalPreview"), pasteQuestion: $("pasteAsQuestionBtn"), pasteAnswer: $("pasteAsAnswerBtn"), pasteCancel: $("pasteCancelBtn"), undoPaste: $("undoPasteBtn"), back: $("backToTrainerLink")
  };

  const emptyConfig = () => ({ version: 2, questions: {}, interactions: {}, addedQuestions: {}, deletedQuestions: [] });
  const openDb = () => new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("settings");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  async function getSetting(key) {
    const db = await openDb();
    const value = await new Promise((resolve, reject) => {
      const request = db.transaction("settings").objectStore("settings").get(key);
      request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
    });
    db.close(); return value;
  }
  async function putSetting(key, value) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const request = db.transaction("settings", "readwrite").objectStore("settings").put(value, key);
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
    });
    db.close();
  }
  let folderHandle = null, toastTimer = 0;
  function notify(message, error = false) {
    clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.toggle("error", error); els.toast.classList.add("show");
    toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3600);
  }
  function renderFolderStatus() {
    const linked = !!folderHandle;
    els.folderStatus.textContent = linked ? `${folderHandle.name} / ${CONFIG_FILE}` : "Trainer folder is not connected";
    els.connectFolder.textContent = linked ? "Change connected folder" : "Connect trainer folder";
  }
  async function connectFolder() {
    if (!("showDirectoryPicker" in window)) throw new Error("Folder saving requires Microsoft Edge or Google Chrome. Use Export JSON in this browser.");
    folderHandle = await window.showDirectoryPicker({ id: "pl900-trainer-folder", mode: "readwrite" });
    await putSetting("trainerDirectory", folderHandle); renderFolderStatus(); return folderHandle;
  }
  async function ensureFolderPermission(promptForFolder = false) {
    if (!folderHandle && promptForFolder) await connectFolder();
    if (!folderHandle) return false;
    const options = { mode: "readwrite" };
    if (await folderHandle.queryPermission(options) === "granted") return true;
    return await folderHandle.requestPermission(options) === "granted";
  }
  async function saveToFolder(promptForFolder = false) {
    if (!await ensureFolderPermission(promptForFolder)) return false;
    const fileHandle = await folderHandle.getFileHandle(CONFIG_FILE, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(config, null, 2)); await writable.close();
    return true;
  }
  async function savePortableConfig() {
    if (/^https?:$/.test(location.protocol)) {
      try {
        const response = await fetch("/api/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(config) });
        if (response.ok) return { saved: true, location: CONFIG_FILE };
      } catch (error) { console.warn("Local save service unavailable", error); }
    }
    if (folderHandle) {
      const saved = await saveToFolder(false);
      return { saved, location: saved ? `${folderHandle.name}\\${CONFIG_FILE}` : "" };
    }
    return { saved: false, location: "" };
  }
  async function loadConfig() {
    try {
      const db = await openDb();
      const value = await new Promise((resolve, reject) => {
        const request = db.transaction("settings").objectStore("settings").get("config");
        request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
      });
      db.close();
      if (value) return { ...emptyConfig(), ...value };
    } catch (error) { console.warn(error); }
    try { return { ...emptyConfig(), ...(JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}) }; } catch { return emptyConfig(); }
  }
  async function saveConfig(message = "All changes saved") {
    config.version = 2; config.updatedAt = new Date().toISOString();
    let portable = { saved: false, location: "" };
    try { portable = await savePortableConfig(); }
    catch (error) { notify(`Folder save failed: ${error.message}`, true); throw error; }
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const request = db.transaction("settings", "readwrite").objectStore("settings").put(config, "config");
      request.onsuccess = resolve; request.onerror = () => reject(request.error);
    });
    db.close();
    try {
      const mirror = JSON.parse(JSON.stringify(config));
      Object.values(mirror.questions || {}).forEach(q => { delete q.promptImages; delete q.answerImages; });
      Object.values(mirror.addedQuestions || {}).forEach(q => { delete q.promptImages; delete q.answerImages; });
      localStorage.setItem(CONFIG_KEY, JSON.stringify(mirror));
    } catch {}
    markSaved(message);
    notify(portable.saved ? `${message}. Saved successfully to ${portable.location}` : `${message}. Saved in this browser. Use Start-Quiz.bat for automatic trainer-folder saving.`);
  }

  let config = await loadConfig();
  const requestedQuestion = Number((location.hash.match(/^#q(\d+)$/) || [])[1]);
  let current = requestedQuestion || baseQuestions[0]?.number || 1;
  let query = "", targets = [], dirty = false, questionImage = "", answerImage = "", pendingPasteFile = null, pendingPasteUrl = "", lastPasteUndo = null;
  const lines = value => String(value || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const parseControls = value => lines(value).map((line, index) => {
    const [label, options, correct] = line.split("|").map(part => part.trim());
    return { label: label || `Answer ${index + 1}`, options: String(options || "Yes, No").split(",").map(x => x.trim()).filter(Boolean), correct: correct || "" };
  });
  const formatControls = controls => (controls || []).map(control => `${control.label} | ${(control.options || []).join(", ")} | ${control.correct || ""}`).join("\n");
  const boxAnswers = q => [...String(q?.search || "").matchAll(/Box\s*[0-9Il]+\s*:\s*(Yes|No)/gi)].map(match => match[1][0].toUpperCase() + match[1].slice(1).toLowerCase());
  const deleted = () => new Set((config.deletedQuestions || []).map(Number));
  const base = number => baseQuestions.find(q => q.number === Number(number));
  const added = number => config.addedQuestions?.[number];
  const rawQuestion = number => added(number) || base(number);
  const question = number => ({ ...(rawQuestion(number) || {}), ...(auditQuestions[number]?.choices ? { choices: auditQuestions[number].choices, answer: auditQuestions[number].answer || "" } : {}), ...(config.questions?.[number] || {}) });
  const interaction = number => ({ ...(baseInteractions[number] || {}), ...(auditQuestions[number]?.interaction || {}), ...(config.interactions?.[number] || {}) });
  const allQuestions = () => [...baseQuestions, ...Object.values(config.addedQuestions || {})].filter(q => !deleted().has(Number(q.number))).sort((a, b) => a.number - b.number);
  const isAdded = number => !!config.addedQuestions?.[number];
  const nextNumber = () => { const used = new Set(allQuestions().map(q => Number(q.number))); let n = 1; while (used.has(n)) n++; return n; };
  const typeOf = number => interaction(number).type || question(number).mode || (question(number).choices?.length ? "choice" : "text");
  function updateReturnAction() {
    els.preview.href = `index.html#q${current}`; els.back.href = `index.html#q${current}`;
    els.preview.textContent = dirty ? "Save + Go back →" : "Preview ↗";
    els.preview.classList.toggle("go-back", dirty);
    els.preview.setAttribute("aria-label", dirty ? `Save question ${current} and return to the trainer` : `Preview question ${current}`);
    if (dirty) els.preview.removeAttribute("target"); else els.preview.target = "_blank";
  }
  function markDirty() { dirty = true; updateReturnAction(); els.state.classList.add("dirty"); els.state.querySelector("span").textContent = "Unsaved changes"; }
  function markSaved(message = "All changes saved") { dirty = false; updateReturnAction(); els.state.classList.remove("dirty"); els.state.querySelector("span").textContent = message; }
  function hasOverride(number) { return isAdded(number) || !!config.questions?.[number] || !!config.interactions?.[number]; }
  function renderCount() { els.count.textContent = allQuestions().length; }
  function renderList() {
    els.list.innerHTML = "";
    allQuestions().filter(q => !query || String(q.number).includes(query) || String(question(q.number).customQuestion || q.search || "").toLowerCase().includes(query)).forEach(q => {
      const button = document.createElement("button");
      button.className = `admin-q${q.number === current ? " active" : ""}${hasOverride(q.number) ? " changed" : ""}`;
      button.textContent = q.number; button.title = `${isAdded(q.number) ? "Added" : "Edit"} question ${q.number}`;
      button.onclick = () => { if (dirty && !confirm("Discard unsaved changes?")) return; current = q.number; renderEditor(); renderList(); };
      els.list.appendChild(button);
    });
  }
  function renderImage(preview, data, fallback) {
    preview.innerHTML = "";
    const source = data || fallback;
    if (!source) { const span = document.createElement("span"); span.textContent = "No image"; preview.appendChild(span); return; }
    const image = new Image(); image.src = source; image.alt = "Configured screenshot"; preview.appendChild(image);
  }
  function renderTargets() {
    els.targetOverlay.innerHTML = "";
    targets.forEach((target, index) => {
      const marker = document.createElement("button"); marker.className = "target-marker"; marker.title = "Remove grading target";
      marker.style.left = `${(target.x1 + target.x2) / 2 * 100}%`; marker.style.top = `${(target.y1 + target.y2) / 2 * 100}%`;
      marker.style.width = `${(target.x2 - target.x1) * 100}%`; marker.style.height = `${(target.y2 - target.y1) * 100}%`;
      marker.onclick = event => { event.stopPropagation(); targets.splice(index, 1); renderTargets(); markDirty(); };
      els.targetOverlay.appendChild(marker);
    });
    els.targetCount.textContent = `${targets.length} grading target${targets.length === 1 ? "" : "s"}`;
  }
  function renderType(type) {
    [els.choiceEditor, els.dragEditor, els.hotspotEditor, els.textEditor].forEach(x => x.hidden = true);
    if (type === "choice") els.choiceEditor.hidden = false;
    if (type === "dragdrop") els.dragEditor.hidden = false;
    if (type === "hotspot") els.hotspotEditor.hidden = false;
    if (type === "text") els.textEditor.hidden = false;
    els.type.textContent = type.toUpperCase();
  }
  function renderEditor() {
    const q = question(current); if (!q) { current = allQuestions()[0]?.number; if (!current) return; return renderEditor(); }
    lastPasteUndo = null; els.undoPaste.disabled = true;
    const edit = config.questions?.[current] || {}, data = interaction(current), type = typeOf(current);
    els.title.textContent = `Question ${current}`; els.number.value = current; els.number.disabled = !isAdded(current); els.questionType.value = type;
    updateReturnAction(); els.custom.value = edit.customQuestion ?? q.customQuestion ?? ""; els.transcript.textContent = base(current)?.search || "New administrator-created question";
    questionImage = edit.promptImages?.[0] || (isAdded(current) ? q.promptImages?.[0] || "" : "");
    answerImage = edit.answerImages?.[0] || (isAdded(current) ? q.answerImages?.[0] || "" : "");
    renderImage(els.qImagePreview, questionImage, base(current)?.promptImages?.[0]); renderImage(els.aImagePreview, answerImage, base(current)?.answerImages?.[0]);
    els.choiceOptions.value = (edit.choices || q.choices || []).join("\n"); els.choiceAnswer.value = edit.answer ?? q.answer ?? "";
    els.dragOptions.value = (data.options || []).join("\n"); els.dragCorrect.value = (data.correct || []).join("\n");
    els.accepted.value = (edit.acceptedAnswers || q.acceptedAnswers || []).join("\n"); targets = JSON.parse(JSON.stringify(data.targets || []));
    const inferredAnswers = boxAnswers(q);
    const controls = data.controls || inferredAnswers.map((correct, index) => ({ label: `Statement ${index + 1}`, options: ["Yes", "No"], correct }));
    els.controlStyle.value = data.controlStyle || (/select the appropriate option|drop-?down/i.test(q.search || "") ? "dropdown" : "radio");
    els.answerControls.value = formatControls(controls);
    const boardImage = questionImage || base(current)?.promptImages?.[0] || data.image || ""; els.targetImage.src = boardImage;
    const avg = targets.length ? Math.round(targets.reduce((sum, t) => sum + Math.max(t.x2 - t.x1, t.y2 - t.y1), 0) / targets.length * 100) : 6;
    els.tolerance.value = Math.max(2, Math.min(12, avg)); els.toleranceValue.textContent = `${els.tolerance.value}%`;
    renderType(type); renderTargets(); markSaved();
  }
  async function imageData(file) {
    if (!file?.type.startsWith("image/")) throw new Error("Please choose an image file.");
    const bitmap = await createImageBitmap(file); const max = 1800, scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    return canvas.toDataURL("image/jpeg", .9);
  }
  async function setImage(kind, file) {
    try {
      const data = await imageData(file); if (kind === "question") questionImage = data; else answerImage = data;
      renderImage(kind === "question" ? els.qImagePreview : els.aImagePreview, data); if (kind === "question") els.targetImage.src = data; markDirty();
    } catch (error) { alert(error.message); }
  }
  function closePasteModal() {
    els.pasteModal.hidden = true; document.body.classList.remove("paste-modal-open"); pendingPasteFile = null;
    if (pendingPasteUrl) URL.revokeObjectURL(pendingPasteUrl); pendingPasteUrl = ""; els.pastePreview.removeAttribute("src");
  }
  function openPasteModal(file) {
    pendingPasteFile = file; pendingPasteUrl = URL.createObjectURL(file); els.pastePreview.src = pendingPasteUrl;
    els.pasteModal.hidden = false; document.body.classList.add("paste-modal-open"); els.pasteQuestion.focus();
  }
  async function applyPastedImage(kind) {
    const file = pendingPasteFile; if (!file) return closePasteModal();
    const previous = kind === "question" ? questionImage : answerImage;
    closePasteModal(); await setImage(kind, file);
    lastPasteUndo = { kind, previous }; els.undoPaste.disabled = false;
    notify(`Pasted image added as the ${kind} image. Undo is available below the image editors.`);
  }
  function undoLastPaste() {
    if (!lastPasteUndo) return;
    const { kind, previous } = lastPasteUndo;
    if (kind === "question") { questionImage = previous; renderImage(els.qImagePreview, previous, base(current)?.promptImages?.[0]); els.targetImage.src = previous || base(current)?.promptImages?.[0] || ""; }
    else { answerImage = previous; renderImage(els.aImagePreview, previous, base(current)?.answerImages?.[0]); }
    lastPasteUndo = null; els.undoPaste.disabled = true; markDirty(); notify(`Last ${kind} image paste was undone.`);
  }
  async function saveCurrent({ goBack = false } = {}) {
    const original = rawQuestion(current); if (!original) return false;
    const type = els.questionType.value, number = Number(els.number.value);
    if (!Number.isInteger(number) || number < 1) { alert("Enter a valid positive question number."); return false; }
    if (number !== current && rawQuestion(number)) { alert(`Question ${number} already exists.`); return false; }
    config.questions ||= {}; config.interactions ||= {}; config.addedQuestions ||= {};
    if (number !== current && isAdded(current)) { config.addedQuestions[number] = { ...config.addedQuestions[current], number }; delete config.addedQuestions[current]; if (config.questions[current]) { config.questions[number] = config.questions[current]; delete config.questions[current]; } if (config.interactions[current]) { config.interactions[number] = config.interactions[current]; delete config.interactions[current]; } current = number; }
    const edit = { customQuestion: els.custom.value.trim(), mode: type };
    if (questionImage) edit.promptImages = [questionImage];
    if (answerImage) edit.answerImages = [answerImage];
    if (type === "choice") { edit.choices = lines(els.choiceOptions.value); edit.answer = els.choiceAnswer.value.toUpperCase().replace(/[^A-H]/g, ""); }
    if (type === "text") edit.acceptedAnswers = lines(els.accepted.value);
    config.questions[current] = edit;
    if (isAdded(current)) config.addedQuestions[current] = { ...config.addedQuestions[current], number: current, mode: type, search: edit.customQuestion, promptImages: edit.promptImages || [], answerImages: edit.answerImages || [], choices: edit.choices || [], answer: edit.answer || "" };
    if (type === "dragdrop") config.interactions[current] = { type, options: lines(els.dragOptions.value), correct: lines(els.dragCorrect.value) };
    else if (type === "hotspot") config.interactions[current] = { type, targets, image: questionImage || interaction(current).image, controlStyle: els.controlStyle.value, controls: parseControls(els.answerControls.value) };
    else delete config.interactions[current];
    await saveConfig("Saved permanently");
    if (goBack) { location.href = `index.html#q${current}`; return true; }
    renderCount(); renderList(); renderEditor(); return true;
  }

  [els.custom, els.choiceOptions, els.choiceAnswer, els.dragOptions, els.dragCorrect, els.accepted, els.number, els.answerControls].forEach(input => input.addEventListener("input", markDirty));
  els.controlStyle.addEventListener("change", markDirty);
  els.questionType.onchange = () => { renderType(els.questionType.value); markDirty(); };
  els.tolerance.oninput = () => { const size = Number(els.tolerance.value) / 100; targets = targets.map(t => { const x = (t.x1 + t.x2) / 2, y = (t.y1 + t.y2) / 2; return { x1: Math.max(0, x - size / 2), y1: Math.max(0, y - size / 2), x2: Math.min(1, x + size / 2), y2: Math.min(1, y + size / 2) }; }); els.toleranceValue.textContent = `${els.tolerance.value}%`; renderTargets(); markDirty(); };
  els.targetOverlay.onclick = event => { if (event.target !== els.targetOverlay) return; const box = els.targetOverlay.getBoundingClientRect(), size = Number(els.tolerance.value) / 100, x = (event.clientX - box.left) / box.width, y = (event.clientY - box.top) / box.height; targets.push({ x1: Math.max(0, x - size / 2), y1: Math.max(0, y - size / 2), x2: Math.min(1, x + size / 2), y2: Math.min(1, y + size / 2) }); renderTargets(); markDirty(); };
  els.clearTargets.onclick = () => { targets = []; renderTargets(); markDirty(); };
  els.chooseQImage.onclick = () => els.qImageFile.click(); els.chooseAImage.onclick = () => els.aImageFile.click();
  els.qImageFile.onchange = event => setImage("question", event.target.files[0]); els.aImageFile.onchange = event => setImage("answer", event.target.files[0]);
  els.clearQImage.onclick = () => { questionImage = ""; renderImage(els.qImagePreview, "", base(current)?.promptImages?.[0]); markDirty(); };
  els.clearAImage.onclick = () => { answerImage = ""; renderImage(els.aImagePreview, "", base(current)?.answerImages?.[0]); markDirty(); };
  document.addEventListener("paste", event => { const file = [...event.clipboardData.files].find(file => file.type.startsWith("image/")); if (!file) return; event.preventDefault(); openPasteModal(file); });
  els.pasteQuestion.onclick = () => applyPastedImage("question");
  els.pasteAnswer.onclick = () => applyPastedImage("answer");
  els.pasteCancel.onclick = closePasteModal;
  els.undoPaste.onclick = undoLastPaste;
  els.pasteModal.querySelector("[data-paste-cancel]").onclick = closePasteModal;
  document.addEventListener("keydown", event => { if (event.key === "Escape" && !els.pasteModal.hidden) closePasteModal(); });
  els.save.onclick = saveCurrent;
  els.preview.onclick = async event => {
    if (!dirty) return;
    event.preventDefault();
    els.preview.classList.add("working"); els.preview.textContent = "Saving…";
    try { await saveCurrent({ goBack: true }); }
    catch (error) { notify(`Save failed: ${error.message}`, true); updateReturnAction(); }
    finally { els.preview.classList.remove("working"); }
  };
  els.connectFolder.onclick = async () => { try { await connectFolder(); await saveToFolder(); notify(`Folder connected. Configuration saved to ${folderHandle.name}\\${CONFIG_FILE}`); } catch (error) { if (error.name !== "AbortError") notify(error.message, true); } };
  els.add.onclick = async () => { if (dirty && !confirm("Discard unsaved changes?")) return; const number = nextNumber(); config.addedQuestions[number] = { number, mode: "choice", answer: "", choices: ["A", "B", "C", "D"], promptImages: [], answerImages: [], search: "", customQuestion: "" }; current = number; await saveConfig("New question created"); renderCount(); renderList(); renderEditor(); };
  els.duplicate.onclick = async () => { const source = question(current), number = nextNumber(); config.addedQuestions[number] = { ...JSON.parse(JSON.stringify(source)), number }; if (interaction(current).type) config.interactions[number] = JSON.parse(JSON.stringify(interaction(current))); current = number; await saveConfig("Question duplicated"); renderCount(); renderList(); renderEditor(); };
  els.remove.onclick = async () => { if (!confirm(`Delete question ${current}?`)) return; if (isAdded(current)) { delete config.addedQuestions[current]; delete config.questions[current]; delete config.interactions[current]; } else { config.deletedQuestions = [...new Set([...(config.deletedQuestions || []), current])]; } await saveConfig("Question deleted"); current = allQuestions()[0]?.number || 1; renderCount(); renderList(); renderEditor(); };
  els.reset.onclick = async () => { if (isAdded(current)) return alert("Administrator-created questions can be deleted, not reset."); if (!confirm(`Reset question ${current} to its source configuration?`)) return; delete config.questions[current]; delete config.interactions[current]; config.deletedQuestions = (config.deletedQuestions || []).filter(n => Number(n) !== current); await saveConfig("Question reset"); renderEditor(); renderList(); renderCount(); };
  els.search.oninput = event => { query = event.target.value.trim().toLowerCase(); renderList(); };
  els.exportBtn.onclick = () => { const blob = new Blob([JSON.stringify(config, null, 2)], { type: "application/json" }), url = URL.createObjectURL(blob), anchor = document.createElement("a"); anchor.href = url; anchor.download = "pl900-trainer-complete-backup.json"; anchor.click(); URL.revokeObjectURL(url); };
  els.importBtn.onclick = () => els.importFile.click();
  els.importFile.onchange = async event => { const file = event.target.files[0]; if (!file) return; try { const imported = JSON.parse(await file.text()); if (!imported || typeof imported !== "object") throw new Error("Invalid backup"); config = { ...emptyConfig(), ...imported }; await saveConfig("Complete backup imported"); current = allQuestions()[0]?.number || 1; renderCount(); renderList(); renderEditor(); } catch (error) { alert(`Import failed: ${error.message}`); } event.target.value = ""; };
  window.addEventListener("beforeunload", event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
  try { folderHandle = await getSetting("trainerDirectory"); } catch (error) { console.warn("Saved folder handle unavailable", error); }
  renderFolderStatus(); renderCount(); renderList(); renderEditor();
})();
