// Antrenman Takip — Çekirdek: ikonlar, veri katmanı (localStorage), yardımcılar, katman/geri tuşu yönetimi, sekmeler.
// Diğer tüm dosyalardan önce yüklenir; açılışta veriyi yükler ve taşır.

// ═══════════════════════════════════════════════
//  İKONLAR (24×24 çizgi ikonlar, renk currentColor)
// ═══════════════════════════════════════════════
const ICONS = {
  dumbbell: '<path d="M7.5 12h9"/><rect x="4" y="7" width="3.5" height="10" rx="1.2"/><rect x="16.5" y="7" width="3.5" height="10" rx="1.2"/><path d="M2 10v4M22 10v4"/>',
  pill: '<rect x="2.5" y="8" width="19" height="8" rx="4" transform="rotate(-45 12 12)"/><path d="m8.5 8.5 7 7"/>',
  ruler: '<rect x="2" y="7" width="20" height="10" rx="2.5"/><path d="M6.5 7v3M10.5 7v4.5M14.5 7v3M18.5 7v4.5"/>',
  trophy: '<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4.5a3 3 0 0 0 2.6 4M17 6h2.5a3 3 0 0 1-2.6 4"/>',
  sliders: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  'minus-circle': '<circle cx="12" cy="12" r="9"/><path d="M8 12h8"/>',
  droplet: '<path d="M12 2.8c3.4 3.7 6 7 6 10.2a6 6 0 0 1-12 0c0-3.2 2.6-6.5 6-10.2z"/>',
  pencil: '<path d="M13 20h8"/><path d="M16.4 3.6a2.1 2.1 0 0 1 3 3L7.5 18.5 3 20l1.5-4.5z"/>',
  note: '<path d="M14.5 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8.5z"/><path d="M14.5 3v5.5H20M8 13h8M8 17h5"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 10v3.5l2.2 1.6M10 2.5h4M18.5 6.5l1.3-1.3"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  palette: '<path d="M12 3a9 9 0 0 0 0 18c1.4 0 2-1 2-2 0-.6-.3-1-.6-1.4-.3-.4-.6-.8-.6-1.4 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11" r="1.1" fill="currentColor"/><circle cx="10" cy="7" r="1.1" fill="currentColor"/><circle cx="15" cy="7.5" r="1.1" fill="currentColor"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.1" fill="currentColor"/><circle cx="4.5" cy="12" r="1.1" fill="currentColor"/><circle cx="4.5" cy="18" r="1.1" fill="currentColor"/>',
  order: '<path d="M8 20V4M4 8l4-4 4 4M16 4v16M12 16l4 4 4-4"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5M12 7.5V12l3 2"/>',
  upload: '<path d="M12 15V3.5M7 8.5l5-5 5 5"/><path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15"/>',
  download: '<path d="M12 3.5V15M7 10l5 5 5-5"/><path d="M4 15v3.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V15"/>',
  trash: '<path d="M3.5 6h17M9 6V4h6v2M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14M10 11v6M14 11v6"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12.2 2.8 2.8L16 9.5"/>',
  'x-circle': '<circle cx="12" cy="12" r="9"/><path d="m15 9-6 6M9 9l6 6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  'chevron-up': '<path d="m18 15-6-6-6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/>',
  'arrow-up': '<path d="M12 19V5M6 11l6-6 6 6"/>',
  'trend-up': '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>',
  swap: '<path d="M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4"/>',
  skip: '<path d="m5 4.5 10 7.5-10 7.5z"/><path d="M19 5v14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
};
function icon(name, cls) {
  return `<svg class="ic${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}
function hydrateIcons(root) {
  (root || document).querySelectorAll('i[data-icon]').forEach(el => { el.outerHTML = icon(el.dataset.icon, el.className); });
}
const TOAST_ICONS = [
  ['✅', 'check-circle', 'ok'], ['❌', 'x-circle', 'err'], ['⚠️', 'alert', 'warn'], ['🏆', 'trophy', 'pr'],
  ['📤', 'upload', ''], ['🗑️', 'trash', ''], ['↩️', 'undo', ''], ['📝', 'note', ''], ['⏱', 'timer', ''], ['🎯', 'target', ''],
];

// ═══════════════════════════════════════════════
//  DATA LAYER
// ═══════════════════════════════════════════════
const DEFAULT_DAYS = [
  { id: 'torso-a', name: 'Torso A', exercises: [
    { id: 'pec-deck', name: 'Pec Deck Fly', sets: 2 },
    { id: 'incline-press', name: 'Incline Chest Press', sets: 2 },
    { id: 'cable-lat', name: 'Cable Lateral Raise', sets: 3 },
    { id: 'lat-pulldown', name: 'Lat Pulldown', sets: 2 },
    { id: 'cs-row', name: 'Chest Supported Machine Row', sets: 1 },
    { id: 'tbar-row', name: 'Chest Supported T-Bar Row Machine', sets: 3 },
  ]},
  { id: 'limbs-a', name: 'Limbs A', exercises: [
    { id: 'preacher-curl', name: 'Preacher Curl Machine', sets: 2 },
    { id: 'tricep-push', name: 'Cable Triceps Pushdown', sets: 2 },
    { id: 'bayesian-curl', name: 'Bayesian Curl Cable', sets: 2 },
    { id: 'tri-overhead', name: 'Triceps Overhead Extension', sets: 2 },
    { id: 'leg-curl', name: 'Lying Leg Curl', sets: 3 },
    { id: 'leg-ext', name: 'Leg Extension', sets: 3 },
    { id: 'leg-press', name: 'Leg Press', sets: 3 },
  ]},
  { id: 'torso-b', name: 'Torso B', exercises: [
    { id: 'pec-deck-b', name: 'Pec Deck Fly', sets: 2 },
    { id: 'horiz-press', name: 'Horizontal Chest Press', sets: 2 },
    { id: 'cable-lat-b', name: 'Cable Lateral Raise', sets: 3 },
    { id: 'lat-pulldown-b', name: 'Lat Pulldown', sets: 2 },
    { id: 'cs-row-b', name: 'Chest Supported Machine Row', sets: 1 },
    { id: 'tbar-row-b', name: 'Chest Supported T-Bar Row Machine', sets: 3 },
  ]},
  { id: 'limbs-b', name: 'Limbs B', exercises: [
    { id: 'preacher-curl-b', name: 'Preacher Curl Machine', sets: 2 },
    { id: 'tricep-push-b', name: 'Cable Triceps Pushdown', sets: 2 },
    { id: 'bayesian-curl-b', name: 'Bayesian Curl Cable', sets: 2 },
    { id: 'tri-overhead-b', name: 'Triceps Overhead Extension', sets: 2 },
    { id: 'leg-curl-b', name: 'Lying Leg Curl', sets: 3 },
    { id: 'leg-ext-b', name: 'Leg Extension', sets: 3 },
    { id: 'hack-squat', name: 'Hack Squat', sets: 3 },
  ]},
];
const DEFAULT_SETTINGS = { theme: 'light', restTimerEnabled: true, restDuration: 90 };

// Tüm anahtarlar bu önekle saklanır. GitHub Pages'te aynı origin'i paylaşan
// diğer projelerle çakışmayı önler; sıfırlama da sadece bu anahtarları siler.
const LS_PREFIX = 'antrenman:';
const LEGACY_KEYS = ['dbVersion','workoutDays','workoutLogs','measurements','settings','workoutOrder','supplHistory','suppl','lastBackup'];

function lsGet(key) { try { return localStorage.getItem(LS_PREFIX + key); } catch(e) { return null; } }
function lsSet(key, val) { try { localStorage.setItem(LS_PREFIX + key, val); return true; } catch(e) { return false; } }
function lsRemove(key) { try { localStorage.removeItem(LS_PREFIX + key); } catch(e) {} }
function lsOwnKeys() {
  const out = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LS_PREFIX)) out.push(k);
    }
  } catch(e) {}
  return out;
}

// Eski (öneksiz) anahtarları yeni öneke taşır. Kopyalama tamamen başarılı
// olmadan eski anahtarlar silinmez.
function migrateLegacyKeys() {
  try {
    if (localStorage.getItem(LS_PREFIX + 'migrated')) return;
    LEGACY_KEYS.forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null && localStorage.getItem(LS_PREFIX + k) === null) localStorage.setItem(LS_PREFIX + k, v);
    });
    localStorage.setItem(LS_PREFIX + 'migrated', '1');
    LEGACY_KEYS.forEach(k => localStorage.removeItem(k));
  } catch(e) {}
}

// Bozuk JSON uygulamayı çökertmesin: ham veri yedeklenir, varsayılan kullanılır.
function readJSON(key, fallback) {
  const raw = lsGet(key);
  if (raw == null) return fallback;
  try {
    const v = JSON.parse(raw);
    return v == null ? fallback : v;
  } catch(e) {
    lsSet(key + ':bozuk-' + Date.now(), raw);
    return fallback;
  }
}
function isPlainObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
// onclick="fn(...)" içine güvenle string argüman koymak için
function jsArg(v) { return escapeHtml(JSON.stringify(String(v ?? ''))); }
function safeColor(c) { return /^#[0-9a-fA-F]{3,8}$/.test(String(c || '')) ? c : '#8e8e93'; }
function deepCopy(v) { return JSON.parse(JSON.stringify(v)); }

// Virgüllü ondalıkları da kabul eder ("22,5" → 22.5)
function num(v) {
  const s = String(v ?? '').trim().replace(',', '.');
  if (s === '') return NaN;
  return parseFloat(s);
}
function int(v) {
  const s = String(v ?? '').trim();
  if (s === '') return NaN;
  return parseInt(s, 10);
}
function round2(n) { return Math.round(n * 100) / 100; }

const DB_VERSION = 2;

function normalizeDays(days) {
  return days.map(d => ({
    ...d,
    id: String(d.id),
    name: String(d.name ?? '').trim() || 'Gün',
    exercises: (Array.isArray(d.exercises) ? d.exercises : []).map(ex => ({
      ...ex,
      id: String(ex.id || uid()),
      name: String(ex.name ?? '').trim(),
      sets: Math.min(10, Math.max(1, parseInt(ex.sets) || 1)),
    })),
  }));
}

function loadData() {
  const days = readJSON('workoutDays', null);
  const logs = readJSON('workoutLogs', []);
  const meas = readJSON('measurements', []);
  const settings = readJSON('settings', {});
  const order = readJSON('workoutOrder', null);
  return {
    version: parseInt(lsGet('dbVersion') || '0') || 0,
    workoutDays: Array.isArray(days) ? normalizeDays(days) : deepCopy(DEFAULT_DAYS),
    workoutLogs: Array.isArray(logs) ? logs.filter(l => isPlainObject(l) && l.date && Array.isArray(l.sets)) : [],
    measurements: Array.isArray(meas) ? meas.filter(m => isPlainObject(m) && m.date) : [],
    settings: Object.assign({}, DEFAULT_SETTINGS, isPlainObject(settings) ? settings : {}),
    workoutOrder: Array.isArray(order) ? order.map(String) : [],
  };
}

function saveData(key, value) {
  const ok = lsSet(key, JSON.stringify(value));
  if (!ok) toast('⚠️ Kaydedilemedi: cihaz depolaması dolu olabilir.', 4000);
  return ok;
}

// Eski kayıtları tamamlar: her sete hareket adı, her loga gün adı yazılır.
// Böylece gün silinse ya da yeniden adlandırılsa da geçmiş kaybolmaz.
function normalizeLogs(logs, days) {
  const dayMap = {};
  (days || []).forEach(d => { dayMap[d.id] = d; });
  logs.forEach(log => {
    const day = dayMap[log.dayId];
    if (!log.dayName && day) log.dayName = day.name;
    log.sets.forEach(s => {
      if (!s.exName && day) {
        const ex = day.exercises.find(e => e.id === s.exId);
        if (ex) s.exName = ex.name;
      }
    });
  });
  return logs;
}

function syncOrder() {
  const ids = DB.workoutDays.map(d => d.id);
  const order = DB.workoutOrder.filter((id, i, arr) => ids.includes(id) && arr.indexOf(id) === i);
  ids.forEach(id => { if (!order.includes(id)) order.push(id); });
  const changed = order.join('|') !== DB.workoutOrder.join('|');
  DB.workoutOrder = order;
  if (changed) saveData('workoutOrder', DB.workoutOrder);
}

function migrateDB() {
  if (DB.version < 2) {
    normalizeLogs(DB.workoutLogs, DB.workoutDays);
    saveData('workoutLogs', DB.workoutLogs);
    const p = DB.settings.profile;
    if (p && p.age && !p.birthYear) {
      p.birthYear = new Date().getFullYear() - p.age;
      delete p.age;
      saveData('settings', DB.settings);
    }
  }
  if (DB.version < DB_VERSION) {
    DB.version = DB_VERSION;
    lsSet('dbVersion', String(DB_VERSION));
  }
}

migrateLegacyKeys();
let DB = loadData();
syncOrder();
migrateDB();

// ═══════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════
function uid() {
  try { if (crypto.randomUUID) return crypto.randomUUID(); } catch(e) {}
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}
function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// Gece 04:00'e kadar yapılan antrenmanlar bir önceki güne sayılır
function logicalNow() {
  const d = new Date();
  if (d.getHours() < 4) d.setDate(d.getDate() - 1);
  return d;
}
function today() { return isoDate(logicalNow()); }
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return String(iso);
  return d.toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' });
}
function fmtDateShort(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d)) return String(iso);
  return d.toLocaleDateString('tr-TR', { day:'numeric', month:'short' });
}
function fmtDuration(secs) {
  secs = Math.max(0, Math.floor(secs));
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  const mm = String(m).padStart(2,'0'), ss = String(s).padStart(2,'0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
function fmtMins(sec) {
  sec = Number(sec) || 0;
  if (sec < 60) return '<1 dk';
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} sa ${m % 60} dk` : `${m} dk`;
}
function firstChar(str) { return Array.from(String(str || '?'))[0] || '?'; }
// "Torso A" → "TA", "Push" → "PU", "Üst Vücut 2" → "Ü2"
function dayCode(name) {
  const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
  const chars = w => Array.from(w);
  const code = words.length >= 2
    ? chars(words[0])[0] + chars(words[words.length - 1])[0]
    : chars(words[0] || '?').slice(0, 2).join('');
  return code.toLocaleUpperCase('tr').replace(/İ/g, 'I');
}
function dayBadgeStyle(dayId) {
  const color = dayColorMap()[dayId];
  return color ? `background:${color};color:${textOn(color)};` : '';
}
// Büyük/küçük harf ve I/ı/İ/i farkı gözetmeksizin karşılaştırma için
function normName(n) { return String(n || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr').replace(/ı/g, 'i'); }
function getDayById(id) { return DB.workoutDays.find(d => d.id === id); }
function dayDisplayName(log) {
  const d = getDayById(log.dayId);
  return d ? d.name : (log.dayName || 'Silinmiş gün');
}
function getNextDayId() {
  const logs = DB.workoutLogs;
  if (!logs.length) return DB.workoutOrder[0];
  const last = logs[logs.length - 1];
  const idx = DB.workoutOrder.indexOf(last.dayId);
  return DB.workoutOrder[(idx + 1) % DB.workoutOrder.length];
}
function hasValue(s) { return !!(s && (s.kg || s.reps || s.repsR || s.repsL)); }
function setVolume(s) { return (s.kg || 0) * (s.reps || 0); }
function logVolume(log) { return Math.round((log.sets || []).reduce((a, s) => a + setVolume(s), 0)); }

function setMatchesName(s, log, norm) {
  if (s.exName) return normName(s.exName) === norm;
  // exName alanı olmayan çok eski kayıtlar: gün tanımından ID ile eşleştir
  const day = getDayById(log.dayId);
  const ex = day && day.exercises.find(e => e.id === s.exId);
  return !!ex && normName(ex.name) === norm;
}

// Verilen hareket adına ait, en az bir dolu seti olan kayıtlar (tarihe göre sıralı)
function getLogsByExName(exName) {
  const norm = normName(exName);
  const results = [];
  DB.workoutLogs.forEach(log => {
    const sets = (log.sets || []).filter(s => hasValue(s) && setMatchesName(s, log, norm));
    if (sets.length) results.push({ log, sets, dayName: dayDisplayName(log) });
  });
  return results.sort((a, b) => String(a.log.date).localeCompare(String(b.log.date)));
}

function getPrevSetsForExName(exName) {
  const all = getLogsByExName(exName);
  return all.length ? all[all.length - 1] : null;
}

// Tek 1RM formülü (Epley). 1 tekrar = kaldırılan ağırlık.
function calcEpley(kg, reps) {
  kg = Number(kg) || 0; reps = Number(reps) || 0;
  if (kg <= 0 || reps < 1) return 0;
  if (reps === 1) return Math.round(kg * 10) / 10;
  return Math.round(kg * (1 + reps / 30) * 10) / 10;
}
// ── Plato tespiti ──
// Her antrenmanın en iyi tahmini 1RM'i (vücut ağırlığında en iyi tekrar)
// alınır; son rekordan bu yana 3+ antrenman geçtiyse plato sayılır.
function sessionBest(sets) {
  const withKg = sets.filter(s => s.kg > 0 && s.reps > 0);
  if (withKg.length) return Math.max(...withKg.map(s => calcEpley(s.kg, s.reps)));
  return Math.max(0, ...sets.map(s => s.reps || 0)) / 1000; // vücut ağırlığı: tekrar
}
function plateauInfo(exName, excludeLog) {
  const vals = getLogsByExName(exName).filter(e => e.log !== excludeLog).map(e => sessionBest(e.sets)).filter(v => v > 0);
  if (vals.length < 4) return null;
  let best = vals[0], lastImprove = 0;
  for (let i = 1; i < vals.length; i++) if (vals[i] > best + 1e-9) { best = vals[i]; lastImprove = i; }
  const stalled = vals.length - 1 - lastImprove;
  return stalled >= 3 ? { stalled } : null;
}

function isPR(exName, volume) {
  const all = getLogsByExName(exName);
  if (!all.length) return false;
  const maxVol = Math.max(...all.flatMap(r => r.sets.map(setVolume)));
  return volume > maxVol;
}

let toastTimer = null;
function toast(msg, dur = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  msg = String(msg);
  let ic = '';
  for (const [emo, name, kind] of TOAST_ICONS) {
    if (msg.startsWith(emo)) { ic = icon(name, 'toast-ic ' + kind); msg = msg.slice(emo.length).trim(); break; }
  }
  el.innerHTML = ic + `<span>${escapeHtml(msg)}</span>`;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), dur);
}

// ═══════════════════════════════════════════════
//  OVERLAY / GERİ TUŞU YÖNETİMİ
// ═══════════════════════════════════════════════
// Açılan her katman tarayıcı geçmişine bir kayıt ekler. Katman ister
// butonla ister geri tuşuyla kapansın, geçmiş kaydı da geri alınır.
const layers = [];
const LAYER_CLOSERS = {
  workout:       () => hideWorkoutScreenUI(),
  summary:       () => document.getElementById('summary-overlay').classList.remove('open'),
  historyModal:  () => document.getElementById('history-modal').classList.remove('open'),
  progressModal: () => document.getElementById('progress-modal').classList.remove('open'),
  dayEditor:     () => document.getElementById('day-editor').classList.remove('open'),
  orderEditor:   () => document.getElementById('order-editor').classList.remove('open'),
  exSheet:       () => document.getElementById('ex-sheet').classList.remove('open'),
};
function pushLayer(name) {
  if (layers[layers.length - 1] === name) return;
  layers.push(name);
  try { history.pushState({ layerDepth: layers.length }, ''); } catch(e) {}
}
function closeLayer(name) {
  if (layers[layers.length - 1] === name) { history.back(); return; }
  const i = layers.lastIndexOf(name);
  if (i !== -1) layers.splice(i, 1);
  LAYER_CLOSERS[name]();
}
function closeAllLayers() {
  if (layers.length) history.go(-layers.length);
}
function swapTopLayer(from, to) {
  if (layers[layers.length - 1] !== from) return false;
  layers[layers.length - 1] = to;
  try { history.replaceState({ layerDepth: layers.length }, ''); } catch(e) {}
  LAYER_CLOSERS[from]();
  return true;
}
// Sayfa yenilendiğinde tarayıcı eski katman kaydını hatırlayabilir; sıfırla
try { history.replaceState({ layerDepth: 0 }, ''); } catch(e) {}
window.addEventListener('popstate', e => {
  const depth = (e.state && e.state.layerDepth) || 0;
  while (layers.length > depth) {
    const name = layers.pop();
    LAYER_CLOSERS[name]();
  }
});

// ═══════════════════════════════════════════════
//  TAB NAVIGATION
// ═══════════════════════════════════════════════
let currentTab = 'workout';
function switchTab(tab) {
  ['workout','routine','meas','stats','settings'].forEach(t => {
    document.getElementById('tab-' + t).style.display = 'none';
    const btn = document.getElementById('tab-btn-' + t);
    btn.classList.remove('active');
    btn.setAttribute('aria-selected', 'false');
  });
  document.getElementById('tab-' + tab).style.display = 'flex';
  const activeBtn = document.getElementById('tab-btn-' + tab);
  activeBtn.classList.add('active');
  activeBtn.setAttribute('aria-selected', 'true');
  currentTab = tab;
  if (tab === 'workout') renderHome();
  if (tab === 'routine') renderRoutine();
  if (tab === 'meas') renderMeasurements();
  if (tab === 'stats') renderStats();
  if (tab === 'settings') renderSettings();
}
