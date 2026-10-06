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
function prevForExercise(ex) {
  const exclude = active && active.mode === 'edit' ? DB.workoutLogs[active.editIdx] : null;
  const all = getLogsByExName(ex.name).filter(e => e.log !== exclude);
  const entry = all.length ? all[all.length - 1] : null;
  const bySet = [];
  if (entry) entry.sets.forEach((s, i) => {
    const idx = Number.isInteger(s.setIdx) ? s.setIdx : i;
    if (bySet[idx] === undefined) bySet[idx] = s;
  });
  return { entry, bySet };
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
  return `<div class="set-row${sug && sug.up ? ' sug-up' : ''}" id="set-row-${id}">
    <span class="set-num">${s+1}</span>
    ${prevCell(ei, s, ps)}
    <div class="kg-stepper">
      <button class="stepper-btn" onclick="stepKg(${ei},${s},-2.5)" type="button">−</button>
      <input class="kg-val" type="text" inputmode="decimal" placeholder="${escapeHtml(phKg || 'kg')}" data-prev="${escapeHtml(prevKg)}"${sugAttr(sug && sug.kg)} id="kg-${id}" oninput="onSetInput(${ei},${s})" onkeydown="handleSetNav(event,'kg',${ei},${s})">
      <button class="stepper-btn" onclick="stepKg(${ei},${s},2.5)" type="button">+</button>
    </div>
    ${repsHtml}
    <button class="set-done-btn" onclick="completeSet(${ei},${s})" id="set-done-${id}" aria-label="Seti tamamla">${icon('check')}</button>
  </div>`;
}

// "Önceki" sütunu: bu hareketin son yapıldığı antrenmanda aynı sıradaki set.
// Dokununca değerler satıra doldurulur (set işaretlenmez).
function prevCell(ei, s, ps) {
  if (!ps || !hasValue(ps)) return `<span class="set-prev empty" aria-label="Önceki set yok">—</span>`;
  const bi = ps.repsR != null || ps.repsL != null;
  const kg = ps.kg ? String(ps.kg) : 'VA';
  const reps = bi ? `${ps.repsR || 0}/${ps.repsL || 0}` : `${ps.reps || 0}`;
  const label = `Önceki: ${ps.kg ? ps.kg + ' kg' : 'vücut ağırlığı'} × ${bi ? `sağ ${ps.repsR || 0}, sol ${ps.repsL || 0}` : (ps.reps || 0)} tekrar. Dokun: satıra doldur`;
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
const REP_RANGES = [null, [6, 8], [8, 10], [8, 12], [10, 15], [12, 20]];
function repRangeFor(exName) {
  const r = (DB.settings.repRangeByEx || {})[normName(exName)];
  return Array.isArray(r) && r.length === 2 ? r : null;
}
function kgStep() { return DB.settings.kgStep || 2.5; }
function suggestSet(ex, ps, range) {
  if (!range || !ps || !hasValue(ps)) return null;
  const [lo, hi] = range;
  // Sağ/sol ayrı tekrarda zayıf taraf belirleyici
  const sides = [ps.repsR, ps.repsL].filter(v => v > 0);
  const reps = sides.length ? Math.min(...sides) : (ps.reps || 0);
  const kg = ps.kg || 0;
  if (!reps) return null;
  if (reps >= hi) {
    if (!kg) return { kg: 0, reps: hi, up: false };          // vücut ağırlığı: tekrarı koru
    return { kg: round2(kg + kgStep()), reps: lo, up: true };
  }
  if (reps < lo) return { kg, reps: lo, up: false };
  return { kg, reps: reps + 1, up: false };
}
function suggestionFor(ei, s) {
  if (!active || active.mode === 'edit') return null;
  const ex = active.day.exercises[ei];
  const pc = prevCache[ei];
  return pc ? suggestSet(ex, pc.bySet[s], repRangeFor(ex.name)) : null;
}
function cycleRepRange(ei) {
  if (!active) return;
  const ex = active.day.exercises[ei];
  const cur = repRangeFor(ex.name);
  const idx = REP_RANGES.findIndex(r => (r && cur) ? r[0] === cur[0] && r[1] === cur[1] : r === cur);
  const next = REP_RANGES[(idx + 1) % REP_RANGES.length];
  DB.settings.repRangeByEx = DB.settings.repRangeByEx || {};
  if (next) DB.settings.repRangeByEx[normName(ex.name)] = next;
  else delete DB.settings.repRangeByEx[normName(ex.name)];
  saveData('settings', DB.settings);
  captureActive();
  renderExerciseCards();
  applyActiveValues();
  toast(next ? `🎯 ${ex.name}: ${next[0]}–${next[1]} tekrar hedefi` : `🎯 ${ex.name}: hedef kapalı`, 1800);
}

const REST_OPTIONS = [60, 90, 120, 150, 180, 240];
function fmtRest(sec) { return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
function restFor(exName) {
  const map = DB.settings.restByEx || {};
  return map[normName(exName)] || DB.settings.restDuration || 90;
}
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
    const { entry, bySet } = prevCache[ei];

    let prevHint = '';
    if (entry) {
      const dayLabel = entry.dayName ? ` · ${escapeHtml(entry.dayName)}` : '';
      const extra = bySet.slice(active.sets[ei]).filter(s => s && hasValue(s));
      const extraTxt = extra.length ? ` · fazladan ${extra.length} set: <b>${escapeHtml(extra.map(fmtSetShort).join(', '))}</b>` : '';
      prevHint = `<div class="ex-prev-hint">Önceki: ${fmtDateShort(entry.log.date)}${dayLabel}${extraTxt}</div>`;
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
      ? `<button class="ex-chip${restMap[normName(ex.name)] ? ' custom' : ''}" id="rest-chip-${ei}" onclick="cycleRest(${ei})" aria-label="Dinlenme süresi">${icon('timer')}${fmtRest(rest)}</button>`
      : '';

    const range = repRangeFor(ex.name);
    const sugs = [];
    let setRows = '';
    for (let s = 0; s < active.sets[ei]; s++) {
      const sug = isEdit ? null : suggestSet(ex, bySet[s], range);
      sugs.push(sug);
      setRows += buildSetRow(ei, s, ex, bySet[s], sug);
    }
    const sugList = sugs.filter(Boolean);
    const sugLine = sugList.length
      ? `<div class="ex-sug">${icon('trend-up')}<span>Bugün: ${sugList.map(g => `<b>${escapeHtml(g.kg ? g.kg + '×' + g.reps : g.reps + ' tk')}${g.up ? icon('arrow-up', 'up') : ''}</b>`).join(', ')}</span></div>`
      : '';
    const rangeChip = isEdit ? '' : `<button class="ex-chip${range ? ' custom' : ''}" id="range-chip-${ei}" onclick="cycleRepRange(${ei})" aria-label="Hedef tekrar aralığı">${icon('target')}${range ? `${range[0]}–${range[1]}` : 'Hedef'}</button>`;

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
  }).join('');
  updateProgress();
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
function cycleRest(ei) {
  if (!active) return;
  const ex = active.day.exercises[ei];
  const cur = restFor(ex.name);
  const next = REST_OPTIONS[(REST_OPTIONS.indexOf(cur) + 1) % REST_OPTIONS.length] || REST_OPTIONS[0];
  DB.settings.restByEx = DB.settings.restByEx || {};
  if (next === (DB.settings.restDuration || 90)) delete DB.settings.restByEx[normName(ex.name)];
  else DB.settings.restByEx[normName(ex.name)] = next;
  saveData('settings', DB.settings);
  // Aynı isimli tüm kartları güncelle
  active.day.exercises.forEach((e, i) => {
    if (normName(e.name) !== normName(ex.name)) return;
    const chip = document.getElementById(`rest-chip-${i}`);
    if (!chip) return;
    chip.innerHTML = icon('timer') + fmtRest(next);
    chip.classList.toggle('custom', !!DB.settings.restByEx[normName(ex.name)]);
  });
  toast(`⏱ ${ex.name}: ${fmtRest(next)} dinlenme`, 1500);
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
  const m = muscleFor(ex.name);
  rows.push(`<label class="sheet-row">${icon('target')}Kas grubu
    <select onchange="setMuscle(active.day.exercises[exSheetIdx].name, this.value); toast('Kas grubu: ' + MUSCLES[this.value], 1500)">
      ${Object.entries(MUSCLES).map(([k, v]) => `<option value="${k}"${k === m ? ' selected' : ''}>${v}</option>`).join('')}
    </select></label>`);
  body.innerHTML = `<div class="sheet-list">${rows.join('')}</div>`;
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

function checkOverload(ei, s) {
  const kgEl  = document.getElementById(`kg-${ei}-${s}`);
  const rowEl = document.getElementById(`set-row-${ei}-${s}`);
  if (!kgEl || !rowEl || !active) return;
  const ex = active.day.exercises[ei];
  const cur = readSet(ei, s);
  const reps = ex.bilateral ? Math.max(cur.repsR, cur.repsL) : cur.reps;
  const prevKg = num(kgEl.dataset.prev) || 0;
  let prevReps;
  if (ex.bilateral) {
    prevReps = Math.max(int(document.getElementById(`repsR-${ei}-${s}`)?.dataset.prev) || 0,
                        int(document.getElementById(`repsL-${ei}-${s}`)?.dataset.prev) || 0);
  } else {
    prevReps = int(document.getElementById(`reps-${ei}-${s}`)?.dataset.prev) || 0;
  }
  const isOverload = cur.kg > 0 && reps > 0 && prevKg > 0 && prevReps > 0
    && (cur.kg > prevKg || (cur.kg >= prevKg && reps > prevReps));
  rowEl.classList.toggle('overload', isOverload);
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

function stepKg(ei, s, delta) {
  const input = document.getElementById(`kg-${ei}-${s}`);
  if (!input) return;
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
  const row = document.getElementById(`set-row-${ei}-${s - 1}`);
  const cur = readSet(ei, s - 1);
  if (hasValue(cur) && !confirm(`${s}. sette girilmiş değerler var. Set silinsin mi?`)) return;
  if (row) row.remove();
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
  if (cur.kg && reps && isPR(ex.name, cur.kg * reps)) toast('🏆 Yeni kişisel rekor!');
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
      if (hasValue(set)) sets.push(set);
    }
  });
  return sets;
}

function finishWorkout() {
  if (!active) return;
  captureActive();
  if (active.mode === 'edit') { saveEditedLog(); return; }
  const day = active.day;
  const duration = Math.floor((Date.now() - active.startTime) / 1000);
  const allSets = collectWorkoutSets();
  if (!allSets.length && !confirm('Hiç set girilmedi. Yine de bitirilsin mi?')) return;

  const notes = {}, exNotes = {};
  day.exercises.forEach((ex, ei) => {
    const val = document.getElementById(`note-${ei}`)?.value?.trim();
    if (val) { notes[ex.id] = val; exNotes[normName(ex.name)] = val; }
  });
  const totalVol = Math.round(allSets.reduce((a, s) => a + setVolume(s), 0));
  pendingWorkoutData = { date: today(), dayId: active.dayId, dayName: day.name, sets: allSets, notes, exNotes, duration };

  document.getElementById('sum-sub').textContent = `${day.name} · ${fmtDate(today())}`;
  document.getElementById('sum-dur').textContent = fmtMins(duration);
  document.getElementById('sum-sets').textContent = allSets.length;
  document.getElementById('sum-vol').textContent = totalVol;

  const prList = [];
  day.exercises.forEach(ex => {
    allSets.filter(s => s.exId === ex.id && s.kg && s.reps).forEach(s => {
      if (isPR(ex.name, s.kg * s.reps) && !prList.includes(ex.name)) prList.push(ex.name);
    });
  });
  const prSection = document.getElementById('sum-pr-section');
  if (prList.length) {
    prSection.style.display = 'block';
    document.getElementById('sum-pr-banner').innerHTML = icon('trophy') + `<span>${escapeHtml(prList.join(', '))} — Yeni kişisel rekor!</span>`;
  } else {
    prSection.style.display = 'none';
  }

  document.getElementById('sum-ex-list').innerHTML = day.exercises.map(ex => {
    const exSets = allSets.filter(s => s.exId === ex.id);
    if (!exSets.length) return '';
    const vol = Math.round(exSets.reduce((a, s) => a + setVolume(s), 0));
    const detail = exSets.map(s => s.repsR != null ? `${s.kg}×${s.repsR}/${s.repsL}` : `${s.kg}×${s.reps}`).join(', ');
    return `<div class="sum-ex-item">
      <div class="sum-ex-name">${escapeHtml(ex.name)}</div>
      <div class="sum-ex-detail">${escapeHtml(detail)} · ${vol} kg</div>
    </div>`;
  }).join('');

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

  const sets = [], values = {}, done = [], notesById = {};
  exercises.forEach((ex, ei) => {
    const mine = filled.filter(s => normName(nameOf(s)) === normName(ex.name));
    if (mine.some(s => s.repsR != null || s.repsL != null)) ex.bilateral = true;
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
    sets, values, done,
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
  if (!allSets.length && !confirm('Hiç set kalmadı. Antrenman setsiz kaydedilsin mi?')) return;
  const notes = {}, exNotes = {};
  active.day.exercises.forEach((ex, ei) => {
    const val = document.getElementById(`note-${ei}`)?.value?.trim();
    if (val) { notes[ex.id] = val; exNotes[normName(ex.name)] = val; }
  });
  const backup = { sets: log.sets, notes: log.notes, exNotes: log.exNotes };
  log.sets = allSets; log.notes = notes; log.exNotes = exNotes;
  if (!saveData('workoutLogs', DB.workoutLogs)) { Object.assign(log, backup); return; }
  discardActive();
  closeAllLayers();
  toast('✅ Antrenman güncellendi.');
  renderHome();
  if (currentTab === 'stats') renderStats();
}
