// Antrenman Takip — Ana sekme: gün seçimi, haftalık hedef / kahraman kart, takvim, son antrenmanlar, yedek hatırlatması.

// ═══════════════════════════════════════════════
//  HOME SCREEN
// ═══════════════════════════════════════════════
function renderHome() {
  document.getElementById('home-date').textContent = logicalNow().toLocaleDateString('tr-TR', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  renderDaySelectList();

  const monthStr = today().slice(0,7);
  const monthLogs = DB.workoutLogs.filter(l => String(l.date).startsWith(monthStr));
  document.getElementById('stat-month-count').textContent = monthLogs.length;
  document.getElementById('stat-total-count').textContent = DB.workoutLogs.length;

  renderHeatmap();
  renderRecentList();
  renderWeeklyGoal();
  renderBackupNudge();
}

// ── Yedek hatırlatması ──
// En az 3 antrenman kaydı varken son yedek 14 günden eskiyse (ya da hiç
// yoksa) ana sekmede gösterilir. "Sonra" 7 gün erteler.
function daysBetween(a, b) { return Math.floor((new Date(b) - new Date(a)) / 86400000); }
function backupNudgeState() {
  if (DB.workoutLogs.length < 3) return null;
  const last = lsGet('lastBackup');
  const age = last ? daysBetween(last, today()) : null;
  if (age !== null && age < 14) return null;
  const snooze = DB.settings.backupSnoozeUntil;
  if (snooze && today() < snooze) return null;
  return { age };
}
function renderBackupNudge() {
  const el = document.getElementById('backup-nudge');
  if (!el) return;
  const st = backupNudgeState();
  if (!st) { el.style.display = 'none'; el.innerHTML = ''; return; }
  const title = st.age === null ? 'Henüz hiç yedek almadın' : `Son yedek ${st.age} gün önce`;
  el.style.display = 'block';
  el.innerHTML = `<div class="nudge-card">
    <div class="nudge-icon">${icon('upload')}</div>
    <div class="nudge-body">
      <div class="nudge-title">${title}</div>
      <div class="nudge-sub">${DB.workoutLogs.length} antrenman kaydın sadece bu telefonda duruyor. Bir yedek dosyası al, telefon değişse de kaybolmasın.</div>
      <div class="nudge-actions">
        <button class="nudge-primary" onclick="exportData()">Yedek Al</button>
        <button class="nudge-secondary" onclick="snoozeBackupNudge()">Sonra</button>
      </div>
    </div>
  </div>`;
}
function snoozeBackupNudge() {
  const d = logicalNow();
  d.setDate(d.getDate() + 7);
  DB.settings.backupSnoozeUntil = isoDate(d);
  saveData('settings', DB.settings);
  renderBackupNudge();
}

function renderRoutine() {
  document.getElementById('routine-date').textContent = logicalNow().toLocaleDateString('tr-TR', { weekday:'long', day:'numeric', month:'long' });
  renderSuppl();
  renderSupplCalendar();
}

function renderDaySelectList() {
  const nextId = getNextDayId();
  const container = document.getElementById('day-select-list');
  if (!container) return;

  const lastLogByDay = {};
  DB.workoutLogs.forEach(log => {
    if (!lastLogByDay[log.dayId] || log.date > lastLogByDay[log.dayId].date) lastLogByDay[log.dayId] = log;
  });

  container.innerHTML = DB.workoutDays.map(day => {
    const isNext = day.id === nextId;
    const exCount = day.exercises.length;
    const setCount = day.exercises.reduce((a, e) => a + e.sets, 0);
    const lastLog = lastLogByDay[day.id];
    const lastDateStr = lastLog ? fmtDate(lastLog.date) : null;

    return `<div class="card day-select-card ${isNext ? 'day-select-next' : ''}" onclick="openWorkoutScreen(${jsArg(day.id)})">
      <div class="day-select-left">
        <div class="day-select-badge" style="${dayBadgeStyle(day.id)}">${escapeHtml(dayCode(day.name))}</div>
        <div>
          <div class="day-select-name">${escapeHtml(day.name)}${isNext ? ' <span class="next-tag">Sıradaki</span>' : ''}</div>
          <div class="day-select-meta">${exCount} hareket · ${setCount} set${lastDateStr ? ` · Son: ${lastDateStr}` : ''}</div>
        </div>
      </div>
      <div class="day-select-arrow">›</div>
    </div>`;
  }).join('');
}

const DAY_PALETTE = ['#007aff','#34c759','#ff9f0a','#af52de','#ff3b30','#5ac8fa'];
const DAY_PALETTE_LIME = ['#C8F169','#1C2420','#8FBF3A','#5B6B60','#E4F6B8','#3A4740'];
const DAY_PALETTE_LIME_DARK = ['#C8F169','#F1F4EC','#8FBF3A','#7E8C82','#E4F6B8','#4E5C53'];
function dayColorMap() {
  const pal = isLime() ? (isDarkMode() ? DAY_PALETTE_LIME_DARK : DAY_PALETTE_LIME) : DAY_PALETTE;
  const map = {};
  DB.workoutDays.forEach((d, i) => { map[d.id] = pal[i % pal.length]; });
  return map;
}
// Arka plan rengine göre okunur yazı rengi
function textOn(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return '#fff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) > 160 ? '#1C2420' : '#fff';
}

let workoutCalOffset = 0;
function shiftWorkoutCal(d) { workoutCalOffset += d; renderHeatmap(); }

function renderHeatmap() {
  const base = logicalNow();
  base.setDate(1);
  base.setMonth(base.getMonth() + workoutCalOffset);
  const year = base.getFullYear();
  const month = base.getMonth();

  const titleEl = document.getElementById('workout-cal-title');
  const dowsEl = document.getElementById('workout-cal-dows');
  const gridEl = document.getElementById('workout-cal-grid');
  const legendEl = document.getElementById('workout-cal-legend');
  if (!gridEl) return;

  titleEl.textContent = base.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  dowsEl.innerHTML = ['Pt','Sa','Ça','Pe','Cu','Ct','Pz'].map(d => `<div class="workout-cal-dow">${d}</div>`).join('');

  const monthStr = `${year}-${String(month+1).padStart(2,'0')}`;
  const monthLogs = DB.workoutLogs.filter(l => String(l.date).startsWith(monthStr));
  const logByDate = {};
  monthLogs.forEach(l => { logByDate[l.date] = l; });
  const dayColors = dayColorMap();

  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = today();

  let html = '';
  for (let i = 0; i < firstDow; i++) html += `<div class="wcal-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${monthStr}-${String(d).padStart(2,'0')}`;
    const log = logByDate[dateStr];
    const isToday = dateStr === todayStr ? ' today' : '';
    if (log) {
      const color = dayColors[log.dayId] || '#8e8e93';
      html += `<div class="wcal-day has-workout${isToday}" style="background:${color}${isToday && !isLime() ? ';outline-color:'+color : ''};">
        <span class="wcal-num" style="color:${textOn(color)};">${d}</span>
      </div>`;
    } else {
      html += `<div class="wcal-day${isToday}"><span class="wcal-num">${d}</span></div>`;
    }
  }
  gridEl.innerHTML = html;

  const seen = [];
  monthLogs.forEach(l => { if (!seen.find(x => x.dayId === l.dayId)) seen.push(l); });
  if (seen.length) {
    legendEl.innerHTML = seen.map(l =>
      `<div class="wcal-legend-item"><div class="wcal-legend-dot" style="background:${dayColors[l.dayId] || '#8e8e93'};box-shadow:inset 0 0 0 1px var(--border-strong);"></div>${escapeHtml(dayDisplayName(l))}</div>`
    ).join('');
  } else {
    legendEl.innerHTML = `<span style="color:var(--text-secondary);font-size:12px;">Bu ay antrenman yok</span>`;
  }
}

function renderRecentList() {
  const list = document.getElementById('recent-list');
  const items = DB.workoutLogs.map((log, idx) => ({ log, idx })).reverse().slice(0, 7);
  if (!items.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:14px;">Henüz antrenman kaydedilmedi.</div>';
    return;
  }
  list.innerHTML = items.map(({ log, idx }) => {
    const name = dayDisplayName(log);
    const initial = dayCode(name);
    const dur = log.duration ? fmtMins(log.duration) : '';
    const vol = logVolume(log);
    return `<div class="recent-item" onclick="openHistoryModal(${idx})">
      <div class="recent-dot" style="${dayBadgeStyle(log.dayId)}"><span style="color:inherit;">${escapeHtml(initial)}</span></div>
      <div class="recent-info">
        <div class="recent-name">${escapeHtml(name)}</div>
        <div class="recent-date">${fmtDate(log.date)}${vol ? ' · ' + vol + ' kg hacim' : ''}</div>
      </div>
      ${dur ? `<div class="recent-dur">${dur}</div>` : ''}
      <span style="color:var(--text-secondary);font-size:18px;margin-left:2px;">›</span>
    </div>`;
  }).join('');
}

// ── Workout History Detail ──
let historyIdx = -1;
function openHistoryModal(idx) {
  const log = DB.workoutLogs[idx];
  if (!log) return;
  historyIdx = idx;
  document.getElementById('hm-day-name').textContent = dayDisplayName(log);
  const dur = log.duration ? `${fmtMins(log.duration)} · ` : '';
  document.getElementById('hm-meta').textContent = `${fmtDate(log.date)} · ${dur}${logVolume(log)} kg hacim`;

  const byEx = {};
  const order = [];
  (log.sets || []).filter(hasValue).forEach(s => {
    const key = s.exName || s.exId;
    if (!byEx[key]) { byEx[key] = []; order.push(key); }
    byEx[key].push(s);
  });

  const body = document.getElementById('hm-body');
  body.innerHTML = order.length ? order.map(exName => {
    const sets = byEx[exName];
    const rows = sets.map((s, i) => {
      const vol = Math.round(setVolume(s));
      const repsTxt = (s.repsR != null || s.repsL != null)
        ? `S ${s.repsR || 0} / L ${s.repsL || 0} tk`
        : `${s.reps || 0} tk`;
      return `<div class="hm-set-row">
        <span class="hm-set-num">${i+1}</span>
        <span class="hm-set-val">${s.kg || 0} kg × ${repsTxt}</span>
        ${vol ? `<span class="hm-set-vol">${vol} kg</span>` : ''}
      </div>`;
    }).join('');
    const note = noteForExName(log, exName);
    return `<div class="hm-ex-block">
      <div class="hm-ex-name">${escapeHtml(exName)}</div>
      ${rows}
      ${note ? `<div class="ex-note-prev hm-note">${icon('note')}${escapeHtml(note)}</div>` : ''}
    </div>`;
  }).join('') : '<div style="padding:12px 0;color:var(--text-secondary);font-size:14px;text-align:center;">Bu antrenmanda set kaydı yok.</div>';

  document.getElementById('history-modal').classList.add('open');
  pushLayer('historyModal');
}
function closeHistoryModal() { closeLayer('historyModal'); }

// ── Weekly Goal ──
function getWeeklyGoal() { return DB.settings.weeklyGoal || 4; }
function changeWeeklyGoal(delta) {
  DB.settings.weeklyGoal = Math.max(1, Math.min(7, getWeeklyGoal() + delta));
  saveData('settings', DB.settings);
  renderWeeklyGoal();
}
function deleteHistoryLog() {
  if (deleteWorkoutLog(historyIdx)) closeHistoryModal();
}
function editHistoryLog() {
  startEditLog(historyIdx);
}
function renderWeeklyGoal() {
  const goal = getWeeklyGoal();
  document.getElementById('weekly-goal-num').textContent = goal;

  // Bu haftanın Pazartesi - Pazar (04:00 kuralıyla)
  const now = logicalNow();
  const dow = (now.getDay() + 6) % 7;
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - dow + i);
    weekDays.push({ str: isoDate(d), label: ['Pt','Sa','Ça','Pe','Cu','Ct','Pz'][i] });
  }

  const loggedDates = new Set(DB.workoutLogs.map(l => l.date));
  const doneThisWeek = weekDays.filter(d => loggedDates.has(d.str)).length;
  const todayStr = today();

  document.getElementById('weekly-goal-label').textContent = `${doneThisWeek} / ${goal} antrenman`;
  document.getElementById('weekly-goal-bar').style.width = Math.min(100, Math.round(doneThisWeek / goal * 100)) + '%';

  document.getElementById('weekly-goal-days').innerHTML = weekDays.map(d => {
    const cls = loggedDates.has(d.str) ? 'done' : d.str === todayStr ? 'today' : 'empty';
    return `<div class="wg-day ${cls}">${d.label}</div>`;
  }).join('');

  // Lime kahraman kartı
  const pctRaw = goal ? doneThisWeek / goal : 0;
  const pct = Math.round(Math.min(1, pctRaw) * 100);
  const C = 2 * Math.PI * 50;
  document.getElementById('hero-ring-fill').setAttribute('stroke-dashoffset', String(C * (1 - Math.min(1, pctRaw))));
  document.getElementById('hero-ring-pct').textContent = pct + '%';
  document.getElementById('hero-goal-num').textContent = `Hedef ${goal}`;
  const left = goal - doneThisWeek;
  let title, sub;
  if (doneThisWeek >= goal) { title = 'Hedef tamam!'; sub = `Bu hafta ${doneThisWeek} antrenman yaptın.`; }
  else if (doneThisWeek === 0) { title = 'Yeni hafta, temiz sayfa'; sub = `Bu haftaki hedefin ${goal} antrenman.`; }
  else if (left === 1) { title = 'Son bir antrenman!'; sub = 'Hedefe sadece 1 antrenman kaldı.'; }
  else { title = 'İyi gidiyorsun'; sub = `Hedefe ${left} antrenman kaldı.`; }
  document.getElementById('hero-title').innerHTML = escapeHtml(title) + (doneThisWeek >= goal ? icon('sparkle') : '');
  document.getElementById('hero-sub').textContent = sub;
  const weekSet = new Set(weekDays.map(d => d.str));
  const weekVol = DB.workoutLogs.filter(l => weekSet.has(l.date)).reduce((a, l) => a + logVolume(l), 0);
  document.getElementById('hero-week-vol').textContent = weekVol.toLocaleString('tr-TR');
  const monthStr = today().slice(0, 7);
  document.getElementById('hero-month').textContent = DB.workoutLogs.filter(l => String(l.date).startsWith(monthStr)).length;
  document.getElementById('hero-total').textContent = DB.workoutLogs.length;
  document.getElementById('hero-days').innerHTML = weekDays.map(d => {
    const cls = loggedDates.has(d.str) ? 'done' : d.str === todayStr ? 'today' : '';
    return `<div class="hero-day ${cls}">${d.label}</div>`;
  }).join('');
}
