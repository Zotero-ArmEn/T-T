/* Simple static review tool for Armenian tags/translations/transliterations
   - Loads data/suggestions.json
   - Keeps reviews in localStorage
   - Import/Export reviews.json
   - Optional: Save to GitHub via Contents API using a fine-grained token
*/

const SUGG_URL = 'data/suggestions.json';
const REVIEWS_KEY = 'reviews_v1';

// State
let suggestions = [];
let reviews = {}; // { [id]: { status, notes, title_transliteration, title_translation, decisions:[{index, decision, tag, lang, type}] } }
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
  items.forEach((rec, idx) => {
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
      decisions: [] // { index, decision: 'approved'|'rejected'|'edited', tag, lang, type, source, confidence }
    };
  }
}

function getDecisionMap(recId) {
  ensureReviewEntry(recId);
  const map = new Map();
  reviews[recId].decisions.forEach(d => map.set(d.index, d));
  return map;
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

  // tags
  const decMap = getDecisionMap(rec.id);
  tagsBodyEl.innerHTML = '';
  (rec.generated || []).forEach((g, idx) => {
    const d = decMap.get(idx) || {};
    const decision = d.decision || 'pending';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input class="edit-tag" data-index="${idx}" value="${d.tag ?? g.tag}"></td>
      <td><input class="edit-lang" data-index="${idx}" value="${d.lang ?? g.lang}" style="width:60px"></td>
      <td><input class="edit-type" data-index="${idx}" value="${d.type ?? g.type}" style="width:100px"></td>
      <td>${g.source}</td>
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
  (rec.generated || []).forEach((g, idx) => {
    const existing = reviews[rec.id].decisions.find(d => d.index === idx) || {};
    const tag = existing.tag ?? g.tag;
    const lang = existing.lang ?? g.lang;
    const type = existing.type ?? g.type;
    updateDecision(rec.id, idx, { decision, tag, lang, type, source: g.source, confidence: g.confidence });
  });
  // elevate record status
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
    if (btn.dataset.act === 'approve') {
      const { tag, lang, type } = readRowEdits(idx);
      updateDecision(rec.id, idx, { decision: 'approved', tag, lang, type, source: rec.generated[idx].source, confidence: rec.generated[idx].confidence });
      renderRecord(); saveLocal();
    } else if (btn.dataset.act === 'reject') {
      const { tag, lang, type } = readRowEdits(idx);
      updateDecision(rec.id, idx, { decision: 'rejected', tag, lang, type, source: rec.generated[idx].source, confidence: rec.generated[idx].confidence });
      renderRecord(); saveLocal();
    } else if (btn.dataset.act === 'mark-edited') {
      const { tag, lang, type } = readRowEdits(idx);
      updateDecision(rec.id, idx, { decision: 'edited', tag, lang, type, source: rec.generated[idx].source, confidence: rec.generated[idx].confidence });
      // mark overall status edited
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
    const { tag, lang, type } = readRowEdits(idx);
    updateDecision(rec.id, idx, { decision: 'edited', tag, lang, type, source: rec.generated[idx].source, confidence: rec.generated[idx].confidence });
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
    if (reviews[rec.id].status === 'pending') reviews[rec.id].status = 'edited';
    saveLocal();
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

function addEmptyTagRow() {
  const rec = suggestions[currentIndex];
  const newIndex = (rec.generated?.length || 0) + (reviews[rec.id]?.decisions?.length || 0) + Math.floor(Math.random()*100000);
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