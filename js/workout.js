// Antrenman Takip — Antrenman ekranı: aktif antrenman durumu, set girişi, ilerleme önerisi, hareket menüsü,
// dinlenme sayacı, bitirme ve geçmiş antrenmanı düzenleme.

// ═══════════════════════════════════════════════
//  WORKOUT SCREEN
// ═══════════════════════════════════════════════
// Aktif antrenman tek bir nesnede tutulur ve her değişiklikte localStorage'a
// yazılır. Uygulama kapanıp açılsa da antrenman kaldığı yerden devam eder.
//   active = { dayId, day (başlangıçtaki gün tanımının kopyası), startTime,
//              sets: [hareket başına set sayısı], values: {inputId: değer},
//              done: [tamamlanan satır id'leri], screenOpen }
let active = null;
let activeTicker = null;
let prevCache = []; // hareket index'i → { entry, bySet }

function saveActive() {
  if (active) lsSet('activeWorkout', JSON.stringify(active));
}
// Ekrandaki tüm girişleri aktif antrenman nesnesine aktarır ve kaydeder
function captureActive() {
  if (!active) return;
  const body = document.getElementById('ws-body');
  const values = {};
  body.querySelectorAll('input, textarea').forEach(el => { if (el.id && el.value !== '') values[el.id] = el.value; });
  active.values = values;
  active.done = [...body.querySelectorAll('.set-done-btn.done')].map(b => b.id);
  saveActive();
}

function startActiveTicker() {
  clearInterval(activeTicker);
  const tick = () => {
    if (!active) return;
    const t = active.mode === 'edit'
      ? 'Düzenleme · ' + fmtDateShort(active.editDate)
      : fmtDuration((Date.now() - active.startTime) / 1000);
    document.getElementById('ws-elapsed').textContent = t;
    document.getElementById('awb-elapsed').textContent = t;
  };
  tick();
  activeTicker = setInterval(tick, 1000);
}

function openWorkoutScreen(dayId) {
  dayId = dayId || getNextDayId();
  if (active && (active.dayId !== dayId || active.mode === 'edit')) {
    const msg = active.mode === 'edit'
      ? `"${active.day.name}" antrenmanını düzenliyorsun.\n\nDüzenleme kaydedilmeden kapatılıp yeni antrenman başlatılsın mı?`
      : `"${active.day.name}" antrenmanı devam ediyor.\n\nOnu iptal edip yeni antrenman başlatılsın mı? Girdiğin veriler silinecek.`;
    if (!confirm(msg)) return;
    discardActive();
  }
  if (!active) {
    const day = getDayById(dayId);
    if (!day) return;
    const snapshot = deepCopy(day);
    active = {
      dayId,
      day: snapshot,
      startTime: Date.now(),
      sets: snapshot.exercises.map(e => e.sets),
      values: {},
      done: [],
      screenOpen: true,
    };
    renderExerciseCards();
    saveActive();
  }
  showWorkoutScreen();
}

function showWorkoutScreen() {
  if (!active) return;
  const isEdit = active.mode === 'edit';
  document.getElementById('ws-day-name').innerHTML = (isEdit ? icon('pencil') : '') + escapeHtml(active.day.name);
  document.getElementById('ws-done-btn').textContent = isEdit ? 'Kaydet' : 'Bitir';
  document.getElementById('workout-screen').classList.add('open');
  document.body.style.overflow = 'hidden';
  document.body.classList.add('ws-open');
  hideActiveWorkoutBanner();
  startActiveTicker();
  updateProgress();
  acquireWakeLock();
  active.screenOpen = true;
  saveActive();
  pushLayer('workout');
}
function reopenWorkoutScreen() { showWorkoutScreen(); }

// Antrenmanı kapatmaz, sadece ekranı gizler ve banner gösterir
function hideWorkoutScreen() { closeLayer('workout'); }
function hideWorkoutScreenUI() {
  document.body.classList.remove('ws-open');
  releaseWakeLock();
  document.getElementById('workout-screen').classList.remove('open');
  document.body.style.overflow = '';
  if (active) {
    active.screenOpen = false;
    captureActive();
    showActiveWorkoutBanner();
  }
}

function confirmCloseWorkout() {
  const msg = active && active.mode === 'edit'
    ? 'Düzenleme kaydedilmeden kapatılacak. Emin misin?'
    : 'Antrenman iptal edilecek ve girilen tüm veriler silinecek. Emin misin?';
  if (!confirm(msg)) return;
  discardActive();
}

// ── Bildirim: uygulamadan çıkınca aktif antrenmanı göster ──
// İçerik çıkış anındaki durumdur (web uygulaması arka planda güncelleyemez).
const WORKOUT_NOTIF_TAG = 'active-workout';
function hhmm(t, sec) {
  return new Date(t).toLocaleTimeString('tr-TR', sec ? { hour: '2-digit', minute: '2-digit', second: '2-digit' } : { hour: '2-digit', minute: '2-digit' });
}
function workoutNotifContent() {
  const skipped = active.skipped || [];
  const total = active.sets.reduce((a, n, i) => a + (skipped.includes(i) ? 0 : n), 0);
  const doneIds = new Set(active.done || []);
  let done = 0, next = null;
  active.day.exercises.forEach((ex, ei) => {
    if (skipped.includes(ei)) return;
    for (let s = 0; s < active.sets[ei]; s++) {
      if (doneIds.has(`set-done-${ei}-${s}`)) done++;
      else if (!next) next = `${ex.name} · ${s + 1}. set`;
    }
  });
  const lines = [`${done}/${total} set · başlangıç ${hhmm(active.startTime)}`];
  if (restInterval && restEndTime > Date.now()) lines.push(`Dinlenme bitişi: ${hhmm(restEndTime, true)}`);
  if (next) lines.push(`Sıradaki: ${next}`);
  return { title: `${active.day.name} devam ediyor`, body: lines.join('\n') };
}
function postWorkoutNotification() {
  if (!active || active.mode === 'edit' || !workoutNotifOn() || !navigator.serviceWorker) return;
  // İçeriği hemen hesapla: sayfa askıya alınmadan önce hazır olsun
  const { title, body } = workoutNotifContent();
  return navigator.serviceWorker.getRegistration().then(reg => {
    if (!reg) return;
    return reg.showNotification(title, {
      body, tag: WORKOUT_NOTIF_TAG, renotify: false, silent: true,
      icon: 'icon-192.png', badge: 'icon-192.png', timestamp: active.startTime,
      data: { url: './' },
    });
  }).catch(() => {});
}
function clearWorkoutNotification() {
  if (!navigator.serviceWorker) return;
  return navigator.serviceWorker.getRegistration().then(reg => {
    if (!reg || !reg.getNotifications) return;
    return reg.getNotifications({ tag: WORKOUT_NOTIF_TAG }).then(list => list.forEach(n => n.close()));
  }).catch(() => {});
}

function discardActive() {
  clearWorkoutNotification();
  active = null;
  prevCache = [];
  lsRemove('activeWorkout');
  clearInterval(activeTicker);
  stopRest();
  hideActiveWorkoutBanner();
  document.body.classList.remove('ws-open');
  releaseWakeLock();
  document.getElementById('workout-screen').classList.remove('open');
  document.body.style.overflow = '';
  document.getElementById('ws-body').innerHTML = '';
}

function showActiveWorkoutBanner() {
  if (!active) return;
  document.body.classList.add('awb-on');
  document.getElementById('awb-name').innerHTML = (active.mode === 'edit' ? icon('pencil') : '') + escapeHtml(active.day.name);
  document.getElementById('active-workout-banner').classList.add('visible');
  startActiveTicker();
}
function hideActiveWorkoutBanner() {
  document.body.classList.remove('awb-on');
  document.getElementById('active-workout-banner').classList.remove('visible');
}

// Önceki antrenmandan bu hareketin setleri (set sırasına göre)
// ── Kablo makinesi seçimi (hareket başına, antrenman içinde) ──
const CABLE_RE = /cable|kablo|bayesian|crossover|pushdown|push ?down|face ?pull|rope|halat/;
function isCableEx(name) {
  const o = (DB.settings.cableByEx || {})[normName(name)];
  return typeof o === 'boolean' ? o : CABLE_RE.test(normName(name));
}
// Varsayılan: bu hareketin son yapıldığı makine
function lastMachineFor(name) {
  const all = getLogsByExName(name);
  for (let i = all.length - 1; i >= 0; i--) {
    const s = all[i].sets.find(x => x.cable);
    if (s) return s.cable;
  }
  return 'single';
}
function machineFor(ex) {
  if (!isCableEx(ex.name)) return null;
  if (!active) return lastMachineFor(ex.name);
  active.cable = active.cable || {};
  if (!active.cable[ex.id]) active.cable[ex.id] = lastMachineFor(ex.name);
  return active.cable[ex.id];
}
function machineLabel(m) { return m === 'double' ? 'Çift makara' : 'Tek makara'; }
function toggleCable(ei) {
  const ex = active.day.exercises[ei];
  const next = machineFor(ex) === 'double' ? 'single' : 'double';
  captureActive();
  active.cable[ex.id] = next;
  renderExerciseCards();
  applyActiveValues();
  saveActive();
  const conv = (prevCache[ei] || {}).conv;
  toast(`${machineLabel(next)}${conv ? ' · önceki değerler bu makineye çevrildi' : ''}`, 2200);
}
function setCableEx(val) {
  const ex = active.day.exercises[exSheetIdx];
  DB.settings.cableByEx = DB.settings.cableByEx || {};
  if (val === CABLE_RE.test(normName(ex.name))) delete DB.settings.cableByEx[normName(ex.name)];
  else DB.settings.cableByEx[normName(ex.name)] = val;
  saveData('settings', DB.settings);
  refreshCardsAfterSetting();
}

function prevForExercise(ex) {
  const exclude = active && active.mode === 'edit' ? DB.workoutLogs[active.editIdx] : null;
  const all = getLogsByExName(ex.name).filter(e => e.log !== exclude);
  const entry = all.length ? all[all.length - 1] : null;
  const bySet = [];
  if (entry) entry.sets.forEach((s, i) => {
    const idx = Number.isInteger(s.setIdx) ? s.setIdx : i;
    if (bySet[idx] === undefined) bySet[idx] = s;
  });
  // Önceki seferki makine farklıysa değerler bugünkü makineye çevrilir
  const m = machineFor(ex);
  let conv = false;
  if (m) bySet.forEach((s, i) => {
    if (!s || (s.cable || 'single') === m) return;
    bySet[i] = { ...s, kg: s.kg ? kgOnMachine(loadKg(s), m) : s.kg, cable: m, conv: true };
    conv = true;
  });
  return { entry, bySet, conv };
}

// Bir logda, verilen hareket adına ait notu bulur
function noteForExName(log, exName) {
  if (!log || !log.notes) return '';
  const norm = normName(exName);
  if (log.exNotes && log.exNotes[norm]) return log.exNotes[norm];
  const s = (log.sets || []).find(s => setMatchesName(s, log, norm));
  if (s && log.notes[s.exId]) return log.notes[s.exId];
  const day = getDayById(log.dayId);
  const ex = day && day.exercises.find(e => normName(e.name) === norm);
  return (ex && log.notes[ex.id]) || '';
}

function buildSetRow(ei, s, ex, ps, sug) {
  ps = ps || {};
  const id = `${ei}-${s}`;
  const prevKg = ps.kg || '';
  // Placeholder: öneri varsa öneri, yoksa geçen seferki değer
  const phKg = sug ? sug.kg : prevKg;
  const phReps = sug ? sug.reps : ps.reps;
  const phR = sug ? sug.reps : ps.repsR;
  const phL = sug ? sug.reps : ps.repsL;
  const sugAttr = v => sug ? ` data-sug="${escapeHtml(v)}"` : '';
  const repsHtml = ex.bilateral
    ? `<div class="bi-reps">
        <div class="bi-reps-row">
          <span class="bi-label">SAĞ</span>
          <input class="bi-val" type="text" inputmode="numeric" placeholder="${escapeHtml(phR || 'tk')}" data-prev="${escapeHtml(ps.repsR || '')}"${sugAttr(sug && sug.reps)} id="repsR-${id}" oninput="onSetInput(${ei},${s})" onkeydown="handleSetNav(event,'repsR',${ei},${s})">
        </div>
        <div class="bi-reps-row">
          <span class="bi-label">SOL</span>
          <input class="bi-val" type="text" inputmode="numeric" placeholder="${escapeHtml(phL || 'tk')}" data-prev="${escapeHtml(ps.repsL || '')}"${sugAttr(sug && sug.reps)} id="repsL-${id}" oninput="onSetInput(${ei},${s})" onkeydown="handleSetNav(event,'repsL',${ei},${s})">
        </div>
      </div>`
    : `<div class="reps-stepper">
        <button class="stepper-btn" onclick="stepReps(${ei},${s},-1)" type="button">−</button>
        <input class="reps-val" type="text" inputmode="numeric" placeholder="${escapeHtml(phReps || 'tk')}" data-prev="${escapeHtml(ps.reps || '')}"${sugAttr(sug && sug.reps)} id="reps-${id}" oninput="onSetInput(${ei},${s})" onkeydown="handleSetNav(event,'reps',${ei},${s})">
        <button class="stepper-btn" onclick="stepReps(${ei},${s},1)" type="button">+</button>
      </div>`;
  return `<div class="set-wrap" id="set-wrap-${id}"><div class="set-row${sug && sug.up ? ' sug-up' : ''}" id="set-row-${id}">
    <span class="set-num">${s+1}</span>
    ${prevCell(ei, s, ps)}
    <div class="kg-stepper">
      <button class="stepper-btn" onclick="stepKg(${ei},${s},-1)" type="button">−</button>
      <input class="kg-val" type="text" inputmode="decimal" placeholder="${escapeHtml(phKg || 'kg')}" data-prev="${escapeHtml(prevKg)}"${sugAttr(sug && sug.kg)} id="kg-${id}" oninput="onSetInput(${ei},${s})" onkeydown="handleSetNav(event,'kg',${ei},${s})">
      <button class="stepper-btn" onclick="stepKg(${ei},${s},1)" type="button">+</button>
    </div>
    ${repsHtml}
    <button class="set-done-btn" onclick="completeSet(${ei},${s})" id="set-done-${id}" aria-label="Seti tamamla">${icon('check')}</button>
  </div>${rirRow(ei, s, ps)}</div>`;
}

// ── RIR: setten sonra kaç tekrar daha yapılabilirdi (isteğe bağlı) ──
// 4 = "4 ve üstü". Set tamamlanınca satırın altında görünür.
function rirEnabled() { return DB.settings.rirEnabled !== false; }
function fmtRir(v) { return v >= 4 ? '4+' : String(v); }
function rirRow(ei, s, ps) {
  if (!rirEnabled()) return '';
  const sel = active && active.rir ? active.rir[`${ei}-${s}`] : undefined;
  const prev = ps && ps.rir != null ? `önceki: ${fmtRir(ps.rir)}` : 'kaç tekrar daha?';
  return `<div class="rir-row" id="rir-row-${ei}-${s}">
    <span class="rir-label">RIR</span>
    ${[0, 1, 2, 3, 4].map(v => `<button type="button" class="rir-btn${sel === v ? ' on' : ''}" data-v="${v}" onclick="setRir(${ei},${s},${v})" aria-label="RIR ${fmtRir(v)}">${fmtRir(v)}</button>`).join('')}
    <span class="rir-prev">${prev}</span>
  </div>`;
}
function setRir(ei, s, v) {
  if (!active) return;
  active.rir = active.rir || {};
  const key = `${ei}-${s}`;
  if (active.rir[key] === v) delete active.rir[key]; else active.rir[key] = v;
  document.querySelectorAll(`#rir-row-${ei}-${s} .rir-btn`).forEach(b => b.classList.toggle('on', Number(b.dataset.v) === active.rir[key]));
  checkOverload(ei, s);
  saveActive();
}

// "Önceki" sütunu: bu hareketin son yapıldığı antrenmanda aynı sıradaki set.
// Dokununca değerler satıra doldurulur (set işaretlenmez).
function prevCell(ei, s, ps) {
  if (!ps || !hasValue(ps)) return `<span class="set-prev empty" aria-label="Önceki set yok">—</span>`;
  const bi = ps.repsR != null || ps.repsL != null;
  const kg = ps.kg ? (ps.conv ? '≈' : '') + String(ps.kg) : 'VA';
  const reps = bi ? `${ps.repsR || 0}/${ps.repsL || 0}` : `${ps.reps || 0}`;
  const label = `Önceki${ps.conv ? ' (diğer makineden çevrildi)' : ''}: ${ps.kg ? ps.kg + ' kg' : 'vücut ağırlığı'} × ${bi ? `sağ ${ps.repsR || 0}, sol ${ps.repsL || 0}` : (ps.reps || 0)} tekrar. Dokun: satıra doldur`;
  return `<button class="set-prev" type="button" onclick="fillFromPrev(${ei},${s})" aria-label="${escapeHtml(label)}"><span class="sp-kg">${escapeHtml(kg)}</span><span class="sp-reps">×${escapeHtml(reps)}</span></button>`;
}
function fillFromPrev(ei, s) {
  const row = document.getElementById(`set-row-${ei}-${s}`);
  if (!row) return;
  row.querySelectorAll('input').forEach(inp => { if (inp.dataset.prev) inp.value = inp.dataset.prev; });
  onSetInput(ei, s);
}

// ── İlerleme önerisi (çift ilerleme) ──
// Hareket başına hedef tekrar aralığı. Geçen seferki her set için:
//  üst sınıra ulaşıldıysa → kilo + artış, tekrar = alt sınır
//  aralıktaysa           → aynı kilo, tekrar + 1
//  alt sınırın altındaysa → aynı kilo, tekrar = alt sınır
const REP_RANGES = [null, [4, 6], [6, 8], [6, 10], [6, 12], [8, 10], [8, 12], [10, 12], [10, 15], [12, 15], [12, 20], [15, 20]];
// ex verilirse o günün hareketine özel aralık (varsa) önce gelir
function repRangeFor(exName, ex) {
  if (ex && Array.isArray(ex.repRange) && ex.repRange.length === 2) return ex.repRange;
  const r = (DB.settings.repRangeByEx || {})[normName(exName)];
  return Array.isArray(r) && r.length === 2 ? r : null;
}
function setRepRangeFor(exName, range) {
  DB.settings.repRangeByEx = DB.settings.repRangeByEx || {};
  if (range) DB.settings.repRangeByEx[normName(exName)] = range;
  else delete DB.settings.repRangeByEx[normName(exName)];
  saveData('settings', DB.settings);
}

// Ağırlık artışı: hareket bazlı, yoksa genel varsayılan
const INC_OPTIONS = [0.5, 1, 1.25, 2, 2.5, 5];
function kgStep() { return DB.settings.kgStep || 2.5; }
function incFor(exName) {
  const v = (DB.settings.incByEx || {})[normName(exName)];
  return v > 0 ? v : kgStep();
}
function fmtKg(v) { return String(round2(v)).replace('.', ','); }

// Dinlenme: hareket bazlı, yoksa çok eklemli / izolasyon varsayılanı
function isCompound(exName) {
  return /press|\brows?\b|pulldown|pull ?-?ups?|chin ?-?ups?|squat|hack|deadlift|\brdl\b|\bdips?\b|lunge|hip thrust|bench press/.test(normName(exName));
}
function restDefaultFor(exName) {
  return isCompound(exName)
    ? (DB.settings.restCompound || 150)
    : (DB.settings.restIsolation || DB.settings.restDuration || 90);
}
// ── İlerleme önerisi ──
// Kural (Ayarlar > İlerleme):
//  • Artış koşulu "Tüm setler" (varsayılan): geçen seferki TÜM çalışma setleri tekrar
//    aralığının üst sınırına ulaştıysa ağırlık artar; ulaşmadıysa her sette +1 tekrar.
//    "Her set": her set kendi başına değerlendirilir.
//  • RIR'a göre artış (varsayılan açık, kademeli): RIR 0 → aynı kilo (pekiştir),
//    RIR 1–3 → 1 adım, RIR 4+ → 2 adım. RIR girilmemişse 1 adım.
//  • Adım = hareketin ağırlık artışı (Hareket ayarları).
function setReps(ps) { return repsOf(ps); }   // sağ/sol ayrıysa zayıf taraf
function progressMode() { return DB.settings.progressMode === 'perSet' ? 'perSet' : 'all'; }
function rirProgression() { return DB.settings.rirProgression !== false; }
function rirSteps(rir) {
  if (!rirProgression() || rir == null) return 1;
  if (rir <= 0) return 0;
  return rir >= 4 ? 2 : 1;
}
// Tek bir set için öneri (önceki set, tekrar aralığı, kaç adım)
function suggestFrom(ps, range, inc, steps) {
  const [lo, hi] = range;
  const r = setReps(ps), kg = ps.kg || 0;
  if (!r) return null;
  if (r >= hi) {
    if (!kg) return { kg: 0, reps: r + 1, up: false };            // vücut ağırlığı: tekrar artar
    if (steps <= 0) return { kg, reps: hi, up: false, hold: true };
    return { kg: round2(kg + steps * inc), reps: lo, up: true, steps };
  }
  if (r < lo) return { kg, reps: lo, up: false };
  return { kg, reps: r + 1, up: false };
}
// Geriye dönük uyumluluk: tek set, RIR'sız
function suggestSet(ex, ps, range) {
  if (!range || !ps || !hasValue(ps)) return null;
  return suggestFrom(ps, range, incFor(ex && ex.name), rirSteps(ps.rir));
}
// Bir hareketin tüm setleri için plan + kısa açıklama
function progressionPlan(ex, bySet, range, count) {
  const out = { sets: [], reason: '' };
  if (!range) return out;
  const prev = bySet.filter(ps => ps && hasValue(ps));
  if (!prev.length) return out;
  const [lo, hi] = range;
  const inc = incFor(ex.name);
  const baseFor = s => (bySet[s] && hasValue(bySet[s])) ? bySet[s] : prev[prev.length - 1];
  if (progressMode() === 'all') {
    const allHit = prev.every(ps => setReps(ps) >= hi);
    const rirs = prev.map(ps => ps.rir).filter(v => v != null);
    const minRir = rirs.length ? Math.min(...rirs) : null;   // en zorlayan set belirler
    const steps = allHit ? rirSteps(minRir) : 0;
    for (let s = 0; s < count; s++) {
      const ps = baseFor(s);
      if (allHit) { out.sets.push(suggestFrom(ps, range, inc, steps)); continue; }
      // Henüz tüm setler üst sınırda değil: üst sınırdaki set aynı kalır, diğerleri +1 tekrar
      const r = setReps(ps);
      out.sets.push(r >= hi && ps.kg ? { kg: ps.kg, reps: hi, up: false } : suggestFrom(ps, range, inc, 0));
    }
    const rirTxt = minRir != null && rirProgression() ? ` (en düşük RIR ${fmtRir(minRir)})` : '';
    if (allHit && steps > 0) out.reason = `Tüm setler ${hi} tekrara ulaştı${rirTxt} → +${fmtKg(steps * inc)} kg, ${lo} tekrardan başla`;
    else if (allHit) out.reason = `${hi} tekrara tükenişe kadar ulaştın (RIR 0) → aynı kiloda kal, ${hi}'yi biraz daha rahat yapmayı hedefle`;
    else out.reason = `Hedef: her sette +1 tekrar. Tüm setler ${hi}'ye ulaşınca kilo artacak`;
  } else {
    for (let s = 0; s < count; s++) {
      const ps = baseFor(s);
      out.sets.push(suggestFrom(ps, range, inc, rirSteps(ps.rir)));
    }
    out.reason = `Her set kendi başına: ${hi} tekrara ulaşan set ağırlaşır, diğerleri +1 tekrar`;
  }
  return out;
}
function suggestionFor(ei, s) {
  if (!active || active.mode === 'edit') return null;
  const ex = active.day.exercises[ei];
  const pc = prevCache[ei];
  if (!pc) return null;
  return progressionPlan(ex, pc.bySet, repRangeFor(ex.name, ex), s + 1).sets[s] || null;
}
function fmtRest(sec) { return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
function restFor(exName) {
  const map = DB.settings.restByEx || {};
  return map[normName(exName)] || restDefaultFor(exName);
}
const REST_MIN = 30, REST_MAX = 360, REST_STEP = 15;
function fmtSetShort(s) {
  return s.repsR != null || s.repsL != null ? `${s.kg || 0}×${s.repsR || 0}/${s.repsL || 0}` : `${s.kg || 0}×${s.reps || 0}`;
}

function renderExerciseCards() {
  const body = document.getElementById('ws-body');
  if (!active) { body.innerHTML = ''; return; }
  const day = active.day;
  const isEdit = active.mode === 'edit';
  prevCache = day.exercises.map(prevForExercise);
  const restOn = !isEdit && DB.settings.restTimerEnabled;
  const restMap = DB.settings.restByEx || {};

  body.innerHTML = (isEdit ? `<div class="ws-edit-banner">${escapeHtml(fmtDate(active.editDate))} tarihli antrenmanı düzenliyorsun</div>` : '') +
  day.exercises.map((ex, ei) => {
    const { entry, bySet, conv } = prevCache[ei];
    const machine = machineFor(ex);

    let prevHint = '';
    if (entry) {
      const dayLabel = entry.dayName ? ` · ${escapeHtml(entry.dayName)}` : '';
      const extra = bySet.slice(active.sets[ei]).filter(s => s && hasValue(s));
      const extraTxt = extra.length ? ` · fazladan ${extra.length} set: <b>${escapeHtml(extra.map(fmtSetShort).join(', '))}</b>` : '';
      const convTxt = conv ? ` · ${machine === 'double' ? 'tek' : 'çift'} makaradan çevrildi` : '';
      prevHint = `<div class="ex-prev-hint">Önceki: ${fmtDateShort(entry.log.date)}${dayLabel}${convTxt}${extraTxt}</div>`;
    } else if (!isEdit) {
      prevHint = `<div class="ex-prev-hint">İlk kez yapıyorsun</div>`;
    }
    const plateau = isEdit ? null : plateauInfo(ex.name);
    const plateauLine = plateau
      ? `<div class="ex-plateau">${icon('alert')}<span>${plateau.stalled} antrenmandır rekor yok. Tekrar aralığını, set sayısını ya da hareketi değiştirmeyi düşünebilirsin.</span></div>`
      : '';
    const noteVal = entry ? noteForExName(entry.log, ex.name) : '';
    const prevNote = noteVal ? `<div class="ex-prev-note">${icon('note')}${escapeHtml(noteVal)}</div>` : '';
    const rest = restFor(ex.name);
    const restChip = restOn
      ? `<button class="ex-chip${restMap[normName(ex.name)] ? ' custom' : ''}" id="rest-chip-${ei}" onclick="openExSheet(${ei})" aria-label="Dinlenme süresi">${icon('timer')}${fmtRest(rest)}</button>`
      : '';

    const range = repRangeFor(ex.name, ex);
    const plan = isEdit ? { sets: [], reason: '' } : progressionPlan(ex, bySet, range, active.sets[ei]);
    let setRows = '';
    for (let s = 0; s < active.sets[ei]; s++) setRows += buildSetRow(ei, s, ex, bySet[s], plan.sets[s] || null);
    const sugList = plan.sets.filter(Boolean);
    const sugLine = sugList.length
      ? `<div class="ex-sug">${icon('trend-up')}<span>Bugün: ${sugList.map(g => `<b>${escapeHtml(g.kg ? g.kg + '×' + g.reps : g.reps + ' tk')}${g.up ? icon('arrow-up', 'up') : ''}</b>`).join(', ')}</span></div>
         <div class="ex-sug-why">${escapeHtml(plan.reason)}</div>`
      : '';
    const rangeChip = isEdit ? '' : `<button class="ex-chip${range ? ' custom' : ''}" id="range-chip-${ei}" onclick="openExSheet(${ei})" aria-label="Hedef tekrar aralığı">${icon('target')}${range ? `${range[0]}–${range[1]}` : 'Hedef'}</button>`;

    const skipped = (active.skipped || []).includes(ei);
    return `<div class="ex-card${skipped ? ' skipped' : ''}" id="ex-card-${ei}">
      <div class="ex-card-header">
        <div class="ex-card-top">
          <span class="ex-name">${escapeHtml(ex.name)}</span>
          <div class="ex-actions">
            <button class="ex-more-btn" onclick="openExSheet(${ei})" aria-label="Hareket menüsü">${icon('more')}</button>
          </div>
        </div>
        <div class="ex-chips">
          ${rangeChip}
          ${machine ? `<button class="ex-chip cable-chip${machine === 'double' ? ' custom' : ''}" id="cable-chip-${ei}" onclick="toggleCable(${ei})" aria-label="Kablo makinesi: ${machineLabel(machine)}. Dokun: değiştir">${icon('swap')}${machineLabel(machine)}</button>` : ''}
          ${restChip}
          <button class="ex-chip" id="note-chip-${ei}" onclick="toggleNote(${ei})" aria-label="Not">${icon('note')}Not</button>
        </div>
        ${ex.swappedFrom ? `<div class="ex-swapped">${icon('swap')}Bugün ${escapeHtml(ex.swappedFrom)} yerine</div>` : ''}
        ${prevHint}
        ${sugLine}
        ${plateauLine}
        ${prevNote}
      </div>
      <div class="ex-sets-container">
        <div class="set-col-header">
          <span class="set-num"></span>
          <span class="set-col-label set-prev-label">Önceki</span>
          <span class="set-col-label" style="flex:1.2;">Kilogram</span>
          <span class="set-col-label" style="flex:1;">Tekrar</span>
          <span style="width:34px;flex-shrink:0;"></span>
        </div>
        <div id="sets-list-${ei}">${setRows}</div>
        <div class="set-count-row">
          <button class="set-count-btn" onclick="removeSet(${ei})">− Set</button>
          <span class="set-count-label" id="set-count-${ei}">${active.sets[ei]} set</span>
          <button class="set-count-btn accent" onclick="addSet(${ei})">+ Set</button>
        </div>
      </div>
      <div class="ex-skip-bar"><span>Bu antrenmanda atlandı</span><button onclick="toggleSkipEx(${ei})">Geri al</button></div>
      <div class="ex-note-section" id="note-sec-${ei}" style="display:none;">
        <textarea class="ex-note-input" placeholder="Bu hareket için not…" id="note-${ei}" oninput="onNoteInput(${ei})" rows="2"></textarea>
      </div>
    </div>`;
  }).join('') + renderCardioCard();
  updateProgress();
}

// ═══════════════════════════════════════════════
//  KARDİYO (antrenmanın sonunda)
// ═══════════════════════════════════════════════
// active.cardio: [{ type, min, km, kcal }] (girilen ham metin; kayıtta sayıya çevrilir)
const CARDIO_TYPES = ['Koşu bandı', 'Eliptik', 'Bisiklet', 'Merdiven', 'Kürek', 'Yürüyüş', 'Diğer'];

// Son kaydedilen kardiyo (düzenlenen kayıt hariç)
function lastCardio(type) {
  const exclude = active && active.mode === 'edit' ? DB.workoutLogs[active.editIdx] : null;
  for (let i = DB.workoutLogs.length - 1; i >= 0; i--) {
    const l = DB.workoutLogs[i];
    if (l === exclude || !Array.isArray(l.cardio) || !l.cardio.length) continue;
    if (!type) return { log: l, entry: l.cardio[l.cardio.length - 1] };
    const e = l.cardio.find(c => c.type === type);
    if (e) return { log: l, entry: e };
  }
  return null;
}
function fmtCardio(c) {
  const parts = [`${c.type} ${c.min} dk`];
  if (c.km) parts.push(`${String(c.km).replace('.', ',')} km`);
  if (c.kcal) parts.push(`${c.kcal} kcal`);
  return parts.join(' · ');
}
function cardioMinutes(log) {
  return (log.cardio || []).reduce((a, c) => a + (Number(c.min) || 0), 0);
}
function renderCardioCard() {
  if (!active) return '';
  const list = active.cardio || [];
  const last = lastCardio();
  const hint = last ? `<div class="ex-prev-hint">Önceki: ${fmtDateShort(last.log.date)} — <b>${escapeHtml(last.log.cardio.map(fmtCardio).join(', '))}</b></div>` : '';
  const rows = list.map((c, i) => {
    const prev = lastCardio(c.type);
    const ph = (k, d) => escapeHtml(prev && prev.entry[k] ? String(prev.entry[k]).replace('.', ',') : d);
    return `<div class="cardio-row">
      <div class="cardio-top">
        <select class="cardio-type" onchange="setCardio(${i},'type',this.value)" aria-label="Kardiyo türü">
          ${CARDIO_TYPES.map(t => `<option${t === c.type ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
        <button class="cardio-remove" onclick="removeCardio(${i})" aria-label="Kardiyoyu sil">${icon('x')}</button>
      </div>
      <div class="cardio-fields">
        <label class="cardio-field"><input type="text" inputmode="numeric" value="${escapeHtml(c.min || '')}" placeholder="${ph('min', '20')}" oninput="setCardio(${i},'min',this.value)" data-cardio="min"><span>dk</span></label>
        <label class="cardio-field"><input type="text" inputmode="decimal" value="${escapeHtml(c.km || '')}" placeholder="${ph('km', '—')}" oninput="setCardio(${i},'km',this.value)" data-cardio="km"><span>km</span></label>
        <label class="cardio-field"><input type="text" inputmode="numeric" value="${escapeHtml(c.kcal || '')}" placeholder="${ph('kcal', '—')}" oninput="setCardio(${i},'kcal',this.value)" data-cardio="kcal"><span>kcal</span></label>
      </div>
    </div>`;
  }).join('');
  return `<div class="ex-card cardio-card" id="cardio-card">
    <div class="ex-card-header">
      <div class="ex-card-top"><span class="ex-name cardio-title">${icon('heart')}Kardiyo</span></div>
      ${hint}
    </div>
    ${rows ? `<div class="cardio-list">${rows}</div>` : ''}
    <button class="cardio-add" onclick="addCardio()">${icon('plus')}${list.length ? 'Bir kardiyo daha ekle' : 'Kardiyo ekle'}</button>
  </div>`;
}
function rerenderCardio(focusIdx) {
  const el = document.getElementById('cardio-card');
  if (!el) return;
  el.outerHTML = renderCardioCard();
  if (focusIdx != null) {
    const rows = document.querySelectorAll('#cardio-card .cardio-row');
    rows[focusIdx]?.querySelector('[data-cardio="min"]')?.focus();
  }
}
function addCardio() {
  if (!active) return;
  active.cardio = active.cardio || [];
  const last = lastCardio();
  const used = new Set(active.cardio.map(c => c.type));
  const type = last && !used.has(last.entry.type) ? last.entry.type : (CARDIO_TYPES.find(t => !used.has(t)) || 'Diğer');
  active.cardio.push({ type, min: '', km: '', kcal: '' });
  saveActive();
  rerenderCardio(active.cardio.length - 1);
}
function removeCardio(i) {
  if (!active || !active.cardio) return;
  active.cardio.splice(i, 1);
  saveActive();
  rerenderCardio();
}
function setCardio(i, field, val) {
  if (!active || !active.cardio || !active.cardio[i]) return;
  active.cardio[i][field] = val;
  saveActive();
  if (field === 'type') rerenderCardio();   // önceki değer ipuçları türe göre değişir
}
// Süresi girilmiş satırlar kaydedilir
function collectCardio() {
  return (active && active.cardio || []).map(c => {
    const min = Math.round(num(c.min));
    if (!(min > 0)) return null;
    const out = { type: c.type || 'Diğer', min };
    const km = num(c.km); if (km > 0) out.km = round2(km);
    const kcal = Math.round(num(c.kcal)); if (kcal > 0) out.kcal = kcal;
    return out;
  }).filter(Boolean);
}

function toggleNote(ei) {
  const sec = document.getElementById(`note-sec-${ei}`);
  const input = document.getElementById(`note-${ei}`);
  if (!sec) return;
  const open = sec.style.display === 'none';
  if (!open && input.value.trim()) { input.focus(); return; } // dolu notu gizleme
  sec.style.display = open ? 'block' : 'none';
  if (open) input.focus();
}
function onNoteInput(ei) {
  const chip = document.getElementById(`note-chip-${ei}`);
  if (chip) chip.classList.toggle('has-note', !!document.getElementById(`note-${ei}`).value.trim());
  captureActive();
}
function updateProgress() {
  if (!active) return;
  const skipped = active.skipped || [];
  const total = active.sets.reduce((a, n, i) => a + (skipped.includes(i) ? 0 : n), 0);
  const done = [...document.querySelectorAll('#ws-body .ex-card:not(.skipped) .set-done-btn.done')].length;
  document.getElementById('ws-day-sub').textContent = `${done} / ${total} set`;
  document.getElementById('ws-progress-fill').style.width = (total ? Math.round(done / total * 100) : 0) + '%';
}
// ── Hareket menüsü: grafik / bugünlük değiştir / atla ──
let exSheetIdx = -1;
function openExSheet(ei) {
  if (!active) return;
  exSheetIdx = ei;
  renderExSheet('menu');
  document.getElementById('ex-sheet').classList.add('open');
  pushLayer('exSheet');
}
function closeExSheet() { closeLayer('exSheet'); }
function renderExSheet(view) {
  const ei = exSheetIdx;
  const ex = active.day.exercises[ei];
  const isEdit = active.mode === 'edit';
  const skipped = (active.skipped || []).includes(ei);
  document.getElementById('ex-sheet-title').textContent = ex.name;
  const body = document.getElementById('ex-sheet-body');
  if (view === 'swap') {
    document.getElementById('ex-sheet-sub').textContent = 'Sadece bu antrenman için. Programın değişmez.';
    fillExNameList();
    body.innerHTML = `<input class="sheet-input" id="swap-input" list="ex-names-list" placeholder="Yeni hareket adı" onkeydown="if(event.key==='Enter')confirmSwapEx()">
      <div class="sheet-hint">Bu hareketin geçmişi ve önerileri yeni isme göre gösterilir.</div>
      <button class="btn-primary" onclick="confirmSwapEx()">Değiştir</button>
      <button class="btn-secondary" onclick="renderExSheet('menu')">Vazgeç</button>`;
    setTimeout(() => document.getElementById('swap-input')?.focus(), 50);
    return;
  }
  document.getElementById('ex-sheet-sub').textContent = `${active.sets[ei]} set`;
  const rows = [
    `<button class="sheet-row" onclick="exSheetGraph()">${icon('trend-up')}Grafik ve geçmiş</button>`,
  ];
  if (!isEdit) {
    rows.push(ex.swappedFrom
      ? `<button class="sheet-row" onclick="undoSwapEx()">${icon('undo')}${escapeHtml(ex.swappedFrom)} hareketine geri dön</button>`
      : `<button class="sheet-row" onclick="renderExSheet('swap')">${icon('swap')}Bu antrenmanda değiştir</button>`);
    rows.push(`<button class="sheet-row" onclick="toggleSkipEx(${ei}); closeExSheet();">${icon(skipped ? 'undo' : 'skip')}${skipped ? 'Atlamayı geri al' : 'Bu antrenmanda atla'}</button>`);
  }
  body.innerHTML = `<div class="sheet-list">${rows.join('')}</div>` + exSettingsHtml(ex);
}

// Hareket ayarları: aynı isimli hareketin her yerdeki ayarı
function exSettingsHtml(ex) {
  const range = repRangeFor(ex.name, ex);
  const same = r => (r && range) ? r[0] === range[0] && r[1] === range[1] : r === range;
  const m = muscleFor(ex.name);
  const restCustom = !!(DB.settings.restByEx || {})[normName(ex.name)];
  const incCustom = !!(DB.settings.incByEx || {})[normName(ex.name)];
  return `<div class="sheet-section">Hareket ayarları <span>bu hareket her antrenmanda böyle</span></div>
    <div class="sheet-list ex-settings">
      <div class="sheet-row sheet-row-col">
        <div class="sheet-row-head">${icon('target')}Tekrar aralığı</div>
        <div class="range-chips">${REP_RANGES.map((r, i) => `<button class="range-chip${same(r) ? ' on' : ''}" onclick="pickRepRange(${i})">${r ? `${r[0]}–${r[1]}` : 'Kapalı'}</button>`).join('')}</div>
      </div>
      <div class="sheet-row">${icon('plus')}Ağırlık artışı
        <div class="dur-stepper sheet-stepper"><button onclick="stepExInc(-1)" aria-label="Azalt">${icon('minus')}</button><span id="ex-inc-label">${fmtKg(incFor(ex.name))} kg</span><button onclick="stepExInc(1)" aria-label="Artır">${icon('plus')}</button></div>
      </div>
      ${incCustom ? '' : `<div class="sheet-note">Genel varsayılan (Ayarlar → İlerleme)</div>`}
      <div class="sheet-row">${icon('timer')}Dinlenme
        <div class="dur-stepper sheet-stepper"><button onclick="stepExRest(-1)" aria-label="Kısalt">${icon('minus')}</button><span id="ex-rest-label">${fmtRest(restFor(ex.name))}</span><button onclick="stepExRest(1)" aria-label="Uzat">${icon('plus')}</button></div>
      </div>
      <div class="sheet-note">${restCustom ? `<button class="link-btn" onclick="resetExRest()">Varsayılana dön (${fmtRest(restDefaultFor(ex.name))})</button>` : `Varsayılan: ${isCompound(ex.name) ? 'çok eklemli hareket' : 'izolasyon hareketi'}`}</div>
      <label class="sheet-row">${icon('swap')}İki kablo makinesi
        <span class="ios-toggle sheet-toggle"><input type="checkbox"${isCableEx(ex.name) ? ' checked' : ''} onchange="setCableEx(this.checked)"><span class="ios-toggle-track"></span><span class="ios-toggle-thumb"></span></span></label>
      <div class="sheet-note">Açıkken kartta tek / çift makara seçilir; farklı makinedeki önceki değerler çevrilir.</div>
      <label class="sheet-row">${icon('target')}Kas grubu
        <select onchange="setMuscle(active.day.exercises[exSheetIdx].name, this.value); toast('Kas grubu: ' + MUSCLES[this.value], 1500)">
          ${Object.entries(MUSCLES).map(([k, v]) => `<option value="${k}"${k === m ? ' selected' : ''}>${v}</option>`).join('')}
        </select></label>
    </div>`;
}
// Ayar değişince kartları yeniden çiz (girilen değerler korunur)
function refreshCardsAfterSetting() {
  captureActive();
  renderExerciseCards();
  applyActiveValues();
}
function pickRepRange(i) {
  const ex = active.day.exercises[exSheetIdx];
  const r = REP_RANGES[i];
  if (Array.isArray(ex.repRange)) {
    // Bu güne özel aralık: sadece bu gündeki hareket değişir
    const real = (getDayById(active.dayId)?.exercises || []).find(e => e.id === ex.id);
    [ex, real].forEach(e => { if (!e) return; if (r) e.repRange = r; else delete e.repRange; });
    saveData('workoutDays', DB.workoutDays);
    if (!r) setRepRangeFor(ex.name, null);
  } else setRepRangeFor(ex.name, r);
  refreshCardsAfterSetting();
  renderExSheet('menu');
}
function stepExInc(dir) {
  const ex = active.day.exercises[exSheetIdx];
  const cur = incFor(ex.name);
  let i = INC_OPTIONS.indexOf(cur);
  if (i === -1) i = INC_OPTIONS.findIndex(v => v > cur) - (dir > 0 ? 1 : 0);
  const next = INC_OPTIONS[Math.max(0, Math.min(INC_OPTIONS.length - 1, i + dir))];
  DB.settings.incByEx = DB.settings.incByEx || {};
  if (next === kgStep()) delete DB.settings.incByEx[normName(ex.name)];
  else DB.settings.incByEx[normName(ex.name)] = next;
  saveData('settings', DB.settings);
  refreshCardsAfterSetting();
  renderExSheet('menu');
}
function stepExRest(dir) {
  const ex = active.day.exercises[exSheetIdx];
  const next = Math.max(REST_MIN, Math.min(REST_MAX, restFor(ex.name) + dir * REST_STEP));
  DB.settings.restByEx = DB.settings.restByEx || {};
  if (next === restDefaultFor(ex.name)) delete DB.settings.restByEx[normName(ex.name)];
  else DB.settings.restByEx[normName(ex.name)] = next;
  saveData('settings', DB.settings);
  updateRestChips(ex.name);
  renderExSheet('menu');
}
function resetExRest() {
  const ex = active.day.exercises[exSheetIdx];
  if (DB.settings.restByEx) delete DB.settings.restByEx[normName(ex.name)];
  saveData('settings', DB.settings);
  updateRestChips(ex.name);
  renderExSheet('menu');
}
function updateRestChips(name) {
  if (!active) return;
  const custom = !!(DB.settings.restByEx || {})[normName(name)];
  active.day.exercises.forEach((e, i) => {
    if (normName(e.name) !== normName(name)) return;
    const chip = document.getElementById(`rest-chip-${i}`);
    if (!chip) return;
    chip.innerHTML = icon('timer') + fmtRest(restFor(name));
    chip.classList.toggle('custom', custom);
  });
}
function exSheetGraph() {
  const name = active.day.exercises[exSheetIdx].name;
  if (!swapTopLayer('exSheet', 'progressModal')) LAYER_CLOSERS.exSheet();
  openProgressModal(name);
}
function fillExNameList() {
  const nameSet = new Set();
  DB.workoutDays.forEach(d => d.exercises.forEach(e => e.name && nameSet.add(e.name)));
  DB.workoutLogs.forEach(l => (l.sets || []).forEach(s => s.exName && nameSet.add(s.exName)));
  document.getElementById('ex-names-list').innerHTML = [...nameSet].sort((a, b) => a.localeCompare(b, 'tr')).map(n => `<option value="${escapeHtml(n)}">`).join('');
}
// Bir hareketin ekrandaki girişlerini aktif durumdan siler
function clearExValues(ei) {
  const re = new RegExp(`^(kg|reps|repsR|repsL|set-done)-${ei}-\\d+$`);
  Object.keys(active.values).forEach(k => { if (re.test(k)) delete active.values[k]; });
  active.done = (active.done || []).filter(id => !re.test(id));
  if (active.rir) Object.keys(active.rir).forEach(k => { if (k.startsWith(`${ei}-`)) delete active.rir[k]; });
}
function knownBilateral(name) {
  const n = normName(name);
  return DB.workoutDays.some(d => d.exercises.some(e => normName(e.name) === n && e.bilateral));
}
function replaceExercise(ei, newName, swappedFrom) {
  captureActive();
  clearExValues(ei);
  const old = active.day.exercises[ei];
  active.day.exercises[ei] = { id: uid(), name: newName, sets: old.sets, bilateral: knownBilateral(newName), ...(swappedFrom ? { swappedFrom, originalId: old.originalId || old.id, originalBilateral: old.originalBilateral ?? !!old.bilateral } : {}) };
  if (!swappedFrom && old.originalId) { active.day.exercises[ei].id = old.originalId; active.day.exercises[ei].bilateral = !!old.originalBilateral; }
  renderExerciseCards();
  applyActiveValues();
  saveActive();
}
function confirmSwapEx() {
  const name = (document.getElementById('swap-input').value || '').trim();
  const ex = active.day.exercises[exSheetIdx];
  if (!name) { toast('Hareket adı gir.'); return; }
  if (normName(name) === normName(ex.name)) { closeExSheet(); return; }
  replaceExercise(exSheetIdx, name, ex.swappedFrom || ex.name);
  closeExSheet();
  toast(`${ex.name} → ${name}`, 1800);
}
function undoSwapEx() {
  const ex = active.day.exercises[exSheetIdx];
  if (!ex.swappedFrom) return;
  replaceExercise(exSheetIdx, ex.swappedFrom, null);
  closeExSheet();
}
function toggleSkipEx(ei) {
  if (!active) return;
  captureActive();
  const list = active.skipped || (active.skipped = []);
  const i = list.indexOf(ei);
  if (i === -1) list.push(ei); else list.splice(i, 1);
  document.getElementById(`ex-card-${ei}`).classList.toggle('skipped', i === -1);
  updateProgress();
  saveActive();
}

// Kaydedilmiş değerleri ekrana geri yükler
function applyActiveValues() {
  if (!active) return;
  Object.entries(active.values || {}).forEach(([id, v]) => {
    const el = document.getElementById(id);
    if (el) el.value = v;
  });
  (active.done || []).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('done');
  });
  active.day.exercises.forEach((ex, ei) => {
    for (let s = 0; s < active.sets[ei]; s++) checkOverload(ei, s);
    const note = document.getElementById(`note-${ei}`);
    if (note && note.value.trim()) {
      document.getElementById(`note-sec-${ei}`).style.display = 'block';
      document.getElementById(`note-chip-${ei}`).classList.add('has-note');
    }
  });
  updateProgress();
}

function readSet(ei, s) {
  const val = id => document.getElementById(`${id}-${ei}-${s}`)?.value;
  const kg = num(val('kg'));
  return {
    kg: isNaN(kg) ? 0 : round2(Math.max(0, kg)),
    reps: Math.max(0, int(val('reps')) || 0),
    repsR: Math.max(0, int(val('repsR')) || 0),
    repsL: Math.max(0, int(val('repsL')) || 0),
  };
}

function onSetInput(ei, s) {
  checkOverload(ei, s);
  captureActive();
}

// Gelişme göstergesi: aynı sıradaki önceki sete göre "tahmini performans" arttı mı?
// Performans = Epley tahmini 1RM; iki sette de RIR varsa tekrar + RIR kullanılır
// (yakın tükenişe göre düzeltilmiş). Tekrar aralığı tanımlıysa alt sınırın altındaki
// setler gelişme sayılmaz. Örn. 60×12 → 62,5×6: kilo artsa da performans düşük.
function setPerformance(kg, reps, rir) {
  if (!(reps > 0)) return 0;
  const eff = reps + (rir != null ? rir : 0);
  return kg > 0 ? kg * (1 + eff / 30) : eff;   // vücut ağırlığında tekrar
}
function isProgress(cur, prev, range) {
  if (!cur || !prev) return false;
  const cr = setReps(cur), pr = setReps(prev);
  if (!(cr > 0) || !(pr > 0)) return false;
  if (range && cr < range[0]) return false;
  if (!!cur.kg !== !!prev.kg) return false;
  const useRir = cur.rir != null && prev.rir != null && rirEnabled();
  const a = setPerformance(cur.kg || 0, cr, useRir ? cur.rir : null);
  const b = setPerformance(prev.kg || 0, pr, useRir ? prev.rir : null);
  return a > b * 1.005;
}
function checkOverload(ei, s) {
  const rowEl = document.getElementById(`set-row-${ei}-${s}`);
  if (!rowEl || !active) return;
  const ex = active.day.exercises[ei];
  const ps = prevCache[ei] && prevCache[ei].bySet[s];
  const c = readSet(ei, s);
  const cur = ex.bilateral ? { kg: c.kg, repsR: c.repsR, repsL: c.repsL } : { kg: c.kg, reps: c.reps };
  const r = active.rir ? active.rir[`${ei}-${s}`] : undefined;
  if (r != null) cur.rir = r;
  rowEl.classList.toggle('overload', isProgress(cur, ps && hasValue(ps) ? ps : null, repRangeFor(ex.name, ex)));
}

function handleSetNav(e, type, ei, s) {
  if (e.key !== 'Enter' && e.key !== 'Tab') return;
  e.preventDefault();
  let next = null;
  if (type === 'kg') {
    next = document.getElementById(`repsR-${ei}-${s}`) || document.getElementById(`reps-${ei}-${s}`);
  } else if (type === 'repsR') {
    next = document.getElementById(`repsL-${ei}-${s}`);
  } else {
    next = document.getElementById(`kg-${ei}-${s + 1}`);
  }
  if (next) next.focus();
}

function stepKg(ei, s, dir) {
  const input = document.getElementById(`kg-${ei}-${s}`);
  if (!input || !active) return;
  const delta = Math.sign(dir) * incFor(active.day.exercises[ei].name);
  if (input.value === '' && delta > 0) {
    const prev = num(input.dataset.sug || input.dataset.prev);
    if (prev) { input.value = prev; onSetInput(ei, s); return; }
  }
  const base = num(input.value) || 0;
  const next = Math.max(0, Math.round((base + delta) * 100) / 100);
  input.value = next > 0 ? next : '';
  onSetInput(ei, s);
}

function stepReps(ei, s, delta) {
  const input = document.getElementById(`reps-${ei}-${s}`);
  if (!input) return;
  if (input.value === '' && delta > 0) {
    const prev = int(input.dataset.sug || input.dataset.prev);
    if (prev) { input.value = prev; onSetInput(ei, s); return; }
  }
  const next = Math.max(0, (int(input.value) || 0) + delta);
  input.value = next > 0 ? next : '';
  onSetInput(ei, s);
}

function updateWsSub() { updateProgress(); }

function addSet(ei) {
  if (!active) return;
  const ex = active.day.exercises[ei];
  const s = active.sets[ei];
  active.sets[ei] = s + 1;
  const container = document.getElementById(`sets-list-${ei}`);
  const div = document.createElement('div');
  div.innerHTML = buildSetRow(ei, s, ex, (prevCache[ei] || { bySet: [] }).bySet[s], suggestionFor(ei, s));
  container.appendChild(div.firstElementChild);
  document.getElementById(`set-count-${ei}`).textContent = `${active.sets[ei]} set`;
  updateWsSub();
  captureActive();
}

function removeSet(ei) {
  if (!active) return;
  const s = active.sets[ei];
  if (s <= 1) return;
  const row = document.getElementById(`set-wrap-${ei}-${s - 1}`);
  const cur = readSet(ei, s - 1);
  if (hasValue(cur) && !confirm(`${s}. sette girilmiş değerler var. Set silinsin mi?`)) return;
  if (row) row.remove();
  if (active.rir) delete active.rir[`${ei}-${s - 1}`];
  active.sets[ei] = s - 1;
  document.getElementById(`set-count-${ei}`).textContent = `${active.sets[ei]} set`;
  updateWsSub();
  captureActive();
}

function completeSet(ei, s) {
  const btn = document.getElementById(`set-done-${ei}-${s}`);
  if (!btn || !active) return;
  getAudioCtx(); // iOS'ta sesi kullanıcı dokunuşuyla açmak için
  if (btn.classList.contains('done')) {
    btn.classList.remove('done');
    captureActive();
    updateProgress();
    return;
  }
  // Boş alanları önceki antrenmanın değerleriyle doldur (gri görünen değerler)
  const row = document.getElementById(`set-row-${ei}-${s}`);
  row.querySelectorAll('input').forEach(inp => {
    const fill = inp.dataset.sug || inp.dataset.prev;
    if (inp.value === '' && fill) inp.value = fill;
  });
  const ex = active.day.exercises[ei];
  const cur = readSet(ei, s);
  const reps = ex.bilateral ? Math.max(cur.repsR, cur.repsL) : cur.reps;
  if (!cur.kg && !reps) {
    toast('Önce kilo ve tekrar gir.');
    return;
  }
  btn.classList.add('done');
  checkOverload(ei, s);
  captureActive();
  updateProgress();
  if (active.mode === 'edit') return;
  // Rekor: geçmiş + bu antrenmanda daha önce tamamlanan setler (tek makara karşılığı)
  const mc = machineFor(ex);
  const sessionSets = [];
  for (let k = 0; k < active.sets[ei]; k++) {
    if (k === s || !document.getElementById(`set-done-${ei}-${k}`)?.classList.contains('done')) continue;
    const o = readSet(ei, k);
    sessionSets.push({ kg: loadKg({ kg: o.kg, cable: mc }), reps: repsOf(ex.bilateral ? o : { reps: o.reps }), date: today() });
  }
  const curLoad = loadKg({ kg: cur.kg, cable: mc });
  const prs = prsForSet(ex.bilateral ? { ...cur, kg: curLoad } : { kg: curLoad, reps: cur.reps }, [...historySets(ex.name), ...sessionSets]);
  if (prs.length) toast(`🏆 ${ex.name}: ${prs.map(p => p.label).join(' · ')}${mc === 'double' && prs.some(p => p.type !== 'reps' || curLoad) ? ' (tek makara karşılığı)' : ''}`, 3200);
  if (DB.settings.restTimerEnabled) startRest(ex.name, restFor(ex.name));
}

// ═══════════════════════════════════════════════
//  REST TIMER
// ═══════════════════════════════════════════════
let restInterval = null;
let restEndTime = 0;
let audioCtx = null;

function getAudioCtx() {
  try {
    if (!audioCtx) {
      const C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      audioCtx = new C();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
  } catch(e) { return null; }
}

function startRest(exName, seconds) {
  stopRest();
  document.getElementById('rest-exercise-label').textContent = exName ? exName + ' sonrası' : 'Dinlenme';
  restEndTime = Date.now() + (seconds || DB.settings.restDuration || 90) * 1000;
  updateRestDisplay();
  document.body.classList.add('rest-on');
  document.getElementById('rest-banner').classList.add('visible');
  restInterval = setInterval(() => {
    if (Date.now() >= restEndTime) {
      stopRest();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 400]);
      playBeep();
      return;
    }
    updateRestDisplay();
  }, 500);
}
function adjustRest(delta) {
  if (!restInterval) return;
  restEndTime = Math.max(Date.now() + 1000, restEndTime + delta * 1000);
  updateRestDisplay();
}
function updateRestDisplay() {
  document.getElementById('rest-display').textContent = fmtDuration(Math.ceil((restEndTime - Date.now()) / 1000));
}
function playBeep() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const t0 = ctx.currentTime;
    [
      { freq: 880,  start: 0,    dur: 0.12 },
      { freq: 880,  start: 0.18, dur: 0.12 },
      { freq: 1320, start: 0.36, dur: 0.28 },
    ].forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t0 + start);
      gain.gain.linearRampToValueAtTime(0.4, t0 + start + 0.01);
      gain.gain.linearRampToValueAtTime(0, t0 + start + dur);
      osc.start(t0 + start);
      osc.stop(t0 + start + dur + 0.05);
    });
  } catch(e) {}
}
function stopRest() {
  clearInterval(restInterval);
  restInterval = null;
  document.body.classList.remove('rest-on');
  document.getElementById('rest-banner').classList.remove('visible');
}
function skipRest() { stopRest(); }

// ═══════════════════════════════════════════════
//  FINISH WORKOUT
// ═══════════════════════════════════════════════
let pendingWorkoutData = null;

// Ekrandaki güncel değerleri okur; boş setler kaydedilmez
function collectWorkoutSets() {
  const sets = [];
  const skipped = active.skipped || [];
  active.day.exercises.forEach((ex, ei) => {
    if (skipped.includes(ei)) return;
    for (let s = 0; s < active.sets[ei]; s++) {
      const cur = readSet(ei, s);
      const set = ex.bilateral
        ? { exId: ex.id, exName: ex.name, setIdx: s, kg: cur.kg, repsR: cur.repsR, repsL: cur.repsL, reps: Math.max(cur.repsR, cur.repsL) }
        : { exId: ex.id, exName: ex.name, setIdx: s, kg: cur.kg, reps: cur.reps };
      const r = active.rir ? active.rir[`${ei}-${s}`] : undefined;
      if (r != null && rirEnabled()) set.rir = r;
      const mc = machineFor(ex);
      if (mc) set.cable = mc;
      if (hasValue(set)) sets.push(set);
    }
  });
  return sets;
}

// ── Antrenman sonu değerlendirme (isteğe bağlı) ──
const FEEDBACK = [
  { key: 'difficulty', label: 'Zorluk', opts: ['Kolay', 'Orta', 'Zor'] },
  { key: 'energy', label: 'Enerji', opts: ['Düşük', 'Normal', 'Yüksek'] },
  { key: 'recovery', label: 'Toparlanma', opts: ['Kötü', 'Orta', 'İyi'] },
];
function feedbackOn() { return DB.settings.feedback === true; }
function feedbackText(fb) {
  if (!fb) return '';
  return FEEDBACK.filter(f => fb[f.key]).map(f => `${f.label}: ${f.opts[fb[f.key] - 1]}`).join(' · ');
}
function renderSumFeedback() {
  const el = document.getElementById('sum-feedback');
  if (!el) return;
  if (!feedbackOn() || !pendingWorkoutData) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const fb = pendingWorkoutData.feedback || {};
  el.style.display = 'block';
  el.innerHTML = `<div class="fb-title">Nasıl geçti? <span>isteğe bağlı</span></div>` + FEEDBACK.map(f => `<div class="fb-row">
      <span class="fb-label">${f.label}</span>
      <div class="fb-opts">${f.opts.map((o, i) => `<button class="fb-opt${fb[f.key] === i + 1 ? ' active' : ''}" onclick="setFeedback('${f.key}',${i + 1})">${o}</button>`).join('')}</div>
    </div>`).join('');
}
function setFeedback(key, v) {
  if (!pendingWorkoutData) return;
  const fb = pendingWorkoutData.feedback || {};
  if (fb[key] === v) delete fb[key]; else fb[key] = v;
  if (Object.keys(fb).length) pendingWorkoutData.feedback = fb; else delete pendingWorkoutData.feedback;
  renderSumFeedback();
}

function finishWorkout() {
  if (!active) return;
  captureActive();
  if (active.mode === 'edit') { saveEditedLog(); return; }
  const day = active.day;
  const duration = Math.floor((Date.now() - active.startTime) / 1000);
  const allSets = collectWorkoutSets();
  const cardio = collectCardio();
  if (!allSets.length && !cardio.length && !confirm('Hiç set girilmedi. Yine de bitirilsin mi?')) return;

  const notes = {}, exNotes = {};
  day.exercises.forEach((ex, ei) => {
    const val = document.getElementById(`note-${ei}`)?.value?.trim();
    if (val) { notes[ex.id] = val; exNotes[normName(ex.name)] = val; }
  });
  const totalVol = Math.round(allSets.reduce((a, s) => a + setVolume(s), 0));
  pendingWorkoutData = { date: today(), dayId: active.dayId, dayName: day.name, sets: allSets, notes, exNotes, duration };
  if (cardio.length) pendingWorkoutData.cardio = cardio;

  document.getElementById('sum-sub').textContent = `${day.name} · ${fmtDate(today())}`;
  document.getElementById('sum-dur').textContent = fmtMins(duration);
  document.getElementById('sum-sets').textContent = allSets.length;
  document.getElementById('sum-vol').textContent = totalVol;

  // Rekorlar: hareket başına, türüne göre (en iyisi)
  const prLines = [];
  day.exercises.forEach(ex => {
    const hist = historySets(ex.name);
    const found = {};
    allSets.filter(s => s.exId === ex.id).forEach(s => prsForSet(s, hist).forEach(p => {
      if (p.type !== 'reps' || !found.reps) found[p.type] = p;   // her türden bir tane
    }));
    const list = ['weight', 'e1rm', 'reps'].map(t => found[t]).filter(Boolean);
    if (list.length) prLines.push(`<b>${escapeHtml(ex.name)}</b> — ${escapeHtml(list.map(p => p.label).join(' · '))}`);
  });
  const prSection = document.getElementById('sum-pr-section');
  if (prLines.length) {
    prSection.style.display = 'block';
    document.getElementById('sum-pr-banner').innerHTML = icon('trophy') + `<div><div class="sum-pr-title">Yeni rekor${prLines.length > 1 ? 'lar' : ''}</div>${prLines.map(l => `<div class="sum-pr-line">${l}</div>`).join('')}</div>`;
  } else {
    prSection.style.display = 'none';
  }

  document.getElementById('sum-ex-list').innerHTML = day.exercises.map(ex => {
    const exSets = allSets.filter(s => s.exId === ex.id);
    if (!exSets.length) return '';
    const vol = Math.round(exSets.reduce((a, s) => a + setVolume(s), 0));
    const detail = exSets.map(s => (s.repsR != null ? `${s.kg}×${s.repsR}/${s.repsL}` : `${s.kg}×${s.reps}`) + (s.rir != null ? ` R${fmtRir(s.rir)}` : '')).join(', ');
    return `<div class="sum-ex-item">
      <div class="sum-ex-name">${escapeHtml(ex.name)}</div>
      <div class="sum-ex-detail">${escapeHtml(detail)} · ${vol} kg${exSets.some(s => s.cable === 'double') ? ' · çift makara' : ''}</div>
    </div>`;
  }).join('') + (cardio.length ? `<div class="sum-ex-item">
      <div class="sum-ex-name">Kardiyo</div>
      <div class="sum-ex-detail">${escapeHtml(cardio.map(fmtCardio).join(', '))}</div>
    </div>` : '');

  renderSumFeedback();
  document.getElementById('summary-overlay').classList.add('open');
  pushLayer('summary');
}

function saveSummary() {
  if (!pendingWorkoutData) return;
  DB.workoutLogs.push(pendingWorkoutData);
  if (!saveData('workoutLogs', DB.workoutLogs)) {
    DB.workoutLogs.pop();
    return;
  }
  pendingWorkoutData = null;
  if (storagePersisted === false) ensurePersistentStorage();
  discardActive();
  document.getElementById('summary-overlay').classList.remove('open');
  closeAllLayers();
  toast('✅ Antrenman kaydedildi!');
  renderHome();
}
function closeSummary() {
  pendingWorkoutData = null;
  closeLayer('summary');
}

// Uygulama yeniden açıldığında yarım kalan antrenmanı geri yükler
function restoreActiveWorkout() {
  const saved = readJSON('activeWorkout', null);
  if (!isPlainObject(saved) || !isPlainObject(saved.day) || !Array.isArray(saved.day.exercises) || !Array.isArray(saved.sets)) {
    lsRemove('activeWorkout');
    return;
  }
  active = saved;
  active.sets = active.day.exercises.map((ex, i) => Math.max(1, parseInt(active.sets[i]) || ex.sets || 1));
  renderExerciseCards();
  applyActiveValues();
  if (active.screenOpen) showWorkoutScreen();
  else showActiveWorkoutBanner();
  toast('↩️ Yarım kalan antrenman geri yüklendi.');
}
// ── Geçmiş antrenmanı düzenleme ──
function startEditLog(idx) {
  const log = DB.workoutLogs[idx];
  if (!log) return;
  if (active) {
    toast(active.mode === 'edit' ? 'Önce açık düzenlemeyi kaydet ya da kapat.' : 'Önce devam eden antrenmanı bitir ya da iptal et.', 3000);
    return;
  }
  const day = getDayById(log.dayId);
  const filled = (log.sets || []).filter(hasValue);
  const nameOf = s => s.exName || (day && (day.exercises.find(e => e.id === s.exId) || {}).name) || s.exId;

  // Gün tanımındaki hareketler + logda olup tanımda olmayanlar
  const exercises = [];
  const seen = new Set();
  if (day) day.exercises.forEach(e => { exercises.push({ ...e }); seen.add(normName(e.name)); });
  filled.forEach(s => {
    const n = nameOf(s);
    if (seen.has(normName(n))) return;
    exercises.push({ id: s.exId || uid(), name: n, sets: 1 });
    seen.add(normName(n));
  });

  const sets = [], values = {}, done = [], notesById = {}, rir = {}, cable = {};
  exercises.forEach((ex, ei) => {
    const mine = filled.filter(s => normName(nameOf(s)) === normName(ex.name));
    if (mine.some(s => s.repsR != null || s.repsL != null)) ex.bilateral = true;
    const withCable = mine.find(s => s.cable);
    if (withCable) cable[ex.id] = withCable.cable;
    let count = ex.sets || 1;
    mine.forEach((s, i) => {
      const si = Number.isInteger(s.setIdx) ? s.setIdx : i;
      count = Math.max(count, si + 1);
      if (s.kg) values[`kg-${ei}-${si}`] = String(s.kg);
      if (ex.bilateral) {
        if (s.repsR) values[`repsR-${ei}-${si}`] = String(s.repsR);
        if (s.repsL) values[`repsL-${ei}-${si}`] = String(s.repsL);
        if (!s.repsR && !s.repsL && s.reps) values[`repsR-${ei}-${si}`] = String(s.reps);
      } else if (s.reps) values[`reps-${ei}-${si}`] = String(s.reps);
      done.push(`set-done-${ei}-${si}`);
      if (s.rir != null) rir[`${ei}-${si}`] = s.rir;
    });
    sets.push(Math.min(20, count));
    const note = noteForExName(log, ex.name);
    if (note) values[`note-${ei}`] = note;
  });

  active = {
    mode: 'edit',
    editIdx: idx,
    editDate: log.date,
    dayId: log.dayId,
    day: { id: log.dayId, name: dayDisplayName(log), exercises },
    startTime: Date.now(),
    sets, values, done, rir, cable,
    cardio: (log.cardio || []).map(c => ({ type: c.type, min: String(c.min || ''), km: c.km ? String(c.km) : '', kcal: c.kcal ? String(c.kcal) : '' })),
    screenOpen: true,
  };
  renderExerciseCards();
  applyActiveValues();
  saveActive();
  if (!swapTopLayer('historyModal', 'workout')) closeLayer('historyModal');
  showWorkoutScreen();
}

function saveEditedLog() {
  const log = DB.workoutLogs[active.editIdx];
  if (!log || log.date !== active.editDate || log.dayId !== active.dayId) {
    toast('❌ Düzenlenen kayıt bulunamadı (silinmiş olabilir).', 3500);
    return;
  }
  const allSets = collectWorkoutSets();
  const cardio = collectCardio();
  if (!allSets.length && !cardio.length && !confirm('Hiç set kalmadı. Antrenman setsiz kaydedilsin mi?')) return;
  const notes = {}, exNotes = {};
  active.day.exercises.forEach((ex, ei) => {
    const val = document.getElementById(`note-${ei}`)?.value?.trim();
    if (val) { notes[ex.id] = val; exNotes[normName(ex.name)] = val; }
  });
  const backup = { sets: log.sets, notes: log.notes, exNotes: log.exNotes, cardio: log.cardio };
  log.sets = allSets; log.notes = notes; log.exNotes = exNotes;
  if (cardio.length) log.cardio = cardio; else delete log.cardio;
  if (!saveData('workoutLogs', DB.workoutLogs)) { Object.assign(log, backup); return; }
  discardActive();
  closeAllLayers();
  toast('✅ Antrenman güncellendi.');
  renderHome();
  if (currentTab === 'stats') renderStats();
}
