// scripts/merge.js
// Merge Supabase overrides (table timeline_overrides row for timeline_id) into data/timeline_base.json
// Usage: node scripts/merge.js  (les variables d'env sont fournies par le workflow)

const fs = require('fs');
const https = require('https');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TIMELINE_ID = process.env.TIMELINE_ID;
const BASE_PATH = process.env.BASE_PATH;
const OVERRIDES_TABLE = process.env.OVERRIDES_TABLE;

function fetchJson(url, headers){
  return new Promise((res, rej)=>{
    const opts = new URL(url);
    opts.headers = headers || {};
    https.get(opts, (r) => {
      let data='';
      r.on('data', c=>data+=c);
      r.on('end', ()=>{
        try { res(JSON.parse(data)); } catch(e){ rej(e); }
      });
    }).on('error', rej);
  });
}

(async ()=> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env');
    process.exit(2);
  }
  // 1) Read local base
  const baseRaw = fs.readFileSync(BASE_PATH, 'utf8');
  let base = JSON.parse(baseRaw);
  // normalise structure
  if (!Array.isArray(base.stories)) {
    console.error('Base file does not contain stories[]');
    process.exit(2);
  }
  const stories = base.stories;

  // 2) Fetch overrides row from Supabase
  const url = `${SUPABASE_URL}/rest/v1/${OVERRIDES_TABLE}?timeline_id=eq.${TIMELINE_ID}&select=data,updated_at,updated_by`;
  const rows = await fetchJson(url, { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` });
  const row = Array.isArray(rows) && rows.length ? rows[0] : null;
  const overrides = row && row.data && typeof row.data === 'object' ? row.data : {};

  // 3) Merge overrides into stories
  const byId = new Map(stories.map(s => [String(s.id), s]));
  for (const [id, o] of Object.entries(overrides || {})){
    if (!o || typeof o !== 'object') continue;
    const sid = String(id);
    const existing = byId.get(sid);
    if (o.__new && !existing){
      const ns = {
        id: isNaN(Number(id)) ? id : Number(id),
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
      // Preserve credit if present
      if (typeof o.credit === 'string') ns.credit = o.credit;
      stories.push(ns);
      byId.set(sid, ns);
      continue;
    }
    if (!existing) continue;
    if (o.__deleted){
      // remove story from array
      const idx = stories.findIndex(x => String(x.id) === sid);
      if (idx !== -1) stories.splice(idx, 1);
      byId.delete(sid);
      continue;
    }
    if (typeof o.title === 'string') existing.title = o.title;
    if (typeof o.startDate === 'string') existing.startDate = o.startDate;
    if (typeof o.endDate === 'string') existing.endDate = o.endDate;
    if (typeof o.category === 'string') existing.category = o.category;
    if (typeof o.fullTextResolved === 'string') existing.fullTextResolved = o.fullTextResolved;
    if (typeof o.textResolved === 'string') existing.textResolved = o.textResolved;
    if (typeof o.tags === 'string') existing.tags = o.tags;
    if (typeof o.externalLink === 'string') existing.externalLink = o.externalLink;
    if (Array.isArray(o.media)) existing.media = o.media;
    if (Array.isArray(o.manualLinks)) existing.__manualLinks = o.manualLinks;
    // Update credit if present
    if (typeof o.credit === 'string') existing.credit = o.credit;
  }

  // 4) Optionnel : sort stories by startDate stable
  stories.sort((a,b)=> (a.startDate||"").localeCompare(b.startDate||""));

  // 5) Write back
  base.stories = stories;
  fs.writeFileSync(BASE_PATH, JSON.stringify(base, null, 2) + '\n', 'utf8');
  console.log('Merged overrides into', BASE_PATH);
})().catch(e => { console.error(e); process.exit(10); });