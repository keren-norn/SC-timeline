/* global supabase */
(() => {
  const MODE = document.body.dataset.mode || "view"; // 'view' | 'edit'
  const SUPABASE_URL = document.body.dataset.supabaseUrl || "";
  const SUPABASE_ANON_KEY = document.body.dataset.supabaseAnonKey || "";
  const TIMELINE_ID = Number(document.body.dataset.timelineId || "1771887");

  const BASE_URL = "./data/tiki_toki_1771887.json";
  const OVERRIDE_TABLE = "timeline_overrides";
  const EDITORS_TABLE = "timeline_editors"; // email allowlist

  const LS_KEY = `tikitoki_overrides_${TIMELINE_ID}_v3`;

  let sb = null;
  let CAN_EDIT = false;
  let SESSION = null;

  let DATA = null;
  let cats = [];
  let stories = [];
  let BASE_STORIES = [];
  let OVERRIDES = {};
  let LAST_REMOTE_UPDATED_AT = null;
  let LAST_REMOTE_UPDATED_BY = null;
  const catMap = new Map();

  function $(id){ return document.getElementById(id); }
  function isObj(x){ return x && typeof x === "object" && !Array.isArray(x); }

  function stripHtml(s){ return (s||"").toString().replace(/<[^>]+>/g, ""); }
  function truncate(s,n){ s=stripHtml(s).trim(); return s.length<=n? s : s.slice(0,n-1)+"…"; }
  function parseYear(dateStr){ const m=/^(\d{4})-\d{2}-\d{2}/.exec(dateStr||""); return m?parseInt(m[1],10):null; }
  function fmtDate(dateStr){ return (dateStr||"").split(" ")[0]; }

  function loadOverridesLocal(){
    try{ const raw = localStorage.getItem(LS_KEY); return raw? JSON.parse(raw): {}; }
    catch{ return {}; }
  }
  function saveOverridesLocal(obj){
    localStorage.setItem(LS_KEY, JSON.stringify(obj));
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
        stories.push(ns);
        continue;
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
      .sort((a,b)=> (a.startDate||"").localeCompare(b.startDate||""))
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

    const tl = $("timeline");
    tl.innerHTML = "";
    for (const s of items){
      const c = catMap.get(String(s.category||""));
      const color = c && c.colour ? ("#" + c.colour) : "var(--accent)";
      const catTitle = c && c.title ? c.title : "—";

      const wrap = document.createElement("div");
      wrap.className = "event";

      const card = document.createElement("div");
      card.className = "card evt";
      card.addEventListener("click", ()=> openModal(s));

      const main = document.createElement("div");
      main.className = "evtMain";

      const d = document.createElement("div");
      d.className = "date";
      const sd = fmtDate(s.startDate);
      const ed = fmtDate(s.endDate);
      d.textContent = sd + (ed && ed !== sd ? (" → " + ed) : "");
      main.appendChild(d);

      const ti = document.createElement("div");
      ti.className = "title";
      ti.textContent = s.title || "(sans titre)";
      main.appendChild(ti);

      const cat = document.createElement("div");
      cat.className = "cat";
      const dot = document.createElement("span"); dot.className="dot"; dot.style.background = color;
      const ct = document.createElement("span"); ct.textContent = catTitle;
      cat.appendChild(dot); cat.appendChild(ct);
      main.appendChild(cat);

      const prev = document.createElement("div");
      prev.className = "preview";
      const source = (s.fullTextResolved && s.fullTextResolved.trim()) ? s.fullTextResolved : (s.textResolved || "");
      prev.textContent = truncate(source, 240) || "";
      main.appendChild(prev);

      const thumbWrap = document.createElement("div");
      thumbWrap.className = "evtThumb";
      const thumbUrl = getThumbUrl(s);
      if (thumbUrl){
        const img = document.createElement("img");
        img.loading="lazy"; img.decoding="async"; img.referrerPolicy="no-referrer";
        img.src = thumbUrl;
        thumbWrap.appendChild(img);
      } else {
        thumbWrap.classList.add("empty");
      }

      card.appendChild(main);
      card.appendChild(thumbWrap);
      wrap.appendChild(card);
      tl.appendChild(wrap);
    }

    // mode badges
    if ($("modePill")){
      $("modePill").textContent = MODE === "edit" ? "Mode: édition" : "Mode: lecture";
    }
  }

  function openModal(story){
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

    const links = $("mlinks");
    links.innerHTML = "";
    const ext = (story.externalLink||"").trim();
    if (ext){
      const a=document.createElement("a"); a.href=ext; a.target="_blank"; a.rel="noopener"; a.textContent="Lien externe";
      links.appendChild(a);
    }
    if (Array.isArray(story.__manualLinks)){
      for (const l of story.__manualLinks){
        if (!l?.url) continue;
        const a=document.createElement("a"); a.href=l.url; a.target="_blank"; a.rel="noopener"; a.textContent=l.title||l.url;
        links.appendChild(a);
      }
    }

    const text = (story.fullTextResolved && story.fullTextResolved.trim()) ? story.fullTextResolved : (story.textResolved || "");
    $("mtext").textContent = stripHtml(text);

    const gal = $("mgallery");
    gal.innerHTML = "";
    if (Array.isArray(story.media) && story.media.length){
      for (const m of story.media){
        if (m?.type === "Image" && m?.src){
          const box=document.createElement("div"); box.className="thumb";
          const img=document.createElement("img"); img.src=m.src; img.loading="lazy";
          const cap=document.createElement("div"); cap.className="cap"; cap.textContent=(m.caption||"").trim();
          box.appendChild(img); box.appendChild(cap);
          gal.appendChild(box);
        }
      }
    }

    $("backdrop").style.display="block";
    $("modal").style.display="grid";
    $("modal").setAttribute("aria-hidden","false");

    applyEditPermissions();
  }

  function closeModal(){
    $("backdrop").style.display="none";
    $("modal").style.display="none";
    $("modal").setAttribute("aria-hidden","true");
  }

  // --- Edit mode (inline) ---
  function setEditMode(on){
    const show = !!on;
    $("editWrap").style.display = show ? "block" : "none";
    $("editBtn").style.display = show ? "none" : "";
    $("saveBtn").style.display = show ? "" : "none";
    $("cancelBtn").style.display = show ? "" : "none";

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

  function openEditForStory(story){
    fillEditCategorySelect(story.category || "");
    $("e_title").value = story.title || "";
    $("e_start").value = story.startDate || "";
    $("e_end").value = story.endDate || "";
    $("e_link").value = story.externalLink || "";

    const t = (story.fullTextResolved && story.fullTextResolved.trim()) ? story.fullTextResolved : (story.textResolved || "");
    $("e_text").value = stripHtml(t);

    const thumb = getThumbUrl(story);
    $("e_img").value = thumb || "";

    setEditMode(true);
  }

  function nextStoryId(){
    const ids = BASE_STORIES.map(s=>parseInt(s.id,10)).filter(Number.isFinite);
    const oids = Object.keys(OVERRIDES||{}).map(k=>parseInt(k,10)).filter(Number.isFinite);
    const maxId = Math.max(0, ...ids, ...oids);
    return maxId + 1;
  }

  function ensureCanEditOrWarn(){
    if (MODE !== "edit"){
      alert("Lecture seule : ouvre editor.html pour modifier.");
      return false;
    }
    if (!CAN_EDIT){
      alert("Lecture seule : connecte-toi (et sois dans la liste des éditeurs).");
      return false;
    }
    return true;
  }

  function applySave(){
    if (!ensureCanEditOrWarn()) return;
    const id = String(window.CURRENT_STORY_ID);
    if (!id) return;

    const title = $("e_title").value.trim();
    const startDate = $("e_start").value.trim();
    const endDate = $("e_end").value.trim();
    const category = $("e_cat").value;
    const externalLink = $("e_link").value.trim();
    const img = $("e_img").value.trim();
    const text = $("e_text").value;

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

    if (img){
      o.media = [{ id: 1, src: img, caption: "", type: "Image", thumbPosition: "0,0", externalMediaThumb: "", externalMediaType: "", externalMediaId: "", orderIndex: 10 }];
    } else {
      o.media = [];
    }

    OVERRIDES[id] = o;
    saveOverridesLocal(OVERRIDES);

    rebuildStoriesFromBase();
    render();

    const s = getStoryById(id);
    if (s) openModal(s);

    debouncedRemoteSave();
  }

  function applyDelete(){
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

    debouncedRemoteSave();
  }

  function createNewStory(){
    if (!ensureCanEditOrWarn()) return;
    const id = String(nextStoryId());
    OVERRIDES = loadOverridesLocal();
    OVERRIDES[id] = { __new: true, title:"(sans titre)", startDate:"", endDate:"", category:(cats[0]?String(cats[0].id):""), fullTextResolved:"", textResolved:"", externalLink:"", tags:"", media:[] };
    saveOverridesLocal(OVERRIDES);
    rebuildStoriesFromBase();
    render();
    const s = getStoryById(id);
    if (s){ openModal(s); openEditForStory(s); }

    debouncedRemoteSave();
  }

  // ---- Export / import (edits) ----
  function exportEdits(){
    const blob = new Blob([JSON.stringify(OVERRIDES, null, 2)], {type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tikitoki_edits_${TIMELINE_ID}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
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
        debouncedRemoteSave();
      }catch(e){
        alert("Import impossible: " + (e.message||String(e)));
      }
    };
    reader.readAsText(file, "utf-8");
  }

  // ---- Filter utilities ----
  async function copyFiltered(){
    const items = filteredStories();
    const payload = { meta: DATA.meta, categories: DATA.categories, stories: items };
    await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
    alert("JSON copié ✅");
  }
  function resetFilters(){
    $("q").value = "";
    $("cat").value = "";
    const years = stories.map(s=>parseYear(s.startDate)).filter(y=>y!==null);
    $("y1").value = years.length ? Math.min(...years) : 0;
    $("y2").value = years.length ? Math.max(...years) : 0;
    render();
  }

  // ---- Supabase I/O ----
  async function sbInit(){
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return;
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data } = await sb.auth.getSession();
    SESSION = data.session || null;
    sb.auth.onAuthStateChange(async () => {
      const { data } = await sb.auth.getSession();
      SESSION = data.session || null;
      await checkEditor();
      setAuthUi();
    });
    await checkEditor();
    setAuthUi();
  }

  async function checkEditor(){
    CAN_EDIT = false;
    if (!sb) return false;
    const { data } = await sb.auth.getSession();
    SESSION = data.session || null;
    if (!SESSION) return false;
    const email = SESSION.user.email;
    if (!email) return false;

    // Check allowlist table (readable to authenticated users via RLS policy)
    const res = await sb.from(EDITORS_TABLE).select("email").eq("email", email).limit(1);
    if (!res.error && Array.isArray(res.data) && res.data.length){
      CAN_EDIT = true;
      return true;
    }
    CAN_EDIT = false;
    return false;
  }

  function setAuthUi(){
    const authBox = $("authBox");
    if (!authBox) return;
    authBox.style.display = (MODE === "edit") ? "block" : "none";

    const status = $("authStatus");
    if (!sb){
      status.textContent = "Supabase: non configuré";
      return;
    }
    if (!SESSION){
      status.textContent = "Mode: lecture (non connecté)";
      $("logoutBtn").disabled = true;
      $("loginBtn").disabled = false;
      CAN_EDIT = false;
      applyEditPermissions();
      return;
    }
    status.textContent = CAN_EDIT ? `Mode: édition ✅ (${SESSION.user.email})` : `Connecté (${SESSION.user.email}) — lecture seule`;
    $("logoutBtn").disabled = false;
    $("loginBtn").disabled = true;
    applyEditPermissions();
  }

  function applyEditPermissions(){
    // Do NOT hide reset/copy as requested.
    const editIds = ["newBtn","editBtn","saveBtn","deleteBtn"];
    for (const id of editIds){
      const el = $(id);
      if (!el) continue;
      el.style.display = (MODE === "edit" && CAN_EDIT) ? "" : "none";
    }
  }

  async function sbLoadOverrides(){
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY){
      return { data: null, updated_at: null, updated_by: null };
    }
    const url = `${SUPABASE_URL}/rest/v1/${OVERRIDE_TABLE}?timeline_id=eq.${TIMELINE_ID}&select=data,updated_at,updated_by`;
    const r = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      }
    });
    if (!r.ok) throw new Error(await r.text());
    const rows = await r.json();
    const row = rows?.[0] || null;
    return { data: row?.data ?? null, updated_at: row?.updated_at ?? null, updated_by: row?.updated_by ?? null };
  }

  async function sbSaveOverrides(obj){
    if (!sb) throw new Error("Supabase non initialisé.");
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token || null;
    if (!token) throw new Error("Non connecté.");
    const url = `${SUPABASE_URL}/rest/v1/${OVERRIDE_TABLE}`;
    const payload = { timeline_id: TIMELINE_ID, data: obj };
    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Prefer: "resolution=merge-duplicates"
      },
      body: JSON.stringify(payload)
    });
    if (!r.ok) throw new Error(await r.text());
  }

  let _saveTimer = null;
  function debouncedRemoteSave(){
    clearTimeout(_saveTimer);
    _saveTimer = setTimeout(async ()=>{
      try{
        if (!(MODE === "edit" && CAN_EDIT)) return;
        await sbSaveOverrides(OVERRIDES);
        const meta = await sbLoadOverrides();
        LAST_REMOTE_UPDATED_AT = meta.updated_at;
        LAST_REMOTE_UPDATED_BY = meta.updated_by;
        setSbStatus("Sauvegardé sur Supabase ✅");
      }catch(e){
        console.warn(e);
        setSbStatus("Erreur save Supabase: " + (e.message||String(e)));
      }
    }, 600);
  }

  function setSbStatus(msg){
    const el = $("sbStatus");
    if (!el) return;
    el.textContent = msg || "";
  }

  function diffOverrideKeys(a,b){
    const A = isObj(a) ? a : {};
    const B = isObj(b) ? b : {};
    const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
    const changed = [];
    for (const k of keys){
      if (JSON.stringify(A[k]) !== JSON.stringify(B[k])) changed.push(k);
    }
    return changed;
  }

  async function pullRemoteAndApply(){
    try{
      const meta = await sbLoadOverrides();
      if (meta.updated_at && meta.updated_at === LAST_REMOTE_UPDATED_AT && meta.updated_by === LAST_REMOTE_UPDATED_BY){
        return;
      }
      const remoteObj = (meta.data && isObj(meta.data)) ? meta.data : {};
      const changed = diffOverrideKeys(OVERRIDES, remoteObj);

      OVERRIDES = remoteObj;
      saveOverridesLocal(OVERRIDES);
      rebuildStoriesFromBase();
      render();

      LAST_REMOTE_UPDATED_AT = meta.updated_at;
      LAST_REMOTE_UPDATED_BY = meta.updated_by;

      const ts = meta.updated_at ? new Date(meta.updated_at).toLocaleString() : "—";
      const who = meta.updated_by ? `uid ${meta.updated_by}` : "—";
      const changedTxt = changed.length ? `Modifs détectées (${changed.length}) : ${changed.slice(0,12).join(", ")}${changed.length>12?"…":""}` : "Aucune modif détectée.";
      setSbStatus(`Supabase: dernière modif ${ts} • ${who} • ${changedTxt}`);
    }catch(e){
      console.warn("Reload Supabase failed:", e);
      setSbStatus("Reload Supabase impossible: " + (e.message||String(e)));
    }
  }

  function exportSnapshotGithub(){
    const ymd = new Date().toISOString().slice(0,10);
    const baseBlob = new Blob([JSON.stringify(DATA, null, 2)], {type:"application/json"});
    const bUrl = URL.createObjectURL(baseBlob);
    const a1 = document.createElement("a");
    a1.href = bUrl;
    a1.download = `base_${TIMELINE_ID}_${ymd}.json`;
    document.body.appendChild(a1); a1.click(); a1.remove();
    URL.revokeObjectURL(bUrl);

    const ovBlob = new Blob([JSON.stringify(OVERRIDES, null, 2)], {type:"application/json"});
    const oUrl = URL.createObjectURL(ovBlob);
    const a2 = document.createElement("a");
    a2.href = oUrl;
    a2.download = `overrides_${TIMELINE_ID}_${ymd}.json`;
    document.body.appendChild(a2); a2.click(); a2.remove();
    URL.revokeObjectURL(oUrl);
  }

  // ---- Boot ----
  async function boot(){
    // load base
    const r = await fetch(BASE_URL);
    if (!r.ok) throw new Error("Base JSON introuvable: " + BASE_URL);
    DATA = await r.json();

    // --- Normalisation du format de base ---
    // Format attendu: { meta, categories:[], stories:[] }
    // Mais certains exports peuvent être un objet {id: story, ...}
    function normalizeBase(input){
      // standard Tiki-Toki-like export
      if (input && typeof input === 'object' && Array.isArray(input.stories)) {
        return {
          meta: (input.meta && typeof input.meta === 'object') ? input.meta : {},
          categories: Array.isArray(input.categories) ? input.categories : [],
          stories: input.stories
        };
      }

      // dict-like export: {"123": {title, startDate, ...}, ...}
      if (input && typeof input === 'object' && !Array.isArray(input)) {
        const stories = Object.entries(input)
          .filter(([, v]) => v && typeof v === 'object')
          .map(([k, v]) => ({ id: (v.id ?? k), ...v }));
        // build minimal categories list from story.category / story.categoryId
        const catIds = new Map();
        for (const s of stories) {
          const cid = (s.categoryId ?? s.category ?? s.category_id ?? null);
          if (cid == null) continue;
          const key = String(cid);
          if (!catIds.has(key)) catIds.set(key, { id: key, title: key });
        }
        return {
          meta: { title: input.title || input.name || 'Timeline' },
          categories: Array.from(catIds.values()),
          stories
        };
      }

      // fallback
      return { meta: {}, categories: [], stories: [] };
    }

    const normalized = normalizeBase(DATA);
    // Keep a copy for status/debug
    DATA = normalized;

    cats = Array.isArray(normalized.categories) ? normalized.categories : [];
    BASE_STORIES = Array.isArray(normalized.stories) ? normalized.stories : [];
    catMap.clear();
    for (const c of cats) catMap.set(String(c.id), c);

    OVERRIDES = loadOverridesLocal();
    rebuildStoriesFromBase();
    buildCategorySelect();
    resetFilters(); // calls render

    await sbInit();
    await pullRemoteAndApply();

    // poll for remote changes
    setInterval(async ()=>{
      try{
        const meta = await sbLoadOverrides();
        if (meta.updated_at && meta.updated_at !== LAST_REMOTE_UPDATED_AT){
          await pullRemoteAndApply();
        }
      }catch{}
    }, 5000);

    applyEditPermissions();
  }

  // ---- Wire UI ----
  document.addEventListener("DOMContentLoaded", () => {
    $("q").addEventListener("input", render);
    $("cat").addEventListener("change", render);
    $("y1").addEventListener("input", render);
    $("y2").addEventListener("input", render);
    $("resetBtn").addEventListener("click", resetFilters);
    $("copyBtn").addEventListener("click", copyFiltered);

    $("exportEditsBtn").addEventListener("click", exportEdits);
    const importFile = $("importFile");
    $("importEditsBtn").addEventListener("click", ()=> importFile.click());
    importFile.addEventListener("change", ()=> { if (importFile.files?.[0]) importEdits(importFile.files[0]); });

    $("backdrop").addEventListener("click", closeModal);
    $("closeBtn").addEventListener("click", closeModal);
    window.addEventListener("keydown", (e)=>{ if (e.key === "Escape") closeModal(); });

    $("editBtn").addEventListener("click", ()=> {
      const s = getStoryById(window.CURRENT_STORY_ID);
      if (s) openEditForStory(s);
    });
    $("saveBtn").addEventListener("click", (e)=>{ e.preventDefault(); applySave(); });
    $("cancelBtn").addEventListener("click", ()=> setEditMode(false));
    $("deleteBtn").addEventListener("click", ()=> applyDelete());
    $("newBtn").addEventListener("click", ()=> createNewStory());

    // supabase UI (editor only)
    if ($("loginBtn")){
      $("loginBtn").addEventListener("click", async ()=>{
        try{
          if (!sb) return alert("Supabase non initialisé.");
          const email = $("authEmail").value.trim();
          const code = $("authCode").value.trim();
          if (!email) return alert("Entre un email.");
          if (code){
            const { error } = await sb.auth.verifyOtp({ email, token: code, type: "email" });
            if (error) throw error;
            $("authCode").value = "";
            await checkEditor();
            setAuthUi();
            alert("Connecté ✅");
          } else {
            const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.href } });
            if (error) throw error;
            alert("Email envoyé ✅ (lien magique).");
          }
        }catch(e){
          console.warn(e);
          alert("Login impossible: " + (e.message||String(e)));
        }
      });
    }
    if ($("logoutBtn")){
      $("logoutBtn").addEventListener("click", async ()=>{
        try{
          if (!sb) return;
          await sb.auth.signOut();
          CAN_EDIT = false;
          setAuthUi();
          alert("Déconnecté.");
        }catch(e){
          alert("Logout impossible: " + (e.message||String(e)));
        }
      });
    }
    if ($("reloadSupabaseBtn")) $("reloadSupabaseBtn").addEventListener("click", pullRemoteAndApply);
    if ($("exportSnapshotBtn")) $("exportSnapshotBtn").addEventListener("click", exportSnapshotGithub);

    // start
    boot().catch(err => {
      console.error(err);
      $("timeline").innerHTML = `<div class="card"><div class="hd">Erreur</div><div class="bd"><div class="muted kbd">${(err.message||String(err)).replace(/</g,"&lt;")}</div></div></div>`;
    });
  });
})();
