'use strict';
/* =========================================================
 *  찰랑찰랑 미용실 예약 – 프론트엔드 (Vanilla JS)
 * ========================================================= */

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const fmtDate = s => { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}(${WD[d.getDay()]})`; };
const fmtLong = s => { const d = parseYmd(s); return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`; };
const toMin = t => { const [h, m] = String(t).split(':').map(Number); return h * 60 + (m || 0); };
const toTime = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const daysBetween = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes(); };
const durLabel = m => m < 60 ? `${m}분` : (m % 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m / 60}시간`);
const digits = s => String(s || '').replace(/\D/g, '');
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function normTime(v) {
  v = String(v || '').trim();
  let m = v.match(/^(\d{1,2})[:시 ]?\s*(\d{1,2})?분?$/);
  if (!m) return v;
  let h = +m[1], mi = m[2] ? +m[2] : 0;
  if (!m[2] && v.length === 3) { h = +v[0]; mi = +v.slice(1); }
  if (!m[2] && v.length === 4 && /^\d{4}$/.test(v)) { h = +v.slice(0, 2); mi = +v.slice(2); }
  if (h > 23 || mi > 59) return v;
  return `${pad(h)}:${pad(mi)}`;
}
const validTime = v => /^\d{2}:\d{2}$/.test(v) && toMin(v) < 1440;
function fmtPhone(v) {
  const d = digits(v);
  if (/^02/.test(d)) return d.length > 9 ? d.replace(/^(02)(\d{4})(\d{4})$/, '$1-$2-$3') : d.replace(/^(02)(\d{3})(\d{4})$/, '$1-$2-$3');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{4})(\d{4})$/, '$1-$2-$3');
  if (d.length === 10) return d.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3');
  return v.trim();
}

/* ---------- 한글 검색 / 유사 이름 ---------- */
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const chosung = s => [...s].map(c => { const k = c.charCodeAt(0) - 0xAC00; return k >= 0 && k < 11172 ? CHO[Math.floor(k / 588)] : c; }).join('');
function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}
function score(q, s) {
  q = q.trim().toLowerCase(); s = String(s).toLowerCase();
  if (!q) return 1;
  if (s.startsWith(q)) return 4;
  if (s.includes(q)) return 3;
  if (/^[ㄱ-ㅎ]+$/.test(q) && chosung(s).includes(q)) return 2;
  return 0;
}
function similar(q, s) {
  q = q.trim(); if (q.length < 2 || q === s) return false;
  if (lev(q, s) <= 1) return true;
  // 성을 뺀 이름이 같거나, 받침/모음 하나 차이 등
  return q.length >= 3 && s.length >= 3 && q.slice(1) === s.slice(1);
}

/* ---------- 상태 ---------- */
const S = {
  me: null, shop: null, settings: null, users: [], services: [], statuses: [], customers: [], sugg: {},
  tab: 'day', date: today(), staffFilter: 'all', dayMode: lsGet('crcr_daymode') || 'tl',
  cache: {}, free: { from: today(), days: 3, staff: 'all', len: 60, svc: '', mode: 'range', sel: new Set() },
};
function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { } }

/* ---------- API ---------- */
async function api(a, body, params) {
  let url = 'api.php?a=' + encodeURIComponent(a);
  if (params) url += '&' + new URLSearchParams(params);
  const opt = { credentials: 'same-origin', headers: { 'X-Req': '1' } };
  if (body instanceof FormData) { opt.method = 'POST'; opt.body = body; }
  else if (body !== undefined) { opt.method = 'POST'; opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let r;
  try { r = await fetch(url, opt); } catch { throw new Error('서버에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.'); }
  let j = {};
  try { j = await r.json(); } catch { }
  if (r.status === 401 && a !== 'login' && a !== 'password') { setTimeout(boot, 50); }
  if (!r.ok || j.error) throw new Error(j.error || ('오류가 발생했습니다 (' + r.status + ')'));
  return j;
}
async function run(fn) {
  try { return await fn(); } catch (e) { console.error(e); toast(e.message || String(e)); }
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- 공통 조회 ---------- */
const logoUrl = () => 'api.php?a=logo&v=' + encodeURIComponent(S.settings?.logo_ver || S.shop?.logo_ver || 1);
const userOf = id => S.users.find(u => u.id === id) || { id, name: '(삭제된 계정)', color: '#999999' };
const statusOf = id => S.statuses.find(s => +s.id === +id);
const staffList = () => { const s = S.users.filter(u => u.is_staff); return s.length ? s : S.users; };
const hoursOf = date => S.settings.hours[parseYmd(date).getDay()] || { closed: true };
const blocks = r => r.kind === 'away' || !statusOf(r.status_id) || !!+statusOf(r.status_id).blocks;
const canEdit = r => S.me.is_admin || S.settings.allow_edit_others || r.created_by === S.me.id || r.staff_id === S.me.id;
const findSched = id => { for (const d in S.cache) { const r = S.cache[d].find(x => x.id === id); if (r) return r; } return null; };
function addSugg(kind, v) {
  v = String(v || '').trim(); if (!v) return;
  const a = (S.sugg[kind] ||= []);
  const i = a.indexOf(v); if (i >= 0) a.splice(i, 1);
  a.unshift(v);
}
const tint = c => (/^#[0-9a-f]{6}$/i.test(c) ? c + '22' : '#f5f3ff');

async function fetchRange(from, to) {
  const j = await api('schedules', undefined, { from, to });
  for (let d = from; d <= to; d = addDays(d, 1)) S.cache[d] = [];
  for (const r of j.schedules) (S.cache[r.date] ||= []).push(r);
}
async function ensureDate(d) { if (!S.cache[d]) await fetchRange(d, d); }

/* ---------- 빈 시간 계산 ---------- */
const bufferOf = min => S.settings.break_per_hour ? Math.ceil(min * S.settings.break_per_hour / 60 / 5) * 5 : 0;
function busyFor(date, staff, excludeId) {
  if (date < today()) return null;
  const h = hoursOf(date);
  if (!h || h.closed) return null;
  const busy = [];
  const ls = staff.lunch_start || S.settings.lunch_start, le = staff.lunch_start ? staff.lunch_end : S.settings.lunch_end;
  if (ls && le) busy.push([toMin(ls), toMin(le)]);
  for (const b of S.settings.breaks || []) busy.push([toMin(b.start), toMin(b.end)]);
  for (const r of S.cache[date] || []) {
    if (r.staff_id !== staff.id || r.id === excludeId || !blocks(r)) continue;
    const s = toMin(r.start);
    busy.push([s, s + r.minutes + (r.kind === 'appt' ? bufferOf(r.minutes) : 0)]);
  }
  if (date === today()) busy.push([0, nowMin()]);
  return { open: toMin(h.open), close: toMin(h.close), busy };
}
function freeStarts(date, staff, len, excludeId) {
  const b = busyFor(date, staff, excludeId);
  if (!b) return [];
  const step = S.settings.slot_step || 30, buf = bufferOf(len), res = [];
  for (let t = Math.ceil(b.open / step) * step; t + len <= b.close; t += step) {
    const end = Math.min(t + len + buf, b.close);
    if (!b.busy.some(([s, e]) => t < e && s < end)) res.push(t);
  }
  return res;
}
function freeSlots(date, staffArr, len) {
  const set = new Set();
  for (const u of staffArr) freeStarts(date, u, len).forEach(t => set.add(t));
  const starts = [...set].sort((a, b) => a - b);
  if (S.free.mode === 'start') return starts.map(t => ({ a: t, b: t + len }));
  const step = S.settings.slot_step || 30, out = [];
  for (const t of starts) {
    const last = out[out.length - 1];
    if (last && t - last.lastStart === step) { last.lastStart = t; last.b = t + len; }
    else out.push({ a: t, b: t + len, lastStart: t });
  }
  return out;
}

/* =========================================================
 *  자동완성 (모든 입력란 – 종류별 목록)
 * ========================================================= */
const AC = { el: null, box: null, items: [], idx: -1 };
const TIMES = Array.from({ length: 144 }, (_, i) => toTime(i * 10));
const DURS = Array.from({ length: 48 }, (_, i) => (i + 1) * 10);
const DEFAULT_AWAY = ['개인 용무', '병원', '교육', '외근', '휴무', '식사'];

function acSource(kind, q, el) {
  const typed = el.dataset.typed === '1';
  const qq = typed ? q.trim() : '';
  if (kind === 'customer') return acCustomers(q.trim(), typed);
  if (kind === 'time') {
    const dq = digits(qq);
    let list = TIMES.filter(t => !dq || digits(t).startsWith(dq) || digits(t).startsWith('0' + dq));
    return list.map(t => ({ value: t, label: t, cur: t === el.value }));
  }
  if (kind === 'duration' || kind === 'minutes') {
    const base = kind === 'minutes' ? [0, 5, 10, 15, 20, 30] : DURS;
    const dq = digits(qq);
    return base.filter(m => !dq || String(m).startsWith(dq)).map(m => ({ value: String(m), label: `${m}분`, sub: m >= 60 ? durLabel(m) : '', cur: String(m) === el.value }));
  }
  if (kind === 'phone') {
    const map = new Map();
    S.customers.forEach(c => c.phone && !map.has(c.phone) && map.set(c.phone, c.name));
    (S.sugg.phone || []).forEach(p => !map.has(p) && map.set(p, ''));
    const dq = digits(qq);
    return [...map].filter(([p, n]) => !qq || digits(p).includes(dq || '#') || (n && score(qq, n)))
      .slice(0, 50).map(([p, n]) => ({ value: p, label: p, sub: n, data: n }));
  }
  let base = [];
  if (kind === 'service') base = [...new Set([...S.services.map(s => s.name), ...(S.sugg.service || [])])];
  else if (kind === 'login_id') base = JSON.parse(lsGet('crcr_ids') || '[]');
  else if (kind === 'away') base = [...new Set([...(S.sugg.away || []), ...DEFAULT_AWAY])];
  else if (kind === 'status') base = [...new Set([...S.statuses.map(s => s.name), '임시', '확정', '변경됨', '취소됨', '통화함', '문자 전송함', '노쇼', '방문 완료', ...(S.sugg.status || [])])];
  else if (kind === 'name') base = [...new Set([...S.users.map(u => u.name), ...(S.sugg.name || [])])];
  else if (kind === 'username') base = [...new Set([...S.users.map(u => u.username), ...(S.sugg.username || [])])];
  else if (kind === 'shop_name') base = [...new Set([S.settings?.shop_name || S.shop?.name, '찰랑찰랑', ...(S.sugg.shop_name || [])].filter(Boolean))];
  else if (kind === 'logq') base = [...new Set(['일정 추가', '일정 수정', '일정 삭제', '상태 변경', '부재 추가', '부재 수정', '부재 삭제', '설정 변경', '계정 추가', '계정 수정', '계정 삭제', '고객 수정', ...S.users.map(u => u.name)])];
  else if (kind === 'cust_search') return acCustomers(q.trim(), true);
  else base = S.sugg[kind] || [];
  return base.map((v, i) => ({ v, s: score(qq, v), i })).filter(x => x.s > 0 && x.v !== q)
    .sort((a, b) => b.s - a.s || a.i - b.i).slice(0, 40).map(x => ({ value: x.v, label: x.v }));
}

function acCustomers(q, typed) {
  const t = today(), dq = digits(q), res = [];
  S.customers.forEach((c, i) => {
    let s = typed ? score(q, c.name) : 1, sim = false;
    if (!s && dq.length >= 3 && digits(c.phone).includes(dq)) s = 2;
    if (!s && typed && similar(q, c.name)) { s = 1; sim = true; }
    if (s) res.push({ c, s, sim, i });
  });
  res.sort((a, b) => b.s - a.s || a.i - b.i);
  return res.slice(0, 40).map(({ c, sim }) => ({
    value: c.name, label: c.name, data: c, tag: sim ? '비슷한 이름' : '',
    sub: [c.phone, c.last_date ? `${daysBetween(c.last_date, t)}일 전` : (c.next_date ? '예약됨' : '신규'), c.visits ? `${c.visits}회` : ''].filter(Boolean).join(' · '),
  }));
}

function acOpen(el) {
  acClose();
  const items = acSource(el.dataset.ac, el.value, el);
  if (!items.length) return;
  const wrap = el.closest('.ac-wrap') || el.parentElement;
  if (!wrap.classList.contains('ac-wrap')) wrap.style.position = 'relative';
  const box = document.createElement('div');
  box.className = 'ac-list';
  box.innerHTML = items.map((it, i) => `<div class="ac-item${it.cur ? ' act' : ''}" data-i="${i}"><span class="l">${esc(it.label)}${it.tag ? `<span class="tag">${esc(it.tag)}</span>` : ''}</span>${it.sub ? `<span class="s">${esc(it.sub)}</span>` : ''}</div>`).join('');
  box.addEventListener('pointerdown', e => e.preventDefault());
  box.addEventListener('mousedown', e => e.preventDefault());
  box.addEventListener('click', e => { const d = e.target.closest('.ac-item'); if (d) acPick(+d.dataset.i); });
  wrap.appendChild(box);
  Object.assign(AC, { el, box, items, idx: items.findIndex(i => i.cur) });
  const cur = box.querySelector('.act');
  if (cur) box.scrollTop = cur.offsetTop - 60;
}
function acClose() { AC.box?.remove(); Object.assign(AC, { el: null, box: null, items: [], idx: -1 }); }
function acPick(i) {
  const it = AC.items[i], el = AC.el;
  if (!it || !el) return;
  el.value = it.value;
  el.dataset.typed = '0';
  acClose();
  el.dispatchEvent(new CustomEvent('acpick', { detail: it, bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
document.addEventListener('focusin', e => { const t = e.target; if (t.matches?.('[data-ac]')) { t.dataset.typed = '0'; acOpen(t); } });
document.addEventListener('input', e => { const t = e.target; if (t.matches?.('[data-ac]')) { t.dataset.typed = '1'; acOpen(t); } });
document.addEventListener('focusout', e => {
  const t = e.target;
  if (t === AC.el) setTimeout(() => { if (document.activeElement !== t) acClose(); }, 250);
  if (t.matches?.('[data-ac="time"]')) { const v = normTime(t.value); if (v !== t.value) { t.value = v; t.dispatchEvent(new Event('change', { bubbles: true })); } }
  if (t.matches?.('[data-ac="phone"]')) t.value = fmtPhone(t.value);
});
document.addEventListener('keydown', e => {
  if (!AC.box || e.target !== AC.el) return;
  const n = AC.items.length;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    AC.idx = (AC.idx + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
    $$('.ac-item', AC.box).forEach((d, i) => d.classList.toggle('act', i === AC.idx));
    AC.box.children[AC.idx]?.scrollIntoView({ block: 'nearest' });
  } else if (e.key === 'Enter' && AC.idx >= 0) { e.preventDefault(); acPick(AC.idx); }
  else if (e.key === 'Escape') acClose();
});

/* ---------- 폼 헬퍼 ---------- */
function inp(name, value = '', ac = '', o = {}) {
  return `<div class="ac-wrap"><input type="${o.type || 'text'}" name="${name}" value="${esc(value)}" ${ac ? `data-ac="${ac}"` : ''} autocomplete="off" placeholder="${esc(o.ph || '')}" ${o.attrs || ''}></div>`;
}
function tarea(name, value = '', ac = '', o = {}) {
  return `<div class="ac-wrap"><textarea name="${name}" ${ac ? `data-ac="${ac}"` : ''} autocomplete="off" placeholder="${esc(o.ph || '')}" rows="${o.rows || 3}">${esc(value)}</textarea></div>`;
}
const fld = (label, inner, cls = '') => `<div class="f ${cls}"><span>${label}</span>${inner}</div>`;
const timeInp = (name, v) => inp(name, v, 'time', { attrs: 'inputmode="numeric"', ph: '00:00' });
function formData(root) {
  const o = {};
  $$('input[name], textarea[name], select[name]', root).forEach(el => {
    o[el.name] = el.type === 'checkbox' ? (el.checked ? 1 : 0) : el.value.trim();
  });
  return o;
}

/* =========================================================
 *  바텀 시트 (안드로이드 뒤로가기로 닫힘)
 * ========================================================= */
const sheetStack = [];
const popWaiters = [];
window.addEventListener('popstate', () => {
  const bg = sheetStack.pop();
  if (bg) { bg.remove(); bg._onclose?.(); }
  if (!sheetStack.length) document.body.style.overflow = '';
  popWaiters.shift()?.();
});
function closeTop() {
  return new Promise(res => {
    if (!sheetStack.length) return res();
    popWaiters.push(res);
    history.back();
  });
}
function openSheet({ title, body, foot = '', onclose }) {
  acClose();
  const bg = document.createElement('div');
  bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog"><div class="sheet-h"><h2>${title}</h2><button type="button" class="sheet-x" aria-label="닫기">✕</button></div>
    <div class="sheet-b">${body}</div>${foot ? `<div class="sheet-f">${foot}</div>` : ''}</div>`;
  $('#sheets').appendChild(bg);
  bg._onclose = onclose;
  sheetStack.push(bg);
  history.pushState({ sheet: sheetStack.length }, '');
  document.body.style.overflow = 'hidden';
  bg.addEventListener('click', e => { if (e.target === bg) closeTop(); });
  bg.querySelector('.sheet-x').onclick = () => closeTop();
  const el = bg.querySelector('.sheet');
  el.close = closeTop;
  return el;
}
function clearSheets() { sheetStack.splice(0).forEach(b => b.remove()); document.body.style.overflow = ''; }

/* =========================================================
 *  시작 / 로그인
 * ========================================================= */
const app = () => $('#app');

async function boot() {
  let j;
  try { j = await api('bootstrap'); }
  catch (e) { app().innerHTML = `<div class="auth"><p class="c">${esc(e.message)}</p><button class="btn block" onclick="boot()">다시 시도</button></div>`; return; }
  S.shop = j.shop;
  S.setupCode = !!j.setupCode;
  clearSheets();
  if (j.needSetup) return renderSetup();
  if (!j.me) return renderLogin();
  Object.assign(S, { me: j.me, settings: j.settings, users: j.users, services: j.services, statuses: j.statuses, customers: j.customers, sugg: j.suggestions || {} });
  S.statuses.forEach(s => { s.id = +s.id; s.blocks = +s.blocks; });
  S.services.forEach(s => { s.id = +s.id; s.minutes = +s.minutes; });
  renderShell();
  go(S.tab);
}

/** 앱 안 브라우저(카카오톡 등)일 때 외부 브라우저로 열기 안내 */
function inAppBanner() {
  if (!IN_APP) return '';
  return `<div class="inapp">⚠️ 앱 안의 브라우저에서는 공유·로그인 유지가 잘 안 돼요.
    <button type="button" class="btn sm pri" onclick="if(!window.openExternal||!openExternal())toast('오른쪽 위 ⋮ 또는 ⋯ 메뉴에서 「다른 브라우저로 열기」/「Safari로 열기」를 눌러 주세요.')">외부 브라우저로 열기</button></div>`;
}

function authHead(sub) {
  return inAppBanner() + `<img class="logo-big" src="${logoUrl()}" alt="" onerror="this.style.display='none'"><h1>${esc(S.shop.name)}</h1><p class="c">${sub}</p>`;
}

function renderSetup() {
  app().innerHTML = `<div class="auth">${authHead('처음 사용하시네요! 관리자 계정을 만들어 주세요.<br>처음 만든 계정이 <b>관리자</b>가 됩니다.')}
    <form class="card" id="setupF">
      ${S.setupCode ? fld('설치 코드 (NAS 설정의 SETUP_CODE)', `<input type="password" name="setup_code" autocomplete="off" placeholder="설치할 때 정한 코드">`) : ''}
      ${fld('미용실 이름', inp('shop_name', S.shop.name, 'shop_name'))}
      ${fld('내 이름 (표시 이름)', inp('name', '', 'name', { ph: '예: 김원장' }))}
      ${fld('아이디', inp('username', '', 'username', { ph: '로그인할 때 쓸 아이디', attrs: 'autocapitalize="off"' }))}
      ${fld('비밀번호', `<input type="password" name="password" autocomplete="new-password" placeholder="6자 이상">`)}
      ${fld('비밀번호 확인', `<input type="password" name="password2" autocomplete="new-password">`)}
      <button class="btn pri block">관리자 계정 만들기</button>
    </form></div>`;
  $('#setupF').onsubmit = e => {
    e.preventDefault();
    run(async () => {
      const d = formData(e.target);
      if (d.password !== d.password2) throw new Error('비밀번호 확인이 일치하지 않습니다.');
      await api('setup', d);
      rememberId(d.username);
      await boot();
    });
  };
}

function rememberId(id) {
  const ids = JSON.parse(lsGet('crcr_ids') || '[]').filter(x => x !== id);
  ids.unshift(id);
  lsSet('crcr_ids', JSON.stringify(ids.slice(0, 10)));
}

function renderLogin() {
  const last = JSON.parse(lsGet('crcr_ids') || '[]')[0] || '';
  app().innerHTML = `<div class="auth">${authHead('로그인하면 이 기기에서 계속 사용할 수 있어요.')}
    <form class="card" id="loginF">
      ${fld('아이디', inp('username', last, 'login_id', { attrs: 'autocapitalize="off"' }))}
      ${fld('비밀번호', `<input type="password" name="password" autocomplete="current-password">`)}
      <button class="btn pri block">로그인</button>
    </form>
    <p class="c muted">비밀번호를 바꾸기 전까지 로그인이 유지됩니다.</p></div>`;
  $(last ? '#loginF [name=password]' : '#loginF [name=username]').focus();
  $('#loginF').onsubmit = e => {
    e.preventDefault();
    run(async () => {
      const d = formData(e.target);
      await api('login', d);
      rememberId(d.username);
      await boot();
    });
  };
}

/* =========================================================
 *  메인 화면
 * ========================================================= */
const TABS = [['day', '📅', '일정'], ['free', '🕒', '빈 시간'], ['cust', '👥', '고객'], ['set', '⚙️', '설정']];

function renderShell() {
  app().innerHTML = `
    <header class="top">
      <img class="logo" src="${logoUrl()}" alt="" onerror="this.style.display='none'">
      <div class="shop">${esc(S.settings.shop_name)}</div>
      <div class="me"><span class="dot" style="background:${esc(S.me.color)}"></span>${esc(S.me.name)}${S.me.is_admin ? ' <small>(관리자)</small>' : ''}</div>
    </header>
    ${inAppBanner()}
    <main id="view"></main>
    <div id="fab"></div>
    <nav class="tabs">${TABS.map(([k, ic, l]) => `<button type="button" data-act="tab" data-tab="${k}"><span class="ic">${ic}</span>${l}</button>`).join('')}</nav>`;
  document.title = S.settings.shop_name + ' 예약';
}

function go(tab) {
  S.tab = tab;
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  acClose();
  window.scrollTo(0, 0);
  render();
}

let rendering = false;
async function render() {
  if (rendering) return;
  rendering = true;
  try {
    $('#fab').innerHTML = '';
    // 이전 화면에서 붙인 이벤트가 남지 않도록 #view 를 새로 만든다
    const old = $('#view'), nv = old.cloneNode(false);
    old.replaceWith(nv);
    await run({ day: viewDay, free: viewFree, cust: viewCust, set: viewSet }[S.tab]);
  } finally { rendering = false; }
}

/* ---------- 이벤트 위임 ---------- */
const ACT = {
  tab: el => go(el.dataset.tab),
  'date-prev': () => { S.date = addDays(S.date, -1); render(); },
  'date-next': () => { S.date = addDays(S.date, 1); render(); },
  'date-today': () => { S.date = today(); render(); },
  'day-set': el => { S.date = el.dataset.d; render(); },
  'staff-filter': el => { S.staffFilter = el.dataset.v; render(); },
  mode: () => { S.dayMode = S.dayMode === 'tl' ? 'list' : 'tl'; lsSet('crcr_daymode', S.dayMode); render(); },
  sched: el => openDetail(+el.dataset.id),
  'tl-tap': (el, e) => {
    const rect = el.getBoundingClientRect();
    const step = S.settings.slot_step || 30;
    const m = +el.dataset.start + Math.floor((e.clientY - rect.top) / PX / step) * step;
    openApptForm({ staff_id: +el.dataset.staff, date: S.date, start: toTime(m) });
  },
  'new-appt': () => openApptForm({ date: S.tab === 'day' ? S.date : today() }),
  'new-away': () => openAwayForm({ date: S.tab === 'day' ? S.date : today() }),
  link: () => { },
};
document.addEventListener('click', e => {
  if (e.target.matches?.('input[type=date]')) { try { e.target.showPicker?.(); } catch { } }
  const t = e.target.closest('[data-act]');
  if (!t || t.closest('.ac-list')) return;
  const f = ACT[t.dataset.act];
  if (f) f(t, e);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.change === 'date-pick' && t.value) { S.date = t.value; render(); }
});

/* =========================================================
 *  일정 (하루)
 * ========================================================= */
const PX = 1.6; // 1분당 픽셀

function fabHTML() {
  return `<div class="fab-wrap"><button type="button" class="fab sub" data-act="new-away">🚫 부재 추가</button><button type="button" class="fab" data-act="new-appt">＋ 예약</button></div>`;
}

function visibleStaff() {
  const st = staffList();
  if (S.staffFilter === 'all') return st;
  const u = S.users.find(u => u.id === +S.staffFilter);
  return u ? [u] : st;
}

async function viewDay() {
  const d = S.date, t = today();
  const ws = addDays(d, -parseYmd(d).getDay()), we = addDays(ws, 6);
  await fetchRange(ws, we);
  const staff = visibleStaff();
  const ids = new Set(staff.map(u => u.id));
  const all = S.cache[d] || [];
  const rows = S.staffFilter === 'all' ? all : all.filter(r => ids.has(r.staff_id));
  const h = hoursOf(d);
  let week = '';
  for (let i = 0; i < 7; i++) {
    const dd = addDays(ws, i), dt = parseYmd(dd);
    const n = (S.cache[dd] || []).filter(r => r.kind === 'appt' && blocks(r) && (S.staffFilter === 'all' || ids.has(r.staff_id))).length;
    week += `<button type="button" data-act="day-set" data-d="${dd}" class="${dd === d ? 'on' : ''} ${dd === t ? 'today' : ''} ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${WD[i]}<b>${dt.getDate()}</b><span class="cnt">${n ? n + '건' : ''}</span></button>`;
  }
  const staffChips = [`<button type="button" class="chip ${S.staffFilter === 'all' ? 'on' : ''}" data-act="staff-filter" data-v="all">전체</button>`]
    .concat(staffList().map(u => `<button type="button" class="chip ${+S.staffFilter === u.id ? 'on' : ''}" data-act="staff-filter" data-v="${u.id}"><span class="dot" style="background:${esc(u.color)}"></span>${esc(u.name)}</button>`)).join('');
  $('#view').innerHTML = `
    <div class="datebar">
      <button type="button" class="nav" data-act="date-prev" aria-label="이전 날">‹</button>
      <div class="cur">${fmtLong(d)}${d === t ? ' · 오늘' : ''}<input type="date" value="${d}" data-change="date-pick" aria-label="날짜 선택"></div>
      <button type="button" class="nav" data-act="date-next" aria-label="다음 날">›</button>
    </div>
    <div class="week">${week}</div>
    <div class="toolbar">
      <div class="chips scroll">${staffChips}</div>
      ${d !== t ? '<button type="button" class="btn sm" data-act="date-today">오늘</button>' : ''}
      <button type="button" class="btn sm" data-act="mode">${S.dayMode === 'tl' ? '📋 목록' : '⏱ 시간표'}</button>
    </div>
    ${h.closed ? '<div class="card muted">📌 이 날은 휴무일로 설정되어 있습니다.</div>' : ''}
    ${S.dayMode === 'tl' ? timelineHTML(d, all, staff) : listHTML(rows)}`;
  $('#fab').innerHTML = fabHTML();
  syncTlHeader();
  if (S.dayMode === 'tl' && d === t && !viewDay.scrolled) {
    viewDay.scrolled = true;
    const now = $('.tl-now');
    if (now) window.scrollTo(0, Math.max(0, now.getBoundingClientRect().top + window.scrollY - 220));
  }
}

// 시간표 담당자 이름 줄: 세로 스크롤 시 상단에 고정, 가로 스크롤은 본문과 같이 움직임
function syncTlHeader() {
  const hdr = $('.tl-hdr'), body = $('.tl-scroll'), top = $('.top');
  if (!hdr || !body) return;
  if (top) document.documentElement.style.setProperty('--top-h', top.offsetHeight + 'px');
  let lock = false;
  const link = (from, to) => from.addEventListener('scroll', () => {
    if (lock) return; lock = true; to.scrollLeft = from.scrollLeft; requestAnimationFrame(() => (lock = false));
  }, { passive: true });
  link(body, hdr); link(hdr, body);
  hdr.scrollLeft = body.scrollLeft;
}
window.addEventListener('resize', () => { const top = $('.top'); if (top) document.documentElement.style.setProperty('--top-h', top.offsetHeight + 'px'); });

function layoutLanes(evs) {
  const out = new Map();
  let cluster = [], end = -1;
  const flush = () => {
    const lanes = [];
    for (const e of cluster) {
      const s = toMin(e.start);
      let i = lanes.findIndex(x => x <= s);
      if (i < 0) { i = lanes.length; lanes.push(0); }
      lanes[i] = s + e.minutes;
      out.set(e.id, { lane: i });
    }
    cluster.forEach(e => (out.get(e.id).lanes = lanes.length));
    cluster = []; end = -1;
  };
  for (const e of [...evs].sort((a, b) => toMin(a.start) - toMin(b.start) || b.minutes - a.minutes)) {
    const s = toMin(e.start);
    if (cluster.length && s >= end) flush();
    cluster.push(e);
    end = Math.max(end, s + e.minutes);
  }
  if (cluster.length) flush();
  return out;
}

function contactLinks(phone, cls = '') {
  if (!phone) return '';
  const p = digits(phone);
  return `<a class="${cls}" href="tel:${p}" data-act="link" aria-label="전화">📞</a><a class="${cls}" href="sms:${p}" data-act="link" aria-label="문자">💬</a>`;
}

function timelineHTML(d, rows, staff) {
  const h = hoursOf(d);
  let start = h.closed ? 600 : toMin(h.open), end = h.closed ? 1200 : toMin(h.close);
  rows.forEach(r => { const s = toMin(r.start); start = Math.min(start, s); end = Math.max(end, s + r.minutes); });
  start = Math.floor(start / 60) * 60;
  end = Math.min(1440, Math.ceil(end / 60) * 60);
  const H = (end - start) * PX;
  let grid = '', labels = '';
  for (let m = start; m <= end; m += 30) {
    grid += `<div class="tl-line ${m % 60 ? '' : 'h'}" style="top:${(m - start) * PX}px"></div>`;
    if (m % 60 === 0 && m < end) labels += `<div class="tl-label" style="top:${(m - start) * PX}px">${toTime(m)}</div>`;
  }
  const off = (a, b, label = '') => b > a ? `<div class="tl-off" style="top:${(Math.max(a, start) - start) * PX}px;height:${(Math.min(b, end) - Math.max(a, start)) * PX}px">${label ? `<span>${label}</span>` : ''}</div>` : '';
  const isToday = d === today(), nm = nowMin();
  const cols = staff.map(u => {
    let offs = '';
    if (h.closed) offs += off(start, end, '휴무');
    else {
      offs += off(start, toMin(h.open)) + off(toMin(h.close), end);
      const ls = u.lunch_start || S.settings.lunch_start, le = u.lunch_start ? u.lunch_end : S.settings.lunch_end;
      if (ls && le) offs += off(toMin(ls), toMin(le), '점심');
      (S.settings.breaks || []).forEach(b => offs += off(toMin(b.start), toMin(b.end), '휴식'));
    }
    const evs = rows.filter(r => r.staff_id === u.id);
    const lanes = layoutLanes(evs);
    const blocksHtml = evs.map(r => {
      const L = lanes.get(r.id), s = toMin(r.start);
      const st = statusOf(r.status_id);
      const color = r.kind === 'away' ? '#8d8899' : (st?.color || '#8b5cf6');
      const ht = Math.max(r.minutes * PX, 24);
      const cls = r.kind === 'away' ? 'away' : (!blocks(r) ? 'cancel' : '');
      const w = 100 / L.lanes;
      const body = r.kind === 'away'
        ? `<div class="t">${r.start}~${toTime(s + r.minutes)}</div><div class="n">🚫 부재</div><div class="sv">${esc(r.memo)}</div>`
        : `<div class="t">${r.start}~${toTime(s + r.minutes)}${st ? ` · <span style="color:${esc(st.color)}">${esc(st.name)}</span>` : ''}</div><div class="n">${esc(r.customer_name)}</div><div class="sv">${esc(r.services)}</div>${r.memo ? `<div class="sv">📝 ${esc(r.memo)}</div>` : ''}`;
      return `<div class="tl-ev ${cls}" data-act="sched" data-id="${r.id}" style="top:${(s - start) * PX}px;height:${ht}px;left:calc(${L.lane * w}% + 2px);width:calc(${w}% - 4px);border-left-color:${esc(color)};${r.kind === 'away' ? '' : `background:${tint(color)}`}">
        ${body}${r.kind === 'appt' && r.phone && ht >= 40 ? `<div class="acts">${contactLinks(r.phone)}</div>` : ''}</div>`;
    }).join('');
    return `<div class="tl-col"><div class="tl-body" data-act="tl-tap" data-staff="${u.id}" data-start="${start}" style="height:${H}px">${grid}${offs}${blocksHtml}
      ${isToday && nm >= start && nm <= end ? `<div class="tl-now" style="top:${(nm - start) * PX}px"></div>` : ''}</div></div>`;
  }).join('');
  const heads = staff.map(u => `<div class="tl-head"><span class="dot" style="background:${esc(u.color)}"></span>${esc(u.name)}</div>`).join('');
  return `<div class="tl-hdr"><div class="tl"><div class="tl-times"></div><div class="tl-cols">${heads}</div></div></div>
    <div class="tl-scroll"><div class="tl"><div class="tl-times"><div style="position:relative;height:${H}px">${labels}</div></div>
    <div class="tl-cols">${cols}</div></div></div>
    <p class="muted" style="text-align:center">빈 칸을 누르면 그 시간으로 바로 예약을 추가합니다.</p>`;
}

function listHTML(rows) {
  if (!rows.length) return '<div class="empty">등록된 일정이 없습니다.<br>아래 ＋ 예약 버튼으로 추가하세요.</div>';
  return rows.slice().sort((a, b) => a.start.localeCompare(b.start)).map(r => {
    const st = statusOf(r.status_id), u = userOf(r.staff_id);
    const color = r.kind === 'away' ? '#8d8899' : (st?.color || '#8b5cf6');
    const end = toTime(toMin(r.start) + r.minutes);
    if (r.kind === 'away') {
      return `<div class="ev-card away" data-act="sched" data-id="${r.id}" style="border-left-color:${color}"><div class="tm">${r.start}<small>~${end}</small></div>
        <div class="bd"><div class="nm">🚫 ${esc(u.name)} 부재</div><div class="muted">${esc(r.memo)}</div></div></div>`;
    }
    return `<div class="ev-card ${blocks(r) ? '' : 'cancel'}" data-act="sched" data-id="${r.id}" style="border-left-color:${esc(color)}">
      <div class="tm">${r.start}<small>~${end}</small></div>
      <div class="bd"><div class="nm">${esc(r.customer_name)} ${st ? `<span class="badge" style="background:${esc(st.color)}">${esc(st.name)}</span>` : ''}</div>
        <div class="muted"><span class="dot" style="background:${esc(u.color)}"></span> ${esc(u.name)} · ${esc(r.services || '시술 미정')}</div>
        ${r.memo ? `<div class="muted">📝 ${esc(r.memo)}</div>` : ''}</div>
      <div class="acts">${contactLinks(r.phone)}</div></div>`;
  }).join('');
}

/* ---------- 일정 상세 ---------- */
function visitInfo(r) {
  if (r.kind !== 'appt') return '';
  if (!r.prev_date) return '<div class="visit">✨ 첫 방문 고객</div>';
  return `<div class="visit">🔁 ${daysBetween(r.prev_date, r.date)}일 만의 방문 <small>(지난 방문 ${fmtDate(r.prev_date)})</small></div>`;
}

function openDetail(id) {
  const r = findSched(id);
  if (!r) return toast('일정을 찾을 수 없습니다.');
  const u = userOf(r.staff_id), editable = canEdit(r);
  const end = toTime(toMin(r.start) + r.minutes);
  const statusChips = () => S.statuses.map(s => `<button type="button" class="chip ${s.id === r.status_id ? 'on' : ''}" data-sid="${s.id}" ${s.id === r.status_id ? `style="background:${esc(s.color)};border-color:${esc(s.color)}"` : ''}>${esc(s.name)}</button>`).join('');
  const body = r.kind === 'away' ? `
      <dl class="kv"><dt>담당</dt><dd><span class="dot" style="background:${esc(u.color)}"></span> ${esc(u.name)}</dd>
      <dt>날짜</dt><dd>${fmtLong(r.date)}</dd><dt>시간</dt><dd>${r.start} ~ ${end} (${durLabel(r.minutes)})</dd>
      <dt>사유</dt><dd>${esc(r.memo || '-')}</dd></dl>` : `
      ${visitInfo(r)}
      ${r.phone ? `<div class="row" style="margin-bottom:14px"><div class="grow"><b>${esc(r.phone)}</b></div>
        <a class="btn" href="tel:${digits(r.phone)}">📞 전화</a><a class="btn" href="sms:${digits(r.phone)}">💬 문자</a></div>` : ''}
      <dl class="kv">
        <dt>날짜</dt><dd>${fmtLong(r.date)}</dd>
        <dt>시간</dt><dd>${r.start} ~ ${end} (${durLabel(r.minutes)})</dd>
        <dt>담당</dt><dd><span class="dot" style="background:${esc(u.color)}"></span> ${esc(u.name)}</dd>
        <dt>시술</dt><dd>${esc(r.services || '-')}</dd>
        <dt>메모</dt><dd>${r.memo ? `<div class="memo-box">${esc(r.memo)}</div>` : '-'}</dd>
      </dl>
      <div class="f"><span>상태 ${editable ? '(누르면 바로 변경)' : ''}</span><div class="chips" id="dStatus">${statusChips()}</div></div>
      <button type="button" class="btn sm" id="dCust">👤 ${esc(r.customer_name)} 고객 기록 보기</button>`;
  const meta = `<p class="muted mt">등록: ${esc(userOf(r.created_by).name)} · ${esc(r.created_at || '')}${r.updated_at && r.updated_at !== r.created_at ? `<br>수정: ${esc(userOf(r.updated_by).name)} · ${esc(r.updated_at)}` : ''}</p>`;
  const sh = openSheet({
    title: r.kind === 'away' ? '🚫 부재' : esc(r.customer_name) + ' 님',
    body: body + meta,
    foot: (editable ? `<button type="button" class="btn danger" id="dDel">삭제</button>` : '') +
      (r.kind === 'appt' ? `<button type="button" class="btn" id="dShare">📤 공유</button>` : '') +
      (editable ? `<button type="button" class="btn pri" id="dEdit">수정</button>` : ''),
  });
  if (!editable && r.kind === 'appt') $('#dStatus', sh).insertAdjacentHTML('afterend', '<p class="muted">다른 사람이 등록한 일정은 수정할 수 없도록 설정되어 있습니다.</p>');
  $('#dStatus', sh)?.addEventListener('click', e => {
    const b = e.target.closest('[data-sid]');
    if (!b || !editable) return;
    run(async () => {
      const sid = +b.dataset.sid === r.status_id ? null : +b.dataset.sid;
      await api('schedule_status', { id: r.id, status_id: sid });
      r.status_id = sid;
      $('#dStatus', sh).innerHTML = statusChips();
      toast('상태를 변경했습니다.');
      render();
    });
  });
  $('#dCust', sh)?.addEventListener('click', () => openCustomer(r.customer_name));
  $('#dShare', sh)?.addEventListener('click', () => openShareAppt(r));
  $('#dEdit', sh)?.addEventListener('click', async () => { await sh.close(); r.kind === 'away' ? openAwayForm(r) : openApptForm(r); });
  $('#dDel', sh)?.addEventListener('click', () => {
    if (!confirm(r.kind === 'away' ? '이 부재 시간을 삭제할까요?' : `${r.customer_name} 님의 ${fmtDate(r.date)} ${r.start} 예약을 삭제할까요?\n(취소 처리만 하려면 상태를 '취소됨'으로 바꾸세요)`)) return;
    run(async () => {
      const j = await api('schedule_delete', { id: r.id });
      S.customers = j.customers;
      await sh.close();
      toast('삭제했습니다.');
      render();
    });
  });
}

/* ---------- 예약 등록 / 수정 ---------- */
function staffChipsHTML(sel, name = 'staff', list = null) {
  return (list || staffList()).map(u => `<button type="button" class="chip ${u.id === sel ? 'on' : ''}" data-${name}="${u.id}"><span class="dot" style="background:${esc(u.color)}"></span>${esc(u.name)}</button>`).join('');
}

function openApptForm(init) {
  const isEdit = !!init.id;
  const f = {
    staff_id: init.staff_id || (S.me.is_staff ? S.me.id : staffList()[0]?.id),
    status_id: isEdit ? init.status_id : (S.statuses[0]?.id || null),
  };
  const svcSel = new Set(String(init.services || '').split(/\s*[,·+]\s*/).filter(Boolean));
  const sh = openSheet({
    title: isEdit ? '예약 수정' : '＋ 새 예약',
    body: `<form id="apF" autocomplete="off">
      ${fld('고객 이름', inp('customer_name', init.customer_name || '', 'customer', { ph: '이름 입력 (자동 완성)' }))}
      <div id="apSim"></div>
      ${fld('연락처', inp('phone', init.phone || '', 'phone', { type: 'tel', ph: '010-0000-0000 (선택)' }))}
      <div class="f"><span>담당</span><div class="chips" id="apStaff">${staffChipsHTML(f.staff_id)}</div></div>
      <div class="row">
        ${fld('날짜', `<input type="date" name="date" value="${init.date || S.date}">`, 'grow')}
        ${fld('시작 시간', timeInp('start', init.start || ''), 'grow')}
      </div>
      <div class="free-hint" id="apFree"></div>
      <div class="f"><span>시술 (여러 개 선택 가능)</span><div class="chips" id="apSvc"></div></div>
      <div class="row">
        ${fld('시술 내용', inp('services', init.services || '', 'service', { ph: '직접 입력 가능' }), 'grow')}
        ${fld('소요(분)', inp('minutes', init.minutes || '', 'duration', { attrs: 'inputmode="numeric" style="width:96px"' }))}
      </div>
      <div class="f"><span>상태</span><div class="chips" id="apStatus"></div></div>
      ${fld('메모', tarea('memo', init.memo || '', 'memo', { ph: '요청 사항, 특이 사항 등', rows: 2 }))}
    </form>`,
    foot: `<button type="button" class="btn" id="apCancel">취소</button><button type="button" class="btn pri" id="apSave">${isEdit ? '수정 저장' : '예약 등록'}</button>`,
  });
  const F = $('#apF', sh), I = n => F.elements[n];
  const renderSvc = () => {
    $('#apSvc', sh).innerHTML = S.services.map(s => `<button type="button" class="chip ${svcSel.has(s.name) ? 'on' : ''}" data-svc="${esc(s.name)}">${esc(s.name)} <small>${durLabel(s.minutes)}</small></button>`).join('');
  };
  const renderStatus = () => {
    $('#apStatus', sh).innerHTML = S.statuses.map(s => `<button type="button" class="chip ${s.id === f.status_id ? 'on' : ''}" data-st="${s.id}" ${s.id === f.status_id ? `style="background:${esc(s.color)};border-color:${esc(s.color)}"` : ''}>${esc(s.name)}</button>`).join('');
  };
  const syncSvcText = () => {
    const known = new Set(S.services.map(s => s.name));
    const extra = String(I('services').value).split(/\s*[,·+]\s*/).filter(x => x && !known.has(x));
    const names = [...S.services.filter(s => svcSel.has(s.name)).map(s => s.name), ...extra];
    I('services').value = names.join(', ');
    const mins = S.services.filter(s => svcSel.has(s.name)).reduce((a, s) => a + s.minutes, 0);
    if (mins) I('minutes').value = mins;
    updateFree();
  };
  const custInfo = () => {
    const name = I('customer_name').value.trim();
    const box = $('#apSim', sh);
    if (!name) { box.innerHTML = ''; return; }
    const c = S.customers.find(c => c.name === name);
    const sims = S.customers.filter(c => similar(name, c.name) || (c.name !== name && c.name.includes(name) && name.length >= 2)).slice(0, 6);
    let html = '';
    if (c) {
      const t = today();
      const parts = [];
      if (c.last_date) parts.push(`최근 방문 ${fmtDate(c.last_date)} (${daysBetween(c.last_date, I('date').value || t)}일 전)`);
      else parts.push('방문 기록 없음');
      if (c.visits) parts.push(`총 ${c.visits}회`);
      if (c.memo) parts.push('📝 ' + c.memo);
      html += `<div class="visit">👤 기존 고객 · ${esc(parts.join(' · '))}</div>`;
      if (!I('phone').value && c.phone) I('phone').value = c.phone;
    } else {
      html += `<div class="muted" style="margin:-6px 0 8px">✨ 새 고객으로 등록됩니다.</div>`;
    }
    if (sims.length && !c) html += `<div class="similar">혹시 이 고객인가요? ${sims.map(s => `<button type="button" data-sim="${esc(s.name)}">${esc(s.name)}${s.phone ? ` <small>${esc(s.phone.slice(-4))}</small>` : ''}</button>`).join('')}</div>`;
    box.innerHTML = html;
  };
  const updateFree = async () => {
    const date = I('date').value, len = parseInt(I('minutes').value, 10) || 30;
    const box = $('#apFree', sh);
    if (!date || !f.staff_id) { box.innerHTML = ''; return; }
    try { await ensureDate(date); } catch { return; }
    const u = userOf(f.staff_id);
    const starts = freeStarts(date, u, len, init.id);
    box.innerHTML = starts.length
      ? `<span class="muted" style="white-space:nowrap;align-self:center">가능:</span>` + starts.slice(0, 40).map(t => `<button type="button" class="chip ${toTime(t) === I('start').value ? 'on' : ''}" data-start="${toTime(t)}">${toTime(t)}</button>`).join('')
      : `<span class="muted">${esc(u.name)} 님은 이 날 ${durLabel(len)} 비는 시간이 없습니다.</span>`;
  };
  renderSvc(); renderStatus(); custInfo(); updateFree();

  sh.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.staff) { f.staff_id = +t.dataset.staff; $$('#apStaff .chip', sh).forEach(c => c.classList.toggle('on', c === t)); updateFree(); }
    if (t.dataset.svc) { const n = t.dataset.svc; svcSel.has(n) ? svcSel.delete(n) : svcSel.add(n); renderSvc(); syncSvcText(); }
    if (t.dataset.st) { f.status_id = +t.dataset.st; renderStatus(); }
    if (t.dataset.start) { I('start').value = t.dataset.start; $$('#apFree .chip', sh).forEach(c => c.classList.toggle('on', c === t)); }
    if (t.dataset.sim) { I('customer_name').value = t.dataset.sim; const c = S.customers.find(c => c.name === t.dataset.sim); if (c?.phone) I('phone').value = c.phone; custInfo(); }
  });
  I('customer_name').addEventListener('acpick', e => { const c = e.detail.data; if (c?.phone) I('phone').value = c.phone; });
  I('customer_name').addEventListener('change', custInfo);
  I('customer_name').addEventListener('input', () => { clearTimeout(custInfo.t); custInfo.t = setTimeout(custInfo, 400); });
  I('phone').addEventListener('acpick', e => { if (e.detail.data && !I('customer_name').value) { I('customer_name').value = e.detail.data; custInfo(); } });
  I('date').addEventListener('change', updateFree);
  I('minutes').addEventListener('change', updateFree);
  I('start').addEventListener('change', () => $$('#apFree .chip', sh).forEach(c => c.classList.toggle('on', c.dataset.start === I('start').value)));
  I('services').addEventListener('change', () => {
    svcSel.clear();
    I('services').value.split(/\s*[,·+]\s*/).forEach(n => S.services.some(s => s.name === n) && svcSel.add(n));
    renderSvc();
    const mins = S.services.filter(s => svcSel.has(s.name)).reduce((a, s) => a + s.minutes, 0);
    if (mins) { I('minutes').value = mins; updateFree(); }
  });
  $('#apCancel', sh).onclick = () => sh.close();
  $('#apSave', sh).onclick = () => run(async () => {
    const d = formData(F);
    d.start = normTime(d.start);
    if (!d.customer_name) throw new Error('고객 이름을 입력해 주세요.');
    if (!validTime(d.start)) throw new Error('시작 시간을 선택해 주세요.');
    d.minutes = parseInt(d.minutes, 10) || 0;
    if (!d.minutes) throw new Error('시술을 고르거나 소요 시간을 입력해 주세요.');
    Object.assign(d, { id: init.id || 0, kind: 'appt', staff_id: f.staff_id, status_id: f.status_id, phone: fmtPhone(d.phone) });
    let j = await api('schedule_save', d);
    if (j.conflict) {
      if (!confirm('같은 담당자의 겹치는 일정이 있습니다.\n\n' + j.conflict.join('\n') + '\n\n그래도 저장할까요?')) return;
      j = await api('schedule_save', { ...d, force: 1 });
    }
    S.customers = j.customers;
    addSugg('phone', d.phone); addSugg('memo', d.memo);
    d.services.split(/\s*,\s*/).forEach(s => addSugg('service', s));
    await sh.close();
    toast(isEdit ? '수정했습니다.' : '예약을 등록했습니다.');
    S.date = d.date;
    if (S.tab !== 'day') go('day'); else await render();
    if (!isEdit && j.schedule) openShareAppt(j.schedule, true);
  });
}

/* ---------- 부재 등록 ---------- */
function openAwayForm(init) {
  const isEdit = !!init.id;
  const mayOthers = S.me.is_admin || S.settings.allow_edit_others;
  const list = mayOthers ? S.users : [S.me];
  let staff = init.staff_id || S.me.id;
  const sh = openSheet({
    title: isEdit ? '부재 수정' : '🚫 부재 시간 추가',
    body: `<form id="awF" autocomplete="off">
      ${list.length > 1 ? `<div class="f"><span>누가</span><div class="chips" id="awStaff">${staffChipsHTML(staff, 'staff', list)}</div></div>` : ''}
      ${fld('날짜', `<input type="date" name="date" value="${init.date || S.date}">`)}
      <div class="f"><span>빠른 선택</span><div class="quick" id="awQuick">
        <button type="button" class="btn" data-q="30">지금부터 30분</button>
        <button type="button" class="btn" data-q="60">지금부터 1시간</button>
        <button type="button" class="btn" data-q="120">지금부터 2시간</button>
        <button type="button" class="btn" data-q="am">오전</button>
        <button type="button" class="btn" data-q="pm">오후</button>
        <button type="button" class="btn" data-q="all">하루 종일</button>
      </div></div>
      <div class="row">
        ${fld('시작', timeInp('start', init.start || ''), 'grow')}
        ${fld('종료', timeInp('end', init.id ? toTime(toMin(init.start) + init.minutes) : ''), 'grow')}
      </div>
      ${fld('사유 (선택)', inp('memo', init.memo || '', 'away', { ph: '예: 병원, 개인 용무' }))}
      <div class="chips" id="awReason">${[...new Set([...(S.sugg.away || []).slice(0, 4), ...DEFAULT_AWAY])].slice(0, 8).map(r => `<button type="button" class="chip" data-r="${esc(r)}">${esc(r)}</button>`).join('')}</div>
    </form>`,
    foot: `<button type="button" class="btn" id="awCancel">취소</button><button type="button" class="btn pri" id="awSave">저장</button>`,
  });
  const F = $('#awF', sh), I = n => F.elements[n];
  sh.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.staff) { staff = +t.dataset.staff; $$('#awStaff .chip', sh).forEach(c => c.classList.toggle('on', c === t)); }
    if (t.dataset.r) { I('memo').value = t.dataset.r; }
    if (t.dataset.q) {
      const h = hoursOf(I('date').value || today());
      const open = h.closed ? 600 : toMin(h.open), close = h.closed ? 1200 : toMin(h.close);
      let s, e2;
      if (/^\d+$/.test(t.dataset.q)) {
        if (I('date').value !== today()) I('date').value = today();
        s = Math.floor(nowMin() / 5) * 5; e2 = Math.min(1435, s + +t.dataset.q);
      } else if (t.dataset.q === 'am') { s = open; e2 = Math.max(open + 30, 12 * 60); }
      else if (t.dataset.q === 'pm') { s = Math.min(close - 30, 13 * 60); e2 = close; }
      else { s = open; e2 = close; if (!I('memo').value) I('memo').value = '휴무'; }
      I('start').value = toTime(s); I('end').value = toTime(e2);
      $$('#awQuick .btn', sh).forEach(b => b.classList.toggle('pri', b === t));
    }
  });
  $('#awCancel', sh).onclick = () => sh.close();
  $('#awSave', sh).onclick = () => run(async () => {
    const d = formData(F);
    d.start = normTime(d.start); d.end = normTime(d.end);
    if (!validTime(d.start) || !validTime(d.end)) throw new Error('시작/종료 시간을 선택해 주세요.');
    const minutes = toMin(d.end) - toMin(d.start);
    if (minutes <= 0) throw new Error('종료 시간이 시작 시간보다 늦어야 합니다.');
    const body = { id: init.id || 0, kind: 'away', staff_id: staff, date: d.date, start: d.start, minutes, memo: d.memo };
    let j = await api('schedule_save', body);
    if (j.conflict) {
      if (!confirm('이 시간에 이미 일정이 있습니다.\n\n' + j.conflict.join('\n') + '\n\n그래도 부재로 등록할까요?')) return;
      j = await api('schedule_save', { ...body, force: 1 });
    }
    addSugg('away', d.memo);
    await sh.close();
    toast('부재 시간을 저장했습니다.');
    S.date = d.date;
    if (S.tab !== 'day') go('day'); else render();
  });
}

/* =========================================================
 *  공유 (텍스트 / 이미지)
 * ========================================================= */
const tplOf = type => (S.me['tpl_' + type] || '').trim() || S.settings['tpl_' + type];
const fillTpl = (tpl, vars) => tpl.replace(/\{([^{}\s]+)\}/g, (m, k) => (k in vars ? vars[k] : m));

function apptVars(r) {
  const st = statusOf(r.status_id);
  return {
    미용실: S.settings.shop_name, 고객: r.customer_name, 날짜: fmtLong(r.date), 시간: `${r.start} ~ ${toTime(toMin(r.start) + r.minutes)}`,
    시작: r.start, 소요: durLabel(r.minutes), 시술: r.services || '-', 담당: userOf(r.staff_id).name, 상태: st?.name || '', 전화: r.phone || '', 메모: r.memo || '',
  };
}

function shareSheet({ title, type, build, phone }) {
  const hasMine = !!(S.me['tpl_' + type] || '').trim();
  let which = hasMine ? 'mine' : 'def';
  const tplText = () => which === 'mine' ? S.me['tpl_' + type] : S.settings['tpl_' + type];
  const sh = openSheet({
    title,
    body: `${hasMine ? `<div class="chips" style="margin-bottom:10px" id="shTpl"><button type="button" class="chip on" data-w="mine">내 문구</button><button type="button" class="chip" data-w="def">기본 문구</button></div>` : ''}
      ${fld('보낼 내용 (수정 가능)', `<textarea id="shText" rows="9"></textarea>`)}
      <div class="btns eq">
        <button type="button" class="btn pri" id="shTxtShare">💬 텍스트 공유</button>
        <button type="button" class="btn" id="shTxtCopy">📋 텍스트 복사</button>
      </div>
      <div class="btns eq mt">
        <button type="button" class="btn pri" id="shImgShare">🖼 이미지 공유</button>
        <button type="button" class="btn" id="shImgCopy">📋 이미지 복사</button>
      </div>
      ${phone ? `<a class="btn block mt" id="shSms" href="#">✉️ ${esc(phone)} 로 문자 보내기</a>` : ''}
      <div class="mt" id="shPrev"></div>`,
  });
  const ta = $('#shText', sh);
  const fill = () => { ta.value = build(tplText()); prev(); };
  let prevTimer;
  const prev = () => {
    clearTimeout(prevTimer);
    prevTimer = setTimeout(async () => {
      try {
        const blob = await prepImage(ta.value); // 미리 만들어 두면 공유 버튼에서 바로 공유창이 뜸
        const url = URL.createObjectURL(blob);
        $('#shPrev', sh).innerHTML = `<p class="muted" style="text-align:center">이미지 미리보기</p><img class="preview-img" src="${url}" alt="공유 이미지">`;
      } catch (e) { console.warn(e); }
    }, 250);
  };
  fill();
  ta.addEventListener('input', prev);
  $('#shTpl', sh)?.addEventListener('click', e => {
    const b = e.target.closest('[data-w]'); if (!b) return;
    which = b.dataset.w;
    $$('#shTpl .chip', sh).forEach(c => c.classList.toggle('on', c === b));
    fill();
  });
  $('#shTxtShare', sh).onclick = () => shareText(ta.value);
  $('#shTxtCopy', sh).onclick = () => copyText(ta.value);
  $('#shImgShare', sh).onclick = () => shareImageText(ta.value);
  $('#shImgCopy', sh).onclick = () => copyImageText(ta.value);
  const why = shareWhy();
  if (why) $('#shText', sh).closest('.f').insertAdjacentHTML('beforebegin', `<div class="similar">⚠️ ${esc(why)}</div>`);
  const sms = $('#shSms', sh);
  if (sms) sms.onclick = e => { e.preventDefault(); location.href = `sms:${digits(phone)}${isIOS ? '&' : '?'}body=${encodeURIComponent(ta.value)}`; };
  return sh;
}

function openShareAppt(r, justSaved) {
  shareSheet({
    title: justSaved ? '✅ 등록 완료 · 고객에게 보내기' : '📤 예약 공유',
    type: 'appt',
    phone: r.phone,
    build: tpl => fillTpl(tpl, apptVars(r)),
  });
}

/* ---------- 휴대폰 공유창 ----------
 * 아이폰(Safari)은 버튼을 누른 "그 순간" navigator.share 를 불러야 공유창이 뜬다.
 * 그래서 이미지는 미리 만들어 두고(prepImage), 누르면 기다리지 않고 바로 share 를 호출한다. */
const IN_APP = /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp|Whale\/.*inapp/i.test(navigator.userAgent);
function shareWhy() {
  if (!window.isSecureContext) return 'https:// 주소로 접속해야 휴대폰 공유창을 쓸 수 있어요.';
  if (IN_APP) return '카카오톡·네이버 등 앱 안의 브라우저에서는 공유창이 열리지 않아요. 오른쪽 위 메뉴에서 "다른 브라우저로 열기"(Safari/Chrome)를 눌러 주세요.';
  if (!navigator.share) return '이 브라우저는 공유창을 지원하지 않아요. Safari 또는 Chrome에서 열어 주세요.';
  return '';
}

function shareText(text) {
  if (!navigator.share || IN_APP) {
    copyText(text, shareWhy() + '\n대신 복사했어요. 메신저에 붙여넣기 하세요.');
    return;
  }
  // await 없이 즉시 호출 (사용자 터치 직후여야 함)
  navigator.share({ text }).catch(e => {
    if (e.name === 'AbortError') return;
    copyText(text, `공유창을 열지 못했어요 (${e.name}). 대신 복사했어요.`);
  });
}

const IMG = { text: null, p: null, blob: null, file: null };
function prepImage(text) {
  if (IMG.text === text && IMG.p) return IMG.p;
  IMG.text = text; IMG.blob = null; IMG.file = null;
  const p = IMG.p = makeImage(text).then(canvasBlob).then(blob => {
    if (IMG.p === p) {
      IMG.blob = blob;
      IMG.file = new File([blob], `salon_${Date.now()}.png`, { type: 'image/png', lastModified: Date.now() });
    }
    return blob;
  });
  p.catch(e => console.warn(e));
  return p;
}

function shareImageText(text) {
  const why = shareWhy();
  if (IMG.text === text && IMG.file) {
    const files = [IMG.file];
    if (!why && navigator.canShare?.({ files })) {
      navigator.share({ files }).catch(e => {
        if (e.name === 'AbortError') return;
        showImage(IMG.blob, `공유창을 열지 못했어요 (${e.name}).`);
      });
    } else {
      showImage(IMG.blob, why || '이 기기는 이미지 바로 공유를 지원하지 않아요.');
    }
    return;
  }
  // 아직 이미지가 준비 안 됨: 만든 뒤 시도 (안드로이드는 대부분 성공, 아이폰은 한 번 더 누르도록 안내)
  toast('이미지를 만드는 중…');
  prepImage(text).then(blob => {
    const files = [IMG.file];
    if (why || !navigator.canShare?.({ files })) return showImage(blob, why || '이 기기는 이미지 바로 공유를 지원하지 않아요.');
    navigator.share({ files }).catch(e => {
      if (e.name === 'AbortError') return;
      toast('이미지가 준비됐어요. 공유 버튼을 한 번 더 눌러 주세요.');
    });
  }).catch(e => toast(e.message));
}

function copyImageText(text) {
  const ready = IMG.text === text && IMG.blob;
  try {
    if (!window.ClipboardItem || !navigator.clipboard?.write || !window.isSecureContext) throw new Error('unsupported');
    // Safari 는 Promise 를 넘겨도 되지만 write 자체는 터치 직후 바로 불러야 함
    navigator.clipboard.write([new ClipboardItem({ 'image/png': ready ? IMG.blob : prepImage(text) })])
      .then(() => toast('이미지를 복사했습니다. 메신저에 붙여넣기 하세요.'))
      .catch(() => prepImage(text).then(b => showImage(b, '이 기기/브라우저는 이미지 복사를 지원하지 않아요.')));
  } catch {
    prepImage(text).then(b => showImage(b, '이 기기/브라우저는 이미지 복사를 지원하지 않아요.'));
  }
}

function copyText(text, msg = '복사했습니다. 메신저에 붙여넣기 하세요.') {
  // execCommand 를 먼저 (터치 직후 동기 실행 – 아이폰/HTTP 에서도 동작)
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { }
  ta.remove();
  if (ok) return toast(msg);
  navigator.clipboard?.writeText(text).then(() => toast(msg), () => toast('복사하지 못했습니다. 텍스트를 길게 눌러 직접 복사해 주세요.'))
    ?? toast('복사하지 못했습니다. 텍스트를 길게 눌러 직접 복사해 주세요.');
}

const canvasBlob = c => new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('이미지를 만들지 못했습니다.'))), 'image/png'));

function showImage(blob, why) {
  const url = URL.createObjectURL(blob);
  const sh = openSheet({
    title: '🖼 이미지 저장',
    body: `<p class="muted">${esc(why)}<br>아래 이미지를 <b>길게 눌러</b> 저장하거나 복사한 뒤 메신저로 보내 주세요.</p>
      <img class="preview-img" src="${url}" alt="공유 이미지">
      <a class="btn block mt" href="${url}" download="${esc(S.settings.shop_name)}.png">⬇️ 이미지 파일 저장</a>`,
    onclose: () => setTimeout(() => URL.revokeObjectURL(url), 1000),
  });
  return sh;
}

function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

let logoImgP = null, logoImgVer = null;
async function makeImage(text) {
  const W = 1080, P = 84, FS = 40, LH = 64;
  const FF = '-apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", "Malgun Gothic", sans-serif';
  if (logoImgVer !== logoUrl()) { logoImgVer = logoUrl(); logoImgP = loadImg(logoUrl()).catch(() => null); }
  const logo = await logoImgP;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  const maxW = W - P * 2 - 40;
  const wrap = (s, font) => {
    ctx.font = font;
    const out = [];
    let line = '';
    for (const ch of [...s]) {
      if (ctx.measureText(line + ch).width > maxW && line) {
        const sp = line.lastIndexOf(' ');
        if (sp > line.length * 0.5) { out.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; }
        else { out.push(line); line = ch; }
      } else line += ch;
    }
    out.push(line);
    return out;
  };
  const isHL = s => /^\s*(\d{1,2}\/\d{1,2}\(|\d{1,2}월|📅|✂️|💇|⏰|🕒)/.test(s);
  const lines = [];
  for (const para of text.split('\n')) {
    if (!para.trim()) { lines.push({ t: '', gap: true }); continue; }
    const hl = isHL(para);
    const font = `${hl ? 700 : 500} ${FS}px ${FF}`;
    wrap(para, font).forEach(t => lines.push({ t, hl, font }));
  }
  let logoW = 0, logoH = 0;
  if (logo) { logoH = Math.min(180, logo.height); logoW = logo.width * logoH / logo.height; if (logoW > 560) { logoW = 560; logoH = logo.height * logoW / logo.width; } }
  const textH = lines.reduce((a, l) => a + (l.gap ? LH * 0.55 : LH), 0);
  const H = Math.ceil(70 + (logo ? logoH + 30 : 0) + 70 + 40 + textH + 50 + 70 + 40);
  c.width = W; c.height = H;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#f4edff'); g.addColorStop(1, '#fdf2f8');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 카드
  const cx = 40, cy = 40, cw = W - 80, ch = H - 80, rr = 40;
  ctx.save();
  ctx.shadowColor = 'rgba(80,40,140,.15)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(cx, cy, cw, ch, rr); else ctx.rect(cx, cy, cw, ch);
  ctx.fill();
  ctx.restore();
  let y = 70 + 30;
  if (logo) { ctx.drawImage(logo, (W - logoW) / 2, y, logoW, logoH); y += logoH + 30; }
  ctx.fillStyle = '#1f1d24'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.font = `800 54px ${FF}`;
  ctx.fillText(S.settings.shop_name, W / 2, y);
  y += 80;
  ctx.fillStyle = '#e7e4ec'; ctx.fillRect(P, y, W - P * 2, 3);
  y += 40;
  ctx.textAlign = 'left';
  for (const l of lines) {
    if (l.gap) { y += LH * 0.55; continue; }
    ctx.font = l.font;
    if (l.hl) {
      ctx.fillStyle = '#f1ebff';
      ctx.beginPath();
      const w = ctx.measureText(l.t).width + 32;
      if (ctx.roundRect) ctx.roundRect(P + 4, y - 6, w, LH - 6, 14); else ctx.rect(P + 4, y - 6, w, LH - 6);
      ctx.fill();
      ctx.fillStyle = '#5b21b6';
    } else ctx.fillStyle = '#2b2833';
    ctx.fillText(l.t, P + 20, y + 4);
    y += LH;
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#9a96a3';
  ctx.font = `500 28px ${FF}`;
  ctx.fillText(`${S.settings.shop_name} · ${fmtLong(today())} 기준`, W / 2, H - 100);
  return c;
}

/* =========================================================
 *  빈 시간
 * ========================================================= */
async function viewFree() {
  const F = S.free;
  if (F.from < today()) F.from = today();
  const to = addDays(F.from, F.days - 1);
  await fetchRange(F.from, to);
  const staffArr = F.staff === 'all' ? staffList() : [userOf(+F.staff)];
  const groups = [];
  for (let d = F.from; d <= to; d = addDays(d, 1)) {
    const items = freeSlots(d, staffArr, F.len);
    groups.push({ date: d, items, closed: hoursOf(d).closed });
  }
  S.free.groups = groups;
  const valid = new Set(groups.flatMap(g => g.items.map(i => `${g.date}|${i.a}`)));
  [...F.sel].forEach(k => !valid.has(k) && F.sel.delete(k));
  const lens = [30, 60, 90, 120, 150, 180];
  $('#view').innerHTML = `
    <div class="card">
      <div class="row">
        ${fld('시작 날짜', `<input type="date" id="frFrom" value="${F.from}" min="${today()}">`, 'grow')}
        ${fld('기간', `<div class="chips" id="frDays">${[[1, '하루'], [3, '3일'], [7, '1주'], [14, '2주']].map(([n, l]) => `<button type="button" class="chip ${F.days === n ? 'on' : ''}" data-days="${n}">${l}</button>`).join('')}</div>`)}
      </div>
      <div class="f"><span>담당</span><div class="chips scroll" id="frStaff"><button type="button" class="chip ${F.staff === 'all' ? 'on' : ''}" data-staff="all">누구든 가능</button>${staffList().map(u => `<button type="button" class="chip ${+F.staff === u.id ? 'on' : ''}" data-staff="${u.id}"><span class="dot" style="background:${esc(u.color)}"></span>${esc(u.name)}</button>`).join('')}</div></div>
      <div class="row">
        ${fld('시술 (소요 시간 자동)', inp('frSvc', F.svc, 'service', { ph: '예: 커트' }), 'grow')}
        ${fld('필요 시간(분)', inp('frLen', F.len, 'duration', { attrs: 'inputmode="numeric" style="width:100px"' }))}
      </div>
      <div class="chips scroll" id="frLens">${lens.map(m => `<button type="button" class="chip ${F.len === m ? 'on' : ''}" data-len="${m}">${durLabel(m)}</button>`).join('')}</div>
      <div class="f mt" style="margin-bottom:0"><span>표시 방식</span><div class="chips" id="frMode">
        <button type="button" class="chip ${F.mode === 'range' ? 'on' : ''}" data-mode="range">시간대 (10:00~13:00)</button>
        <button type="button" class="chip ${F.mode === 'start' ? 'on' : ''}" data-mode="start">시작 시각 (10:00, 10:30…)</button></div></div>
    </div>
    <div class="row between" style="margin:4px 4px 10px">
      <b>📋 비어 있는 시간 <small class="muted">· 눌러서 골라 보내기</small></b>
      <button type="button" class="btn sm" id="frAll">전체 선택</button>
    </div>
    <div id="frList">${groups.map(g => `
      <div class="free-day card">
        <h4>${fmtLong(g.date)} ${g.items.length ? `<button type="button" class="btn sm" data-dsel="${g.date}">이 날 모두</button>` : ''}</h4>
        ${g.closed ? '<span class="muted">휴무일</span>' : g.items.length ? g.items.map(i => {
          const k = `${g.date}|${i.a}`;
          return `<span class="free-item ${F.sel.has(k) ? 'on' : ''}" data-k="${k}">${F.mode === 'range' ? `${toTime(i.a)}~${toTime(i.b)}` : toTime(i.a)}</span>`;
        }).join('') : '<span class="muted">빈 시간이 없습니다.</span>'}
      </div>`).join('')}</div>
    <div style="height:70px"></div>
    <div class="actionbar"><div class="info" id="frInfo"></div>
      <button type="button" class="btn pri" id="frTS">💬 텍스트<br>공유</button>
      <button type="button" class="btn" id="frTC">📋 텍스트<br>복사</button>
      <button type="button" class="btn pri" id="frIS">🖼 이미지<br>공유</button>
      <button type="button" class="btn" id="frIC">📋 이미지<br>복사</button>
    </div>`;
  const v = $('#view');
  const info = () => {
    const n = F.sel.size, total = valid.size;
    $('#frInfo').textContent = n ? `${n}개 선택됨` : `선택하지 않으면 전체 ${total}개를 보냅니다`;
    $('#frAll').textContent = n && n === total ? '선택 해제' : '전체 선택';
    // 공유 이미지를 미리 만들어 둔다 (버튼을 누르면 바로 공유창)
    clearTimeout(info.t);
    info.t = setTimeout(() => prepImage(freeShareText(F)), 300);
  };
  info();
  $('#frFrom').onchange = e => { if (e.target.value) { F.from = e.target.value; render(); } };
  v.onclick = e => {
    const t = e.target.closest('[data-days],[data-staff],[data-len],[data-mode],[data-k],[data-dsel]');
    if (!t) return;
    if (t.dataset.days) { F.days = +t.dataset.days; return render(); }
    if (t.dataset.staff) { F.staff = t.dataset.staff; return render(); }
    if (t.dataset.len) { F.len = +t.dataset.len; F.svc = ''; return render(); }
    if (t.dataset.mode) { F.mode = t.dataset.mode; F.sel.clear(); return render(); }
    if (t.dataset.k) { const k = t.dataset.k; F.sel.has(k) ? F.sel.delete(k) : F.sel.add(k); t.classList.toggle('on'); return info(); }
    if (t.dataset.dsel) {
      const ks = $$(`[data-k^="${t.dataset.dsel}|"]`, v).map(x => x.dataset.k);
      const allOn = ks.every(k => F.sel.has(k));
      ks.forEach(k => allOn ? F.sel.delete(k) : F.sel.add(k));
      $$(`[data-k^="${t.dataset.dsel}|"]`, v).forEach(x => x.classList.toggle('on', !allOn));
      return info();
    }
  };
  $('#frAll').onclick = () => {
    const all = F.sel.size === valid.size;
    F.sel.clear();
    if (!all) valid.forEach(k => F.sel.add(k));
    $$('.free-item', v).forEach(x => x.classList.toggle('on', F.sel.has(x.dataset.k)));
    info();
  };
  const svcIn = $('[name=frSvc]');
  const applySvc = () => {
    const names = svcIn.value.split(/\s*[,·+]\s*/).filter(Boolean);
    const mins = S.services.filter(s => names.includes(s.name)).reduce((a, s) => a + s.minutes, 0);
    F.svc = svcIn.value.trim();
    if (mins) { F.len = mins; render(); }
  };
  svcIn.addEventListener('change', applySvc);
  $('[name=frLen]').addEventListener('change', e => { const n = parseInt(e.target.value, 10); if (n >= 5) { F.len = n; render(); } });
  const text = () => freeShareText(F);
  $('#frTS').onclick = () => shareText(text());
  $('#frTC').onclick = () => copyText(text());
  $('#frIS').onclick = () => shareImageText(text());
  $('#frIC').onclick = () => copyImageText(text());
  const why = shareWhy();
  if (why) $('#view').insertAdjacentHTML('afterbegin', `<div class="similar" style="margin:0 0 10px">⚠️ ${esc(why)}</div>`);
  $('#fab').innerHTML = '';
  // 꾹 눌러 문구 편집 후 보내기
  ['#frTS', '#frIS'].forEach(id => $(id).addEventListener('contextmenu', e => { e.preventDefault(); openFreeShareSheet(); }));
  $('#frList').insertAdjacentHTML('afterend', `<div style="text-align:center"><button type="button" class="btn sm" id="frEdit">✏️ 문구 확인/수정 후 보내기</button></div>`);
  $('#frEdit').onclick = openFreeShareSheet;
}

function freeSlotsText(F) {
  const lines = [];
  for (const g of F.groups) {
    const items = g.items.filter(i => !F.sel.size || F.sel.has(`${g.date}|${i.a}`));
    if (!items.length) continue;
    lines.push(`${fmtDate(g.date)} ` + items.map(i => F.mode === 'range' ? `${toTime(i.a)}~${toTime(i.b)}` : toTime(i.a)).join(', '));
  }
  return lines.join('\n') || '(비어 있는 시간이 없습니다)';
}
function freeVars(F) {
  return {
    미용실: S.settings.shop_name, 빈시간: freeSlotsText(F), 담당: F.staff === 'all' ? '' : userOf(+F.staff).name,
    시술: F.svc || '', 소요: durLabel(F.len), 기간: `${fmtDate(F.from)} ~ ${fmtDate(addDays(F.from, F.days - 1))}`,
  };
}
const freeShareText = F => fillTpl(tplOf('free'), freeVars(F));
function openFreeShareSheet() {
  shareSheet({ title: '📤 빈 시간 보내기', type: 'free', build: tpl => fillTpl(tpl, freeVars(S.free)) });
}

/* =========================================================
 *  고객
 * ========================================================= */
let custQ = '';
async function viewCust() {
  const j = await api('customers');
  S.customers = j.customers;
  $('#view').innerHTML = `
    <div class="card">${inp('cq', custQ, 'cust_search', { type: 'search', ph: '🔍 이름, 초성(ㄱㅁㅅ), 전화번호 검색' })}</div>
    <div id="cList"></div>`;
  const q = $('[name=cq]');
  const draw = () => {
    custQ = q.value.trim();
    const t = today(), dq = digits(custQ);
    let list = S.customers.map((c, i) => ({ c, s: score(custQ, c.name) || (dq.length >= 3 && digits(c.phone).includes(dq) ? 2 : 0) || (similar(custQ, c.name) ? 1 : 0), i }))
      .filter(x => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, 200).map(x => x.c);
    $('#cList').innerHTML = list.length ? list.map(c => `
      <div class="cust" data-cname="${esc(c.name)}">
        <div class="bd"><div class="nm">${esc(c.name)} ${c.next_date ? `<span class="badge" style="background:#10b981">예약 ${fmtDate(c.next_date)}</span>` : ''}</div>
          <div class="muted">${esc(c.phone || '연락처 없음')} · 방문 ${c.visits}회${c.last_date ? ` · 마지막 ${fmtDate(c.last_date)} (${daysBetween(c.last_date, t)}일 전)` : ''}</div>
          ${c.memo ? `<div class="muted">📝 ${esc(c.memo)}</div>` : ''}</div>
        ${c.phone ? `<a class="callbtn" href="tel:${digits(c.phone)}" data-act="link">📞</a><a class="callbtn" href="sms:${digits(c.phone)}" data-act="link">💬</a>` : ''}
      </div>`).join('') : '<div class="empty">고객이 없습니다.<br>예약을 등록하면 고객이 자동으로 저장됩니다.</div>';
  };
  draw();
  q.addEventListener('input', draw);
  q.addEventListener('acpick', e => openCustomer(e.detail.value));
  $('#cList').onclick = e => { if (e.target.closest('a')) return; const c = e.target.closest('[data-cname]'); if (c) openCustomer(c.dataset.cname); };
  $('#fab').innerHTML = fabHTML();
}

async function openCustomer(name) {
  await run(async () => {
    const j = await api('customer', undefined, { name });
    const c = j.customer, hist = j.history;
    const visits = hist.filter(h => blocks(h));
    const past = visits.filter(h => h.date <= today());
    let intervals = [];
    for (let i = 0; i < past.length - 1; i++) intervals.push(daysBetween(past[i + 1].date, past[i].date));
    intervals = intervals.filter(x => x > 0);
    const avg = intervals.length ? Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length) : 0;
    const sh = openSheet({
      title: '👤 ' + esc(c.name),
      body: `
        ${past.length ? `<div class="visit">방문 ${past.length}회 · 마지막 방문 ${fmtDate(past[0].date)} (${daysBetween(past[0].date, today())}일 전)${avg ? ` · 평균 ${avg}일 주기` : ''}</div>` : '<div class="visit">아직 방문 기록이 없습니다.</div>'}
        <form id="cuF">
          ${fld('연락처', `<div class="row"><div class="grow">${inp('phone', c.phone, 'phone', { type: 'tel' })}</div>${c.phone ? `<a class="callbtn" href="tel:${digits(c.phone)}">📞</a><a class="callbtn" href="sms:${digits(c.phone)}">💬</a>` : ''}</div>`)}
          ${fld('고객 메모', tarea('memo', c.memo, 'cmemo', { ph: '모발 상태, 선호 스타일, 주의 사항 등', rows: 2 }))}
          <div class="btns eq"><button type="button" class="btn" id="cuSave">고객 정보 저장</button><button type="button" class="btn pri" id="cuNew">＋ 이 고객 예약</button></div>
        </form>
        <div class="sec-title">방문 / 예약 기록</div>
        ${hist.length ? hist.map((h, i) => {
          const st = statusOf(h.status_id);
          const prev = hist.slice(i + 1).find(x => blocks(x));
          const gap = blocks(h) && prev ? daysBetween(prev.date, h.date) : null;
          return `<div class="hist" style="border-left-color:${esc(st?.color || '#ddd')}">
            <b>${fmtDate(h.date)} ${h.start}</b> ${st ? `<span class="badge" style="background:${esc(st.color)}">${esc(st.name)}</span>` : ''} ${gap !== null ? `<small class="muted">(${gap}일 만)</small>` : ''}
            <div class="muted">${esc(h.services || '-')} · 담당 ${esc(userOf(h.staff_id).name)}</div>
            ${h.memo ? `<div class="muted">📝 ${esc(h.memo)}</div>` : ''}</div>`;
        }).join('') : '<p class="muted">기록이 없습니다.</p>'}`,
    });
    $('#cuSave', sh).onclick = () => run(async () => {
      const d = formData($('#cuF', sh));
      const r = await api('customer_save', { id: c.id, phone: fmtPhone(d.phone), memo: d.memo });
      S.customers = r.customers;
      addSugg('cmemo', d.memo);
      toast('저장했습니다.');
      if (S.tab === 'cust') render();
    });
    $('#cuNew', sh).onclick = async () => {
      const phone = fmtPhone($('#cuF [name=phone]', sh).value);
      await closeTop();
      openApptForm({ customer_name: c.name, phone, date: S.tab === 'day' ? S.date : today() });
    };
  });
}

/* =========================================================
 *  설정
 * ========================================================= */
const TPL_HELP = {
  appt: ['미용실', '고객', '날짜', '시간', '시작', '소요', '시술', '담당', '상태', '전화', '메모'],
  free: ['미용실', '빈시간', '담당', '시술', '소요', '기간'],
};
const tplHelp = type => `<div class="tpl-help">누르면 넣어져요: ${TPL_HELP[type].map(k => `<code data-ins="{${k}}">{${k}}</code>`).join(' ')}</div>`;
function bindTplHelp(root) {
  root.addEventListener('click', e => {
    const c = e.target.closest('[data-ins]');
    if (!c) return;
    const ta = c.closest('.tpl-block')?.querySelector('textarea');
    if (!ta) return;
    const s = ta.selectionStart ?? ta.value.length;
    ta.value = ta.value.slice(0, s) + c.dataset.ins + ta.value.slice(ta.selectionEnd ?? s);
    ta.focus();
    ta.selectionStart = ta.selectionEnd = s + c.dataset.ins.length;
  });
}

/** 설정 화면을 다시 그리되 열린 섹션과 스크롤 위치를 유지 */
async function rerenderSet(shell = false) {
  const y = window.scrollY;
  const open = $$('details.sec[open] summary').map(x => x.textContent);
  if (shell) renderShell();
  S.tab = 'set';
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === 'set'));
  await render();
  $$('details.sec summary').forEach(x => (x.parentElement.open = open.includes(x.textContent)));
  window.scrollTo(0, y);
}

function viewSet() {
  const me = S.me, st = S.settings, admin = me.is_admin;
  const order = [1, 2, 3, 4, 5, 6, 0];
  $('#view').innerHTML = `
    <div class="sec-title">내 설정</div>
    <details class="sec" open><summary>👤 내 정보</summary><div class="in">
      ${fld('표시 이름', inp('myName', me.name, 'name'))}
      <p class="muted">아이디: ${esc(me.username)} ${admin ? '· 관리자' : ''}</p>
      <button type="button" class="btn pri" id="myNameSave">저장</button>
    </div></details>
    <details class="sec"><summary>💬 내 공유 문구</summary><div class="in">
      <p class="muted">비워 두면 관리자가 정한 기본 문구를 사용합니다.</p>
      <div class="tpl-block">${fld('빈 시간 공유 문구', tarea('myTplFree', me.tpl_free, 'tpl_free', { rows: 6, ph: st.tpl_free }))}${tplHelp('free')}</div>
      <div class="tpl-block">${fld('예약 안내 문구', tarea('myTplAppt', me.tpl_appt, 'tpl_appt', { rows: 7, ph: st.tpl_appt }))}${tplHelp('appt')}</div>
      <button type="button" class="btn pri" id="myTplSave">저장</button>
    </div></details>
    <details class="sec"><summary>🔑 비밀번호 변경</summary><div class="in">
      ${fld('현재 비밀번호', '<input type="password" name="pwCur" autocomplete="current-password">')}
      ${fld('새 비밀번호', '<input type="password" name="pwNew" autocomplete="new-password" placeholder="6자 이상">')}
      ${fld('새 비밀번호 확인', '<input type="password" name="pwNew2" autocomplete="new-password">')}
      <p class="muted">비밀번호를 바꾸면 다른 모든 기기에서 로그아웃됩니다.</p>
      <button type="button" class="btn pri" id="pwSave">변경</button>
    </div></details>
    <div class="btns eq"><button type="button" class="btn" id="logout">로그아웃</button><button type="button" class="btn" id="logoutOthers">다른 기기 모두 로그아웃</button></div>
    <p class="muted" style="text-align:center">📱 브라우저 메뉴의 <b>“홈 화면에 추가”</b>를 누르면 앱처럼 쓸 수 있어요.</p>

    ${admin ? `
    <div class="sec-title">관리자 설정</div>
    <details class="sec"><summary>🏠 미용실 이름 · 로고</summary><div class="in">
      ${fld('미용실 이름', inp('shopName', st.shop_name, 'shop_name'))}
      <button type="button" class="btn pri" id="shopSave">이름 저장</button>
      <div class="f mt"><span>로고</span>
        <img src="${logoUrl()}" alt="" style="max-height:90px;max-width:220px;display:block;margin-bottom:8px;border-radius:8px" onerror="this.style.display='none'">
        <div class="btns"><label class="btn">📷 로고 올리기<input type="file" id="logoFile" accept="image/*" hidden></label>
        ${st.has_custom_logo ? '<button type="button" class="btn" id="logoReset">기본 로고로</button>' : ''}</div>
      </div>
    </div></details>

    <details class="sec"><summary>🕘 영업시간</summary><div class="in">
      ${order.map(d => { const h = st.hours[d]; return `<div class="hours-row" data-day="${d}">
        <b style="color:${d === 0 ? '#e11d48' : d === 6 ? '#2563eb' : 'inherit'}">${WD[d]}</b>
        <label class="check"><input type="checkbox" class="hClosed" ${h.closed ? 'checked' : ''}>휴무</label>
        ${timeInp('open' + d, h.open)}<span>~</span>${timeInp('close' + d, h.close)}</div>`; }).join('')}
      <button type="button" class="btn pri mt" id="hoursSave">영업시간 저장</button>
    </div></details>

    <details class="sec"><summary>☕ 직원 휴식 · 점심 시간 · 시간 단위</summary><div class="in">
      <div class="row">${fld('점심 시작', timeInp('lunchS', st.lunch_start), 'grow')}${fld('점심 종료', timeInp('lunchE', st.lunch_end), 'grow')}</div>
      <p class="muted" style="margin-top:-6px">직원별 점심 시간은 아래 ‘계정 관리’에서 따로 정할 수 있어요. 비우면 점심 시간 없음.</p>
      ${fld('시간당 휴식 시간(분)', inp('bph', st.break_per_hour, 'minutes', { attrs: 'inputmode="numeric"' }))}
      <p class="muted" style="margin-top:-6px">시술 1시간마다 이만큼 쉬는 시간을 시술 뒤에 두고 빈 시간을 계산합니다. (예: 10분 → 2시간 시술 뒤 20분 휴식)</p>
      <div class="f"><span>고정 휴식 시간 (매일)</span><div id="brk">${(st.breaks || []).map(b => breakRow(b)).join('')}</div>
        <button type="button" class="btn sm" id="brkAdd">＋ 휴식 시간 추가</button></div>
      ${fld('예약 시간 단위', `<div class="chips" id="stepC">${[10, 15, 20, 30, 60].map(n => `<button type="button" class="chip ${st.slot_step === n ? 'on' : ''}" data-step="${n}">${n}분</button>`).join('')}</div>`)}
      <button type="button" class="btn pri" id="brkSave">저장</button>
    </div></details>

    <details class="sec"><summary>✂️ 시술 종류 · 소요 시간</summary><div class="in">
      <div id="svcL">${S.services.map(s => svcRow(s)).join('')}</div>
      <div class="btns mt"><button type="button" class="btn sm" id="svcAdd">＋ 시술 추가</button><button type="button" class="btn pri" id="svcSave">저장</button></div>
    </div></details>

    <details class="sec"><summary>🏷 일정 상태</summary><div class="in">
      <p class="muted">‘시간 차지’를 끄면 그 상태의 예약은 빈 시간으로 계산됩니다. (예: 취소됨)</p>
      <div id="stL">${S.statuses.map(s => statusRow(s)).join('')}</div>
      <div class="btns mt"><button type="button" class="btn sm" id="stAdd">＋ 상태 추가</button><button type="button" class="btn pri" id="stSave">저장</button></div>
    </div></details>

    <details class="sec"><summary>👥 계정 관리</summary><div class="in">
      <div id="usrL">${S.users.map(u => `<div class="cust" data-uid="${u.id}" style="border:1px solid var(--line)">
        <span class="dot" style="background:${esc(u.color)};width:14px;height:14px"></span>
        <div class="bd"><div class="nm">${esc(u.name)} <small class="muted">${esc(u.username)}</small></div>
        <div class="muted">${u.is_admin ? '관리자' : '일반'}${u.is_staff ? ' · 시술 담당' : ''}${u.lunch_start ? ` · 점심 ${u.lunch_start}~${u.lunch_end}` : ''}</div></div><span>›</span></div>`).join('')}</div>
      <button type="button" class="btn" id="usrAdd">＋ 계정 추가</button>
    </div></details>

    <details class="sec"><summary>🔒 권한</summary><div class="in">
      <label class="check"><input type="checkbox" id="allowOthers" ${st.allow_edit_others ? 'checked' : ''}> 다른 사람이 등록한 일정도 수정/삭제 허용</label>
      <p class="muted">끄면 자신이 등록했거나 자신이 담당인 일정만 수정/삭제할 수 있습니다. (관리자는 항상 가능)</p>
      <button type="button" class="btn pri" id="permSave">저장</button>
    </div></details>

    <details class="sec"><summary>💬 기본 공유 문구</summary><div class="in">
      <div class="tpl-block">${fld('빈 시간 공유 문구', tarea('tplFree', st.tpl_free, 'tpl_free', { rows: 7 }))}${tplHelp('free')}</div>
      <div class="tpl-block">${fld('예약 안내 문구', tarea('tplAppt', st.tpl_appt, 'tpl_appt', { rows: 8 }))}${tplHelp('appt')}</div>
      <button type="button" class="btn pri" id="tplSave">저장</button>
    </div></details>

    <button type="button" class="btn block" id="logBtn">📜 변경 기록(로그) 보기</button>` : ''}
  `;
  const v = $('#view');
  bindTplHelp(v);
  const val = n => $(`[name="${n}"]`, v)?.value.trim() ?? '';
  const saveSettings = async (data, msg = '저장했습니다.') => {
    const j = await api('settings_save', data);
    S.settings = j.settings;
    toast(msg);
  };

  $('#myNameSave').onclick = () => run(async () => {
    await api('me_save', { name: val('myName'), tpl_free: S.me.tpl_free, tpl_appt: S.me.tpl_appt });
    S.me.name = val('myName'); const u = S.users.find(u => u.id === S.me.id); if (u) u.name = S.me.name;
    addSugg('name', S.me.name); rerenderSet(true); toast('저장했습니다.');
  });
  $('#myTplSave').onclick = () => run(async () => {
    const tf = $('[name=myTplFree]', v).value, tp = $('[name=myTplAppt]', v).value;
    await api('me_save', { name: S.me.name, tpl_free: tf, tpl_appt: tp });
    S.me.tpl_free = tf; S.me.tpl_appt = tp; toast('내 공유 문구를 저장했습니다.');
  });
  $('#pwSave').onclick = () => run(async () => {
    if (val('pwNew') !== val('pwNew2')) throw new Error('새 비밀번호 확인이 일치하지 않습니다.');
    await api('password', { current: $('[name=pwCur]', v).value, new: $('[name=pwNew]', v).value });
    $$('input[type=password]', v).forEach(i => (i.value = ''));
    toast('비밀번호를 변경했습니다. 이 기기는 계속 로그인됩니다.');
  });
  $('#logoutOthers').onclick = () => run(async () => {
    if (!confirm('이 기기만 남기고, 내 계정으로 로그인된 다른 휴대폰·PC를 모두 로그아웃할까요?\n(휴대폰을 잃어버렸을 때 사용)')) return;
    const j = await api('logout_others', {});
    toast(`다른 기기 ${j.count}대를 로그아웃했습니다.`);
  });
  $('#logout').onclick = () => run(async () => { if (!confirm('로그아웃할까요?')) return; await api('logout', {}); S.me = null; boot(); });
  if (!admin) return;

  $('#shopSave').onclick = () => run(async () => { await saveSettings({ shop_name: val('shopName') }); addSugg('shop_name', S.settings.shop_name); rerenderSet(true); });
  $('#logoFile').onchange = e => run(async () => {
    const f = e.target.files[0]; if (!f) return;
    const fd = new FormData(); fd.append('logo', f);
    const j = await api('logo_upload', fd);
    S.settings.logo_ver = j.logo_ver; S.settings.has_custom_logo = 1;
    rerenderSet(true); toast('로고를 바꿨습니다.');
  });
  $('#logoReset')?.addEventListener('click', () => run(async () => {
    const j = await api('logo_reset', {}); S.settings.logo_ver = j.logo_ver; S.settings.has_custom_logo = 0;
    rerenderSet(true); toast('기본 로고로 되돌렸습니다.');
  }));
  $('#hoursSave').onclick = () => run(async () => {
    const hours = [];
    for (let d = 0; d < 7; d++) {
      const row = $(`.hours-row[data-day="${d}"]`, v);
      hours[d] = { closed: $('.hClosed', row).checked, open: normTime(val('open' + d)), close: normTime(val('close' + d)) };
    }
    await saveSettings({ hours }, '영업시간을 저장했습니다.');
  });
  let step = st.slot_step;
  $('#stepC').onclick = e => { const b = e.target.closest('[data-step]'); if (!b) return; step = +b.dataset.step; $$('#stepC .chip', v).forEach(c => c.classList.toggle('on', c === b)); };
  $('#brkAdd').onclick = () => $('#brk').insertAdjacentHTML('beforeend', breakRow({ start: '', end: '' }));
  $('#brk').onclick = e => { if (e.target.closest('.del')) e.target.closest('.list-row').remove(); };
  $('#brkSave').onclick = () => run(async () => {
    const breaks = $$('#brk .list-row', v).map(r => ({ start: normTime($('[name=bs]', r).value), end: normTime($('[name=be]', r).value) }));
    await saveSettings({ lunch_start: normTime(val('lunchS')), lunch_end: normTime(val('lunchE')), break_per_hour: +val('bph') || 0, breaks, slot_step: step });
    rerenderSet();
  });
  const listCtl = (box, rowFn, add) => {
    $(add).onclick = () => { $(box).insertAdjacentHTML('beforeend', rowFn({})); $(box).lastElementChild.querySelector('input[type=text]')?.focus(); };
    $(box).onclick = e => {
      const row = e.target.closest('.list-row'); if (!row) return;
      if (e.target.closest('.del')) row.remove();
      if (e.target.closest('.up') && row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
      if (e.target.closest('.down') && row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
    };
  };
  listCtl('#svcL', svcRow, '#svcAdd');
  listCtl('#stL', statusRow, '#stAdd');
  $('#svcSave').onclick = () => run(async () => {
    const services = $$('#svcL .list-row', v).map(r => ({ id: +r.dataset.id || 0, name: $('[name=sn]', r).value.trim(), minutes: parseInt($('[name=sm]', r).value, 10) || 0 }));
    const j = await api('services_save', { services });
    S.services = j.services.map(s => ({ ...s, id: +s.id, minutes: +s.minutes }));
    toast('시술 목록을 저장했습니다.'); rerenderSet();
  });
  $('#stSave').onclick = () => run(async () => {
    const statuses = $$('#stL .list-row', v).map(r => ({ id: +r.dataset.id || 0, name: $('[name=stn]', r).value.trim(), color: $('[name=stc]', r).value, blocks: $('[name=stb]', r).checked ? 1 : 0 }));
    const j = await api('statuses_save', { statuses });
    S.statuses = j.statuses.map(s => ({ ...s, id: +s.id, blocks: +s.blocks }));
    toast('상태 목록을 저장했습니다.'); rerenderSet();
  });
  $('#usrL').onclick = e => { const r = e.target.closest('[data-uid]'); if (r) openUserForm(S.users.find(u => u.id === +r.dataset.uid)); };
  $('#usrAdd').onclick = () => openUserForm({});
  $('#permSave').onclick = () => run(() => saveSettings({ allow_edit_others: $('#allowOthers').checked ? 1 : 0 }));
  $('#tplSave').onclick = () => run(async () => { await saveSettings({ tpl_free: $('[name=tplFree]', v).value, tpl_appt: $('[name=tplAppt]', v).value }); rerenderSet(); });
  $('#logBtn').onclick = () => openLogs();
}

const moveBtns = `<div class="mv"><button type="button" class="up" aria-label="위로">▲</button><button type="button" class="down" aria-label="아래로">▼</button></div>`;
const breakRow = b => `<div class="list-row"><div class="grow">${timeInp('bs', b.start)}</div><span>~</span><div class="grow">${timeInp('be', b.end)}</div><button type="button" class="del" aria-label="삭제">✕</button></div>`;
const svcRow = s => `<div class="list-row" data-id="${s.id || ''}">${moveBtns}<div class="grow">${inp('sn', s.name || '', 'service', { ph: '시술 이름' })}</div>
  <div style="width:96px">${inp('sm', s.minutes || '', 'duration', { attrs: 'inputmode="numeric"', ph: '분' })}</div><button type="button" class="del" aria-label="삭제">✕</button></div>`;
const statusRow = s => `<div class="list-row" data-id="${s.id || ''}">${moveBtns}<input type="color" name="stc" value="${esc(s.color || '#8b5cf6')}">
  <div class="grow">${inp('stn', s.name || '', 'status', { ph: '상태 이름' })}</div>
  <label class="check" style="font-size:12px"><input type="checkbox" name="stb" ${s.blocks === 0 ? '' : 'checked'}>시간<br>차지</label><button type="button" class="del" aria-label="삭제">✕</button></div>`;

function openUserForm(u) {
  const isEdit = !!u.id;
  const sh = openSheet({
    title: isEdit ? '계정 수정' : '＋ 계정 추가',
    body: `<form id="usF" autocomplete="off">
      ${fld('이름 (표시 이름)', inp('name', u.name || '', 'name', { ph: '예: 김디자이너' }))}
      ${fld('아이디', inp('username', u.username || '', 'username', { attrs: 'autocapitalize="off"' }))}
      ${fld(isEdit ? '새 비밀번호 (바꿀 때만 입력)' : '비밀번호', `<input type="password" name="password" autocomplete="new-password" placeholder="${isEdit ? '변경 시 그 계정은 모든 기기에서 로그아웃' : '6자 이상'}">`)}
      <div class="row wrap" style="margin-bottom:12px;gap:16px">
        <label class="check"><input type="checkbox" name="is_staff" ${u.is_staff === 0 ? '' : 'checked'}> 시술 담당 (일정표에 표시)</label>
        <label class="check"><input type="checkbox" name="is_admin" ${u.is_admin ? 'checked' : ''}> 관리자</label>
      </div>
      ${fld('색상', `<input type="color" name="color" value="${esc(u.color || '#8b5cf6')}">`)}
      <div class="row">${fld('개별 점심 시작', timeInp('lunch_start', u.lunch_start || ''), 'grow')}${fld('개별 점심 종료', timeInp('lunch_end', u.lunch_end || ''), 'grow')}</div>
      <p class="muted" style="margin-top:-6px">비워 두면 기본 점심 시간(${esc(S.settings.lunch_start || '없음')}${S.settings.lunch_end ? '~' + esc(S.settings.lunch_end) : ''})을 사용합니다.</p>
    </form>`,
    foot: `${isEdit && u.id !== S.me.id ? '<button type="button" class="btn danger" id="usDel">삭제</button>' : ''}<button type="button" class="btn pri" id="usSave">저장</button>`,
  });
  $('#usSave', sh).onclick = () => run(async () => {
    const d = formData($('#usF', sh));
    d.lunch_start = normTime(d.lunch_start); d.lunch_end = normTime(d.lunch_end);
    d.password = $('#usF [name=password]', sh).value;
    const j = await api('user_save', { ...d, id: u.id || 0 });
    S.users = j.users;
    if (u.id === S.me.id) Object.assign(S.me, S.users.find(x => x.id === S.me.id));
    addSugg('name', d.name); addSugg('username', d.username);
    await sh.close();
    toast('계정을 저장했습니다.');
    rerenderSet(true);
  });
  $('#usDel', sh)?.addEventListener('click', () => {
    if (!confirm(`${u.name} 계정을 삭제할까요?\n(지난 일정 기록은 남습니다)`)) return;
    run(async () => {
      const j = await api('user_delete', { id: u.id });
      S.users = j.users;
      await sh.close();
      toast('삭제했습니다.');
      rerenderSet();
    });
  });
}

function openLogs() {
  let page = 1, q = '';
  const sh = openSheet({
    title: '📜 변경 기록',
    body: `<div class="row" style="margin-bottom:8px"><div class="grow">${inp('lq', '', 'logq', { type: 'search', ph: '검색 (이름, 작업, 고객 등)' })}</div><button type="button" class="btn" id="lgGo">검색</button></div>
      <div id="lgL"></div><div class="row between mt"><button type="button" class="btn sm" id="lgPrev">‹ 이전</button><span class="muted" id="lgP"></span><button type="button" class="btn sm" id="lgNext">다음 ›</button></div>`,
  });
  const load = () => run(async () => {
    const j = await api('logs', undefined, { page, q });
    page = j.page;
    $('#lgP', sh).textContent = `${j.page} / ${j.pages} (총 ${j.total}건)`;
    $('#lgPrev', sh).disabled = page <= 1;
    $('#lgNext', sh).disabled = page >= j.pages;
    $('#lgL', sh).innerHTML = j.logs.length ? j.logs.map(l => `<div class="log"><div class="h"><b>${esc(l.action)}</b><span class="muted">${esc(l.created_at)}</span><span class="muted">· ${esc(l.user_name)}</span></div>
      <div>${esc(l.target)}</div>${l.detail ? `<div class="d">${esc(l.detail)}</div>` : ''}</div>`).join('') : '<p class="muted">기록이 없습니다.</p>';
  });
  const search = () => { q = $('[name=lq]', sh).value.trim(); page = 1; load(); };
  $('#lgGo', sh).onclick = search;
  $('[name=lq]', sh).addEventListener('keydown', e => { if (e.key === 'Enter' && !AC.box) search(); });
  $('[name=lq]', sh).addEventListener('acpick', search);
  $('#lgPrev', sh).onclick = () => { page--; load(); };
  $('#lgNext', sh).onclick = () => { page++; load(); };
  load();
}

/* ---------- 자동 새로고침 (여러 명이 함께 쓰므로) ---------- */
function autoRefresh() {
  if (document.visibilityState !== 'visible' || !S.me || sheetStack.length || AC.box) return;
  if (S.tab === 'day' || S.tab === 'free') {
    const y = window.scrollY;
    const sx = $('.tl-scroll')?.scrollLeft || 0;
    render().then(() => { window.scrollTo(0, y); const t = $('.tl-scroll'); if (t) t.scrollLeft = sx; const hh = $('.tl-hdr'); if (hh) hh.scrollLeft = sx; });
  }
}
setInterval(autoRefresh, 60000);
document.addEventListener('visibilitychange', autoRefresh);

boot();
