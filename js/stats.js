// Antrenman Takip — İlerleme grafiği, PR listesi, 1RM hesaplayıcı, kas grubu dağılımı, plato tespiti.

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

// ═══════════════════════════════════════════════
//  PR & 1RM
// ═══════════════════════════════════════════════
function stepOrm(field, delta) {
  const input = document.getElementById(`orm-${field}`);
  const base = num(input.value) || 0;
  if (field === 'kg') input.value = Math.max(0, Math.round((base + delta) * 100) / 100) || '';
  else input.value = Math.max(1, Math.round(base + delta)) || '';
}

function calculateOrm() {
  const kg = num(document.getElementById('orm-kg').value);
  const reps = int(document.getElementById('orm-reps').value);
  if (!(kg > 0) || !(reps > 0)) { toast('Ağırlık ve tekrar girin.'); return; }
  const orm = calcEpley(kg, reps);
  document.getElementById('orm-result').style.display = 'block';
  document.getElementById('orm-result-val').textContent = orm + ' kg';
  const pcts = [100,95,90,85,80,75,70];
  document.getElementById('orm-result-grid').innerHTML = pcts.map(p => {
    const w = Math.round(orm * p / 100 * 10) / 10;
    const r = p === 100 ? 1 : p >= 95 ? 2 : p >= 90 ? 3 : p >= 85 ? 4 : p >= 80 ? 5 : p >= 75 ? 7 : 10;
    return `<div class="orm-pct-row"><span class="orm-pct-label">%${p} · ~${r} tk</span><span class="orm-pct-val">${w} kg</span></div>`;
  }).join('');
}

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
  ['biceps', /curl|bicep|preacher|hammer|pazı/],
  ['traps', /shrug|trap/],
  // "Chest Supported Row" bir sırt hareketi: sırt kuralı göğüsten önce
  ['back', /\blat\b|lats|\brows?\b|pulldown|pull ?up|chin ?up|pullover|deadlift|sırt|kanat/],
  ['chest', /pec|chest|bench|fly|flye|push ?up|crossover|göğüs/],
  ['abs', /crunch|\babs?\b|plank|leg raise|sit ?up|karın|mekik/],
  ['forearms', /wrist|forearm|ön kol|bilek/],
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
  if (!DB.workoutLogs.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:14px;">Henüz antrenman kaydı yok.</div>';
    return;
  }

  // Aynı hareket büyük/küçük harf farkıyla yazılmış olsa da tek satırda toplanır
  const prMap = {};
  DB.workoutLogs.forEach(log => {
    (log.sets || []).forEach(s => {
      if (!s.exName || !hasValue(s)) return;
      const key = normName(s.exName);
      if (!prMap[key]) prMap[key] = { name: s.exName.trim(), bestKg: 0, bestKgReps: 0, best1RM: 0, bestVol: 0, best1RMDate: '' };
      const pr = prMap[key];
      const kg = s.kg || 0, reps = s.reps || 0;
      if (kg > pr.bestKg || (kg === pr.bestKg && reps > pr.bestKgReps)) { pr.bestKg = kg; pr.bestKgReps = reps; }
      const orm = calcEpley(kg, reps);
      if (orm > pr.best1RM) { pr.best1RM = orm; pr.best1RMDate = log.date; }
      pr.bestVol = Math.max(pr.bestVol, Math.round(kg * reps * 10) / 10);
    });
  });

  const entries = Object.values(prMap).sort((a,b) => a.name.localeCompare(b.name, 'tr'));
  if (!entries.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:14px;">Kayıtlı set bulunamadı.</div>';
    return;
  }

  list.innerHTML = entries.map(pr => `
    <div class="pr-item" data-name="${escapeHtml(pr.name)}">
      <div class="pr-name">${escapeHtml(pr.name)}${(() => { const pl = plateauInfo(pr.name); return pl ? `<span class="pr-plateau">${icon('alert')}Plato · ${pl.stalled} antrenman</span>` : ''; })()}</div>
      <div class="pr-stats">
        <div class="pr-stat"><span class="pr-stat-val">${pr.bestKg} kg</span><span class="pr-stat-sub">${pr.bestKgReps} tekrar</span><span class="pr-stat-lbl">Max ağırlık</span></div>
        <div class="pr-stat"><span class="pr-stat-val">${pr.best1RM} kg</span><span class="pr-stat-sub">&nbsp;</span><span class="pr-stat-lbl">Tahmini 1RM</span></div>
        <div class="pr-stat"><span class="pr-stat-val">${pr.bestVol} kg</span><span class="pr-stat-sub">&nbsp;</span><span class="pr-stat-lbl">Max hacim/set</span></div>
      </div>
      ${pr.best1RMDate ? `<div class="pr-date">1RM rekoru: ${fmtDate(pr.best1RMDate)}</div>` : ''}
    </div>
  `).join('');
}
