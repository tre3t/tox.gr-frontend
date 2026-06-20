const API_BASE = 'https://hera-tox-646749664538.europe-west1.run.app';
const GIPHY_KEY = 'hwhnpVCf0AQTX898mvXm9NPkHH4mqtYX';

const el  = id => document.getElementById(id);
const url = path => `${API_BASE}${path}`;

const token    = () => localStorage.getItem('tox_token');
const username = () => localStorage.getItem('tox_user');
const loggedIn = () => !!token();

const jsonHeaders = () => {
  const h = { 'Content-Type': 'application/json' };
  if (token()) h['Authorization'] = `Bearer ${token()}`;
  return h;
};
const authHeader = () => token() ? { 'Authorization': `Bearer ${token()}` } : {};

const esc = t => (t||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
const md  = t => t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                   .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
                   .replace(/\*(.*?)\*/g,'<em>$1</em>')
                   .replace(/`([^`]+)`/g,'<code>$1</code>')
                   .replace(/\n/g,'<br>');
const timeAgo = ts => {
  const d=Date.now()-ts, m=Math.floor(d/60000), h=Math.floor(m/60), dy=Math.floor(h/24);
  return dy>0?`${dy}μ`:h>0?`${h}ω`:m>0?`${m}λ`:'τώρα';
};

const CAT_EMOJI = { 'Vibes':'🎵', 'Διατροφή':'🥗', 'Τεχνολογία':'💻', 'Γυμναστική':'💪', 'Αγγελίες':'📢' };

// ── STATE ────────────────────────────────────────────────────
let currentTab      = 'feed';
let currentSession  = null;
let anonHistory     = [];
let attachedFile    = null;
let currentDmFriend = null;
let dmPoll          = null;
let lastDmTs        = null;
const shownDmIds    = new Set();
let currentGroup    = null;
let grpPoll         = null;
let lastGrpTs       = null;
const shownGrpIds   = new Set();
let feedOffset      = 0;
let gifTarget       = null;
let pendingPostGif  = null;
let pendingDmGif    = null;
let pendingGrpGif   = null;
let allFriends      = [];
let onlineUsers     = new Set();
let onlinePoll      = null;
let heartbeatIntervalStarted = false;
// Messages sub-tab state
let msgSubTab       = 'people';
// Threads state
let currentThread     = null;
let currentThreadCat  = '';

// ── PROFILE PICS ─────────────────────────────────────────────
const PP = {
  get: u => { try { return JSON.parse(localStorage.getItem('pp')||'{}')[u]||null; } catch { return null; } },
  set: (u,b) => { try { const m=JSON.parse(localStorage.getItem('pp')||'{}'); if(b)m[u]=b; else delete m[u]; localStorage.setItem('pp',JSON.stringify(m)); } catch {} }
};

// ── INIT ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  updateTheme(localStorage.getItem('theme') || 'light');
  if (loggedIn()) { applyLoggedIn(username()); loadSessions(); }
  else { applyGuest(); }
  switchTab('feed');
  wireListeners();
  if (loggedIn()) heartbeat();
});

function wireListeners() {
  // Auth
  el('open-auth-btn')?.addEventListener('click', openAuth);
  el('feed-auth-link')?.addEventListener('click', openAuth);
  el('close-auth-btn')?.addEventListener('click', closeAuth);
  el('skip-auth-link')?.addEventListener('click', closeAuth);
  el('auth-overlay')?.addEventListener('click', e => { if(e.target===el('auth-overlay')) closeAuth(); });
  el('auth-submit-btn')?.addEventListener('click', submitAuth);
  el('toggle-auth-link')?.addEventListener('click', toggleAuthMode);
  document.addEventListener('keydown', e => { if(e.key==='Enter' && !el('auth-overlay')?.classList.contains('hidden')) submitAuth(); });

  // ΗΡΑ chat
  el('send-action-btn')?.addEventListener('click', sendChat);
  el('user-input')?.addEventListener('keydown', e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat();} });
  el('file-input')?.addEventListener('change', onFileSelect);
  el('clear-file-action')?.addEventListener('click', clearFile);

  // Logout / sidebar
  el('logout-btn')?.addEventListener('click', logout);
  el('sidebar-avatar')?.addEventListener('click', () => { if(loggedIn()) openOwnProfile(); });
  el('sidebar-hera-btn')?.addEventListener('click', () => switchTab('chat'));
  el('new-chat-btn')?.addEventListener('click', newChat);
  el('theme-toggle-btn')?.addEventListener('click', toggleTheme);

  // Desktop tabs
  document.querySelectorAll('.tab-btn[data-tab]').forEach(b =>
    b.addEventListener('click', () => switchTab(b.dataset.tab))
  );
  // Bottom nav tabs
  document.querySelectorAll('.btm-tab[data-tab]').forEach(b =>
    b.addEventListener('click', () => switchTab(b.dataset.tab))
  );

  // Mobile menu
  el('mob-menu-btn')?.addEventListener('click', e => { e.stopPropagation(); toggleMobMenu(); });
  el('mob-overlay')?.addEventListener('click', closeMobMenu);
  el('mob-history-btn')?.addEventListener('click', () => { closeMobMenu(); openHistory(); });
  el('mob-profile-btn')?.addEventListener('click', () => { closeMobMenu(); if(loggedIn()) openOwnProfile(); else openAuth(); });
  el('mob-settings-btn')?.addEventListener('click', () => { closeMobMenu(); openSettings(); });
  el('mob-theme-btn')?.addEventListener('click', () => { closeMobMenu(); toggleTheme(); });
  el('mob-auth-btn')?.addEventListener('click', () => { closeMobMenu(); loggedIn() ? logout() : openAuth(); });

  el('settings-gear-btn')?.addEventListener('click', openSettings);

  // Feed
  el('post-type-select')?.addEventListener('change', updateLimitInfo);
  el('post-media-input')?.addEventListener('change', onPostMediaSelect);
  el('clear-post-media-btn')?.addEventListener('click', clearPostMedia);
  el('clear-post-gif')?.addEventListener('click', clearPostGif);
  el('post-gif-btn')?.addEventListener('click', () => openGifPicker('post'));
  el('publish-btn')?.addEventListener('click', publishPost);
  el('load-more-btn')?.addEventListener('click', () => loadFeed(true));

  // Messages sub-tabs
  document.querySelectorAll('.msg-sub-tab[data-msub]').forEach(b =>
    b.addEventListener('click', () => switchMsgSubTab(b.dataset.msub))
  );

  // DMs
  el('add-friend-fab')?.addEventListener('click', () => el('add-friend-row')?.classList.toggle('hidden'));
  el('send-friend-request-btn')?.addEventListener('click', sendFriendRequest);
  el('friend-username-input')?.addEventListener('keydown', e => { if(e.key==='Enter') sendFriendRequest(); });
  el('friend-search-input')?.addEventListener('input', filterFriends);
  el('back-to-friends-btn')?.addEventListener('click', backToFriends);
  el('dm-send-btn')?.addEventListener('mousedown', e => e.preventDefault());
  el('dm-send-btn')?.addEventListener('click', sendDm);
  el('dm-input')?.addEventListener('keydown', e => { if(e.key==='Enter') sendDm(); });
  el('dm-gif-btn')?.addEventListener('click', () => openGifPicker('dm'));

  // Groups (now inside messages tab)
  el('new-group-btn')?.addEventListener('click', () => { if(!loggedIn()){openAuth();return;} openGroupModal(); });
  el('close-group-modal-btn')?.addEventListener('click', closeGroupModal);
  el('group-modal-overlay')?.addEventListener('click', e => { if(e.target===el('group-modal-overlay')) closeGroupModal(); });
  el('create-group-btn')?.addEventListener('click', createGroup);
  el('back-to-groups-btn')?.addEventListener('click', backToGroups);
  el('grp-send-btn')?.addEventListener('mousedown', e => e.preventDefault());
  el('grp-send-btn')?.addEventListener('click', sendGroupMsg);
  el('grp-input')?.addEventListener('keydown', e => { if(e.key==='Enter') sendGroupMsg(); });
  el('grp-gif-btn')?.addEventListener('click', () => openGifPicker('grp'));
  el('delete-group-btn')?.addEventListener('click', deleteCurrentGroup);

  // Profiles
  el('close-profile-btn')?.addEventListener('click', () => el('profile-modal')?.classList.add('hidden'));
  el('profile-modal')?.addEventListener('click', e => { if(e.target===el('profile-modal')) el('profile-modal')?.classList.add('hidden'); });
  el('profile-pic-input')?.addEventListener('change', onProfilePicSelect);
  el('remove-pic-btn')?.addEventListener('click', removeProfilePic);
  el('close-user-profile-btn')?.addEventListener('click', () => el('user-profile-modal')?.classList.add('hidden'));
  el('user-profile-modal')?.addEventListener('click', e => { if(e.target===el('user-profile-modal')) el('user-profile-modal')?.classList.add('hidden'); });

  // Settings / history
  el('close-settings-btn')?.addEventListener('click', () => el('settings-panel')?.classList.add('hidden'));
  el('settings-theme-row')?.addEventListener('click', toggleTheme);
  el('delete-account-btn')?.addEventListener('click', deleteAccount);
  el('close-history-btn')?.addEventListener('click', () => el('history-panel')?.classList.add('hidden'));

  // GIF picker
  el('close-gif-btn')?.addEventListener('click', closeGifPicker);
  el('gif-picker-overlay')?.addEventListener('click', e => { if(e.target===el('gif-picker-overlay')) closeGifPicker(); });
  el('gif-search-input')?.addEventListener('input', debounce(searchGifs, 400));

  // Lightbox
  el('lightbox')?.addEventListener('click', e => { if(e.target===el('lightbox')||e.target===el('lightbox-img')) el('lightbox')?.classList.add('hidden'); });
  el('lightbox-close')?.addEventListener('click', () => el('lightbox')?.classList.add('hidden'));

  // Νήματα (threads)
  el('thread-search')?.addEventListener('input', debounce(loadThreads, 400));
  document.querySelectorAll('.cat-chip').forEach(chip =>
    chip.addEventListener('click', () => {
      document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentThreadCat = chip.dataset.cat || '';
      loadThreads();
    })
  );
  el('create-thread-fab')?.addEventListener('click', () => { if(!loggedIn()){openAuth();return;} openCreateThread(); });
  el('close-thread-modal-btn')?.addEventListener('click', closeCreateThread);
  el('create-thread-modal')?.addEventListener('click', e => { if(e.target===el('create-thread-modal')) closeCreateThread(); });
  el('publish-thread-btn')?.addEventListener('click', publishThread);
  el('back-to-threads-btn')?.addEventListener('click', backToThreads);
  el('thread-reply-btn')?.addEventListener('mousedown', e => e.preventDefault());
  el('thread-reply-btn')?.addEventListener('click', sendThreadReply);
  el('thread-reply-input')?.addEventListener('keydown', e => { if(e.key==='Enter') sendThreadReply(); });
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ── AUTH ─────────────────────────────────────────────────────
let authMode = 'login';

function openAuth()  { el('auth-overlay')?.classList.remove('hidden'); el('auth-username')?.focus(); }
function closeAuth() { el('auth-overlay')?.classList.add('hidden'); el('auth-error')?.classList.add('hidden'); }

function toggleAuthMode() {
  authMode = authMode === 'login' ? 'signup' : 'login';
  el('auth-title').textContent       = authMode === 'login' ? 'Σύνδεση' : 'Εγγραφή';
  el('auth-submit-btn').textContent  = authMode === 'login' ? 'Είσοδος' : 'Δημιουργία λογαριασμού';
  el('toggle-auth-link').textContent = authMode === 'login' ? 'Εγγραφή' : 'Σύνδεση';
  el('toggle-auth-text').firstChild.textContent = authMode === 'login' ? 'Δεν έχετε λογαριασμό; ' : 'Έχετε λογαριασμό; ';
  el('auth-error')?.classList.add('hidden');
}

function showAuthError(msg, ok=false) {
  const e = el('auth-error');
  if (!e) return;
  e.textContent = msg;
  e.style.color      = ok ? 'var(--success)' : 'var(--danger)';
  e.style.background = ok ? 'rgba(22,163,74,0.08)' : 'rgba(220,38,38,0.08)';
  e.classList.remove('hidden');
}

async function submitAuth() {
  const uname = el('auth-username')?.value.trim();
  const pass  = el('auth-password')?.value;
  if (!uname || !pass) return;
  const btn = el('auth-submit-btn');
  btn.disabled = true; btn.textContent = '...';
  try {
    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/signup';
    const res  = await fetch(url(endpoint), { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ username:uname, password:pass }) });
    const data = await res.json();
    if (!res.ok) {
      showAuthError(data.error || 'Σφάλμα.');
    } else if (authMode === 'login') {
      localStorage.setItem('tox_token', data.token);
      localStorage.setItem('tox_user', data.username);
      closeAuth();
      applyLoggedIn(data.username);
      loadSessions();
      loadFeed();
      heartbeat();
    } else {
      showAuthError('Ο λογαριασμός δημιουργήθηκε! Συνδεθείτε.', true);
      authMode = 'login';
      el('auth-title').textContent = 'Σύνδεση';
      el('auth-submit-btn').textContent = 'Είσοδος';
    }
  } catch { showAuthError('Αδυναμία σύνδεσης.'); }
  finally {
    btn.disabled = false;
    btn.textContent = authMode === 'login' ? 'Είσοδος' : 'Δημιουργία λογαριασμού';
  }
}

function applyLoggedIn(uname) {
  el('account-badge')?.classList.remove('hidden');
  el('guest-badge')?.classList.add('hidden');
  if (el('user-display')) el('user-display').textContent = uname;
  el('feed-guest-notice')?.classList.add('hidden');
  if (el('create-post-card')) el('create-post-card').style.display = 'flex';
  el('sessions-guest-note')?.classList.add('hidden');
  if (el('mob-auth-label')) el('mob-auth-label').textContent = 'Αποσύνδεση';
  if (el('settings-username-val')) el('settings-username-val').textContent = uname;
  refreshSidebarAvatar();
  loadFriends();
  updateLimitInfo();
}

function applyGuest() {
  el('account-badge')?.classList.add('hidden');
  el('guest-badge')?.classList.remove('hidden');
  el('feed-guest-notice')?.classList.remove('hidden');
  if (el('create-post-card')) el('create-post-card').style.display = 'none';
  el('sessions-guest-note')?.classList.remove('hidden');
  if (el('mob-auth-label')) el('mob-auth-label').textContent = 'Σύνδεση';
}

function logout() {
  localStorage.removeItem('tox_token');
  localStorage.removeItem('tox_user');
  anonHistory = [];
  stopDmPoll(); stopGrpPoll(); stopOnlinePoll();
  allFriends = [];
  applyGuest();
  el('chat-logs')?.replaceChildren();
  el('chat-logs')?.classList.add('hidden');
  el('greeting')?.classList.remove('hidden');
  loadFeed();
}

// ── THEME ────────────────────────────────────────────────────
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem('theme', next);
  updateTheme(next);
}
function updateTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  const icon = t==='dark' ? '☀️' : '🌙', text = t==='dark' ? 'Φωτεινό θέμα' : 'Σκούρο θέμα';
  const ti=el('theme-icon'); if(ti) ti.textContent=icon;
  const tt=el('theme-text'); if(tt) tt.textContent=text;
  const mi=el('mob-theme-icon'); if(mi) mi.textContent=icon;
  const sv=el('settings-theme-val'); if(sv) sv.textContent=t==='dark'?'Σκούρο':'Φωτεινό';
}

// ── TABS ─────────────────────────────────────────────────────
// groups removed — now lives inside messages sub-tab
const TAB_SECTIONS = { feed:'feed-section', chat:'chat-section', messages:'messages-section', threads:'threads-section' };

function switchTab(tab) {
  currentTab = tab;
  Object.entries(TAB_SECTIONS).forEach(([t, secId]) => {
    el(secId)?.classList.toggle('hidden', t !== tab);
  });
  document.querySelectorAll('.tab-btn[data-tab], .btm-tab[data-tab]').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tab);
  });
  stopOnlinePoll();
  if (tab === 'feed')     loadFeed();
  if (tab === 'messages') { switchMsgSubTab(msgSubTab); startOnlinePoll(); }
  if (tab === 'threads')  loadThreads();
  closeMobMenu();
}

// ── MESSAGES SUB-TABS ────────────────────────────────────────
function switchMsgSubTab(sub) {
  msgSubTab = sub;
  el('msg-people-pane')?.classList.toggle('hidden', sub !== 'people');
  el('msg-groups-pane')?.classList.toggle('hidden', sub !== 'groups');
  document.querySelectorAll('.msg-sub-tab[data-msub]').forEach(b => {
    b.classList.toggle('active', b.dataset.msub === sub);
  });
  if (sub === 'people') { loadFriends(); backToFriends(); }
  if (sub === 'groups') { backToGroups(); loadGroups(); }
}

// ── MOBILE MENU ──────────────────────────────────────────────
function toggleMobMenu() {
  const d=el('mob-dropdown'), o=el('mob-overlay');
  const open=!d?.classList.contains('hidden');
  if(open){ d?.classList.add('hidden'); o?.classList.add('hidden'); }
  else    { d?.classList.remove('hidden'); o?.classList.remove('hidden'); }
}
function closeMobMenu() { el('mob-dropdown')?.classList.add('hidden'); el('mob-overlay')?.classList.add('hidden'); }

// ── SETTINGS ─────────────────────────────────────────────────
function openSettings() {
  if(loggedIn() && el('settings-username-val')) el('settings-username-val').textContent = username();
  el('settings-panel')?.classList.remove('hidden');
}
async function deleteAccount() {
  if(!confirm('Διαγραφή λογαριασμού; Μη αναστρέψιμη ενέργεια.')) return;
  try {
    await fetch(url('/api/users/me'), { method:'DELETE', headers:jsonHeaders() });
    logout(); el('settings-panel')?.classList.add('hidden'); alert('Ο λογαριασμός διαγράφηκε.');
  } catch { alert('Σφάλμα.'); }
}

// ── HISTORY ──────────────────────────────────────────────────
function openHistory() {
  const list=el('history-list'), empty=el('history-empty');
  const sessions=JSON.parse(localStorage.getItem('tox_sessions')||'[]');
  if(!list) return;
  list.innerHTML='';
  sessions.length===0 ? empty?.classList.remove('hidden') : empty?.classList.add('hidden');
  sessions.forEach(s => {
    const row=document.createElement('div'); row.className='history-row';
    row.innerHTML=`<span class="history-label">${esc(s.label||s.id)}</span><div class="history-actions"><button class="history-load-btn">Άνοιγμα</button><button class="history-del-btn">✕</button></div>`;
    row.querySelector('.history-load-btn').addEventListener('click', () => { el('history-panel')?.classList.add('hidden'); loadSessionHistory(s.id); switchTab('chat'); });
    row.querySelector('.history-del-btn').addEventListener('click', async () => { await deleteSession(s.id); openHistory(); });
    list.appendChild(row);
  });
  el('history-panel')?.classList.remove('hidden');
}

async function deleteSession(sid) {
  const sessions=JSON.parse(localStorage.getItem('tox_sessions')||'[]').filter(s=>s.id!==sid);
  localStorage.setItem('tox_sessions', JSON.stringify(sessions));
  if(loggedIn()) { try{ await fetch(url(`/api/sessions/${sid}`),{method:'DELETE',headers:jsonHeaders()}); }catch{} }
}

// ── OWN PROFILE ──────────────────────────────────────────────
function openOwnProfile() {
  const uname=username()||'', pic=PP.get(uname);
  const prev=el('own-avatar-large');
  if(prev){ if(pic) prev.innerHTML=`<img src="${pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; else{ prev.innerHTML=''; prev.textContent=uname[0]?.toUpperCase()||'?'; } }
  if(el('own-username-display')) el('own-username-display').textContent=uname;
  el('profile-modal')?.classList.remove('hidden');
}
function refreshSidebarAvatar() {
  const av=el('sidebar-avatar'); if(!av) return;
  const uname=username()||'', pic=PP.get(uname);
  if(pic) av.innerHTML=`<img src="${pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; else av.textContent=uname[0]?.toUpperCase()||'?';
}
function onProfilePicSelect() {
  const file=el('profile-pic-input')?.files[0]; if(!file) return;
  const r=new FileReader();
  r.onload=()=>{ PP.set(username()||'',r.result); openOwnProfile(); refreshSidebarAvatar(); };
  r.readAsDataURL(file);
}
function removeProfilePic() { PP.set(username()||'',null); openOwnProfile(); refreshSidebarAvatar(); }

// ── USER PROFILE (others) ────────────────────────────────────
async function openUserProfile(uname) {
  if(uname===username()){ openOwnProfile(); return; }
  try {
    const res=await fetch(url(`/api/users/${encodeURIComponent(uname)}/profile`),{headers:authHeader()});
    const{user}=await res.json();
    const av=el('up-avatar');
    if(av){ const pic=PP.get(uname); if(pic) av.innerHTML=`<img src="${pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`; else{ av.innerHTML=''; av.textContent=uname[0]?.toUpperCase()||'?'; } }
    if(el('up-username')) el('up-username').textContent=uname;
    if(el('up-reputation')) el('up-reputation').textContent=`⭐ Υπόληψη: ${user.reputation}`;
    const giftRow=el('up-gift-row');
    if(giftRow&&loggedIn()){ giftRow.classList.remove('hidden'); const btn=el('up-gift-btn'); if(btn) btn.onclick=async()=>{ try{ const r=await fetch(url(`/api/reputation/gift/${encodeURIComponent(uname)}`),{method:'POST',headers:jsonHeaders()}); const d=await r.json(); btn.textContent=r.ok?'✓ Δόθηκε!':d.error; btn.disabled=!r.ok; }catch{ btn.textContent='Σφάλμα'; } }; }
    const actions=el('up-actions');
    if(actions&&loggedIn()){
      actions.innerHTML='';
      if(user.friendship_id){ const rb=document.createElement('button'); rb.className='up-action-btn up-remove-btn'; rb.textContent='Αφαίρεση φίλου'; rb.onclick=async()=>{ if(!confirm('Αφαίρεση φίλου;')) return; await fetch(url(`/api/friends/${user.friendship_id}`),{method:'DELETE',headers:jsonHeaders()}); el('user-profile-modal')?.classList.add('hidden'); loadFriends(); }; actions.appendChild(rb); }
      else{ const ab=document.createElement('button'); ab.className='up-action-btn up-add-btn'; ab.textContent='+ Αίτημα φιλίας'; ab.onclick=async()=>{ const r=await fetch(url('/api/friends/request'),{method:'POST',headers:jsonHeaders(),body:JSON.stringify({username:uname})}); const d=await r.json(); ab.textContent=r.ok?'✓ Εστάλη':d.error; ab.disabled=true; }; actions.appendChild(ab); }
      const blk=document.createElement('button'); blk.className='up-action-btn up-block-btn'; blk.textContent=user.is_blocked?'🔓 Άρση αποκλεισμού':'🚫 Αποκλεισμός'; blk.onclick=async()=>{ await fetch(url(`/api/users/${encodeURIComponent(uname)}/block`),{method:'POST',headers:jsonHeaders()}); el('user-profile-modal')?.classList.add('hidden'); loadFriends(); loadFeed(); }; actions.appendChild(blk);
    }
    const grid=el('up-posts-grid');
    if(grid){ grid.innerHTML=''; (user.posts||[]).forEach(p=>{ const d=document.createElement('div'); d.className='up-post-thumb'; if(p.gif_url) d.style.backgroundImage=`url(${p.gif_url})`; else if(p.media_data) d.style.backgroundImage=`url(${p.media_data})`; else d.textContent=(p.content||'').slice(0,60); grid.appendChild(d); }); }
    el('user-profile-modal')?.classList.remove('hidden');
  } catch(e){ console.error('profile:',e); }
}

// ── HRA CHAT ─────────────────────────────────────────────────
function genId() { return Math.random().toString(36).slice(2)+Date.now().toString(36); }

function newChat() {
  currentSession=genId();
  el('chat-logs')?.replaceChildren(); el('chat-logs')?.classList.add('hidden');
  el('greeting')?.classList.remove('hidden');
  if(el('user-input')) el('user-input').value='';
  anonHistory=[]; highlightSession(); switchTab('chat');
}
function loadSessions() { const ss=JSON.parse(localStorage.getItem('tox_sessions')||'[]'); renderSessions(ss); }
function renderSessions(ss) {
  document.querySelectorAll('.session-item').forEach(e=>e.remove());
  const list=el('sessions-list'); if(!list) return;
  ss.forEach(s=>{
    const b=document.createElement('button'); b.className='session-item'; b.dataset.sid=s.id;
    b.innerHTML=`<span class="session-label">${esc(s.label||s.id)}</span><button class="session-del" title="Διαγραφή">✕</button>`;
    b.querySelector('.session-label').addEventListener('click',()=>loadSessionHistory(s.id));
    b.querySelector('.session-del').addEventListener('click',async e=>{ e.stopPropagation(); await deleteSession(s.id); loadSessions(); });
    list.insertBefore(b,el('sessions-guest-note'));
  });
  highlightSession();
}
function highlightSession() {
  document.querySelectorAll('.session-item').forEach(b=>{
    b.classList.toggle('active', b.dataset.sid===currentSession);
  });
}
async function loadSessionHistory(sid) {
  if(!loggedIn()) return;
  currentSession=sid; el('chat-logs')?.replaceChildren(); highlightSession();
  try {
    const res=await fetch(url(`/api/history/${sid}`),{headers:jsonHeaders()});
    if(res.status===401){ logout(); return; }
    const{history}=await res.json();
    if(history?.length){ el('greeting')?.classList.add('hidden'); el('chat-logs')?.classList.remove('hidden'); history.forEach(m=>appendMsg(m.content||'',m.role==='user'?'Εσείς':'ΗΡΑ',m.role==='user'?'user-msg':'agent-msg',false)); if(el('chat-logs')) el('chat-logs').scrollTop=99999; }
    else{ el('greeting')?.classList.remove('hidden'); el('chat-logs')?.classList.add('hidden'); }
  } catch{ appendMsg('Αδυναμία φόρτωσης.','ΗΡΑ','agent-msg'); }
}
function onFileSelect() { const f=el('file-input')?.files[0]; if(!f) return; attachedFile=f; if(el('attached-filename')) el('attached-filename').textContent=f.name; el('file-preview')?.classList.remove('hidden'); }
function clearFile() { attachedFile=null; if(el('file-input')) el('file-input').value=''; el('file-preview')?.classList.add('hidden'); }

async function sendChat() {
  const text=el('user-input')?.value.trim(), file=attachedFile;
  if(!text&&!file) return;
  if(el('user-input')) el('user-input').value='';
  clearFile();
  el('greeting')?.classList.add('hidden'); el('chat-logs')?.classList.remove('hidden');
  if(!currentSession) currentSession=genId();
  if(loggedIn()&&text) saveSession(currentSession,text);
  appendMsg(text||`📎 ${file?.name}`,'Εσείς','user-msg');
  const typing=appendTyping();
  try {
    const fd=new FormData();
    if(text) fd.append('message',text);
    if(file) fd.append('file',file);
    const headers={};
    if(loggedIn()){ fd.append('sessionId',currentSession); headers['Authorization']=`Bearer ${token()}`; }
    else fd.append('anonHistory',JSON.stringify(anonHistory));
    const res=await fetch(url('/api/chat'),{method:'POST',headers,body:fd});
    if(res.status===401){ logout(); return; }
    const data=await res.json();
    const reply=res.ok?data.reply:(data.error||'Σφάλμα.');
    typing.remove(); appendMsg(reply,'ΗΡΑ','agent-msg');
    if(!loggedIn()){ if(text) anonHistory.push({role:'user',content:text}); anonHistory.push({role:'model',content:reply}); }
  } catch{ typing.remove(); appendMsg('Αδυναμία σύνδεσης.','ΗΡΑ','agent-msg'); }
}
function saveSession(sid,text) {
  const ss=JSON.parse(localStorage.getItem('tox_sessions')||'[]');
  if(!ss.find(s=>s.id===sid)){ ss.unshift({id:sid,label:text.slice(0,40)}); localStorage.setItem('tox_sessions',JSON.stringify(ss.slice(0,30))); renderSessions(ss); }
}
function appendMsg(text,sender,cls,animate=true) {
  const logs=el('chat-logs'); if(!logs) return null;
  const r=document.createElement('div');
  r.className=`msg-row ${cls} ${cls==='user-msg'?'user-row':'agent-row'}`;
  if(!animate) r.style.animation='none';
  r.innerHTML=`<div class="msg-sender">${sender}</div><div class="msg-text">${cls==='agent-msg'?md(text):esc(text)}</div>`;
  logs.appendChild(r); logs.scrollTop=99999; return r;
}
function appendTyping() {
  const logs=el('chat-logs');
  const r=document.createElement('div'); r.className='msg-row agent-msg agent-row';
  r.innerHTML=`<div class="msg-sender">ΗΡΑ</div><div class="msg-text"><span class="typing-indicator"><span></span><span></span><span></span></span></div>`;
  logs?.appendChild(r); if(logs) logs.scrollTop=99999; return r;
}

// ── FEED ─────────────────────────────────────────────────────
async function loadFeed(append=false) {
  if(!append) feedOffset=0;
  el('feed-loading')?.classList.remove('hidden');
  try {
    const res=await fetch(url(`/api/posts?limit=20&offset=${feedOffset}`),{headers:authHeader()});
    const data=await res.json();
    el('feed-loading')?.classList.add('hidden');
    if(!res.ok||!data.posts){ console.error('feed:',data.error); if(!append&&el('posts-container')) el('posts-container').innerHTML=`<p class="feed-empty-sub" style="text-align:center;padding:20px">Αδυναμία φόρτωσης</p>`; return; }
    const posts=data.posts;
    if(!append) el('posts-container')?.replaceChildren();
    el('feed-empty')?.classList.toggle('hidden',posts.length>0||append);
    posts.forEach(p=>el('posts-container')?.appendChild(buildPostCard(p)));
    feedOffset+=posts.length;
    el('load-more-btn')?.classList.toggle('hidden',posts.length<20);
    if(loggedIn()){ if(el('create-post-card')) el('create-post-card').style.display='flex'; el('feed-guest-notice')?.classList.add('hidden'); updateCreateAvatar(); }
  } catch(e){ el('feed-loading')?.classList.add('hidden'); console.error('feed:',e); }
}
function updateCreateAvatar() {
  const av=el('create-post-avatar'); if(!av||!username()) return;
  const pic=PP.get(username()); av.style.background=pic?'none':'';
  av.innerHTML=pic?`<img src="${pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:(username()[0]?.toUpperCase()||'?');
}
function updateLimitInfo() {
  const info=el('post-limit-info'); if(!info||!loggedIn()) return;
  const type=el('post-type-select')?.value||'public';
  info.textContent=`max ${type==='public'?3:10}/ημέρα`;
}
function onPostMediaSelect() {
  const f=el('post-media-input')?.files[0]; if(!f) return;
  if(f.type.startsWith('video/')){ const r=new FileReader(); r.onload=()=>{ if(el('post-media-img')) el('post-media-img').src=r.result; el('post-media-preview')?.classList.remove('hidden'); el('post-gif-preview')?.classList.add('hidden'); pendingPostGif=null; }; r.readAsDataURL(f); return; }
  const reader=new FileReader();
  reader.onload=e2=>{ const img=new Image(); img.onload=()=>{ const MAX=1280; let{width,height}=img; if(width>MAX||height>MAX){ if(width>height){height=Math.round(height*MAX/width);width=MAX;}else{width=Math.round(width*MAX/height);height=MAX;} } const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height; canvas.getContext('2d').drawImage(img,0,0,width,height); const resized=canvas.toDataURL('image/jpeg',0.82); if(el('post-media-img')) el('post-media-img').src=resized; el('post-media-preview')?.classList.remove('hidden'); el('post-gif-preview')?.classList.add('hidden'); pendingPostGif=null; }; img.onerror=()=>alert('Αδυναμία φόρτωσης εικόνας.'); img.src=e2.target.result; };
  reader.readAsDataURL(f);
}
function clearPostMedia() { if(el('post-media-input')) el('post-media-input').value=''; el('post-media-preview')?.classList.add('hidden'); }
function clearPostGif() { pendingPostGif=null; if(el('post-gif-img')) el('post-gif-img').src=''; el('post-gif-preview')?.classList.add('hidden'); }
async function publishPost() {
  if(!loggedIn()){ openAuth(); return; }
  const type=el('post-type-select')?.value||'public', content=el('post-text-input')?.value.trim();
  const mediaEl=el('post-media-img');
  const media_data=(!el('post-media-preview')?.classList.contains('hidden')&&mediaEl?.src&&!mediaEl.src.endsWith('#'))?mediaEl.src:null;
  const media_type=media_data?(media_data.startsWith('data:video')?'video':'image'):null;
  if(!content&&!media_data&&!pendingPostGif) return;
  try {
    const res=await fetch(url('/api/posts'),{method:'POST',headers:jsonHeaders(),body:JSON.stringify({type,content:content||null,media_data,media_type,gif_url:pendingPostGif||null})});
    let data; try{ data=await res.json(); }catch{ data={error:'Το αρχείο είναι πολύ μεγάλο.'}; }
    if(!res.ok){ alert(data.error); return; }
    if(el('post-text-input')) el('post-text-input').value='';
    clearPostMedia(); clearPostGif(); feedOffset=0; loadFeed();
  } catch(e){ console.error('publish:',e); }
}
function buildPostCard(post) {
  const card=document.createElement('div'); card.className='post-card';
  const uname=post.author||'?', pic=PP.get(uname), init=uname[0]?.toUpperCase()||'?';
  const avatarContent=pic?`<img src="${pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:init;
  const isOwn=uname===username(), liked=post.liked;
  card.innerHTML=`
    <div class="post-header">
      <div class="post-avatar" style="${pic?'background:none':''}" data-uname="${esc(uname)}">${avatarContent}</div>
      <div class="post-meta"><div class="post-author">${esc(uname)}</div><div class="post-time">${timeAgo(new Date(post.created_at).getTime())} · ${post.type==='public'?'🌍':'👥'}</div></div>
      ${isOwn?`<button class="post-delete-btn" title="Διαγραφή">🗑</button>`:''}
    </div>
    ${post.content?`<div class="post-content">${esc(post.content)}</div>`:''}
    ${post.gif_url?`<div class="post-media"><img src="${post.gif_url}" alt="GIF"></div>`:''}
    ${post.has_media&&post.media_data?`<div class="post-media"><img src="${post.media_data}" alt="media"></div>`:''}
    <div class="post-footer">
      <button class="post-like-btn ${liked?'liked':''}"><svg width="14" height="14" viewBox="0 0 24 24" fill="${liked?'currentColor':'none'}" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg><span class="like-count">${post.like_count}</span></button>
      <button class="post-comment-toggle"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><span>${post.comment_count}</span></button>
    </div>
    <div class="post-comments hidden" id="cmt-${post.id}"><div class="cmt-list" id="cmt-list-${post.id}"></div>${loggedIn()?`<div class="cmt-input-row"><input class="cmt-input" placeholder="Σχόλιο..."><button class="cmt-send-btn">→</button></div>`:''}</div>`;
  card.querySelector('.post-avatar').addEventListener('click',()=>openUserProfile(uname));
  const delBtn=card.querySelector('.post-delete-btn');
  if(delBtn) delBtn.addEventListener('click',async()=>{ if(!confirm('Διαγραφή post;')) return; await fetch(url(`/api/posts/${post.id}`),{method:'DELETE',headers:jsonHeaders()}); card.remove(); });
  card.querySelector('.post-like-btn').addEventListener('click',async()=>{ if(!loggedIn()){openAuth();return;} const res=await fetch(url(`/api/posts/${post.id}/like`),{method:'POST',headers:jsonHeaders()}); const{liked:nl,count}=await res.json(); const btn=card.querySelector('.post-like-btn'); btn.classList.toggle('liked',nl); btn.querySelector('svg').setAttribute('fill',nl?'currentColor':'none'); btn.querySelector('.like-count').textContent=count; });
  card.querySelector('.post-comment-toggle').addEventListener('click',async()=>{ const sec=card.querySelector(`#cmt-${post.id}`); const open=!sec.classList.contains('hidden'); sec.classList.toggle('hidden',open); if(!open) await loadComments(post.id,card); });
  const cmtInput=card.querySelector('.cmt-input'), cmtBtn=card.querySelector('.cmt-send-btn');
  if(cmtBtn) cmtBtn.addEventListener('click',()=>sendComment(post.id,card));
  if(cmtInput) cmtInput.addEventListener('keydown',e=>{if(e.key==='Enter') sendComment(post.id,card);});
  card.querySelectorAll('.post-media img').forEach(img=>{ img.style.cursor='pointer'; img.addEventListener('click',()=>openLightbox(img.src)); });
  return card;
}
async function loadComments(pid,card) {
  const list=card.querySelector(`#cmt-list-${pid}`); if(!list) return; list.innerHTML='';
  const res=await fetch(url(`/api/posts/${pid}/comments`),{headers:authHeader()}); const{comments}=await res.json();
  comments.slice(0,3).forEach(c=>list.appendChild(buildComment(c)));
  const hidden=comments.slice(3);
  if(hidden.length){ const btn=document.createElement('button'); btn.className='show-more-cmt'; btn.textContent=`+ ${hidden.length} ακόμα`; btn.addEventListener('click',()=>{hidden.forEach(c=>list.insertBefore(buildComment(c),btn));btn.remove();}); list.appendChild(btn); }
}
function buildComment(c) { const d=document.createElement('div'); d.className='comment'; d.innerHTML=`<div class="cmt-author">${esc(c.author)}</div><div class="cmt-text">${esc(c.content)}</div>`; return d; }
async function sendComment(pid,card) {
  if(!loggedIn()){openAuth();return;}
  const inp=card.querySelector('.cmt-input'), text=inp?.value.trim(); if(!text) return; inp.value='';
  const res=await fetch(url(`/api/posts/${pid}/comments`),{method:'POST',headers:jsonHeaders(),body:JSON.stringify({content:text})}); const{comment}=await res.json();
  const list=card.querySelector(`#cmt-list-${pid}`); if(list) list.appendChild(buildComment({author:comment.author,content:comment.content}));
}
function openLightbox(src) { if(el('lightbox-img')) el('lightbox-img').src=src; el('lightbox')?.classList.remove('hidden'); }

// ── FRIENDS ──────────────────────────────────────────────────
async function loadFriends() {
  if(!loggedIn()){ const list=el('friends-list'); if(list) list.innerHTML='<p class="empty-note">Συνδεθείτε για να δείτε τους φίλους σας.</p>'; return; }
  try { const res=await fetch(url('/api/friends'),{headers:jsonHeaders()}); const{friends}=await res.json(); allFriends=friends; renderFriends(friends); } catch(e){ console.error('loadFriends:',e); }
}
function filterFriends() {
  const q=el('friend-search-input')?.value.toLowerCase()||'';
  document.querySelectorAll('#friends-list .friend-item').forEach(item=>{ const name=item.querySelector('.friend-name')?.textContent.toLowerCase()||''; item.style.display=name.includes(q)?'flex':'none'; });
  updateOnlineDots();
}
function renderFriends(friends) {
  const list=el('friends-list'); if(!list) return; list.innerHTML='';
  const pending=friends.filter(f=>f.status==='pending'&&f.direction==='received');
  const accepted=friends.filter(f=>f.status==='accepted');
  const sent=friends.filter(f=>f.status==='pending'&&f.direction==='sent');
  if(!friends.length){ list.innerHTML='<p class="empty-note">Δεν έχετε φίλους ακόμα.</p>'; return; }
  [...pending,...accepted,...sent].forEach(f=>{
    const item=document.createElement('div'); item.className='friend-item';
    const pic=PP.get(f.username), init=(f.username||'?')[0].toUpperCase();
    const avatarContent=pic?`<img src="${pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:init;
    if(f.status==='pending'&&f.direction==='received'){
      item.innerHTML=`<div class="friend-avatar" style="${pic?'background:none':''}">${avatarContent}</div><div class="friend-info"><div class="friend-name">${esc(f.username)}</div><div class="friend-sub">Αίτημα φιλίας</div></div><button class="accept-friend-btn" data-id="${f.id}">✓</button>`;
      item.querySelector('.accept-friend-btn').addEventListener('click',async e=>{ e.stopPropagation(); await fetch(url(`/api/friends/accept/${f.id}`),{method:'POST',headers:jsonHeaders()}); loadFriends(); });
    } else if(f.status==='accepted'){
      item.innerHTML=`<div class="friend-avatar clickable" style="${pic?'background:none':''}" data-uname="${esc(f.username)}">${avatarContent}</div><div class="friend-info"><div class="friend-name">${esc(f.username)}</div><div class="friend-sub">Φίλος</div></div><button class="remove-friend-btn" data-fid="${f.id}" title="Αφαίρεση">✕</button>`;
      item.querySelector('.friend-avatar').addEventListener('click',()=>openUserProfile(f.username));
      item.addEventListener('click',e=>{ if(!e.target.closest('.remove-friend-btn')&&!e.target.closest('.friend-avatar')) openDm(f.friend_id,f.username); });
      item.querySelector('.remove-friend-btn').addEventListener('click',async e=>{ e.stopPropagation(); if(!confirm(`Αφαίρεση ${f.username};`)) return; await fetch(url(`/api/friends/${f.id}`),{method:'DELETE',headers:jsonHeaders()}); loadFriends(); });
    } else {
      item.innerHTML=`<div class="friend-avatar" style="${pic?'background:none':''}">${avatarContent}</div><div class="friend-info"><div class="friend-name">${esc(f.username)}</div><div class="friend-sub" style="color:var(--text-subtle)">Εκκρεμές...</div></div>`;
    }
    list.appendChild(item);
  });
}
async function sendFriendRequest() {
  const uname=el('friend-username-input')?.value.trim(); if(!uname||!loggedIn()) return;
  try { const res=await fetch(url('/api/friends/request'),{method:'POST',headers:jsonHeaders(),body:JSON.stringify({username:uname})}); const data=await res.json(); const status=el('im-status-msg'); if(status){ status.textContent=data.error||data.message; status.style.color=res.ok?'var(--success)':'var(--danger)'; status.classList.remove('hidden'); setTimeout(()=>status.classList.add('hidden'),3000); } if(res.ok){ if(el('friend-username-input')) el('friend-username-input').value=''; loadFriends(); } } catch{}
}

// ── DMs ──────────────────────────────────────────────────────
function openDm(fid,funame) {
  currentDmFriend={id:fid,username:funame}; lastDmTs=new Date(0).toISOString(); shownDmIds.clear();
  if(el('dm-friend-name')) el('dm-friend-name').textContent=funame;
  const pav=el('dm-peer-avatar');
  if(pav){ const pic=PP.get(funame); pav.innerHTML=pic?`<img src="${pic}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`:(funame[0]?.toUpperCase()||'?'); pav.style.background=pic?'none':''; }
  const msgs=el('dm-messages'); if(msgs){ msgs.replaceChildren(); showDmEmpty(true); }
  pendingDmGif=null; const gifPrev=el('dm-gif-preview'); if(gifPrev){ gifPrev.innerHTML=''; gifPrev.classList.add('hidden'); }
  el('msg-friends-view')?.classList.add('hidden'); el('msg-dm-view')?.classList.remove('hidden');
  fetchDms(); stopDmPoll(); dmPoll=setInterval(fetchDms,3000); updateOnlineDots();
}
function backToFriends() { el('msg-dm-view')?.classList.add('hidden'); el('msg-friends-view')?.classList.remove('hidden'); stopDmPoll(); currentDmFriend=null; }
function showDmEmpty(show) {
  const msgs=el('dm-messages'); if(!msgs) return;
  let ph=msgs.querySelector('.dm-empty');
  if(show&&!ph){ ph=document.createElement('div'); ph.className='dm-empty'; ph.innerHTML='📮<br><span>Στείλτε κάτι</span>'; msgs.appendChild(ph); }
  else if(!show&&ph){ ph.remove(); }
}
async function fetchDms() {
  if(!currentDmFriend||!loggedIn()) return;
  try { const res=await fetch(url(`/api/dm/${currentDmFriend.id}?since=${encodeURIComponent(lastDmTs)}`),{headers:jsonHeaders()}); const{messages}=await res.json(); if(messages?.length){ showDmEmpty(false); messages.forEach(m=>{lastDmTs=m.created_at;appendDmMsg(m);}); if(el('dm-messages')) el('dm-messages').scrollTop=99999; } } catch{}
}
function appendDmMsg(msg) {
  if(shownDmIds.has(msg.id)) return; shownDmIds.add(msg.id);
  const mine=msg.sender_username===username();
  const d=document.createElement('div'); d.className=`dm-msg ${mine?'mine':'theirs'}${msg.is_ai_reply?' ai-reply':''}`; d.dataset.mid=msg.id;
  if(msg.gif_url){ const img=document.createElement('img'); img.src=msg.gif_url; img.alt='GIF'; img.style.cssText='max-width:220px;height:auto;border-radius:8px;display:block'; d.appendChild(img); }
  else{ d.textContent=msg.content; }
  if(msg.is_ai_reply){ const lbl=document.createElement('div'); lbl.className='ai-lbl'; lbl.textContent='✨ ΗΡΑ'; d.prepend(lbl); }
  if(mine) addDmSwipe(d,msg.id);
  el('dm-messages')?.appendChild(d);
}
function addDmSwipe(msgEl,mid) {
  let startX=0,dragging=false;
  msgEl.addEventListener('touchstart',e=>{startX=e.touches[0].clientX;dragging=true;msgEl.style.transition='none';},{passive:true});
  msgEl.addEventListener('touchmove',e=>{ if(!dragging) return; const dx=e.touches[0].clientX-startX; if(dx<0) msgEl.style.transform=`translateX(${Math.max(-80,dx)}px)`; },{passive:true});
  msgEl.addEventListener('touchend',async e=>{ if(!dragging) return; dragging=false; msgEl.style.transition=''; const dx=e.changedTouches[0].clientX-startX; if(dx<-50){ if(confirm('Διαγραφή μηνύματος;')){ await fetch(url(`/api/dm/message/${mid}`),{method:'DELETE',headers:jsonHeaders()}); msgEl.style.opacity='0'; msgEl.style.height='0'; msgEl.style.margin='0'; setTimeout(()=>msgEl.remove(),300); }else{ msgEl.style.transform=''; } }else{ msgEl.style.transform=''; } },{passive:true});
}
async function sendDm() {
  const text=el('dm-input')?.value.trim(), gif=pendingDmGif;
  if((!text&&!gif)||!currentDmFriend||!loggedIn()) return;
  if(el('dm-input')) el('dm-input').value='';
  pendingDmGif=null; const gifPrev=el('dm-gif-preview'); if(gifPrev){ gifPrev.innerHTML=''; gifPrev.classList.add('hidden'); }
  try {
    const res=await fetch(url(`/api/dm/${currentDmFriend.id}`),{method:'POST',headers:jsonHeaders(),body:JSON.stringify({content:text||'',gif_url:gif||null,aiReply:el('ai-reply-toggle')?.checked})});
    if(!res.ok){ const d=await res.json(); const e=document.createElement('div'); e.className='dm-msg theirs'; e.style.color='var(--danger)'; e.textContent=d.error||'Σφάλμα.'; el('dm-messages')?.appendChild(e); }
  } catch{}
}
function stopDmPoll() { if(dmPoll){ clearInterval(dmPoll); dmPoll=null; } }

// ── GROUPS ───────────────────────────────────────────────────
async function loadGroups() {
  if(!loggedIn()){ el('groups-empty')?.classList.remove('hidden'); return; }
  try { const res=await fetch(url('/api/groups'),{headers:jsonHeaders()}); const{groups}=await res.json(); renderGroups(groups); } catch{}
}
function renderGroups(groups) {
  const list=el('groups-list'), empty=el('groups-empty'); if(!list) return; list.innerHTML='';
  if(!groups?.length){ empty?.classList.remove('hidden'); return; } empty?.classList.add('hidden');
  groups.forEach(g=>{
    const item=document.createElement('div'); item.className='friend-item';
    item.innerHTML=`<div class="friend-avatar grp-color">G</div><div class="friend-info"><div class="friend-name">${esc(g.name)}</div><div class="friend-sub">${g.last_sender?`${esc(g.last_sender)}: ${esc((g.last_message||'').slice(0,30))}`:`${g.member_count} μέλη`}</div></div>`;
    item.addEventListener('click',()=>openGroup(g)); list.appendChild(item);
  });
}
function openGroup(g) {
  currentGroup=g; lastGrpTs=new Date(0).toISOString(); shownGrpIds.clear();
  if(el('grp-chat-name')) el('grp-chat-name').textContent=g.name;
  const msgs=el('grp-messages');
  if(msgs){ msgs.replaceChildren(); const ph=document.createElement('div'); ph.className='dm-empty'; ph.innerHTML='📮<br><span>Στείλτε κάτι</span>'; msgs.appendChild(ph); }
  pendingGrpGif=null; const gifPrev=el('grp-gif-preview'); if(gifPrev){ gifPrev.innerHTML=''; gifPrev.classList.add('hidden'); }
  el('grp-list-view')?.classList.add('hidden'); el('grp-chat-view')?.classList.remove('hidden');
  if(el('delete-group-btn')) el('delete-group-btn').style.display='block';
  fetchGroupMsgs(); stopGrpPoll(); grpPoll=setInterval(fetchGroupMsgs,3000);
}
function backToGroups() { el('grp-chat-view')?.classList.add('hidden'); el('grp-list-view')?.classList.remove('hidden'); stopGrpPoll(); currentGroup=null; }
async function fetchGroupMsgs() {
  if(!currentGroup||!loggedIn()) return;
  try { const res=await fetch(url(`/api/groups/${currentGroup.id}/messages?since=${encodeURIComponent(lastGrpTs)}`),{headers:jsonHeaders()}); const{messages}=await res.json(); if(messages?.length){ const msgs=el('grp-messages'); msgs?.querySelector('.dm-empty')?.remove(); messages.forEach(m=>{lastGrpTs=m.created_at;appendGrpMsg(m);}); if(msgs) msgs.scrollTop=99999; } } catch{}
}
function appendGrpMsg(msg) {
  if(shownGrpIds.has(msg.id)) return; shownGrpIds.add(msg.id);
  const mine=msg.sender_username===username();
  const d=document.createElement('div'); d.className=`dm-msg ${mine?'mine':'theirs'} grp-msg`;
  if(!mine){ const auth=document.createElement('div'); auth.className='grp-msg-author'; auth.textContent=msg.sender_username; d.appendChild(auth); }
  if(msg.gif_url){ const img=document.createElement('img'); img.src=msg.gif_url; img.alt='GIF'; img.style.cssText='max-width:200px;height:auto;border-radius:8px;display:block'; d.appendChild(img); }
  else{ d.appendChild(document.createTextNode(msg.content)); }
  el('grp-messages')?.appendChild(d);
}
async function sendGroupMsg() {
  const text=el('grp-input')?.value.trim(), gif=pendingGrpGif;
  if((!text&&!gif)||!currentGroup||!loggedIn()) return;
  if(el('grp-input')) el('grp-input').value='';
  pendingGrpGif=null; const gifPrev=el('grp-gif-preview'); if(gifPrev){ gifPrev.innerHTML=''; gifPrev.classList.add('hidden'); }
  try { await fetch(url(`/api/groups/${currentGroup.id}/messages`),{method:'POST',headers:jsonHeaders(),body:JSON.stringify({content:text||'',gif_url:gif||null})}); } catch{}
}
async function deleteCurrentGroup() {
  if(!currentGroup||!loggedIn()) return;
  if(!confirm(`Διαγραφή ομάδας "${currentGroup.name}";`)) return;
  try { const res=await fetch(url(`/api/groups/${currentGroup.id}`),{method:'DELETE',headers:jsonHeaders()}); const d=await res.json(); if(!res.ok){alert(d.error);return;} backToGroups(); loadGroups(); } catch{}
}
function stopGrpPoll() { if(grpPoll){ clearInterval(grpPoll); grpPoll=null; } }
function openGroupModal() {
  if(el('group-name-input')) el('group-name-input').value='';
  el('group-modal-err')?.classList.add('hidden');
  const memberList=el('group-members-list');
  if(memberList){ memberList.innerHTML=''; const accepted=allFriends.filter(f=>f.status==='accepted'); if(!accepted.length){ memberList.innerHTML='<p class="empty-note">Προσθέστε φίλους πρώτα.</p>'; }else{ accepted.forEach(f=>{ const row=document.createElement('div'); row.className='grp-member-row'; row.dataset.uid=f.friend_id; row.innerHTML=`<div class="grp-member-check">○</div><span>${esc(f.username)}</span>`; row.addEventListener('click',()=>{ row.classList.toggle('selected'); row.querySelector('.grp-member-check').textContent=row.classList.contains('selected')?'✓':'○'; }); memberList.appendChild(row); }); } }
  el('group-modal-overlay')?.classList.remove('hidden');
}
function closeGroupModal() { el('group-modal-overlay')?.classList.add('hidden'); }
async function createGroup() {
  const name=el('group-name-input')?.value.trim();
  if(!name){ const err=el('group-modal-err'); if(err){err.textContent='Δώστε όνομα.';err.classList.remove('hidden');} return; }
  const member_ids=[...document.querySelectorAll('.grp-member-row.selected')].map(r=>parseInt(r.dataset.uid));
  try { const res=await fetch(url('/api/groups'),{method:'POST',headers:jsonHeaders(),body:JSON.stringify({name,member_ids})}); const data=await res.json(); if(!res.ok){ const err=el('group-modal-err'); if(err){err.textContent=data.error;err.classList.remove('hidden');} return; } closeGroupModal(); loadGroups(); } catch{}
}

// ── GIF PICKER ────────────────────────────────────────────────
function openGifPicker(target) { gifTarget=target; if(el('gif-search-input')) el('gif-search-input').value=''; el('gif-picker-overlay')?.classList.remove('hidden'); loadTrendingGifs(); }
function closeGifPicker() { el('gif-picker-overlay')?.classList.add('hidden'); gifTarget=null; }
async function loadTrendingGifs() {
  el('gif-loading')?.classList.remove('hidden'); if(el('gif-grid')) el('gif-grid').innerHTML='';
  try { const res=await fetch(`https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_KEY}&limit=12&rating=g`); const data=await res.json(); renderGifs(data.data||[]); } catch{ el('gif-loading')?.classList.add('hidden'); }
}
async function searchGifs() {
  const q=el('gif-search-input')?.value.trim(); if(!q){loadTrendingGifs();return;}
  el('gif-loading')?.classList.remove('hidden'); if(el('gif-grid')) el('gif-grid').innerHTML='';
  try { const res=await fetch(`https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=12&rating=g`); const data=await res.json(); renderGifs(data.data||[]); } catch{ el('gif-loading')?.classList.add('hidden'); }
}
function renderGifs(gifs) {
  el('gif-loading')?.classList.add('hidden'); const grid=el('gif-grid'); if(!grid) return; grid.innerHTML='';
  gifs.forEach(gif=>{ const img=document.createElement('img'); img.src=gif.images?.fixed_height_small?.url||gif.images?.fixed_height?.url||''; img.alt=gif.title||'GIF'; img.className='gif-thumb'; img.addEventListener('click',()=>selectGif(gif.images?.original?.url||img.src)); grid.appendChild(img); });
}
function selectGif(gifUrl) {
  const target=gifTarget; closeGifPicker();
  if(target==='post'){ pendingPostGif=gifUrl; if(el('post-gif-img')) el('post-gif-img').src=gifUrl; el('post-gif-preview')?.classList.remove('hidden'); el('post-media-preview')?.classList.add('hidden'); if(el('post-media-input')) el('post-media-input').value=''; }
  else if(target==='dm'){ pendingDmGif=gifUrl; showGifPreview('dm-gif-preview',gifUrl,()=>{pendingDmGif=null;}); }
  else if(target==='grp'){ pendingGrpGif=gifUrl; showGifPreview('grp-gif-preview',gifUrl,()=>{pendingGrpGif=null;}); }
}
function showGifPreview(elemId,gifUrl,onClear) {
  const prev=el(elemId); if(!prev) return;
  prev.innerHTML=`<img src="${gifUrl}" style="height:60px;border-radius:6px;vertical-align:middle"><button class="clear-gif-btn">✕</button>`;
  prev.classList.remove('hidden');
  prev.querySelector('.clear-gif-btn').addEventListener('click',()=>{ onClear(); prev.innerHTML=''; prev.classList.add('hidden'); });
}

// ── ONLINE HEARTBEAT ─────────────────────────────────────────
function heartbeat() {
  if(!loggedIn()) return;
  fetch(url('/api/online'),{method:'POST',headers:jsonHeaders()}).catch(()=>{});
  if(!heartbeatIntervalStarted){ heartbeatIntervalStarted=true; setInterval(()=>{ if(loggedIn()) fetch(url('/api/online'),{method:'POST',headers:jsonHeaders()}).catch(()=>{}); },4*60*1000); }
}
async function fetchOnlineUsers() {
  if(!loggedIn()) return;
  try { const res=await fetch(url('/api/online'),{headers:jsonHeaders()}); const{online}=await res.json(); onlineUsers=new Set(online||[]); updateOnlineDots(); } catch{}
}
function updateOnlineDots() {
  document.querySelectorAll('#friends-list .friend-avatar[data-uname]').forEach(av=>{ const item=av.closest('.friend-item'); if(!item) return; item.classList.toggle('friend-online',onlineUsers.has(av.dataset.uname)); });
  if(currentDmFriend) el('dm-header')?.classList.toggle('peer-online',onlineUsers.has(currentDmFriend.username));
}
function startOnlinePoll() { stopOnlinePoll(); fetchOnlineUsers(); onlinePoll=setInterval(fetchOnlineUsers,30000); }
function stopOnlinePoll() { if(onlinePoll){ clearInterval(onlinePoll); onlinePoll=null; } }

// ══════════════════════════════════════════════════════════════
// ── ΝΗΜΑΤΑ (THREADS FORUM) ───────────────────────────────────
// ══════════════════════════════════════════════════════════════

async function loadThreads() {
  el('threads-loading')?.classList.remove('hidden');
  el('threads-empty')?.classList.add('hidden');
  const container = el('threads-container');
  if (container) container.innerHTML = '';

  try {
    const params = new URLSearchParams();
    if (currentThreadCat) params.set('category', currentThreadCat);
    const search = el('thread-search')?.value.trim();
    if (search) params.set('search', search);
    params.set('limit', '40');

    const res = await fetch(url(`/api/threads?${params}`), { headers: authHeader() });
    const { threads } = await res.json();
    el('threads-loading')?.classList.add('hidden');

    if (!threads?.length) {
      el('threads-empty')?.classList.remove('hidden');
      return;
    }
    threads.forEach(t => container?.appendChild(buildThreadCard(t)));
  } catch (e) {
    el('threads-loading')?.classList.add('hidden');
    console.error('loadThreads:', e);
  }
}

function buildThreadCard(thread) {
  const card = document.createElement('div');
  card.className = 'thread-card';
  const emoji = CAT_EMOJI[thread.category] || '';

  const top = document.createElement('div');
  top.className = 'thread-card-top';
  const badge = document.createElement('span');
  badge.className = 'cat-badge';
  badge.dataset.cat = thread.category;
  badge.textContent = `${emoji} ${thread.category}`;
  top.appendChild(badge);
  card.appendChild(top);

  const title = document.createElement('div');
  title.className = 'thread-card-title';
  title.textContent = thread.title;
  card.appendChild(title);

  if (thread.content) {
    const excerpt = document.createElement('div');
    excerpt.className = 'thread-card-excerpt';
    excerpt.textContent = thread.content;
    card.appendChild(excerpt);
  }

  const footer = document.createElement('div');
  footer.className = 'thread-card-footer';
  footer.innerHTML = `
    <span class="thread-card-author">${esc(thread.author)} · ${timeAgo(new Date(thread.created_at).getTime())}</span>
    <span class="thread-stat">❤ ${thread.like_count}</span>
    <span class="thread-stat">💬 ${thread.reply_count}</span>`;
  card.appendChild(footer);

  card.addEventListener('click', () => openThread(thread));
  return card;
}

function openThread(thread) {
  currentThread = thread;

  // Update header badge + title
  const badge = el('thread-detail-cat-badge');
  if (badge) { badge.dataset.cat = thread.category; badge.textContent = `${CAT_EMOJI[thread.category]||''} ${thread.category}`; }
  if (el('thread-detail-title-header')) el('thread-detail-title-header').textContent = thread.title;

  // Clear previous content
  ['thread-post-card','thread-replies-header','thread-replies-list'].forEach(id => { const e = el(id); if (e) e.innerHTML = ''; });

  // Switch view
  el('thread-list-view')?.classList.add('hidden');
  el('thread-detail-view')?.classList.remove('hidden');

  loadThreadDetail(thread.id);
}

function backToThreads() {
  el('thread-detail-view')?.classList.add('hidden');
  el('thread-list-view')?.classList.remove('hidden');
  currentThread = null;
  if (el('thread-reply-input')) el('thread-reply-input').value = '';
}

async function loadThreadDetail(tid) {
  try {
    const res = await fetch(url(`/api/threads/${tid}`), { headers: authHeader() });
    if (!res.ok) { backToThreads(); return; }
    const { thread, replies } = await res.json();
    renderThreadDetail(thread, replies);
  } catch (e) { console.error('loadThreadDetail:', e); }
}

function renderThreadDetail(thread, replies) {
  const postCard = el('thread-post-card');
  if (postCard) {
    postCard.innerHTML = '';
    const isOwn = thread.author === username();

    const titleEl = document.createElement('div');
    titleEl.className = 'thread-post-title';
    titleEl.textContent = thread.title;
    postCard.appendChild(titleEl);

    if (thread.content) {
      const bodyEl = document.createElement('div');
      bodyEl.className = 'thread-post-body';
      bodyEl.textContent = thread.content;
      postCard.appendChild(bodyEl);
    }

    const metaEl = document.createElement('div');
    metaEl.className = 'thread-post-meta';
    const authorSpan = document.createElement('span');
    authorSpan.textContent = thread.author;
    authorSpan.style.cssText = 'cursor:pointer;color:var(--accent);font-weight:500';
    authorSpan.addEventListener('click', () => openUserProfile(thread.author));
    metaEl.appendChild(authorSpan);
    metaEl.insertAdjacentHTML('beforeend', ` <span>·</span> <span>${timeAgo(new Date(thread.created_at).getTime())}</span>`);
    postCard.appendChild(metaEl);

    const footerEl = document.createElement('div');
    footerEl.className = 'thread-post-footer';

    const likeBtn = document.createElement('button');
    likeBtn.className = `thread-like-btn${thread.liked ? ' liked' : ''}`;
    likeBtn.innerHTML = `❤ <span>${thread.like_count}</span>`;
    likeBtn.addEventListener('click', () => { if (!loggedIn()) { openAuth(); return; } likeThread(thread.id, likeBtn); });
    footerEl.appendChild(likeBtn);

    if (isOwn) {
      const delBtn = document.createElement('button');
      delBtn.className = 'thread-delete-btn'; delBtn.title = 'Διαγραφή νήματος'; delBtn.textContent = '🗑';
      delBtn.addEventListener('click', async () => { if (!confirm('Διαγραφή νήματος;')) return; await deleteThread(thread.id); });
      footerEl.appendChild(delBtn);
    }
    postCard.appendChild(footerEl);
  }

  // Replies header
  const hdr = el('thread-replies-header');
  if (hdr) hdr.textContent = replies.length > 0 ? `${replies.length} ${replies.length === 1 ? 'Απάντηση' : 'Απαντήσεις'}` : 'Καμία απάντηση ακόμα';

  // Replies list
  const list = el('thread-replies-list');
  if (list) { list.innerHTML = ''; replies.forEach(r => list.appendChild(buildReplyCard(r))); }

  // Show/hide reply bar
  const bar = el('thread-reply-bar');
  if (bar) bar.style.display = loggedIn() ? 'flex' : 'none';

  // Scroll to top
  const scroll = el('thread-detail-scroll');
  if (scroll) scroll.scrollTop = 0;
}

function buildReplyCard(reply) {
  const card = document.createElement('div');
  card.className = 'thread-reply-card';
  const isOwn = reply.author === username();
  const pic = PP.get(reply.author);
  const init = (reply.author||'?')[0].toUpperCase();

  const header = document.createElement('div');
  header.className = 'thread-reply-header';
  const av = document.createElement('div');
  av.className = 'reply-avatar';
  av.innerHTML = pic ? `<img src="${pic}" alt="${init}">` : init;
  const authorEl = document.createElement('span');
  authorEl.className = 'reply-author';
  authorEl.textContent = reply.author;
  authorEl.style.cursor = 'pointer';
  authorEl.addEventListener('click', () => openUserProfile(reply.author));
  const timeEl = document.createElement('span');
  timeEl.className = 'reply-time';
  timeEl.textContent = timeAgo(new Date(reply.created_at).getTime());
  header.appendChild(av); header.appendChild(authorEl); header.appendChild(timeEl);
  card.appendChild(header);

  const body = document.createElement('div');
  body.className = 'thread-reply-body';
  body.textContent = reply.content;
  card.appendChild(body);

  const footer = document.createElement('div');
  footer.className = 'thread-reply-footer';
  const likeBtn = document.createElement('button');
  likeBtn.className = `reply-like-btn${reply.liked ? ' liked' : ''}`;
  likeBtn.innerHTML = `❤ <span>${reply.like_count}</span>`;
  likeBtn.addEventListener('click', () => { if (!loggedIn()) { openAuth(); return; } likeReply(reply.id, likeBtn); });
  footer.appendChild(likeBtn);

  if (isOwn) {
    const delBtn = document.createElement('button');
    delBtn.className = 'reply-delete-btn'; delBtn.title = 'Διαγραφή'; delBtn.textContent = '🗑';
    delBtn.addEventListener('click', () => deleteReply(reply.id, card));
    footer.appendChild(delBtn);
  }
  card.appendChild(footer);
  return card;
}

async function likeThread(tid, btn) {
  try {
    const res = await fetch(url(`/api/threads/${tid}/like`), { method:'POST', headers:jsonHeaders() });
    const { liked, count } = await res.json();
    btn.classList.toggle('liked', liked);
    const span = btn.querySelector('span'); if (span) span.textContent = count;
  } catch {}
}

async function likeReply(rid, btn) {
  try {
    const res = await fetch(url(`/api/threads/replies/${rid}/like`), { method:'POST', headers:jsonHeaders() });
    const { liked, count } = await res.json();
    btn.classList.toggle('liked', liked);
    const span = btn.querySelector('span'); if (span) span.textContent = count;
  } catch {}
}

async function sendThreadReply() {
  if (!currentThread || !loggedIn()) return;
  const input = el('thread-reply-input');
  const text = input?.value.trim();
  if (!text) return;
  input.value = '';

  try {
    const res = await fetch(url(`/api/threads/${currentThread.id}/replies`), {
      method:'POST', headers:jsonHeaders(), body:JSON.stringify({ content:text })
    });
    if (!res.ok) { const d=await res.json(); alert(d.error); input.value=text; return; }
    const { reply } = await res.json();

    const list = el('thread-replies-list');
    if (list) {
      list.appendChild(buildReplyCard(reply));
      const scroll = el('thread-detail-scroll');
      if (scroll) scroll.scrollTop = 99999;
    }
    // Update count in header
    const hdr = el('thread-replies-header');
    if (hdr) {
      const count = el('thread-replies-list')?.querySelectorAll('.thread-reply-card').length || 0;
      hdr.textContent = `${count} ${count === 1 ? 'Απάντηση' : 'Απαντήσεις'}`;
    }
  } catch (e) { console.error('sendThreadReply:', e); }
}

async function deleteThread(tid) {
  try {
    const res = await fetch(url(`/api/threads/${tid}`), { method:'DELETE', headers:jsonHeaders() });
    if (!res.ok) { const d=await res.json(); alert(d.error); return; }
    backToThreads();
    loadThreads();
  } catch {}
}

async function deleteReply(rid, card) {
  if (!confirm('Διαγραφή απάντησης;')) return;
  try {
    const res = await fetch(url(`/api/threads/replies/${rid}`), { method:'DELETE', headers:jsonHeaders() });
    if (!res.ok) return;
    card.style.transition = 'opacity 0.25s, height 0.25s';
    card.style.opacity = '0';
    card.style.overflow = 'hidden';
    card.style.height = card.offsetHeight + 'px';
    requestAnimationFrame(() => { card.style.height = '0'; card.style.padding = '0'; card.style.margin = '0'; });
    setTimeout(() => {
      card.remove();
      const hdr = el('thread-replies-header');
      if (hdr) {
        const count = el('thread-replies-list')?.querySelectorAll('.thread-reply-card').length || 0;
        hdr.textContent = count > 0 ? `${count} ${count===1?'Απάντηση':'Απαντήσεις'}` : 'Καμία απάντηση ακόμα';
      }
    }, 280);
  } catch {}
}

// ── CREATE THREAD MODAL ───────────────────────────────────────
function openCreateThread() {
  if (el('thread-cat-select')) el('thread-cat-select').value = '';
  if (el('thread-title-input')) el('thread-title-input').value = '';
  if (el('thread-content-input')) el('thread-content-input').value = '';
  el('thread-modal-err')?.classList.add('hidden');
  el('create-thread-modal')?.classList.remove('hidden');
  setTimeout(() => el('thread-title-input')?.focus(), 80);
}

function closeCreateThread() { el('create-thread-modal')?.classList.add('hidden'); }

async function publishThread() {
  const title    = el('thread-title-input')?.value.trim();
  const content  = el('thread-content-input')?.value.trim();
  const category = el('thread-cat-select')?.value;
  const errEl    = el('thread-modal-err');

  const showErr = msg => {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.style.color = 'var(--danger)';
    errEl.style.background = 'rgba(220,38,38,0.08)';
    errEl.classList.remove('hidden');
  };

  if (!category) { showErr('Επιλέξτε κατηγορία.'); return; }
  if (!title)    { showErr('Δώστε τίτλο.'); return; }

  const btn = el('publish-thread-btn');
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  try {
    const res = await fetch(url('/api/threads'), {
      method:'POST', headers:jsonHeaders(),
      body: JSON.stringify({ title, content:content||null, category })
    });
    const data = await res.json();
    if (!res.ok) { showErr(data.error); return; }
    closeCreateThread();
    loadThreads();
  } catch { showErr('Σφάλμα σύνδεσης.'); }
  finally { if (btn) { btn.disabled = false; btn.textContent = 'Δημοσίευση'; } }
}