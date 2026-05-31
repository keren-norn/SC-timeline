/* app.js — édition locale avec overrides JSON */
(() => {
  function getMode(){ return document.body.dataset.mode || "view"; }
  const TIMELINE_ID = Number(document.body.dataset.timelineId || "1771887");

  const BASE_URL = "./data/timeline_base.json";
  const OVERRIDES_FILENAME = "timeline_overrides.local.json";
  const LS_KEY = `tikitoki_overrides_${TIMELINE_ID}_v3`;

  let DATA = null;
  let cats = [];
  let stories = [];
  let BASE_STORIES = [];
  let OVERRIDES = {};
  const catMap = new Map();

  function $(id){ return document.getElementById(id); }

  function showTopStatus(msg, kind){
    const bar = $("topStatus");
    const txt = $("topStatusMsg");
    if (!bar || !txt) return;
    if (getMode() !== "edit") {
      bar.classList.remove("show");
      document.body.classList.remove("has-topstatus");
      return;
    }
    txt.textContent = msg || "";
    bar.classList.add("show");
    bar.classList.toggle("ok", kind === "ok");
    bar.classList.toggle("err", kind === "err");
    document.body.classList.add("has-topstatus");
  }

  function hideTopStatus(){
    const bar = $("topStatus");
    if (!bar) return;
    bar.classList.remove("show", "ok", "err");
    document.body.classList.remove("has-topstatus");
  }

  function isObj(x){ return x && typeof x === "object" && !Array.isArray(x); }

  function setStatus(msg){
    const el = $("status");
    if (!el) return;
    el.textContent = msg || "";
  }

  function stripHtml(s){ return (s||"").toString().replace(/<[^>]+>/g, ""); }
  function truncate(s,n){ s=stripHtml(s).trim(); return s.length<=n? s : s.slice(0,n-1)+"…"; }

  // parseYear accepts signed years now (e.g. "-0444-01-01" -> -444)
  function parseYear(dateStr){
    if (!dateStr) return null;
    const m = /^(-?\d+)(?:-\d{2}(?:-\d{2})?)?/.exec(String(dateStr||""));
    return m ? parseInt(m[1], 10) : null;
  }

  // parseDateParts -> { year: Number|null, month: Number, day: Number }
  function parseDateParts(dateStr){
    if (!dateStr) return { year: null, month: 1, day: 1 };
    const m = /^(-?\d+)(?:-(\d{2})(?:-(\d{2}))?)?/.exec(String(dateStr));
    if (!m) return { year: null, month: 1, day: 1 };
    const year = parseInt(m[1], 10);
    const month = parseInt(m[2] || "1", 10);
    const day = parseInt(m[3] || "1", 10);
    return { year, month, day };
  }

  // compare two date strings numerically (handles negative years)
  function compareDateStrings(a, b){
    const A = parseDateParts(a);
    const B = parseDateParts(b);
    if (A.year === null && B.year === null) return 0;
    if (A.year === null) return 1;
    if (B.year === null) return -1;
    if (A.year !== B.year) return A.year - B.year;
    if (A.month !== B.month) return A.month - B.month;
    return A.day - B.day;
  }

  // fmtDate: format for display, handles negative years (shows "YYYY-MM-DD av. J.-C.")
  function fmtDate(dateStr){
    if (!dateStr) return "";
    const p = parseDateParts(dateStr);
    if (p.year === null) return String(dateStr).split(" ")[0];
    const yearAbs = Math.abs(p.year);
    const yyyy = String(yearAbs).padStart(4, "0");
    const mm = String(p.month).padStart(2, "0");
    const dd = String(p.day).padStart(2, "0");
    const datePart = `${yyyy}-${mm}-${dd}`;
    if (p.year < 0) return `${datePart} BCE`;
    return datePart;
  }

  function escapeHtml(s){
    return (s||"").replace(/[&<>"']/g, (ch)=>({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[ch]));
  }

  function renderTextWithLinks(raw){
    const plain = stripHtml(raw || "");
    const md = [];
    const withPlaceholders = plain.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (m, label, url)=>{
      const safe = safeUrl(url);
      if (!safe) return m;
      const idx = md.length;
      md.push({ label, url: safe });
      return `@@MDLINK_${idx}@@`;
    });
    let html = escapeHtml(withPlaceholders);
    html = html.replace(/(https?:\/\/[^\s<]+)/g, (match)=>{
      const safe = safeUrl(match);
      if (!safe) return match;
      return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${match}</a>`;
    });
    html = html.replace(/@@MDLINK_(\d+)@@/g, (m, n)=>{
      const item = md[Number(n)];
      if (!item) return m;
      const label = escapeHtml(item.label);
      return `<a href="${item.url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    });
    html = html.replace(/\n/g, "<br>");
    return html;
  }

  function safeUrl(u){
    if (!u || typeof u !== "string") return null;
    const trimmed = u.trim();
    if (!trimmed) return null;
    try {
      const url = new URL(trimmed, window.location.href);
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
      return null;
    } catch { return null; }
  }

  function safeImageUrl(u){
    if (!u || typeof u !== "string") return null;
    const trimmed = u.trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase().startsWith("data:image/")) {
      if (/^data:image\/[a-z0-9+.-]+;base64,/i.test(trimmed)) return trimmed;
      return null;
    }
    try {
      const url = new URL(trimmed, window.location.href);
      if (url.protocol === "http:" || url.protocol === "https:") return url.href;
      return null;
    } catch { return null; }
  }

  function loadOverridesLocal(){
    try{ const raw = localStorage.getItem(LS_KEY); return raw? JSON.parse(raw): {}; } catch{ return {}; }
  }
  function saveOverridesLocal(obj){
    try{ localStorage.setItem(LS_KEY, JSON.stringify(obj)); }catch(e){}
  }

  function getThumbUrl(story){
    const media = Array.isArray(story.media)? story.media: [];
    for (const m of media){
      const t = String(m?.type||"").toLowerCase();
      if (t === "image" && m?.src) return m.src;
    }
    for (const m of media){ if (m?.externalMediaThumb) return m.externalMediaThumb; }
    return "";
  }

  function rebuildStoriesFromBase(){
    stories = JSON.parse(JSON.stringify(BASE_STORIES));
    const byId = new Map(stories.map(s => [String(s.id), s]));
    for (const [id, o] of Object.entries(OVERRIDES)){
      if (!isObj(o)) continue;
      if (o.__new){
        const existing = byId.get(String(id));
        if (!existing){
          const ns = {
            id: parseInt(id, 10) || id,
            title: o.title || "(sans titre)",
            startDate: o.startDate || "",
            endDate: o.endDate || "",
            category: o.category || "",
            fullTextResolved: o.fullTextResolved || "",
            textResolved: o.textResolved || "",
            tags: o.tags || "",
            externalLink: o.externalLink || "",
            media: Array.isArray(o.media) ? o.media : []
          };
          if (Array.isArray(o.manualLinks)) ns.__manualLinks = o.manualLinks;
          // New: preserve credit on newly created story
          if (typeof o.credit === "string") ns.credit = o.credit;
          stories.push(ns);
          byId.set(String(id), ns);
          continue;
        }
      }
      const s = byId.get(String(id));
      if (!s) continue;
      if (o.__deleted){ s.__deleted = true; continue; }
      if (typeof o.title === "string") s.title = o.title;
      if (typeof o.startDate === "string") s.startDate = o.startDate;
      if (typeof o.endDate === "string") s.endDate = o.endDate;
      if (typeof o.category === "string") s.category = o.category;
      if (typeof o.fullTextResolved === "string") s.fullTextResolved = o.fullTextResolved;
      if (typeof o.textResolved === "string") s.textResolved = o.textResolved;
      if (typeof o.tags === "string") s.tags = o.tags;
      if (typeof o.externalLink === "string") s.externalLink = o.externalLink;
      if (Array.isArray(o.media)) s.media = o.media;
      if (Array.isArray(o.manualLinks)) s.__manualLinks = o.manualLinks;
      // New: propagate credit if present in overrides
      if (typeof o.credit === "string") s.credit = o.credit;
    }
  }

  function buildCategorySelect(){
    const sel = $("cat");
    const current = sel.value;
    sel.innerHTML = "";
    const o0 = document.createElement("option");
    o0.value = ""; o0.textContent = "Toutes les catégories";
    sel.appendChild(o0);
    const sorted = [...cats].sort((a,b)=> (a.title||"").localeCompare(b.title||"", "fr"));
    for (const c of sorted){
      const o = document.createElement("option");
      o.value = String(c.id);
      o.textContent = c.title || ("Cat " + c.id);
      sel.appendChild(o);
    }
    sel.value = current || "";
  }

  function filteredStories(){
    const q = $("q").value.trim().toLowerCase();
    const catId = $("cat").value;
    const y1 = parseInt($("y1").value, 10);
    const y2 = parseInt($("y2").value, 10);
    return stories
      .filter(s => !s.__deleted)
      .slice()
      .sort((a,b)=> compareDateStrings(a.startDate, b.startDate))
      .filter(s => {
        if (catId && String(s.category) !== String(catId)) return false;
        const y = parseYear(s.startDate);
        if (!Number.isNaN(y1) && y !== null && y < y1) return false;
        if (!Number.isNaN(y2) && y !== null && y > y2) return false;
        if (q){
          const hay = ((s.title||"") + " " + (s.textResolved||"") + " " + (s.fullTextResolved||"") + " " + (s.tags||"")).toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
  }

  function render(){
    $("pageTitle").textContent = DATA?.meta?.title || "Timeline";
    $("pageMeta").textContent = ((DATA?.meta?.authorName||"") + " • " + (DATA?.meta?.startDate||"").split(" ")[0] + " → " + (DATA?.meta?.endDate||"").split(" ")[0]).trim();
    const items = filteredStories();
    const total = stories.length;
    const yearsAll = stories.map(s=>parseYear(s.startDate)).filter(y=>y!==null);
    const minY = yearsAll.length ? Math.min(...yearsAll) : 0;
    const maxY = yearsAll.length ? Math.max(...yearsAll) : 0;
    $("stats").innerHTML = "";
    const p1 = document.createElement("div"); p1.className="pill"; p1.textContent = `${items.length} / ${total} événements affichés`;
    const p2 = document.createElement("div"); p2.className="pill"; p2.textContent = `Plage: ${minY} → ${maxY}`;
    $("stats").appendChild(p1); $("stats").appendChild(p2);
    const tl = $("timeline"); tl.innerHTML = "";
    const fragment = document.createDocumentFragment();
    for (const s of items){
      const c = catMap.get(String(s.category||""));
      const color = c && c.colour ? ("#" + c.colour) : "var(--accent)";
      const catTitle = c && c.title ? c.title : "—";
      const wrap = document.createElement("div"); wrap.className = "event";
      const card = document.createElement("div"); card.className = "card evt"; card.addEventListener("click", ()=> openModal(s));
      const main = document.createElement("div"); main.className = "evtMain";
      const d = document.createElement("div"); d.className = "date";
      const sd = fmtDate(s.startDate);
      const ed = fmtDate(s.endDate);
      d.textContent = sd + (ed && ed !== sd ? (" → " + ed) : "");
      main.appendChild(d);
      const ti = document.createElement("div"); ti.className = "title"; ti.textContent = s.title || "(sans titre)";
      main.appendChild(ti);
      const cat = document.createElement("div"); cat.className = "cat";
      const dot = document.createElement("span"); dot.className="dot"; dot.style.background = color;
      const ct = document.createElement("span"); ct.textContent = catTitle;
      cat.appendChild(dot); cat.appendChild(ct);
      main.appendChild(cat);
      const prev = document.createElement("div"); prev.className = "preview";
      const source = (s.fullTextResolved && s.fullTextResolved.trim()) ? s.fullTextResolved : (s.textResolved || "");
      prev.textContent = truncate(source, 240) || "";
      main.appendChild(prev);
      const thumbWrap = document.createElement("div"); thumbWrap.className = "evtThumb";
      const thumbUrl = getThumbUrl(s);
      if (thumbUrl){
        const safeThumb = safeImageUrl(thumbUrl);
        if (safeThumb){
          const img = document.createElement("img");
          img.loading="lazy"; img.decoding="async"; img.referrerPolicy="no-referrer";
          img.src = safeThumb;
          thumbWrap.appendChild(img);
        } else { thumbWrap.classList.add("empty"); }
      } else { thumbWrap.classList.add("empty"); }
      card.appendChild(main); card.appendChild(thumbWrap); wrap.appendChild(card); fragment.appendChild(wrap);
    }
    tl.appendChild(fragment);
    if ($("modePill")) $("modePill").textContent = getMode() === "edit" ? "Mode: édition" : "Mode: lecture";
  }

  let _previousActive = null;

  function openModal(story){
    _previousActive = document.activeElement;
    window.CURRENT_STORY_ID = String(story.id);
    setEditMode(false);
    const c = catMap.get(String(story.category||""));
    const color = c && c.colour ? ("#" + c.colour) : "var(--accent)";
    const catTitle = c && c.title ? c.title : "—";
    const sd = fmtDate(story.startDate);
    const ed = fmtDate(story.endDate);
    $("mdate").textContent = sd + (ed && ed !== sd ? (" → " + ed) : "");
    $("mtitle").textContent = story.title || "(sans titre)";
    $("mcat").textContent = catTitle;
    $("mdot").style.background = color;
    // NOUVEAU : afficher credit si présent
    if ($("mcredit")) $("mcredit").textContent = story.credit || "";

    const links = $("mlinks"); links.innerHTML = "";
    const ext = (story.externalLink||"").trim();
    if (ext){
      const safeExt = safeUrl(ext);
      if (safeExt){
        const a=document.createElement("a"); a.href=safeExt; a.target="_blank"; a.rel="noopener"; a.textContent="Lien externe"; links.appendChild(a);
      }
    }
    if (Array.isArray(story.__manualLinks)){
      for (const l of story.__manualLinks){
        if (!l?.url) continue;
        const safeLink = safeUrl(l.url);
        if (safeLink){
          const a=document.createElement("a"); a.href=safeLink; a.target="_blank"; a.rel="noopener"; a.textContent=l.title||l.url; links.appendChild(a);
        }
      }
    }
    const text = (story.fullTextResolved && story.fullTextResolved.trim()) ? story.fullTextResolved : (story.textResolved || "");
    $("mtext").innerHTML = renderTextWithLinks(text);
    const gal = $("mgallery"); gal.innerHTML = "";
    if (Array.isArray(story.media) && story.media.length){
      for (const m of story.media){
        if (m?.type === "Image" && m?.src){
          const safeSrc = safeImageUrl(m.src);
          if (safeSrc){
            const box=document.createElement("div"); box.className="thumb";
            const img=document.createElement("img"); img.src=safeSrc; img.loading="lazy";
            const cap=document.createElement("div"); cap.className="cap"; cap.textContent=(m.caption||"").trim();
            box.appendChild(img); box.appendChild(cap); gal.appendChild(box);
          }
        }
      }
    }
    const modal = $("modal");
    $("backdrop").style.display="block";
    modal.style.display="grid";
    document.body.classList.add("modal-open");
    modal.setAttribute("aria-hidden","false");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("tabindex", "-1");
    modal.focus();
    applyEditPermissions();
    setEditMode(false);
  }

  function closeModal(){
    const modal = $("modal");
    $("backdrop").style.display="none";
    modal.style.display="none";
    document.body.classList.remove("modal-open");
    modal.setAttribute("aria-hidden","true");
    modal.removeAttribute("role");
    modal.removeAttribute("aria-modal");
    modal.removeAttribute("tabindex");
    if (_previousActive && document.body.contains(_previousActive)){
      try { _previousActive.focus(); } catch(e){}
    }
    _previousActive = null;
  }

  function setEditMode(on){
    const isEdit = getMode() === "edit";
    const show = isEdit && !!on;
    $("editWrap").style.display = show ? "block" : "none";
    $("editBtn").style.display   = (!show && isEdit) ? "" : "none";
    $("saveBtn").style.display   = show ? "" : "none";
    $("cancelBtn").style.display = show ? "" : "none";
    $("deleteBtn").style.display = show ? "" : "none";
    $("mdate").style.display = show ? "none" : "block";
    $("mtitle").style.display = show ? "none" : "block";
    document.querySelector(".mcat").style.display = show ? "none" : "flex";
    $("mlinks").style.display = show ? "none" : "flex";
    $("mtext").style.display = show ? "none" : "block";
    $("mgallery").style.display = show ? "none" : "grid";
  }

  function fillEditCategorySelect(selected){
    const sel = $("e_cat");
    sel.innerHTML = "";
    const sorted = [...cats].sort((a,b)=> (a.title||"").localeCompare(b.title||"", "fr"));
    for (const c of sorted){
      const o = document.createElement("option");
      o.value = String(c.id);
      o.textContent = c.title || String(c.id);
      sel.appendChild(o);
    }
    sel.value = selected ? String(selected) : "";
  }

  function getStoryById(id){ return stories.find(s => String(s.id) === String(id)); }

  // ---------- UI helpers pour media rows ----------
  function createMediaRow(m = {}) {
    const row = document.createElement('div');
    row.className = 'media-row';

    const src = document.createElement('input');
    src.type = 'url';
    src.className = 'media-src';
    src.placeholder = 'https://.../image.jpg';
    src.value = m.src || m.url || '';

    const caption = document.createElement('input');
    caption.type = 'text';
    caption.className = 'media-caption';
    caption.placeholder = 'Légende (optionnel)';
    caption.value = m.caption || '';

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'media-remove';
    remove.textContent = 'Supprimer';
    remove.addEventListener('click', () => row.remove());

    row.appendChild(src);
    row.appendChild(caption);
    row.appendChild(remove);
    return row;
  }

  function addMediaRow(m = {}) {
    const container = document.getElementById('e_images');
    if (!container) return;
    container.appendChild(createMediaRow(m));
  }

  // ---------- end helpers ----------

  function openEditForStory(story){
    fillEditCategorySelect(story.category || "");
    $("e_title").value = story.title || "";
    $("e_start").value = story.startDate || "";
    $("e_end").value = story.endDate || "";
    $("e_link").value = story.externalLink || "";
    const t = (story.fullTextResolved && story.fullTextResolved.trim()) ? story.fullTextResolved : (story.textResolved || "");
    $("e_text").value = stripHtml(t);

    // NOUVEAU : crédit aucteur / credit
    if ($("e_credit")) $("e_credit").value = story.credit || "";

    // Remplir la liste d'images (si media existe)
    const imgsContainer = $("e_images");
    if (imgsContainer) {
      imgsContainer.innerHTML = '';
      const media = Array.isArray(story.media) ? story.media : [];
      if (media.length === 0) {
        addMediaRow(); // un champ vide par défaut
      } else {
        media.forEach(m => addMediaRow(m));
      }
    }

    setEditMode(true);
  }

  function nextStoryId(){
    const ids = BASE_STORIES.map(s=>parseInt(s.id,10)).filter(Number.isFinite);
    const oids = Object.keys(OVERRIDES||{}).map(k=>parseInt(k,10)).filter(Number.isFinite);
    const maxId = Math.max(0, ...ids, ...oids);
    return maxId + 1;
  }

  function ensureCanEditOrWarn(){
    if (getMode() !== "edit"){ alert("Lecture seule : passe en mode #edit pour modifier."); return false; }
    return true;
  }

  async function applySave(){
    if (!ensureCanEditOrWarn()) return;
    const id = String(window.CURRENT_STORY_ID);
    if (!id) return;
    const title = $("e_title").value.trim();
    const startDate = $("e_start").value.trim();
    const endDate = $("e_end").value.trim();
    const category = $("e_cat").value;
    const externalLink = $("e_link").value.trim();
    const text = $("e_text").value;
    const credit = ($("e_credit") ? $("e_credit").value.trim() : "").trim();

    // collecter media depuis DOM
    const mediaRows = Array.from(document.querySelectorAll('#e_images .media-row'));
    const media = mediaRows
      .map((r, idx) => {
        const src = (r.querySelector('.media-src') || {}).value || '';
        const caption = (r.querySelector('.media-caption') || {}).value || '';
        const s = (src || '').trim();
        if (!s) return null;
        return { id: idx + 1, src: s, caption: caption || '', type: "Image", thumbPosition: "0,0", externalMediaThumb: "", externalMediaType: "", externalMediaId: "", orderIndex: 10 };
      })
      .filter(Boolean);

    // load local overrides only (no seed file)
    OVERRIDES = loadOverridesLocal();
    const prev = isObj(OVERRIDES[id]) ? OVERRIDES[id] : {};
    const o = Object.assign({}, prev);
    const existsInBase = BASE_STORIES.some(s => String(s.id) === String(id));
    if (!existsInBase) o.__new = true;
    o.title = title || "(sans titre)";
    o.startDate = startDate || "";
    o.endDate = endDate || "";
    o.category = category || "";
    o.externalLink = externalLink || "";
    o.fullTextResolved = text || "";
    o.textResolved = "";
    // NOUVEAU : sauvegarder credit
    if (credit) o.credit = credit;
    // Sauver media (array)
    o.media = media.length ? media : [];

    // Compatibilité ascendante : garder "image" simple si nécessaire
    o.image = o.media && o.media.length ? (o.media[0].src || "") : (o.image || "");

    OVERRIDES[id] = o;
    saveOverridesLocal(OVERRIDES);

    rebuildStoriesFromBase();
    render();

    const s = getStoryById(id);
    if (s) openModal(s);

    setLocalStatus("Modifications enregistrées localement ✅");
  }

  async function applyDelete(){
    if (!ensureCanEditOrWarn()) return;
    const id = String(window.CURRENT_STORY_ID);
    if (!id) return;
    if (!confirm("Supprimer cet événement ?")) return;

    OVERRIDES = loadOverridesLocal();
    const existsInBase = BASE_STORIES.some(s => String(s.id) === String(id));
    if (existsInBase){
      OVERRIDES[id] = Object.assign({}, (OVERRIDES[id]||{}), { __deleted: true });
    } else {
      delete OVERRIDES[id];
    }
    saveOverridesLocal(OVERRIDES);
    rebuildStoriesFromBase();
    render();
    closeModal();

    setLocalStatus("Suppression enregistrée localement ✅");
  }

  async function createNewStory(){
    const id = String(nextStoryId());
    const draft = { id, title: "(sans titre)", startDate: "", endDate: "", category: (cats[0] ? String(cats[0].id) : ""), externalLink: "", fullTextResolved: "", textResolved: "", tags: "", media: [] };
    openModal(draft);
    openEditForStory(draft);
    if ($('deleteBtn')) $('deleteBtn').style.display = 'none';
    setLocalStatus("Nouvel événement prêt (non enregistré tant que tu ne cliques pas sur Enregistrer).");
  }

  function exportEdits(){
    const blob = new Blob([JSON.stringify(OVERRIDES, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = OVERRIDES_FILENAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setLocalStatus(`Export JSON prêt (${OVERRIDES_FILENAME}).`);
  }

  function importEdits(file){
    const reader = new FileReader();
    reader.onload = () => {
      try{
        const obj = JSON.parse(reader.result);
        if (!isObj(obj)) throw new Error("JSON invalide");
        OVERRIDES = obj;
        saveOverridesLocal(OVERRIDES);
        rebuildStoriesFromBase();
        render();
        alert("Modifications importées ✅");
        setLocalStatus("Overrides importés localement ✅");
      }catch(e){
        alert("Import impossible: " + (e.message||String(e)));
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function resetFilters(){
    $("q").value = "";
    $("cat").value = "";
    const years = stories.map(s=>parseYear(s.startDate)).filter(y=>y!==null);
    $("y1").value = years.length ? Math.min(...years) : 0;
    $("y2").value = years.length ? Math.max(...years) : 0;
    render();
  }

  function applyEditPermissions(){
    const isEdit = getMode() === "edit";
    if (!isEdit){
      if ($("editBtn")) $("editBtn").style.display = "none";
      if ($("saveBtn")) $("saveBtn").style.display = "none";
      if ($("cancelBtn")) $("cancelBtn").style.display = "none";
      if ($("deleteBtn")) $("deleteBtn").style.display = "none";
    }
    const newBtn = $("newBtn");
    if (newBtn){ newBtn.style.display = isEdit ? "" : "none"; newBtn.disabled = false; }
    const editBtn = $("editBtn");
    if (editBtn){ editBtn.disabled = !isEdit; editBtn.title = isEdit ? "" : "Lecture seule"; }
    const saveBtn = $("saveBtn");
    if (saveBtn){ saveBtn.disabled = !isEdit; saveBtn.title = isEdit ? "" : "Lecture seule"; }
    const deleteBtn = $("deleteBtn");
    if (deleteBtn){ deleteBtn.disabled = !isEdit; deleteBtn.title = isEdit ? "" : "Lecture seule"; }
    if (isEdit){
      setStatus("Mode édition locale : overrides enregistrés dans ce navigateur.");
    } else {
      setStatus("Mode lecture.");
    }
  }

  function setLocalStatus(msg){
    if (getMode() === "edit") {
      const kind = (msg || "").toLowerCase().includes("erreur") ? "err" : "ok";
      if (msg) showTopStatus(msg, kind);
    }
  }

  async function boot(){
    const r = await fetch(BASE_URL, { cache: "no-store" });
    if (!r.ok) throw new Error("Base JSON introuvable: " + BASE_URL);
    DATA = await r.json();

    function normalizeBase(input){
      if (input && typeof input === 'object' && Array.isArray(input.stories)) {
        return { meta: (input.meta && typeof input.meta === 'object') ? input.meta : {}, categories: Array.isArray(input.categories) ? input.categories : [], stories: input.stories };
      }
      if (input && typeof input === 'object' && !Array.isArray(input)) {
        const stories = Object.entries(input).filter(([, v]) => v && typeof v === 'object').map(([k, v]) => ({ id: (v.id ?? k), ...v }));
        const catIds = new Map();
        for (const s of stories) {
          const cid = (s.categoryId ?? s.category ?? s.category_id ?? null);
          if (cid == null) continue;
          const key = String(cid);
          if (!catIds.has(key)) catIds.set(key, { id: key, title: key });
        }
        return { meta: { title: input.title || input.name || 'Timeline' }, categories: Array.from(catIds.values()), stories };
      }
      return { meta: {}, categories: [], stories: [] };
    }

    const normalized = normalizeBase(DATA);
    DATA = normalized;
    cats = Array.isArray(normalized.categories) ? normalized.categories : [];
    BASE_STORIES = Array.isArray(normalized.stories) ? normalized.stories : [];
    catMap.clear(); for (const c of cats) catMap.set(String(c.id), c);

    // load local overrides (no seed file)
    OVERRIDES = loadOverridesLocal();
    saveOverridesLocal(OVERRIDES);
    rebuildStoriesFromBase();
    buildCategorySelect();
    resetFilters();

    applyEditPermissions();
    if (getMode() !== "edit") hideTopStatus();
  }

  document.addEventListener("DOMContentLoaded", () => {
    // wire UI
    if ($("q")) $("q").addEventListener("input", render);
    if ($("cat")) $("cat").addEventListener("change", render);
    if ($("y1")) $("y1").addEventListener("input", render);
    if ($("y2")) $("y2").addEventListener("input", render);
    if ($("resetBtn")) $("resetBtn").addEventListener("click", resetFilters);

    const exportBtn = $("exportOverridesBtn"); if (exportBtn) exportBtn.addEventListener("click", exportEdits);
    const importBtn = $("importOverridesBtn"); const importFile = $("importFile");
    if (importBtn && importFile) { importBtn.addEventListener("click", ()=> importFile.click()); importFile.addEventListener("change", ()=> { if (importFile.files?.[0]) importEdits(importFile.files[0]); }); }

    if ($("backdrop")) $("backdrop").addEventListener("click", closeModal);
    if ($("closeBtn")) $("closeBtn").addEventListener("click", closeModal);
    window.addEventListener("keydown", (e)=>{ if (e.key === "Escape") closeModal(); });

    if ($("editBtn")) $("editBtn").addEventListener("click", ()=> { const s = getStoryById(window.CURRENT_STORY_ID); if (s) openEditForStory(s); });
    if ($("saveBtn")) $("saveBtn").addEventListener("click", (e)=>{ e.preventDefault(); applySave().catch((err)=>{ console.error(err); setStatus("Erreur: "+(err&&err.message?err.message:String(err)), true); }); });
    if ($("cancelBtn")) $("cancelBtn").addEventListener("click", ()=> setEditMode(false));
    if ($("deleteBtn")) $("deleteBtn").addEventListener("click", ()=> applyDelete().catch((err)=>{ console.error(err); setStatus("Erreur: "+(err&&err.message?err.message:String(err)), true); }));
    const newBtn = $("newBtn"); if (newBtn) newBtn.addEventListener("click", ()=> createNewStory().catch((err)=>{ console.error(err); setStatus("Erreur: "+(err&&err.message?err.message:String(err)), true); }));

    // ajout listener pour le bouton Ajouter image
    if ($("e_add_image")) $("e_add_image").addEventListener("click", ()=> addMediaRow());

    window.addEventListener("sc:modechange", () => {
      applyEditPermissions();
      if (DATA && Array.isArray(stories) && stories.length) render();
      if (getMode() !== "edit") hideTopStatus();
    });

    boot().catch(err => {
      console.error(err);
      if ($("timeline")) $("timeline").innerHTML = `<div class="card"><div class="hd">Erreur</div><div class="bd"><div class="muted kbd">${(err.message||String(err)).replace(/</g,"&lt;")}</div></div></div>`;
    });
  });
})();
