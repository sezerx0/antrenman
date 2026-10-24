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
    const best = Math.max(0, ...sets.map(s => calcEpley(s.kg, s.reps)));
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
      const summary = sets.map(s => s.repsR != null ? `${s.kg}kg×${s.repsR}/${s.repsL}` : `${s.kg}kg×${s.reps}`).join(', ');
      const maxORM = Math.max(0, ...sets.map(s => calcEpley(s.kg, s.reps)));
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
  ['triceps', /tricep|pushdown|push ?down|skull|\bdips?\b|close ?grip|arka kol|french press/],
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
function renderMuscleCard() {
  const el = document.getElementById('muscle-card');
  if (!el) return;
  const counts = weeklyMuscleSets();
  // Programdaki kas gruplarını sıfır olsa bile göster: ihmal edileni görmek için
  const inProgram = new Set();
  DB.workoutDays.forEach(d => d.exercises.forEach(e => inProgram.add(muscleFor(e.name))));
  const keys = Object.keys(MUSCLES).filter(k => counts[k] || inProgram.has(k));
  if (!keys.length) { el.innerHTML = '<div class="muscle-empty">Henüz veri yok.</div>'; return; }
  keys.sort((a, b) => (counts[b] || 0) - (counts[a] || 0) || MUSCLES[a].localeCompare(MUSCLES[b], 'tr'));
  const scale = Math.max(20, ...keys.map(k => counts[k] || 0));
  const zoneL = 10 / scale * 100, zoneW = 10 / scale * 100;
  el.innerHTML = keys.map(k => {
    const n = counts[k] || 0;
    return `<div class="muscle-row${n ? '' : ' zero'}">
      <span class="muscle-name">${MUSCLES[k]}</span>
      <div class="muscle-bar"><div class="muscle-zone" style="left:${zoneL}%;width:${zoneW}%;"></div><div class="muscle-fill" style="width:${n / scale * 100}%;"></div></div>
      <span class="muscle-num">${n}</span>
    </div>`;
  }).join('') + `<div class="muscle-legend"><i></i>Haftada 10–20 set, çoğu kişi için yaygın bir hacim aralığı. Kas grubunu hareketin ⋯ menüsünden değiştirebilirsin.</div>`;
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
      <div class="pr-row pr-row2"><span>${main.sub}${pl ? ` <span class="pr-plateau">${icon('alert')}Plato · ${pl.stalled} antrenman</span>` : ''}</span><span class="pr-main-lbl">${main.lbl}</span></div>
    </button>`;
  }).join('');
}
