// Antrenman Takip — Hareket detayı (grafik, rekorlar, çalışma ağırlıkları), rekor listesi, kas grubu hacmi.

// ═══════════════════════════════════════════════
//  PROGRESS MODAL
// ═══════════════════════════════════════════════
let progressChart = null;

function openProgressModal(exName) {
  document.getElementById('modal-ex-name').textContent = exName;

  const entries = getLogsByExName(exName);
  document.getElementById('modal-ex-sub').textContent =
    entries.length ? `${entries.length} antrenman kaydı (tüm günler)` : 'Henüz kayıt yok';

  const labels = [], oneRMs = [];
  entries.forEach(({ log, sets }) => {
    const best = Math.max(0, ...sets.map(s => calcEpley(loadKg(s), s.reps)));
    if (!best) return;
    labels.push(fmtDateShort(log.date));
    oneRMs.push(best);
  });

  const canvas = document.getElementById('progress-chart');
  if (progressChart) { progressChart.destroy(); progressChart = null; }
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = '#8e8e93';
  if (labels.length && window.Chart) {
    progressChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Tahmini 1RM (kg)',
          data: oneRMs,
          borderColor: chartColor('#007AFF'),
          backgroundColor: chartColor('#007AFF') + '1f',
          fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: chartColor('#007AFF'),
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
          y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 } } },
        }
      }
    });
  } else {
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  renderExerciseRecords(exName);

  const histEl = document.getElementById('modal-history-list');
  if (!entries.length) {
    histEl.innerHTML = '<div style="padding:12px 0;color:var(--text-secondary);font-size:14px;text-align:center;">Henüz kayıt yok</div>';
  } else {
    histEl.innerHTML = [...entries].reverse().slice(0, 8).map(({ log, sets, dayName }) => {
      const summary = sets.map(s => s.repsR != null ? `${s.kg}kg×${s.repsR}/${s.repsL}` : `${s.kg}kg×${s.reps}`).join(', ') + (sets.some(s => s.cable === 'double') ? ' · çift makara' : '');
      const maxORM = Math.max(0, ...sets.map(s => calcEpley(loadKg(s), s.reps)));
      return `<div class="prog-history-item">
        <div>
          <span class="prog-date">${fmtDateShort(log.date)}</span>
          <span style="font-size:10px;color:var(--text-tertiary);margin-left:6px;">${escapeHtml(dayName)}</span>
        </div>
        <span class="prog-vals">${escapeHtml(summary) || '—'} ${maxORM ? `<span style="color:var(--accent);font-size:11px;">(~${maxORM})</span>` : ''}</span>
      </div>`;
    }).join('');
  }
  document.getElementById('progress-modal').classList.add('open');
  pushLayer('progressModal');
}
function closeProgressModal() { closeLayer('progressModal'); }

// Detay: üç rekor türü + tahmini 1RM'den çalışma ağırlıkları
function renderExerciseRecords(exName) {
  const rec = exerciseRecords(exName);
  const recEl = document.getElementById('modal-records');
  const repEl = document.getElementById('modal-rep-prs');
  const pctEl = document.getElementById('modal-pct');
  const show = (el, on) => { el.style.display = on ? '' : 'none'; if (el.previousElementSibling && el.previousElementSibling.classList.contains('prog-history-title')) el.previousElementSibling.style.display = on ? '' : 'none'; };
  if (!rec || (!rec.best && !rec.bwBest)) { recEl.innerHTML = ''; show(repEl, false); show(pctEl, false); return; }
  const tile = (lbl, val, sub) => `<div class="rec-tile"><span class="rec-lbl">${lbl}</span><span class="rec-val">${val}</span><span class="rec-sub">${sub}</span></div>`;
  if (rec.best) {
    recEl.innerHTML = tile('Tahmini 1RM', `${fmtKgTr(rec.best.e1rm)} kg`, `${fmtKgTr(rec.best.kg)}×${rec.best.reps} · ${fmtDateShort(rec.best.date)}`)
      + tile('En ağır', `${fmtKgTr(rec.heaviest.kg)} kg`, `×${rec.heaviest.reps} · ${fmtDateShort(rec.heaviest.date)}`);
    repEl.innerHTML = rec.repsByKg.map(s => `<div class="prog-history-item"><span class="prog-date">${fmtKgTr(s.kg)} kg</span><span class="prog-vals"><b>${s.reps}</b> tekrar <span class="rec-date">${fmtDateShort(s.date)}</span></span></div>`).join('');
    const inc = incFor(exName);
    const roundTo = v => Math.round(v / inc) * inc;
    pctEl.innerHTML = [90, 85, 80, 75, 70].map(p => {
      const reps = Math.round(30 * (100 / p - 1));
      return `<div class="prog-history-item"><span class="prog-date">%${p} · ~${reps} tekrar</span><span class="prog-vals"><b>${fmtKgTr(roundTo(rec.best.e1rm * p / 100))} kg</b></span></div>`;
    }).join('') + `<div class="rec-note">Tahmini 1RM'den hesaplanır; 12+ tekrarda tahmin daha az güvenilir.</div>`;
    show(repEl, true); show(pctEl, true);
  } else {
    recEl.innerHTML = tile('En çok tekrar', `${rec.bwBest.reps}`, `vücut ağırlığı · ${fmtDateShort(rec.bwBest.date)}`);
    show(repEl, false); show(pctEl, false);
  }
}

// ═══════════════════════════════════════════════
//  REKORLAR
// ═══════════════════════════════════════════════
function filterPR(query) {
  const q = normName(query);
  document.querySelectorAll('#pr-list .pr-item').forEach(el => {
    el.style.display = normName(el.dataset.name).includes(q) ? '' : 'none';
  });
}

// ── Kas grupları ──
const MUSCLES = {
  chest: 'Göğüs', back: 'Sırt', shoulders: 'Omuz', rearDelts: 'Arka omuz', biceps: 'Biceps', triceps: 'Triceps',
  quads: 'Ön bacak', hamstrings: 'Arka bacak', glutes: 'Kalça', calves: 'Baldır', abs: 'Karın', traps: 'Trapez',
  forearms: 'Ön kol', other: 'Diğer',
};
// Sıra önemli: özel kalıplar genel kalıplardan önce ("leg curl" → arka bacak, "curl" → biceps)
const MUSCLE_RULES = [
  ['rearDelts', /rear delt|reverse (pec|fly|flye)|face ?pull|arka omuz/],
  ['hamstrings', /leg curl|hamstring|\brdl\b|romanian|nordic|good ?morning|arka bacak/],
  ['quads', /leg ext|squat|leg press|lunge|hack|sissy|step ?up|ön bacak|bacak pres/],
  ['calves', /calf|baldır/],
  ['triceps', /tricep|pushdown|push ?down|skull|jm press|tate press|\bdips?\b|close ?grip|arka kol|french press/],
  ['glutes', /hip thrust|glute|kick ?back|abduct|kalça/],
  ['shoulders', /lateral raise|shoulder|overhead press|military|\bohp\b|arnold|front raise|upright row|omuz/],
  // Ön kol: "reverse curl" ve "wrist curl" biceps sayılmasın diye biceps'ten önce
  ['forearms', /wrist|forearm|reverse curl|ön ?kol|bilek/],
  ['biceps', /curl|bicep|preacher|hammer|pazı/],
  ['traps', /shrug|trap/],
  // "Chest Supported Row" bir sırt hareketi: sırt kuralı göğüsten önce
  ['back', /\blat\b|lats|\brows?\b|pulldown|pull ?up|chin ?up|pullover|deadlift|sırt|kanat/],
  ['chest', /pec|chest|bench|fly|flye|push ?up|crossover|göğüs/],
  ['abs', /crunch|\babs?\b|plank|leg raise|sit ?up|karın|mekik/],
];
function detectMuscle(name) {
  const n = normName(name);
  for (const [m, re] of MUSCLE_RULES) if (re.test(n)) return m;
  return 'other';
}
function muscleFor(name) {
  const o = (DB.settings.muscleByEx || {})[normName(name)];
  return MUSCLES[o] ? o : detectMuscle(name);
}
function setMuscle(name, m) {
  DB.settings.muscleByEx = DB.settings.muscleByEx || {};
  if (m === detectMuscle(name)) delete DB.settings.muscleByEx[normName(name)];
  else DB.settings.muscleByEx[normName(name)] = m;
  saveData('settings', DB.settings);
}

// Son 7 günde (bugün dahil) kas grubu başına dolu set sayısı
function weeklyMuscleSets() {
  const start = logicalNow(); start.setDate(start.getDate() - 6);
  const from = isoDate(start), to = today();
  const counts = {};
  DB.workoutLogs.forEach(log => {
    if (log.date < from || log.date > to) return;
    (log.sets || []).forEach(s => {
      if (!hasValue(s)) return;
      const name = s.exName || (getDayById(log.dayId)?.exercises.find(e => e.id === s.exId) || {}).name;
      if (!name) return;
      const m = muscleFor(name);
      counts[m] = (counts[m] || 0) + 1;
    });
  });
  return counts;
}
// ── Haftalık hacim: gruplar, direkt / dolaylı setler, kişisel hedefler ──
const VOLUME_GROUPS = [
  { id: 'chest', name: 'Göğüs', muscles: ['chest'] },
  { id: 'back', name: 'Sırt', muscles: ['back', 'traps'] },
  { id: 'shoulders', name: 'Omuz', muscles: ['shoulders', 'rearDelts'] },
  { id: 'arms', name: 'Kol', muscles: ['biceps', 'triceps', 'forearms'] },
  { id: 'legs', name: 'Bacak', muscles: ['quads', 'hamstrings', 'glutes', 'calves'] },
  { id: 'abs', name: 'Karın', muscles: ['abs'] },
  { id: 'other', name: 'Diğer', muscles: ['other'] },
];
// Dolaylı çalışma: hareketin birincil kası + hareket kalıbı → yardımcı kaslar (yarım set)
function indirectFor(name) {
  const n = normName(name), m = muscleFor(name);
  if (m === 'chest' && /press|push ?-?ups?|\bdips?\b/.test(n)) return ['shoulders', 'triceps'];
  if (m === 'shoulders' && /press/.test(n)) return ['triceps'];
  if (m === 'back' && /\brows?\b/.test(n)) return ['biceps', 'rearDelts'];
  if (m === 'back' && /pulldown|pull ?-?ups?|chin ?-?ups?/.test(n)) return ['biceps'];
  if (m === 'triceps' && /\bdips?\b|close ?grip/.test(n)) return ['chest'];
  if (m === 'quads' && /squat|leg press|hack|lunge|step ?up/.test(n)) return ['glutes'];
  if (m === 'hamstrings' && /\brdl\b|romanian|deadlift|good ?morning/.test(n)) return ['glutes'];
  return [];
}
function weeklyIndirectSets() {
  const start = logicalNow(); start.setDate(start.getDate() - 6);
  const from = isoDate(start), to = today();
  const out = {};
  DB.workoutLogs.forEach(log => {
    if (log.date < from || log.date > to) return;
    (log.sets || []).forEach(s => {
      if (!hasValue(s)) return;
      const name = s.exName || (getDayById(log.dayId)?.exercises.find(e => e.id === s.exId) || {}).name;
      if (!name) return;
      indirectFor(name).forEach(m => { out[m] = (out[m] || 0) + 0.5; });
    });
  });
  return out;
}
function volumeTargets() { return DB.settings.volumeTargets || {}; }
function fmtSets(v) { return String(Math.round(v * 2) / 2).replace('.', ','); }
const volOpen = new Set();

function renderMuscleCard() {
  const el = document.getElementById('muscle-card');
  if (!el) return;
  const direct = weeklyMuscleSets();
  const showInd = DB.settings.showIndirect === true;
  const indirect = showInd ? weeklyIndirectSets() : {};
  const targets = volumeTargets();
  const inProgram = new Set();
  DB.workoutDays.forEach(d => d.exercises.forEach(e => inProgram.add(muscleFor(e.name))));
  const sum = (obj, ms) => ms.reduce((a, m) => a + (obj[m] || 0), 0);
  const rows = VOLUME_GROUPS.map(g => ({ g, d: sum(direct, g.muscles), i: sum(indirect, g.muscles), t: targets[g.id] || 0,
    used: g.muscles.some(m => inProgram.has(m)) }))
    .filter(r => r.d || r.i || r.t || (r.used && r.g.id !== 'other'));
  if (!rows.length) { el.innerHTML = '<div class="muscle-empty">Henüz veri yok.</div>'; return; }
  const scale = Math.max(10, ...rows.map(r => Math.max(r.d + r.i, r.t))) * 1.12;
  const pct = v => Math.min(100, v / scale * 100);
  el.innerHTML = `<div class="vol-head"><span>Son 7 gün · direkt set</span>
      <button class="vol-toggle${showInd ? ' on' : ''}" onclick="toggleIndirect()">${showInd ? 'Dolaylı: açık' : 'Dolaylı: kapalı'}</button></div>`
    + rows.map(({ g, d, i, t }) => {
      const open = volOpen.has(g.id);
      const subs = g.muscles.filter(m => g.muscles.length > 1 || m !== g.id).map(m => {
        const dv = direct[m] || 0, iv = indirect[m] || 0;
        return `${MUSCLES[m]} <b>${fmtSets(dv)}</b>${showInd && iv ? ` <span class="vol-ind-txt">+${fmtSets(iv)}</span>` : ''}`;
      }).join(' · ');
      const reached = t && d >= t;
      return `<button class="vol-row${d || i ? '' : ' zero'}" onclick="toggleVolDetail('${g.id}')" aria-expanded="${open}">
          <span class="muscle-name">${g.name}</span>
          <span class="muscle-bar">
            <span class="muscle-fill" style="width:${pct(d)}%;"></span>
            ${showInd && i ? `<span class="vol-ind" style="left:${pct(d)}%;width:${pct(i)}%;"></span>` : ''}
            ${t ? `<span class="vol-target" style="left:calc(${pct(t)}% - 1px);"></span>` : ''}
          </span>
          <span class="muscle-num${reached ? ' reached' : ''}">${fmtSets(d)}${t ? `<small>/${t}</small>` : ''}</span>
        </button>
        <div class="vol-detail" id="vol-detail-${g.id}" style="display:${open ? 'block' : 'none'};">
          ${subs ? `<div class="vol-subs">${subs}</div>` : ''}
          ${showInd && i ? `<div class="vol-subs">Dolaylı: ${fmtSets(i)} set (yardımcı kas olarak, yarım sayılır)</div>` : ''}
          <div class="vol-target-row"><span>Haftalık hedef</span>
            <div class="dur-stepper"><button onclick="changeVolTarget('${g.id}',-1)" aria-label="Azalt">${icon('minus')}</button><span>${t ? t + ' set' : 'yok'}</span><button onclick="changeVolTarget('${g.id}',1)" aria-label="Artır">${icon('plus')}</button></div>
          </div>
        </div>`;
    }).join('')
    + `<div class="muscle-legend">Gruba dokununca kas detayı ve hedef. Hedefleri sen belirlersin; hedef koymadığın gruplar eksik sayılmaz. Kas grubunu hareketin ⋯ menüsünden değiştirebilirsin.</div>`;
}
function toggleVolDetail(id) {
  if (volOpen.has(id)) volOpen.delete(id); else volOpen.add(id);
  renderMuscleCard();
}
function toggleIndirect() {
  DB.settings.showIndirect = !(DB.settings.showIndirect === true);
  saveData('settings', DB.settings);
  renderMuscleCard();
}
function changeVolTarget(id, dir) {
  const t = Object.assign({}, volumeTargets());
  const next = Math.max(0, Math.min(40, (t[id] || (dir > 0 ? 9 : 0)) + dir));
  if (next) t[id] = next; else delete t[id];
  DB.settings.volumeTargets = t;
  saveData('settings', DB.settings);
  renderMuscleCard();
}

function renderStats() {
  renderMuscleCard();
  renderPrList();
  const search = document.getElementById('pr-search');
  if (search) search.value = '';
}

function renderPrList() {
  const list = document.getElementById('pr-list');
  const names = {};
  DB.workoutLogs.forEach(log => (log.sets || []).forEach(s => {
    if (s.exName && hasValue(s)) names[normName(s.exName)] = names[normName(s.exName)] || s.exName.trim();
  }));
  const items = Object.values(names).map(n => ({ name: n, rec: exerciseRecords(n) })).filter(x => x.rec);
  if (!items.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:14px;">Henüz antrenman kaydı yok.</div>';
    return;
  }
  // En son yapılan hareketler üstte
  items.sort((a, b) => String(b.rec.last).localeCompare(String(a.rec.last)) || a.name.localeCompare(b.name, 'tr'));
  list.innerHTML = items.map(({ name, rec }) => {
    const pl = plateauInfo(name);
    const main = rec.best
      ? { val: `${fmtKgTr(rec.best.e1rm)} kg`, lbl: 'tahmini 1RM', sub: `En iyi set ${fmtKgTr(rec.best.kg)}×${rec.best.reps} · ${fmtDateShort(rec.best.date)}` }
      : { val: `${rec.bwBest.reps} tekrar`, lbl: 'en çok', sub: `Vücut ağırlığı · ${fmtDateShort(rec.bwBest.date)}` };
    return `<button class="pr-item" data-name="${escapeHtml(name)}" onclick="openProgressModal(this.dataset.name)">
      <div class="pr-row"><span class="pr-name">${escapeHtml(name)}</span><span class="pr-main">${main.val}</span></div>
      <div class="pr-row pr-row2"><span>${main.sub}${pl ? ` <span class="pr-plateau">${icon('alert')}${pl.declining ? 'Düşüşte' : 'Plato'} · ${pl.stalled} antrenman</span>` : ''}</span><span class="pr-main-lbl">${main.lbl}</span></div>
    </button>`;
  }).join('');
}
