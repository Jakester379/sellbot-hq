/* =========================================================
   SELLBOT HQ — app logic
   Data lives in one JSON blob: localStorage + Supabase (sellbot_profiles.data)
   ========================================================= */
(() => {
'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Math.round(n||0));
const fmtK = n => Math.abs(n) >= 1000 ? '$' + (n/1000).toFixed(Math.abs(n) >= 100000 ? 0 : 1).replace(/\.0$/,'') + 'k' : fmt(n);
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
// one rounding rule everywhere: floor; one decimal under 10%
const pctFmt = p => { p = Math.max(0, p || 0); return (p < 10 ? (Math.floor(p*10)/10).toString() : Math.floor(p).toString()) + '%'; };
const LS_KEY = 'sellbotDash';
const MS_DAY = 864e5;

/* ---------- dates ---------- */
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parseISO = s => { const [y,m,d] = String(s||'').split('-').map(Number); return y ? new Date(y, (m||1)-1, d||1) : null; };
const todayISO = () => iso(new Date());
const mondayOf = (d = new Date()) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay()+6)%7)); return x; };
const niceDate = (s, opts={month:'short',day:'numeric',year:'numeric'}) => { const d = parseISO(s); return d ? d.toLocaleDateString('en-US', opts) : '—'; };
const addYears = (d, y) => { const x = new Date(d); x.setFullYear(x.getFullYear() + y); return x; };

/* ---------- ladder ---------- */
const SUITS = [['Cold Caller',1,5],['Telemarketer',2,6],['Name Dropper',3,7],['Glad Hander',4,8],['Mover & Shaker',5,9],['Two-Face',6,10],['The Mingler',7,11],['Mr. Hollywood',8,50]];
let ranks = [], GOAL = 300000;
function buildRanks(goal){
  GOAL = goal;
  const list = [];
  SUITS.forEach(([name, lo, hi], s) => { for (let l = lo; l <= hi; l++) list.push({name, level:l, suit:s, suitStart:l===lo}); });
  const N = list.length, step = goal >= 200000 ? 500 : goal >= 50000 ? 250 : 100;
  // gentle curve: early promotions come quicker, every step after is a little bigger
  let prev = 0;
  list.forEach((r, i) => {
    let t = i === N-1 ? goal : Math.round(goal * Math.pow((i+1)/N, 1.15) / step) * step;
    if (t <= prev) t = prev + step;
    r.threshold = t; r.idx = i; prev = t;
  });
  ranks = list;
}
const rankLabel = r => r ? `${r.name} Lv ${r.level}` : 'Unsuited';
const tierFor = r => r.suitStart ? 5 : ((r.idx+1) % 5 === 0 ? 4 : 3);

/* ---------- reward deck ---------- */
const DECK = [
['Madam Chuckle','Coffee shop visit + pastry',3,100],['Clerk Will','New book or audiobook',3,100],['Stinky Ned','Favorite takeout lunch',3,100],['Barbara Seville','Video game or game add-on',3,100],['Clumsy Ned','Gym or workout accessory',3,100],['Professor Guffaw','Specialty coffee or drink',3,100],['Clerk Ray','Desk accessory or notebook',3,100],['Doctor Drift','Grooming product',3,100],['Melody Wavers','Music, movie, or digital entertainment',3,100],['Baker Bridget','Bakery run or dessert',3,100],['Sofie Squirt','Plant, seeds, or garden accessory',3,100],['Shelly Seaweed','Small hobby purchase',3,100],['Soggy Bottom','Protected hour for a hobby',3,100],['Flim Flam','Snack and movie night',3,100],
['Daffy Don','Nice dinner out',4,300],['Clerk Penny','Quality clothing item',4,300],['Nancy Gas','Family day trip or local attraction',4,300],['Sid Sonata','Concert, comedy, or live event',4,300],['Franz Neckvein','Hobby or fitness upgrade',4,300],['Soggy Nell','Date night',4,300],['Mr. Freeze','Premium tech or gaming accessory',4,300],
['Flippy','Special date night + activity',5,750],['Clerk Clara','Home office or sales setup upgrade',5,750],['Lil Oldman','Course, coaching, or professional development',5,750],['Moe Zart','Two tickets to a major live event',5,750],['Barnacle Bessie','Memorable family outing or overnight adventure',5,750],['Professor Pete','Premium purchase',5,750],['Sticky Lou','Full hobby day',5,750],['Julius Wheezer','Special experience or getaway',5,750]];

/* ---------- state ---------- */
const blankWeek = () => ({start: iso(mondayOf()), outreach:0, meetings:0, proposals:0, target:300, notes:''});
const zero4 = () => ({merits:0, outreach:0, meetings:0, proposals:0});
function defaultState(){
  return {v:2, goal:{amount:300000, start:todayISO(), years:5}, deals:[], closePct:0, week:blankWeek(), weeks:[],
    life:zero4(), logged:zero4(), draws:{tokens:[], highest:null}, rewards:[], card:null,
    prefs:{sound:false, ambience:'full'}, savedAt:0};
}
// accepts v1 (flat) or v2 data
function migrate(s){
  const st = defaultState();
  if (!s || typeof s !== 'object') return st;
  if (s.v === 2){
    Object.assign(st, s);
    st.goal = {...defaultState().goal, ...s.goal}; st.week = {...blankWeek(), ...s.week};
    st.life = {...zero4(), ...s.life}; st.logged = {...zero4(), ...s.logged};
    st.draws = {tokens:[], highest:null, ...s.draws}; st.prefs = {...st.prefs, ...s.prefs};
    st.deals = Array.isArray(s.deals) ? s.deals : []; st.weeks = Array.isArray(s.weeks) ? s.weeks : []; st.rewards = Array.isArray(s.rewards) ? s.rewards : [];
    return st;
  }
  // v1
  const m = num(s.mrr);
  if (m) st.deals = [{id:uid(), date:todayISO(), client:'Opening balance (carried over)', mrr:m}];
  st.closePct = num(s.closePct);
  st.week = {...blankWeek(), outreach:num(s.outreach), meetings:num(s.meetings), proposals:num(s.proposals), target:num(s.target)||300, notes:s.notes||''};
  if (s.life) st.life = {...zero4(), ...s.life};
  if (s.logged) st.logged = {...zero4(), ...s.logged};
  st.rewards = (s.history||[]).map(c => Array.isArray(c) ? {name:c[0], desc:c[1], stars:c[2], value:c[3], date:null, redeemed:false} : c);
  st.migrated = true;
  st.savedAt = 1; // real data, but older than anything in the cloud
  return st;
}
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const isEmpty = s => !s.deals.length && !s.weeks.length && !s.rewards.length && !s.week.outreach && !s.week.meetings && !s.week.proposals && !s.week.notes;

let state = defaultState();
try { const raw = localStorage.getItem(LS_KEY); if (raw) state = migrate(JSON.parse(raw)); } catch(e){ console.warn('Local data unreadable', e); }
buildRanks(state.goal.amount);

/* ---------- derived ---------- */
const totalMRR = () => state.deals.reduce((a,d) => a + num(d.mrr), 0);
const rankIdx = v => { let i = -1; for (const r of ranks){ if (v >= r.threshold) i = r.idx; else break; } return i; };
function promotionDates(){
  const sorted = [...state.deals].sort((a,b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const out = []; let run = 0, reached = -1;
  for (const d of sorted){
    run += num(d.mrr);
    while (reached + 1 < ranks.length && run >= ranks[reached+1].threshold){ reached++; out.push({rank:ranks[reached], date:d.date}); }
  }
  return out;
}
function pace(v){
  const start = parseISO(state.goal.start) || new Date(), end = addYears(start, num(state.goal.years)||5), now = new Date();
  const f = Math.min(1, Math.max(0, (now - start) / (end - start)));
  const expected = GOAL * f, monthsLeft = Math.max(0, (end - now) / (MS_DAY * 30.4375));
  return {start, end, f, expected, diff: v - expected, monthsLeft, daysLeft: Math.max(0, Math.ceil((end - now)/MS_DAY)), notStarted: now < start};
}
function meritCalc(){
  const w = state.week, m = num(w.outreach) + 15*num(w.meetings) + 40*num(w.proposals), t = Math.max(1, num(w.target) || 300);
  return {m, t, p: m / t * 100};
}

/* ---------- persistence ---------- */
let sb = null, user = null, saveTimer = null, lastSynced = num(localStorage.getItem(LS_KEY+'_synced'));
function payload(){
  const v = totalMRR();
  // legacy mirror fields keep the old single-file version readable if you ever roll back
  return {...state, mrr:v, outreach:state.week.outreach, meetings:state.week.meetings, proposals:state.week.proposals,
    target:state.week.target, notes:state.week.notes, history:state.rewards.map(r => [r.name, r.desc, r.stars, r.value])};
}
function persistLocal(){ try { localStorage.setItem(LS_KEY, JSON.stringify(payload())); } catch(e){ toast('Could not save in this browser (storage full?)', 'err'); } }
function commit(){ state.savedAt = Date.now(); persistLocal(); renderFooter(); clearTimeout(saveTimer); saveTimer = setTimeout(pushCloud, 700); }
async function pushCloud(){
  if (!sb || !user) return;
  const now = new Date().toISOString();
  const {error} = await sb.from('sellbot_profiles').upsert({user_id:user.id, data:payload(), updated_at:now});
  if (error){ console.error(error); setChip('warn', 'Sync error'); toast('Cloud save failed — your data is still saved in this browser.', 'err'); return; }
  lastSynced = Date.parse(now); localStorage.setItem(LS_KEY+'_synced', lastSynced); setChip('on', 'Synced'); renderFooter();
}
async function pullCloud({quiet=false} = {}){
  if (!sb || !user) return;
  const {data, error} = await sb.from('sellbot_profiles').select('data,updated_at').eq('user_id', user.id).maybeSingle();
  if (error){ console.error(error); setChip('warn','Sync error'); if (!quiet) toast('Signed in, but cloud data could not be loaded.', 'err'); return; }
  if (!data || !data.data){ await pushCloud(); if (!quiet) toast('Cloud save created.', 'ok'); return; }
  const cloudTs = Date.parse(data.updated_at) || 0;
  const localDirty = state.savedAt > lastSynced;
  if (isEmpty(state) || !localDirty || cloudTs >= state.savedAt){
    if (cloudTs === lastSynced && !localDirty) { setChip('on','Synced'); return; }
    if (!isEmpty(state) && localDirty) localStorage.setItem(LS_KEY+'_localBackup', JSON.stringify(payload()));
    state = migrate(data.data); buildRanks(state.goal.amount);
    lastSynced = cloudTs; localStorage.setItem(LS_KEY+'_synced', lastSynced); persistLocal();
    applyPrefs(); initHighest(); renderAll();
    if (!quiet) toast('Loaded your cloud save.', 'ok');
  } else {
    // this browser has newer edits: keep them, back up the cloud copy, then push
    localStorage.setItem(LS_KEY+'_cloudBackup', JSON.stringify(data.data));
    await pushCloud();
    if (!quiet) toast('This browser had newer changes — pushed them to the cloud (previous cloud copy backed up).', 'ok');
  }
  setChip('on','Synced');
}

/* ---------- toasts / dialogs ---------- */
function toast(msg, kind=''){
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg; $('toasts').appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, kind === 'err' ? 6000 : 3600);
}
function confirmBox(title, body, yes='Confirm'){
  return new Promise(res => {
    const d = $('confirmDlg'); $('cfTitle').textContent = title; $('cfBody').textContent = body; $('cfYes').textContent = yes;
    d.returnValue = ''; d.showModal();
    d.addEventListener('close', () => res(d.returnValue === 'yes'), {once:true});
  });
}

/* ---------- sound (synthesised, no files) ---------- */
let actx = null;
function tone(freq, start, dur, type='square', vol=.06){
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, actx.currentTime + start);
  g.gain.setValueAtTime(0, actx.currentTime + start);
  g.gain.linearRampToValueAtTime(vol, actx.currentTime + start + .01);
  g.gain.exponentialRampToValueAtTime(.0001, actx.currentTime + start + dur);
  o.connect(g).connect(actx.destination); o.start(actx.currentTime + start); o.stop(actx.currentTime + start + dur + .05);
}
const SFX = {
  cash(){ tone(1319,0,.08,'square'); tone(1760,.07,.22,'square'); },
  card(){ [523,659,784].forEach((f,i) => tone(f, i*.05, .12, 'triangle', .08)); },
  promo(){ [392,523,659,784,1047].forEach((f,i) => tone(f, i*.11, i===4 ? .6 : .14, 'square', .07)); tone(262,0,.7,'triangle',.05); },
  week(){ tone(659,0,.1,'triangle',.08); tone(988,.1,.25,'triangle',.08); },
  thud(){ tone(110,0,.18,'sawtooth',.05); }
};
function sfx(name){
  if (!state.prefs.sound) return;
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); SFX[name](); } catch(e){}
}

/* ---------- confetti (little cogs) ---------- */
function confetti(host = document.body){
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div'); box.className = 'confetti';
  const cols = ['#ffd23f','#ff8a1f','#ff4a2b','#3ddc97','#38e1ff','#fff1d6'];
  for (let i = 0; i < 46; i++){
    const el = document.createElement('i'), t = 2.2 + Math.random()*2;
    el.style.cssText = `left:${Math.random()*100}vw;--t:${t}s;--x:${(Math.random()-.5)*200}px;--rot:${(Math.random()-.5)*1440}deg;width:${12+Math.random()*16}px;height:auto;aspect-ratio:1;animation-delay:${Math.random()*.6}s`;
    el.innerHTML = `<svg viewBox="0 0 512 512"><use href="#gear" fill="${cols[i%cols.length]}"/></svg>`;
    box.appendChild(el);
  }
  host.appendChild(box); setTimeout(() => box.remove(), 5200);
}

/* ---------- rendering ---------- */
function setBar(fillId, wrapId, p, over=false){
  $(fillId).style.width = Math.min(100, Math.max(0, p)) + '%';
  const w = $(wrapId); if (w){ w.setAttribute('aria-valuenow', Math.round(Math.min(100, p))); w.classList.toggle('over', over); }
}
function renderLadder(){
  const v = totalMRR(), idx = rankIdx(v), r = ranks[idx], next = ranks[idx+1], last = idx === ranks.length - 1;
  const base = r ? r.threshold : 0, p = last ? 100 : (v - base) / (next.threshold - base) * 100;
  $('rank').textContent = rankLabel(r);
  $('rankSub').textContent = `Rank ${idx+1} of ${ranks.length}`;
  $('next').textContent = last ? 'MAX' : fmt(next.threshold);
  $('nextSub').textContent = last ? 'Top of the ladder' : rankLabel(next);
  $('pct').textContent = pctFmt(p);
  $('mrrSub').textContent = fmt(v) + ' total MRR';
  setBar('bar', 'barWrap', p);
  $('rankHint').textContent = last ? 'Max rank achieved. You made it to the top of the ladder.'
    : v <= 0 ? `Log your first deal — ${fmt(next.threshold)} earns your first suit.`
    : `${fmt(next.threshold - v)} until ${rankLabel(next)}.`;

  // suits
  const nextSuit = last ? -1 : next.suit;
  $('milestones').innerHTML = SUITS.map(([name, lo, hi], s) => {
    const g = ranks.filter(x => x.suit === s), top = g[g.length-1];
    const done = v >= top.threshold, cur = !done && r && r.suit === s, nx = !cur && !done && s === nextSuit;
    const pips = g.map(x => `<i class="${v >= x.threshold ? 'on' : ''}"></i>`).join('');
    return `<div class="mile ${done?'active':''} ${cur?'current':''} ${nx?'next':''}"><small>${cur?'You are here':nx?'Next suit':done?'Cleared':'Locked'}</small><b>${esc(name)}</b><div class="muted">Lv ${lo}–${hi} · ${fmtK(g[0].threshold)}–${fmtK(top.threshold)}</div><div class="pips">${pips}</div></div>`;
  }).join('');

  // deals
  const deals = [...state.deals].sort((a,b) => a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
  $('dealList').innerHTML = deals.length ? deals.map(d => `<li><span class="d">${esc(niceDate(d.date,{month:'short',day:'numeric',year:'2-digit'}))}</span><span class="c" title="${esc(d.client)}">${esc(d.client || '—')}</span><span class="m ${num(d.mrr)<0?'neg':''}">${num(d.mrr)<0?'−':''}${fmt(Math.abs(num(d.mrr)))}</span><button class="icon" data-del="${esc(d.id)}" aria-label="Delete deal ${esc(d.client)}">✕</button></li>`).join('')
    : '<li class="empty">No deals logged yet.</li>';

  // promotion log + ladder
  const promos = promotionDates(), byIdx = Object.fromEntries(promos.map(x => [x.rank.idx, x.date]));
  $('timeline').innerHTML = promos.length ? promos.slice().reverse().map(x => `<li class="${x.rank.suitStart?'suitup':''}"><span class="d">${esc(niceDate(x.date,{month:'short',day:'numeric',year:'2-digit'}))}</span><span class="c">${x.rank.suitStart?'New suit · ':''}${esc(rankLabel(x.rank))}</span><span class="d">${fmt(x.rank.threshold)}</span></li>`).join('')
    : '<li class="empty">Your promotions will be recorded here with dates.</li>';
  $('fullLadder').innerHTML = ranks.map(x => `<div class="rung ${x.idx<=idx?'active':''}"><b>${esc(rankLabel(x))}</b><span>${fmt(x.threshold)}${byIdx[x.idx] ? `<em>${esc(niceDate(byIdx[x.idx],{month:'short',year:'numeric'}))}</em>` : ''}</span></div>`).join('');
  renderGoal(v, idx);
}
function renderGoal(v, idx){
  const op = v / GOAL * 100, pc = pace(v);
  $('goalNum').innerHTML = `${fmt(Math.max(0,v))}<em>/ ${fmt(GOAL)}</em>`;
  $('goalPct').textContent = pctFmt(op);
  setBar('goalBar', 'goalBarWrap', op);
  $('paceMark').style.left = (pc.f * 100) + '%';
  $('paceMark').hidden = pc.notStarted;
  const ps = $('paceStat'); ps.className = '';
  if (pc.notStarted) ps.textContent = 'Starts ' + pc.start.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  else if (v >= GOAL) { ps.textContent = 'Goal hit!'; ps.className = 'ahead'; }
  else if (Math.abs(pc.diff) < GOAL * .005) ps.textContent = 'On pace';
  else { ps.textContent = (pc.diff > 0 ? 'Ahead ' : 'Behind ') + fmtK(Math.abs(pc.diff)); ps.className = pc.diff > 0 ? 'ahead' : 'behind'; }
  $('needStat').textContent = v >= GOAL ? '—' : fmtK((GOAL - v) / Math.max(1, pc.monthsLeft)) + '/mo';
  $('dateStat').textContent = pc.end.toLocaleDateString('en-US',{month:'short',year:'numeric'});
  $('goalLbl').textContent = `${num(state.goal.years)}-year goal · cumulative net-new MRR`;
  $('heroLine').textContent = v >= GOAL ? 'Mr. Hollywood, Level 50. You did it.' : `The climb to Mr. Hollywood, Level 50 · ${pc.daysLeft.toLocaleString()} days left.`;
  $('wantedName').textContent = 'Mr. Hollywood · Lv 50';
  $('wantedBounty').textContent = fmt(GOAL) + ' MRR';
  $('wantedBy').textContent = 'By ' + pc.end.toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'});
  document.title = `${pctFmt(op)} · Sellbot HQ`;
}
function renderWeek(){
  const w = state.week;
  ['outreach','meetings','proposals','target','notes'].forEach(k => { if (document.activeElement !== $(k)) $(k).value = w[k]; });
  if (document.activeElement !== $('closePct')) $('closePct').value = state.closePct;
  const ws = parseISO(w.start), we = new Date(ws); we.setDate(we.getDate()+6);
  $('weekOf').textContent = `Week of ${ws.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${we.toLocaleDateString('en-US',{month:'short',day:'numeric'})}`;
  renderMerits();
  // streak
  const recent = state.weeks.slice(0, 8).reverse(); let streak = 0;
  for (const x of state.weeks){ if (x.hit) streak++; else break; }
  $('streak').innerHTML = `<span>Last ${Math.max(8,recent.length)} weeks${streak ? ` · ${streak}-week streak` : ''}</span>` +
    Array.from({length:8}, (_, i) => { const x = recent[i - (8 - recent.length)]; return `<i class="${x ? (x.hit?'hit':'miss') : ''}" title="${x ? esc(niceDate(x.start)) + ': ' + x.merits + ' merits' : 'No data'}"></i>`; }).join('');
}
function renderMerits(){
  const {m, t, p} = meritCalc();
  $('merits').textContent = m.toLocaleString(); $('meritTarget').textContent = t.toLocaleString(); $('meritPct').textContent = pctFmt(p);
  setBar('meritBar', 'meritWrap', p, p > 100);
  $('progBox').style.setProperty('--g', p >= 50 ? Math.min(1, Math.max(.01, (p-50)/50)) : 0);
}
function renderLife(bump){
  const L = state.life;
  $('lifeMerits').textContent = num(L.merits).toLocaleString(); $('lifeOutreach').textContent = num(L.outreach).toLocaleString();
  $('lifeMeetings').textContent = num(L.meetings).toLocaleString(); $('lifeProposals').textContent = num(L.proposals).toLocaleString();
  $('lifeWeeks').textContent = `${state.weeks.length} week${state.weeks.length===1?'':'s'} logged`;
  const pos = state.deals.filter(d => num(d.mrr) > 0 && !/opening balance/i.test(d.client||''));
  $('lifeDeals').textContent = pos.length.toLocaleString();
  $('lifeAvg').textContent = pos.length ? fmtK(pos.reduce((a,d)=>a+num(d.mrr),0)/pos.length) : '$0';
  $('lifeBest').textContent = state.weeks.length ? Math.max(...state.weeks.map(x => num(x.merits))).toLocaleString() : '0';
  $('weekList').innerHTML = state.weeks.length ? state.weeks.map(x => `<li style="grid-template-columns:96px minmax(0,1fr) auto"><span class="d">${esc(niceDate(x.start,{month:'short',day:'numeric',year:'2-digit'}))}</span><span class="c">${num(x.merits).toLocaleString()} / ${num(x.target).toLocaleString()} merits${x.notes ? ` · <span class="muted">${esc(x.notes)}</span>` : ''}</span><span class="d" style="color:${x.hit?'var(--green)':'#ff8f7a'}">${x.hit?'HIT':'MISS'}</span></li>`).join('')
    : '<li class="empty">Close out your first week to start the record.</li>';
  if (bump) document.querySelectorAll('#h4sec ~ .statrow strong').forEach(e => { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); });
}
function renderRewards(){
  const toks = state.draws.tokens, c = state.card, v = totalMRR(), next = ranks[rankIdx(v)+1];
  if (c){
    $('reward').innerHTML = `<div class="stars">${'★ '.repeat(c.stars).trim()}</div><h3>${esc(c.name)}</h3><p>${esc(c.desc)}</p><div class="value">$${c.value}</div><p class="muted">${c.stars}-star SOS reward${c.rank ? ' · earned at ' + esc(c.rank) : ''}</p>`;
  } else {
    $('reward').innerHTML = `<div class="stars">★ ★ ★ ★ ★</div><h3>${toks.length ? 'A card awaits' : 'Deck locked'}</h3><p class="muted">${toks.length ? `You have ${toks.length} draw${toks.length>1?'s':''} waiting.` : next ? `Earn your next draw at ${esc(rankLabel(next))} (${fmt(next.threshold)}).` : 'You have drawn every card the ladder offers.'}</p>`;
  }
  const counts = {3:0,4:0,5:0}; toks.forEach(t => counts[t.tier]++);
  $('tokens').innerHTML = toks.length ? 'Draws available: ' + [5,4,3].filter(k => counts[k]).map(k => `<span class="tok">${'★'.repeat(k)} ×${counts[k]}</span>`).join('') : '';
  $('draw').disabled = !toks.length;
  $('draw').textContent = toks.length ? `Draw ${'★'.repeat(toks[0].tier)} card` : 'No draws yet';
  $('clearReward').disabled = !c;
  $('history').innerHTML = state.rewards.length ? state.rewards.map((r,i) => `<li class="${r.redeemed?'redeemed':''}"><input type="checkbox" data-redeem="${i}" ${r.redeemed?'checked':''} aria-label="Mark ${esc(r.name)} redeemed"><span class="c"><b>${esc(r.name)}</b> — ${esc(r.desc)} <span class="muted">${r.date ? '· ' + esc(niceDate(r.date,{month:'short',day:'numeric',year:'2-digit'})) : ''}</span></span><span class="d">${'★'.repeat(r.stars)} $${r.value}</span></li>`).join('')
    : '<li class="empty">No cards drawn yet.</li>';
}
function renderFooter(){
  const t = state.savedAt > 1 ? new Date(state.savedAt).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'}) : null;
  $('footer').textContent = `Sellbot HQ · ${user ? 'Cloud synced' : 'Saved in this browser'}${t ? ' · last change ' + t : ''} · Cog Nation`;
}
function renderAll(){ renderLadder(); renderWeek(); renderLife(); renderRewards(); renderFooter(); }

/* ---------- promotions & draws ---------- */
function initHighest(){ if (state.draws.highest === null || state.draws.highest === undefined){ state.draws.highest = rankIdx(totalMRR()); } }
function checkPromotions(){
  const idx = rankIdx(totalMRR()), hi = state.draws.highest;
  if (idx <= hi) return;
  const gained = [];
  for (let i = hi + 1; i <= idx; i++){ const r = ranks[i]; gained.push(r); state.draws.tokens.push({tier:tierFor(r), rank:rankLabel(r), date:todayISO()}); }
  state.draws.highest = idx;
  const top = gained[gained.length-1], newSuit = gained.find(r => r.suitStart);
  $('promoTitle').textContent = newSuit ? 'New suit!' : 'Promotion!';
  $('promoWho').textContent = rankLabel(top);
  $('promoSub').textContent = gained.length > 1 ? `${gained.length} promotions in one deal. Rank ${top.idx+1} of ${ranks.length}.` : `Rank ${top.idx+1} of ${ranks.length}.`;
  const tiers = gained.map(tierFor).sort((a,b)=>b-a);
  $('promoEarn').textContent = `Earned: ${tiers.map(t => '★'.repeat(t)).join(' + ')} SOS card${tiers.length>1?'s':''}`;
  sfx('promo');
  const d = $('promoDlg'); d.returnValue = ''; d.showModal(); confetti(d);
  d.addEventListener('close', () => { if (d.returnValue === 'draw') drawCard(); }, {once:true});
}
function drawCard(){
  const tok = state.draws.tokens.shift(); if (!tok) return;
  const pool = DECK.filter(c => c[2] === tok.tier), c = pool[Math.floor(Math.random()*pool.length)];
  state.card = {name:c[0], desc:c[1], stars:c[2], value:c[3], date:todayISO(), rank:tok.rank, redeemed:false};
  state.rewards.unshift({...state.card});
  commit(); renderRewards(); sfx('card');
  const el = $('reward'); el.classList.remove('flip'); void el.offsetWidth; el.classList.add('flip');
}

/* ---------- events ---------- */
$('dealDate').value = todayISO();
$('dealForm').addEventListener('submit', e => {
  e.preventDefault();
  const mrr = num($('dealMrr').value);
  if (!mrr){ toast('Enter an MRR amount.', 'err'); $('dealMrr').focus(); return; }
  state.deals.push({id:uid(), date:$('dealDate').value || todayISO(), client:$('dealClient').value.trim(), mrr});
  $('dealMrr').value = ''; $('dealClient').value = '';
  commit(); renderLadder(); renderLife(); renderRewards();
  if (mrr > 0) sfx('cash'); else sfx('thud');
  toast(`${mrr > 0 ? 'Deal logged' : 'Adjustment logged'}: ${mrr<0?'−':''}${fmt(Math.abs(mrr))} MRR`, 'ok');
  checkPromotions(); renderRewards(); commit();
});
$('dealList').addEventListener('click', async e => {
  const id = e.target.closest('[data-del]')?.dataset.del; if (!id) return;
  const d = state.deals.find(x => x.id === id); if (!d) return;
  if (!await confirmBox('Delete deal?', `${d.client || 'Untitled deal'} · ${fmt(d.mrr)} on ${niceDate(d.date)}. Rewards already earned are kept.`, 'Delete')) return;
  state.deals = state.deals.filter(x => x.id !== id); commit(); renderLadder(); renderLife(); renderRewards();
});
['outreach','meetings','proposals','target'].forEach(k => $(k).addEventListener('input', () => { state.week[k] = Math.max(k==='target'?1:0, num($(k).value)); renderMerits(); commit(); }));
$('notes').addEventListener('input', () => { state.week.notes = $('notes').value; commit(); });
$('closePct').addEventListener('input', () => { state.closePct = Math.min(100, Math.max(0, num($('closePct').value))); commit(); });

$('closeWeek').addEventListener('click', async () => {
  const w = state.week, {m, t} = meritCalc();
  if (!m && !w.notes.trim()){ toast('Nothing to log yet this week.'); return; }
  const cur = {merits:m, outreach:num(w.outreach), meetings:num(w.meetings), proposals:num(w.proposals)};
  Object.keys(cur).forEach(k => state.life[k] = Math.max(0, num(state.life[k]) + cur[k] - num(state.logged[k])));
  state.weeks.unshift({start:w.start, closed:todayISO(), merits:m, target:t, hit:m >= t, ...cur, closePct:state.closePct, notes:w.notes.trim()});
  const thisMon = mondayOf(), ws = parseISO(w.start), nextStart = new Date(thisMon); if (ws >= thisMon) nextStart.setDate(nextStart.getDate()+7);
  state.week = {...blankWeek(), start:iso(nextStart), target:t};
  state.logged = zero4();
  commit(); renderWeek(); renderLife(true); sfx('week');
  toast(`Week logged: +${m.toLocaleString()} merits${m >= t ? ' · target hit!' : ''}`, 'ok');
});
$('copyReport').addEventListener('click', () => {
  const {m, t, p} = meritCalc(), v = totalMRR(), r = ranks[rankIdx(v)], pc = pace(v), w = state.week;
  const text = [
    'SELLBOT HQ — WEEKLY REPORT', $('weekOf').textContent, '',
    `Merits: ${m.toLocaleString()} / ${t.toLocaleString()} (${pctFmt(p)})`,
    `Outreach attempts: ${w.outreach}`, `Qualified meetings: ${w.meetings}`, `Proposals delivered: ${w.proposals}`, `Close rate: ${state.closePct}%`, '',
    `Rank: ${rankLabel(r)} (${rankIdx(v)+1} of ${ranks.length})`,
    `Cumulative net-new MRR: ${fmt(v)} of ${fmt(GOAL)} (${pctFmt(v/GOAL*100)})`,
    `Pace: ${$('paceStat').textContent} · need ${$('needStat').textContent}`, '',
    `Notes: ${w.notes || '(none)'}`].join('\n');
  copyText(text);
});
async function copyText(text){
  try { await navigator.clipboard.writeText(text); toast('Report copied to clipboard.', 'ok'); return; } catch(e){}
  const ta = document.createElement('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); toast('Report copied to clipboard.', 'ok'); } catch(e){ toast('Copy failed — your browser blocked clipboard access.', 'err'); }
  ta.remove();
}
$('resetLife').addEventListener('click', async () => {
  if (!await confirmBox('Reset lifetime totals?', 'This zeroes lifetime merits and activity and clears the past-weeks record. Deals and rewards are not affected. Export a backup first if unsure.', 'Reset')) return;
  state.life = zero4(); state.weeks = []; state.logged = zero4(); commit(); renderWeek(); renderLife();
});
$('draw').addEventListener('click', drawCard);
$('clearReward').addEventListener('click', () => { state.card = null; commit(); renderRewards(); });
$('history').addEventListener('change', e => {
  const i = e.target.dataset.redeem; if (i === undefined) return;
  state.rewards[i].redeemed = e.target.checked; commit(); renderRewards();
});

/* settings */
function applyPrefs(){
  document.documentElement.classList.toggle('calm', state.prefs.ambience === 'calm');
  $('soundChip').setAttribute('aria-pressed', state.prefs.sound); $('soundIcon').textContent = state.prefs.sound ? '🔊' : '🔇';
}
$('soundChip').addEventListener('click', () => { state.prefs.sound = !state.prefs.sound; applyPrefs(); persistLocal(); if (state.prefs.sound) sfx('card'); toast(state.prefs.sound ? 'Sound on' : 'Sound off'); });
$('settingsChip').addEventListener('click', () => {
  $('setGoal').value = state.goal.amount; $('setStart').value = state.goal.start; $('setYears').value = state.goal.years;
  document.querySelectorAll('input[name=amb]').forEach(r => r.checked = r.value === state.prefs.ambience);
  $('settingsDlg').returnValue = ''; $('settingsDlg').showModal();
});
$('settingsDlg').addEventListener('close', () => {
  if ($('settingsDlg').returnValue !== 'save') return;
  const amt = Math.max(1000, num($('setGoal').value) || 300000), start = $('setStart').value || state.goal.start, years = Math.min(40, Math.max(1, Math.round(num($('setYears').value) || 5)));
  const goalChanged = amt !== state.goal.amount;
  state.goal = {amount:amt, start, years};
  state.prefs.ambience = document.querySelector('input[name=amb]:checked')?.value || 'full';
  buildRanks(amt);
  if (goalChanged) state.draws.highest = rankIdx(totalMRR()); // rescaling isn't a promotion
  applyPrefs(); commit(); renderAll(); toast('Settings saved.', 'ok');
});
$('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(payload(), null, 2)], {type:'application/json'}), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `sellbot-hq-backup-${todayISO()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    $('settingsDlg').close();
    if (!await confirmBox('Import backup?', 'This replaces everything currently on the dashboard (and in the cloud, if signed in).', 'Import')) return;
    state = migrate(data); buildRanks(state.goal.amount); initHighest(); applyPrefs(); commit(); renderAll(); toast('Backup imported.', 'ok');
  } catch(err){ toast('That file is not a valid Sellbot HQ backup.', 'err'); }
});

/* account popover */
function setChip(kind, label){ const c = $('acctChip'); c.classList.toggle('on', kind === 'on'); c.classList.toggle('warn', kind === 'warn'); $('acctLbl').textContent = label; }
function setAuthStatus(html){ $('authStatus').innerHTML = html; }
$('acctChip').addEventListener('click', e => { e.stopPropagation(); const p = $('acctPop'), open = p.hidden; p.hidden = !open; $('acctChip').setAttribute('aria-expanded', open); if (open && !user) setTimeout(() => $('email').focus(), 30); });
document.addEventListener('click', e => { if (!$('acctPop').hidden && !e.target.closest('#acctPop')) { $('acctPop').hidden = true; $('acctChip').setAttribute('aria-expanded', false); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('acctPop').hidden){ $('acctPop').hidden = true; $('acctChip').focus(); } });
$('authForm').addEventListener('submit', async e => {
  e.preventDefault(); if (!sb) return setAuthStatus('Cloud sync is not configured. See <b>config.js</b>.');
  setAuthStatus('Signing in…');
  const {error} = await sb.auth.signInWithPassword({email:$('email').value.trim(), password:$('password').value});
  if (error) setAuthStatus(esc(error.message));
});
$('signUp').addEventListener('click', async () => {
  if (!sb) return setAuthStatus('Cloud sync is not configured. See <b>config.js</b>.');
  if (!$('authForm').reportValidity()) return;
  const {error} = await sb.auth.signUp({email:$('email').value.trim(), password:$('password').value});
  setAuthStatus(error ? esc(error.message) : 'Account created. Check your email if confirmation is enabled, then sign in.');
});
$('signOut').addEventListener('click', async () => { if (sb) await sb.auth.signOut({scope:'local'}); });
$('syncNow').addEventListener('click', async () => { await pullCloud(); });

async function updateAuth(session){
  const was = user?.id; user = session?.user || null;
  $('authForm').hidden = !!user; $('signedIn').hidden = !user;
  if (user){
    setChip('on', 'Synced'); $('password').value = '';
    setAuthStatus(`Signed in as <b>${esc(user.email)}</b>. Changes sync automatically.`);
    if (was !== user.id) await pullCloud();
  } else {
    setChip('', 'Local only');
    setAuthStatus('Sign in to sync your Sellbot HQ data across devices. Without an account, data stays in this browser.');
  }
  renderFooter();
}
async function initAuth(){
  const cfg = window.SELLBOT_CONFIG || {}, url = cfg.SUPABASE_URL || '', key = cfg.SUPABASE_PUBLISHABLE_KEY || '';
  if (!url || !key || url.startsWith('YOUR_') || key.startsWith('YOUR_')){ setChip('warn', 'Setup needed'); setAuthStatus('Cloud sync is off. Copy <b>config.example.js</b> to <b>config.js</b> and add your Supabase URL and publishable key.'); return; }
  if (!window.supabase){ setChip('warn', 'Offline'); setAuthStatus('Could not load the Supabase library. Check your connection and refresh.'); return; }
  sb = window.supabase.createClient(url, key);
  const {data} = await sb.auth.getSession();
  await updateAuth(data.session);
  sb.auth.onAuthStateChange((_e, session) => { if ((session?.user?.id) !== user?.id) updateAuth(session); });
}

/* week rollover check */
function checkWeek(){
  const w = state.week, ws = parseISO(w.start), thisMon = mondayOf();
  if (ws < thisMon){
    const hasActivity = meritCalc().m || w.notes.trim();
    if (!hasActivity){ w.start = iso(thisMon); persistLocal(); }
    else toast(`Your week of ${ws.toLocaleDateString('en-US',{month:'short',day:'numeric'})} is still open — close it out to log it.`);
  }
}

/* ambience: pause when hidden; re-check cloud on return */
document.addEventListener('visibilitychange', () => {
  document.documentElement.classList.toggle('paused', document.hidden);
  if (!document.hidden && user && state.savedAt <= lastSynced) pullCloud({quiet:true});
});

/* boot */
initHighest(); applyPrefs(); renderAll(); checkWeek();
if (state.migrated){ delete state.migrated; persistLocal(); setTimeout(() => toast('Upgraded your data. Your MRR is now an opening-balance deal — set your goal start date in Settings.'), 600); }
initAuth();
})();
