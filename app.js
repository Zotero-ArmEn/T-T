/* Tag Review Tool (light theme)
   - Loads data/suggestions.json
   - Shows original fields (if present)
   - Title approval: choose translation/transliteration/both/none; live preview
   - Approve/Reject/Edit tags; Add Tag creates editable custom rows
   - Saves to localStorage; export/import; optional save to GitHub
*/

const SUGG_URL = 'data/suggestions.json';
const REVIEWS_KEY = 'reviews_v2';

// State
let suggestions = [];
let reviews = {}; // { [id]: { status, notes, title_transliteration, title_translation, approved_title_mode, approved_title_text (optional), decisions:[{index, decision, tag, lang, type, source, confidence}] } }
let currentIndex = 0;

// DOM
const listEl = document.getElementById('item-list');
const filterStatusEl = document.getElementById('filter-status');
const searchEl = document.getElementById('search');
const itemTitleEl = document.getElementById('item-title');
const fldIdEl = document.getElementById('fld-id');
const fldStatusEl = document.getElementById('fld-status');
const fldNotesEl = document.getElementById('fld-notes');
const tagsBodyEl = document.getElementById('tags-body');
const titleTranslitEl = document.getElementById('title-translit');
const titleTranslationEl = document.getElementById('title-translation');
const approvedTitleModeEl = document.getElementById('approved-title-mode');
const composedPreviewEl = document.getElementById('composed-title-preview');

// Original fields DOM (may be empty if not provided in suggestions.json)
const origTitleEl = document.getElementById('orig-title');
const origAbstractEl = document.getElementById('orig-abstract');
const origRemainderEl = document.getElementById('orig-remainder');
const origKeywordsEl = document.getElementById('orig-keywords');
const origSubjectEl = document.getElementById('orig-subject');
const origValueEl = document.getElementById('orig-value');

function loadLocal() {
  try {
    const raw = localStorage.getItem(REVIEWS_KEY);
    if (raw) reviews = JSON.parse(raw);
  } catch(e) { console.warn('localStorage parse error', e); }
}

function saveLocal() {
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews, null, 2));
  setSaveStatus('Saved locally');
}

function setSaveStatus(msg) {
  document.getElementById('save-status').textContent = msg;
  setTimeout(()=>document.getElementById('save-status').textContent='', 1800);
}

async function loadSuggestions() {
  const res = await fetch(SUGG_URL + '?v=' + Date.now());
  if (!res.ok) {
    console.error('Failed to load suggestions.json', res.status);
    suggestions = [];
    return;
  }
  suggestions = await res.json();
}

function getVisibleItems() {
  const q = (searchEl.value || '').toLowerCase();
  const filt = filterStatusEl.value;
  return suggestions.filter((rec) => {
    const r = reviews[rec.id] || {};
    const status = r.status || rec.status || 'pending';
    const matchStatus = (filt==='all') ? true : status===filt;
    const matchText = !q || (rec.title || '').toLowerCase().includes(q);
    return matchStatus && matchText;
  });
}

function renderList() {
  const items = getVisibleItems();
  listEl.innerHTML = '';
  items.forEach((rec) => {
    const li = document.createElement('li');
    li.dataset.id = rec.id;
    const r = reviews[rec.id] || {};
    const status = r.status || rec.status || 'pending';
    li.innerHTML = `
      <div>${rec.title}</div>
      <div class="badge">${status}</div>
    `;
    li.addEventListener('click', () => {
      const absoluteIndex = suggestions.findIndex(s => s.id === rec.id);
      selectIndex(absoluteIndex);
    });
    if (suggestions[currentIndex] && suggestions[currentIndex].id === rec.id) {
      li.classList.add('active');
    }
    listEl.appendChild(li);
  });
}

function selectIndex(i) {
  if (i < 0 || i >= suggestions.length) return;
  currentIndex = i;
  renderList();
  renderRecord();
}

function ensureReviewEntry(id) {
  if (!reviews[id]) {
    reviews[id] = {
      status: 'pending',
      notes: '',
      title_transliteration: '',
      title_translation: '',
      approved_title_mode: 'none', // none | translation | transliteration | both
      approved_title_text: '',      // optional manual override in future
      decisions: [] // { index, decision: 'approved'|'rejected'|'edited'|'pending', tag, lang, type, source, confidence }
    };
  } else {
    // Backward compatibility: ensure new fields exist
    reviews[id].approved_title_mode = reviews[id].approved_title_mode || 'none';
    if (typeof reviews[id].approved_title_text !== 'string') reviews[id].approved_title_text = '';
    if (!Array.isArray(reviews[id].decisions)) reviews[id].decisions = [];
    if (typeof reviews[id].notes !== 'string') reviews[id].notes = '';
  }
}

function getDecisionMap(recId) {
  ensureReviewEntry(recId);
  const map = new Map();
  reviews[recId].decisions.forEach(d => map.set(d.index, d));
  return map;
}

function normalizeSource(src) {
  // Only show column names. Map known non-column labels to canonical columns.
  const s = (src || '').toString().toLowerCase();
  const map = {
    'catalogue-subject': 'subject',
    'catalogue-value': 'value',
    'title-context': 'title',
    'title': 'title',
    'abstract': 'abstract',
    'remainder': 'remainder',
    'keywords': 'keywords',
    'subject': 'subject',
    'value': 'value',
    'manual': 'manual'
  };
  const norm = map[s];
  return norm ? capitalizeFirst(norm) : '';
}

function capitalizeFirst(t){ return t ? t.charAt(0).toUpperCase() + t.slice(1) : t; }

function composeTitlePreview(rec, r) {
  const base = rec.title || '';
  const trl = (r.title_transliteration || rec.title_transliteration || '').trim();
  const trn = (r.title_translation || rec.title_translation || '').trim();

  let addon = '';
  switch (r.approved_title_mode) {
    case 'translation':
      if (trn) addon = `[${trn}]`;
      break;
    case 'transliteration':
      if (trl) addon = `[${trl}]`;
      break;
    case 'both':
      if (trl && trn) addon = `[${trl}; ${trn}]`;
      else if (trl) addon = `[${trl}]`;
      else if (trn) addon = `[${trn}]`;
      break;
    case 'none':
    default:
      addon = '';
  }
  return addon ? `${base} ${addon}` : base;
}

function renderOriginalFields(rec) {
  // Expecting optional block like rec.original = { title, abstract, remainder, keywords, subject, value }
  const orig = rec.original || {};
  origTitleEl.textContent = rec.title || orig.title || '';
  origAbstractEl.textContent = orig.abstract || '';
  origRemainderEl.textContent = orig.remainder || '';
  origKeywordsEl.textContent = Array.isArray(orig.keywords) ? orig.keywords.join(', ') : (orig.keywords || '');
  origSubjectEl.textContent = orig.subject || '';
  origValueEl.textContent = orig.value || '';
}

function renderRecord() {
  const rec = suggestions[currentIndex];
  ensureReviewEntry(rec.id);
  const r = reviews[rec.id];

  itemTitleEl.textContent = rec.title || '';
  fldIdEl.textContent = rec.id;
  fldStatusEl.textContent = r.status || 'pending';
  fldNotesEl.value = r.notes || '';

  titleTranslitEl.value = r.title_transliteration || rec.title_transliteration || '';
  titleTranslationEl.value = r.title_translation || rec.title_translation || '';
  approvedTitleModeEl.value = r.approved_title_mode || 'none';
  composedPreviewEl.textContent = composeTitlePreview(rec, r);

  renderOriginalFields(rec);

  // Build rows: generated suggestions + custom user-added (decisions with index not in generated range)
  const gen = Array.isArray(rec.generated) ? rec.generated : [];
  const genCount = gen.length;

  const decMap = getDecisionMap(rec.id);
  const customRows = (reviews[rec.id].decisions || [])
    .filter(d => d && (typeof d.index === 'number') && (d.index >= 1000000 || d.index >= genCount))
    .map(d => ({
      tag: d.tag || '',
      lang: d.lang || '',
      type: d.type || 'custom',
      source: d.source || 'manual',
      confidence: (typeof d.confidence === 'number') ? d.confidence : 1.0,
      __customIndex: d.index
    }));

  // Render
  tagsBodyEl.innerHTML = '';
  // Generated rows first
  gen.forEach((g, idx) => {
    const d = decMap.get(idx) || {};
    const decision = d.decision || 'pending';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="edit-tag" data-index="${idx}" value="${escapeAttr(d.tag ?? g.tag)}"></td>
      <td><input class="edit-lang" data-index="${idx}" value="${escapeAttr(d.lang ?? g.lang)}" style="width:80px"></td>
      <td><input class="edit-type" data-index="${idx}" value="${escapeAttr(d.type ?? g.type)}" style="width:120px"></td>
      <td>${normalizeSource(g.source)}</td>
      <td>${(g.confidence ?? '').toString()}</td>
      <td class="decision">
        <button class="btn btn-approve" data-act="approve" data-index="${idx}">Approve</button>
        <button class="btn btn-reject" data-act="reject" data-index="${idx}">Reject</button>
        <span class="badge">${decision}</span>
      </td>
      <td>
        <button class="btn" data-act="mark-edited" data-index="${idx}">Mark Edited</button>
      </td>
    `;
    tagsBodyEl.appendChild(tr);
  });

  // Then custom/user-added rows
  customRows.forEach((g) => {
    const idx = g.__customIndex;
    const d = decMap.get(idx) || {};
    const decision = d.decision || 'edited'; // new rows considered 'edited' by default
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="edit-tag" data-index="${idx}" value="${escapeAttr(d.tag ?? g.tag)}" placeholder="New tag…"></td>
      <td><input class="edit-lang" data-index="${idx}" value="${escapeAttr(d.lang ?? g.lang)}" style="width:80px" placeholder="hy/en/hbm…"></td>
      <td><input class="edit-type" data-index="${idx}" value="${escapeAttr(d.type ?? g.type)}" style="width:120px" placeholder="subject/person/…"></td>
      <td>${normalizeSource(d.source ?? g.source)}</td>
      <td>${(d.confidence ?? g.confidence ?? '').toString()}</td>
      <td class="decision">
        <button class="btn btn-approve" data-act="approve" data-index="${idx}">Approve</button>
        <button class="btn btn-reject" data-act="reject" data-index="${idx}">Reject</button>
        <span class="badge">${decision}</span>
      </td>
      <td>
        <button class="btn" data-act="mark-edited" data-index="${idx}">Mark Edited</button>
      </td>
    `;
    tagsBodyEl.appendChild(tr);
  });
}

function escapeAttr(v) {
  return (v ?? '').toString().replace(/"/g, '&quot;');
}

function updateDecision(recId, idx, patch) {
  ensureReviewEntry(recId);
  const arr = reviews[recId].decisions;
  const i = arr.findIndex(x => x.index === idx);
  if (i === -1) {
    arr.push({ index: idx, decision: 'pending' , ...patch });
  } else {
    arr[i] = { ...arr[i], ...patch };
  }
}

function bulkDecision(decision) {
  const rec = suggestions[currentIndex];
  ensureReviewEntry(rec.id);

  // Apply to generated rows
  const gen = Array.isArray(rec.generated) ? rec.generated : [];
  gen.forEach((g, idx) => {
    const existing = reviews[rec.id].decisions.find(d => d.index === idx) || {};
    const tag = existing.tag ?? g.tag;
    const lang = existing.lang ?? g.lang;
    const type = existing.type ?? g.type;
    updateDecision(rec.id, idx, { decision, tag, lang, type, source: 'title', confidence: g.confidence });
  });

  // Apply to custom rows too
  const custom = (reviews[rec.id].decisions || []).filter(d => d.index >= (gen.length));
  custom.forEach(d => {
    updateDecision(rec.id, d.index, { ...d, decision });
  });

  reviews[rec.id].status = (decision === 'approve' || decision === 'approved') ? 'approved' : 'rejected';
  renderRecord();
  saveLocal();
}

function attachHandlers() {
  document.getElementById('prev').addEventListener('click', () => selectIndex(currentIndex - 1));
  document.getElementById('next').addEventListener('click', () => selectIndex(currentIndex + 1));
  document.getElementById('approve-all').addEventListener('click', () => bulkDecision('approved'));
  document.getElementById('reject-all').addEventListener('click', () => bulkDecision('rejected'));
  document.getElementById('add-tag').addEventListener('click', () => addEmptyTagRow());

  // delegate tag decision/edit
  tagsBodyEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const idx = parseInt(btn.dataset.index, 10);
    const rec = suggestions[currentIndex];
    // Determine a base source/confidence for this idx
    const base = getBaseForIndex(rec, idx);
    if (btn.dataset.act === 'approve') {
      const { tag, lang, type } = readRowEdits(idx);
      updateDecision(rec.id, idx, { decision: 'approved', tag, lang, type, source: base.source, confidence: base.confidence });
      renderRecord(); saveLocal();
    } else if (btn.dataset.act === 'reject') {
      const { tag, lang, type } = readRowEdits(idx);
      updateDecision(rec.id, idx, { decision: 'rejected', tag, lang, type, source: base.source, confidence: base.confidence });
      renderRecord(); saveLocal();
    } else if (btn.dataset.act === 'mark-edited') {
      const { tag, lang, type } = readRowEdits(idx);
      updateDecision(rec.id, idx, { decision: 'edited', tag, lang, type, source: base.source, confidence: base.confidence });
      reviews[rec.id].status = 'edited';
      renderRecord(); saveLocal();
    }
  });

  // inline edits of fields
  tagsBodyEl.addEventListener('change', (e) => {
    if (!e.target.classList.contains('edit-tag') &&
        !e.target.classList.contains('edit-lang') &&
        !e.target.classList.contains('edit-type')) return;
    const idx = parseInt(e.target.dataset.index, 10);
    const rec = suggestions[currentIndex];
    const base = getBaseForIndex(rec, idx);
    const { tag, lang, type } = readRowEdits(idx);
    updateDecision(rec.id, idx, { decision: 'edited', tag, lang, type, source: base.source, confidence: base.confidence });
    reviews[rec.id].status = 'edited';
    saveLocal();
  });

  // record-level fields
  document.getElementById('save-local').addEventListener('click', () => {
    const rec = suggestions[currentIndex];
    ensureReviewEntry(rec.id);
    reviews[rec.id].notes = fldNotesEl.value || '';
    reviews[rec.id].title_transliteration = titleTranslitEl.value || '';
    reviews[rec.id].title_translation = titleTranslationEl.value || '';
    reviews[rec.id].approved_title_mode = approvedTitleModeEl.value || 'none';
    // Optional: if you want to store the composed result explicitly:
    reviews[rec.id].approved_title_text = composeTitlePreview(rec, reviews[rec.id]);
    if (reviews[rec.id].status === 'pending') reviews[rec.id].status = 'edited';
    composedPreviewEl.textContent = reviews[rec.id].approved_title_text;
    saveLocal();
  });

  // live preview update on mode/inputs
  [titleTranslitEl, titleTranslationEl, approvedTitleModeEl].forEach(inp => {
    inp.addEventListener('input', () => {
      const rec = suggestions[currentIndex];
      ensureReviewEntry(rec.id);
      const r = reviews[rec.id];
      if (inp === titleTranslitEl) r.title_transliteration = titleTranslitEl.value || '';
      if (inp === titleTranslationEl) r.title_translation = titleTranslationEl.value || '';
      if (inp === approvedTitleModeEl) r.approved_title_mode = approvedTitleModeEl.value || 'none';
      composedPreviewEl.textContent = composeTitlePreview(rec, r);
    });
  });

  // filters/search
  filterStatusEl.addEventListener('change', renderList);
  searchEl.addEventListener('input', renderList);

  // import/export
  document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(reviews, null, 2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'reviews.json';
    a.click();
  });

  document.getElementById('btn-import').addEventListener('click', async () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'application/json';
    inp.onchange = async () => {
      const file = inp.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        const obj = JSON.parse(text);
        reviews = obj;
        saveLocal();
        renderList();
        renderRecord();
      } catch(e) { alert('Invalid JSON'); }
    };
    inp.click();
  });

  document.getElementById('btn-clear-local').addEventListener('click', () => {
    if (confirm('Clear local cache?')) {
      localStorage.removeItem(REVIEWS_KEY);
      reviews = {};
      renderList();
      renderRecord();
    }
  });

  // GitHub save
  document.getElementById('btn-save-github').addEventListener('click', saveToGitHub);
}

function readRowEdits(idx) {
  const tag = document.querySelector(`.edit-tag[data-index="${idx}"]`)?.value || '';
  const lang = document.querySelector(`.edit-lang[data-index="${idx}"]`)?.value || '';
  const type = document.querySelector(`.edit-type[data-index="${idx}"]`)?.value || '';
  return { tag, lang, type };
}

function getBaseForIndex(rec, idx) {
  const gen = Array.isArray(rec.generated) ? rec.generated : [];
  if (Number.isInteger(idx) && idx >= 0 && idx < gen.length) {
    return { source: normalizeForStorage(gen[idx].source), confidence: gen[idx].confidence };
  }
  return { source: 'manual', confidence: 1.0 };
}

function normalizeForStorage(src) {
  // Normalize to canonical keys for storage
  const s = (src || '').toString().toLowerCase();
  const map = {
    'catalogue-subject': 'subject',
    'catalogue-value': 'value',
    'title-context': 'title',
    'title': 'title',
    'abstract': 'abstract',
    'remainder': 'remainder',
    'keywords': 'keywords',
    'subject': 'subject',
    'value': 'value',
    'manual': 'manual'
  };
  return map[s] || 'title';
}

function addEmptyTagRow() {
  const rec = suggestions[currentIndex];
  ensureReviewEntry(rec.id);
  // Create a unique large index to avoid colliding with generated indices
  const genLen = Array.isArray(rec.generated) ? rec.generated.length : 0;
  const newIndex = Math.max(genLen, 1000000) + Date.now() % 100000 + Math.floor(Math.random()*1000);
  updateDecision(rec.id, newIndex, { decision: 'edited', tag: '', lang: '', type: 'custom', source: 'manual', confidence: 1.0 });
  reviews[rec.id].status = 'edited';
  renderRecord(); saveLocal();
}

// GitHub save: PUT contents
async function saveToGitHub() {
  const owner = document.getElementById('gh-owner').value.trim();
  const repo = document.getElementById('gh-repo').value.trim();
  const branch = document.getElementById('gh-branch').value.trim() || 'main';
  const path = document.getElementById('gh-path').value.trim() || 'data/reviews.json';
  const token = document.getElementById('gh-token').value.trim();
  const msgEl = document.getElementById('gh-msg');
  msgEl.textContent = '';

  if (!owner || !repo || !token) {
    msgEl.textContent = 'Owner, repo and token are required.';
    return;
  }

  // Get existing file sha (if exists)
  let sha = undefined;
  try {
    const getRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(branch)}`, {
      headers: { 'Authorization': `token ${token}`, 'Accept': 'application/vnd.github+json' }
    });
    if (getRes.ok) {
      const data = await getRes.json();
      if (data && data.sha) sha = data.sha;
    }
  } catch(e) {
    // ignore; file may not exist
  }

  const contentB64 = btoa(unescape(encodeURIComponent(JSON.stringify(reviews, null, 2))));
  const body = {
    message: `chore: save reviews.json (${new Date().toISOString()})`,
    content: contentB64,
    branch,
    sha
  };

  const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (putRes.ok) {
    const result = await putRes.json();
    msgEl.textContent = `Saved to GitHub at ${result.content?.path} (commit ${result.commit?.sha?.slice(0,7) || ''})`;
  } else {
    const err = await putRes.text();
    msgEl.textContent = `GitHub save failed: ${putRes.status} ${err}`;
  }
}

// Init
(async function init(){
  loadLocal();
  await loadSuggestions();
  attachHandlers();
  renderList();
  selectIndex(0);
})();