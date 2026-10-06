// Antrenman Takip — Ayarlar, tema, gün ve sıra düzenleyici, yedek alma / geri yükleme / sıfırlama, kalıcı depolama.

// ═══════════════════════════════════════════════
//  SETTINGS
// ═══════════════════════════════════════════════
function toggleLogHistory() {
  const list = document.getElementById('log-delete-list');
  const chevron = document.getElementById('log-history-chevron');
  const isOpen = list.style.display !== 'none';
  list.style.display = isOpen ? 'none' : 'block';
  chevron.style.transform = isOpen ? '' : 'rotate(90deg)';
  chevron.style.transition = 'transform 0.2s';
  if (!isOpen) renderLogDeleteList();
}

function renderLogDeleteList() {
  const el = document.getElementById('log-delete-list');
  if (!el) return;
  const items = DB.workoutLogs.map((log, idx) => ({ log, idx })).reverse();
  if (!items.length) {
    el.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary);font-size:14px;">Kayıtlı antrenman yok.</div>';
    return;
  }
  el.innerHTML = items.map(({ log, idx }) => {
    const dur = log.duration ? ` · ${fmtMins(log.duration)}` : '';
    const setCount = (log.sets || []).filter(hasValue).length;
    return `<div class="suppl-setting-item">
      <div style="flex:1;min-width:0;">
        <div style="font-size:14px;font-weight:600;">${escapeHtml(dayDisplayName(log))}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${fmtDate(log.date)}${dur} · ${setCount} set</div>
      </div>
      <button class="suppl-remove-btn" onclick="deleteWorkoutLog(${idx})" aria-label="Sil">−</button>
    </div>`;
  }).join('');
}

function deleteWorkoutLog(idx) {
  const log = DB.workoutLogs[idx];
  if (!log) return false;
  if (active && active.mode === 'edit') {
    toast('Önce açık düzenlemeyi kaydet ya da kapat.', 3000);
    return false;
  }
  if (!confirm(`"${dayDisplayName(log)}" – ${fmtDate(log.date)} tarihli antrenman silinsin mi?`)) return false;
  DB.workoutLogs.splice(idx, 1);
  saveData('workoutLogs', DB.workoutLogs);
  renderLogDeleteList();
  renderHome();
  renderStats();
  toast('Antrenman silindi.');
  return true;
}

function renderSettings() {
  const s = DB.settings;
  document.getElementById('palette-classic-btn').classList.toggle('active', s.palette !== 'lime');
  document.getElementById('palette-lime-btn').classList.toggle('active', s.palette === 'lime');
  document.getElementById('theme-light-btn').classList.toggle('active', s.theme !== 'dark');
  document.getElementById('theme-dark-btn').classList.toggle('active', s.theme === 'dark');
  document.getElementById('rest-toggle').checked = !!s.restTimerEnabled;
  document.getElementById('keep-awake-toggle').checked = s.keepAwake !== false;
  document.getElementById('rest-dur-label').textContent = fmtRest(s.restDuration || 90);
  document.getElementById('day-count-label').textContent = DB.workoutDays.length + ' gün';
  const orderNames = DB.workoutOrder.map(id => { const d = getDayById(id); return d ? d.name : id; });
  document.getElementById('order-label').textContent = orderNames.length ? orderNames.slice(0,2).join(' → ') + (orderNames.length > 2 ? ' → ...' : '') : '—';
  const lastBackup = lsGet('lastBackup');
  const backupLabel = document.getElementById('last-backup-label');
  if (backupLabel) {
    if (!lastBackup) {
      backupLabel.textContent = 'Hiç yedek alınmadı';
      backupLabel.style.color = 'var(--red)';
    } else {
      const daysSince = Math.floor((new Date(today()) - new Date(lastBackup)) / 86400000);
      backupLabel.textContent = daysSince <= 0 ? 'Bugün' : `${daysSince} gün önce`;
      backupLabel.style.color = daysSince > 14 ? 'var(--orange)' : 'var(--text-secondary)';
    }
  }
  renderSupplSettings();
  renderLogDeleteList();
}

function setTheme(t) {
  DB.settings.theme = t;
  saveData('settings', DB.settings);
  applyTheme();
  refreshAfterThemeChange();
}
function isLime() { return DB.settings.palette === 'lime'; }
function isDarkMode() { return DB.settings.theme === 'dark'; }
function applyTheme() {
  const isDark = isDarkMode();
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : '');
  document.documentElement.setAttribute('data-palette', isLime() ? 'lime' : 'classic');
  const bar = isLime() ? (isDark ? '#0F1311' : '#F1F1EA') : (isDark ? '#1c1c1e' : '#ffffff');
  document.getElementById('theme-color-meta').setAttribute('content', bar);
}
function setPalette(p) {
  DB.settings.palette = p === 'lime' ? 'lime' : 'classic';
  saveData('settings', DB.settings);
  applyTheme();
  refreshAfterThemeChange();
}
// Renkleri JS'te hesaplanan parçaları (takvim, grafikler, kartlar) yeniden çizer
function refreshAfterThemeChange() {
  renderSettings();
  renderHome();
  if (currentTab === 'meas') renderMeasurements();
  if (active) { renderExerciseCards(); applyActiveValues(); }
}
// Grafik rengi: Lime'da açık zeminde koyu lime-yeşil, koyuda parlak lime
function chartColor(fallback) {
  if (!isLime()) return fallback;
  return isDarkMode() ? '#C8F169' : '#7FAE1F';
}
// ── Ekran açık kalsın (Screen Wake Lock) ──
// Antrenman ekranı açıkken telefonun kendiliğinden kilitlenmesini engeller.
// Tarayıcı, uygulama arka plana geçince kilidi bırakır; dönünce yeniden alınır.
let wakeLock = null;
async function acquireWakeLock() {
  if (DB.settings.keepAwake === false || !('wakeLock' in navigator)) return;
  if (!active || !document.body.classList.contains('ws-open') || document.visibilityState !== 'visible') return;
  if (wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch(e) { wakeLock = null; }
}
function releaseWakeLock() {
  const wl = wakeLock;
  wakeLock = null;
  if (wl) wl.release().catch(() => {});
}
function toggleKeepAwake(val) {
  DB.settings.keepAwake = !!val;
  saveData('settings', DB.settings);
  if (val) acquireWakeLock(); else releaseWakeLock();
}

function toggleRestTimer(val) {
  DB.settings.restTimerEnabled = val;
  saveData('settings', DB.settings);
}
function stepRestDuration(dir) {
  const cur = DB.settings.restDuration || 90;
  let i = REST_OPTIONS.indexOf(cur);
  if (i === -1) i = REST_OPTIONS.findIndex(v => v > cur) - (dir > 0 ? 1 : 0);
  const next = REST_OPTIONS[Math.max(0, Math.min(REST_OPTIONS.length - 1, i + dir))];
  setRestDuration(next);
}
function setRestDuration(dur) {
  DB.settings.restDuration = dur;
  saveData('settings', DB.settings);
  renderSettings();
}

// ═══════════════════════════════════════════════
//  DAY EDITOR
// ═══════════════════════════════════════════════
let editorDays = [];

function openDayEditor() {
  editorDays = deepCopy(DB.workoutDays);
  renderDayEditor();
  document.getElementById('day-editor').classList.add('open');
  pushLayer('dayEditor');
}
function closeDayEditor() { closeLayer('dayEditor'); }

function renderDayEditor() {
  const nameSet = new Set();
  DB.workoutDays.forEach(d => d.exercises.forEach(e => e.name && nameSet.add(e.name)));
  DB.workoutLogs.forEach(l => (l.sets||[]).forEach(s => s.exName && nameSet.add(s.exName)));
  document.getElementById('ex-names-list').innerHTML = [...nameSet].sort((a,b) => a.localeCompare(b,'tr')).map(n => `<option value="${escapeHtml(n)}">`).join('');

  const body = document.getElementById('day-editor-body');
  body.innerHTML = editorDays.map((day, di) => `
    <div class="day-item">
      <div class="day-item-header">
        <input class="day-item-name-input" value="${escapeHtml(day.name)}" oninput="editorDays[${di}].name=this.value" placeholder="Gün adı">
        <button class="remove-day-btn" onclick="removeDay(${di})" aria-label="Günü sil">${icon('minus-circle')}</button>
        <button class="day-toggle-btn" onclick="toggleDayExercises(${di})" id="day-toggle-${di}" aria-label="Aç/kapat">${icon('chevron-down')}</button>
      </div>
      <div class="day-exercises open" id="day-exs-${di}">
        ${day.exercises.map((ex, ei) => `
          <div class="day-ex-row">
            <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0;">
              <button class="order-arrow-btn" style="width:24px;height:22px;font-size:12px;" onclick="moveEx(${di},${ei},-1)" ${ei === 0 ? 'disabled' : ''} aria-label="Yukarı">${icon('chevron-up')}</button>
              <button class="order-arrow-btn" style="width:24px;height:22px;font-size:12px;" onclick="moveEx(${di},${ei},1)" ${ei === day.exercises.length - 1 ? 'disabled' : ''} aria-label="Aşağı">${icon('chevron-down')}</button>
            </div>
            <input class="day-ex-name-input" list="ex-names-list" value="${escapeHtml(ex.name)}" oninput="editorDays[${di}].exercises[${ei}].name=this.value" placeholder="Hareket adı">
            <input class="day-ex-sets-input" type="number" value="${ex.sets}" min="1" max="10" oninput="editorDays[${di}].exercises[${ei}].sets=Math.min(10,Math.max(1,parseInt(this.value)||1))" title="Set sayısı">
            <button class="bi-toggle-btn${ex.bilateral ? ' active' : ''}" onclick="toggleBilateral(${di},${ei})" title="Sağ/Sol ayrı tekrar">S/L</button>
            <button class="remove-ex-btn" onclick="removeEx(${di},${ei})" aria-label="Hareketi sil">${icon('minus-circle')}</button>
          </div>
        `).join('')}
        <button class="add-ex-btn" onclick="addEx(${di})">${icon('plus')}Hareket Ekle</button>
      </div>
    </div>
  `).join('') + `<button class="add-day-btn" onclick="addDay()">${icon('plus')}Yeni Antrenman Günü</button>`;
}
function toggleBilateral(di, ei) {
  const ex = editorDays[di].exercises[ei];
  const newVal = !ex.bilateral;
  const name = normName(ex.name);
  if (!name) { ex.bilateral = newVal; renderDayEditor(); return; }
  // Aynı isimli tüm egzersizlere uygula
  editorDays.forEach(day => day.exercises.forEach(e => {
    if (normName(e.name) === name) e.bilateral = newVal;
  }));
  renderDayEditor();
}
function toggleDayExercises(di) {
  document.getElementById(`day-exs-${di}`).classList.toggle('open');
  document.getElementById(`day-toggle-${di}`).classList.toggle('open');
}
function removeDay(di) {
  if (!confirm('Bu günü silmek istiyor musunuz? Geçmiş antrenman kayıtları silinmez.')) return;
  editorDays.splice(di, 1);
  renderDayEditor();
}
function removeEx(di, ei) {
  editorDays[di].exercises.splice(ei, 1);
  renderDayEditor();
}
function moveEx(di, ei, dir) {
  const exs = editorDays[di].exercises;
  const j = ei + dir;
  if (j < 0 || j >= exs.length) return;
  [exs[ei], exs[j]] = [exs[j], exs[ei]];
  renderDayEditor();
}

function addEx(di) {
  editorDays[di].exercises.push({ id: uid(), name: '', sets: 3 });
  renderDayEditor();
  const inputs = document.querySelectorAll(`#day-exs-${di} .day-ex-name-input`);
  if (inputs.length) inputs[inputs.length - 1].focus();
}
function addDay() {
  editorDays.push({ id: uid(), name: 'Yeni Gün', exercises: [] });
  renderDayEditor();
}

function saveDays() {
  // Boş isimli hareketleri temizle
  const emptyCount = editorDays.reduce((a, d) => a + d.exercises.filter(e => !String(e.name || '').trim()).length, 0);
  if (emptyCount && !confirm(`Adı boş ${emptyCount} hareket var. Bunlar kaydedilmeden silinecek. Devam edilsin mi?`)) return;
  const newDays = editorDays.map((d, i) => ({
    ...d,
    name: String(d.name || '').trim() || `Gün ${i + 1}`,
    exercises: d.exercises.filter(e => String(e.name || '').trim()).map(e => ({
      ...e,
      id: e.id || uid(),
      name: String(e.name).trim(),
      sets: Math.min(10, Math.max(1, parseInt(e.sets) || 1)),
    })),
  }));

  // Yeniden adlandırılan hareketlerin geçmişini taşı
  const oldNames = {};
  DB.workoutDays.forEach(d => d.exercises.forEach(e => { oldNames[e.id] = e.name; }));
  const newNameSet = new Set();
  newDays.forEach(d => d.exercises.forEach(e => newNameSet.add(normName(e.name))));
  const renames = [];
  newDays.forEach(d => d.exercises.forEach(e => {
    const oldName = oldNames[e.id];
    if (!oldName || normName(oldName) === normName(e.name)) return;
    if (newNameSet.has(normName(oldName))) return; // eski isim başka günde hâlâ kullanılıyor
    if (renames.find(r => normName(r.from) === normName(oldName))) return;
    if (getLogsByExName(oldName).length) renames.push({ from: oldName, to: e.name });
  }));
  if (renames.length) {
    const list = renames.map(r => `• ${r.from} → ${r.to}`).join('\n');
    if (confirm(`Yeniden adlandırılan hareketler:\n${list}\n\nGeçmiş kayıtları da yeni isme taşınsın mı? (Grafik ve rekorlar devam eder)`)) {
      renames.forEach(r => {
        const from = normName(r.from);
        DB.workoutLogs.forEach(log => (log.sets || []).forEach(s => {
          if (setMatchesName(s, log, from)) s.exName = r.to;
        }));
        DB.workoutLogs.forEach(log => {
          if (log.exNotes && log.exNotes[from]) { log.exNotes[normName(r.to)] = log.exNotes[from]; delete log.exNotes[from]; }
        });
      });
      saveData('workoutLogs', DB.workoutLogs);
    }
  }

  // Silinen günlerin adı geçmiş kayıtlarda kalsın
  DB.workoutLogs.forEach(log => {
    if (!log.dayName) { const d = getDayById(log.dayId); if (d) log.dayName = d.name; }
  });
  saveData('workoutLogs', DB.workoutLogs);

  DB.workoutDays = newDays;
  saveData('workoutDays', DB.workoutDays);
  syncOrder();
  saveData('workoutOrder', DB.workoutOrder);
  closeDayEditor();
  toast('✅ Günler kaydedildi!');
  renderHome();
  renderSettings();
}

// ═══════════════════════════════════════════════
//  ORDER EDITOR
// ═══════════════════════════════════════════════
let editorOrder = [];
function openOrderEditor() {
  editorOrder = [...DB.workoutOrder];
  renderOrderEditor();
  document.getElementById('order-editor').classList.add('open');
  pushLayer('orderEditor');
}
function closeOrderEditor() { closeLayer('orderEditor'); }
function renderOrderEditor() {
  document.getElementById('order-editor-body').innerHTML = editorOrder.map((id, i) => {
    const day = getDayById(id);
    return `<div class="order-item">
      <div class="order-item-num">${i + 1}</div>
      <div class="order-item-name">${escapeHtml(day ? day.name : id)}</div>
      <button class="order-arrow-btn" onclick="moveOrder(${i},-1)" ${i === 0 ? 'disabled' : ''} aria-label="Yukarı">${icon('chevron-up')}</button>
      <button class="order-arrow-btn" onclick="moveOrder(${i},1)" ${i === editorOrder.length - 1 ? 'disabled' : ''} aria-label="Aşağı">${icon('chevron-down')}</button>
    </div>`;
  }).join('');
}
function moveOrder(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= editorOrder.length) return;
  [editorOrder[i], editorOrder[j]] = [editorOrder[j], editorOrder[i]];
  renderOrderEditor();
}
function saveOrder() {
  DB.workoutOrder = editorOrder;
  syncOrder();
  saveData('workoutOrder', DB.workoutOrder);
  closeOrderEditor();
  toast('✅ Sıra kaydedildi!');
  renderHome();
  renderSettings();
}

// ═══════════════════════════════════════════════
//  DATA EXPORT / IMPORT / RESET
// ═══════════════════════════════════════════════
// ── Kalıcı depolama ──
// Tarayıcıdan, yer darlığında bu sitenin verisini silmemesini ister.
// Ana ekrana eklenmiş uygulamalarda genelde hemen verilir; tarayıcıda
// kullanım arttıkça verilebilir, bu yüzden antrenman kaydında tekrar denenir.
let storagePersisted = null;
async function ensurePersistentStorage() {
  try {
    if (!navigator.storage || !navigator.storage.persist) { storagePersisted = null; renderStorageStatus(); return; }
    storagePersisted = await navigator.storage.persisted();
    if (!storagePersisted) storagePersisted = await navigator.storage.persist();
  } catch(e) { storagePersisted = null; }
  renderStorageStatus();
}
function renderStorageStatus() {
  const el = document.getElementById('storage-status');
  if (!el) return;
  if (storagePersisted === true) {
    el.className = 'ok';
    el.innerHTML = icon('check-circle') + 'Kalıcı depolama açık';
  } else if (storagePersisted === false) {
    el.className = 'warn';
    el.innerHTML = icon('alert') + 'Tarayıcı kalıcı depolamaya izin vermedi, düzenli yedek al';
  } else {
    el.className = '';
    el.textContent = '';
  }
}

function markBackup() {
  lsSet('lastBackup', today());
  renderSettings();
  renderBackupNudge();
}

async function exportData() {
  const data = {
    workoutDays: DB.workoutDays,
    workoutLogs: DB.workoutLogs,
    measurements: DB.measurements,
    settings: DB.settings,
    workoutOrder: DB.workoutOrder,
    supplHistory: getSupplHistory(),
    exportDate: new Date().toISOString(),
  };
  const json = JSON.stringify(data, null, 2);
  const fileName = `antrenman-yedek-${today()}.json`;

  // Telefonda paylaşım menüsü (iOS'ta "Dosyalar'a Kaydet") en güvenilir yol
  const isTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (isTouch && typeof File === 'function' && navigator.canShare) {
    try {
      const file = new File([json], fileName, { type: 'application/json' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Antrenman yedeği' });
        markBackup();
        toast('📤 Yedek kaydedildi.');
        return;
      }
    } catch(e) {
      if (e && e.name === 'AbortError') { toast('Dışa aktarma iptal edildi.'); return; }
      // Paylaşım başarısızsa indirmeye geç
    }
  }

  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  markBackup();
  toast('📤 Veri dışa aktarıldı.');
}

function validateImport(data) {
  if (!isPlainObject(data)) return 'Dosya bir yedek değil.';
  if (!Array.isArray(data.workoutDays) || !Array.isArray(data.workoutLogs)) return 'workoutDays ve workoutLogs dizisi gerekli.';
  for (const d of data.workoutDays) {
    if (!isPlainObject(d) || !d.id || typeof d.name !== 'string' || !Array.isArray(d.exercises)) return 'Geçersiz gün: id/name/exercises eksik.';
    for (const ex of d.exercises) {
      if (!isPlainObject(ex) || !ex.id || typeof ex.name !== 'string') return `Geçersiz egzersiz: ${d.name} içinde.`;
    }
  }
  for (const log of data.workoutLogs) {
    if (!isPlainObject(log) || !/^\d{4}-\d{2}-\d{2}$/.test(String(log.date)) || !log.dayId || !Array.isArray(log.sets)) return 'Geçersiz antrenman logu: date/dayId/sets eksik.';
  }
  if (data.measurements != null && !Array.isArray(data.measurements)) return 'measurements bir dizi olmalı.';
  return null;
}

function importData(evt) {
  const file = evt.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    let data;
    try { data = JSON.parse(e.target.result); }
    catch { toast('❌ Geçersiz dosya formatı.'); return; }
    const err = validateImport(data);
    if (err) { toast('❌ ' + err, 3500); return; }
    if (!confirm('Mevcut tüm veriler bu yedekle değiştirilecek. Emin misiniz?')) return;
    const days = normalizeDays(data.workoutDays).map(d => ({ ...d, exercises: d.exercises.filter(e => e.name) }));
    DB.workoutDays = days;
    DB.workoutLogs = normalizeLogs(data.workoutLogs, days);
    DB.measurements = (data.measurements || []).filter(m => isPlainObject(m) && m.date);
    DB.settings = Object.assign({}, DEFAULT_SETTINGS, isPlainObject(data.settings) ? data.settings : {});
    const p = DB.settings.profile;
    if (p && p.age && !p.birthYear) { p.birthYear = new Date().getFullYear() - p.age; delete p.age; }
    DB.workoutOrder = Array.isArray(data.workoutOrder) ? data.workoutOrder.map(String) : [];
    syncOrder();
    ['workoutDays','workoutLogs','measurements','settings','workoutOrder'].forEach(k => saveData(k, DB[k]));
    if (isPlainObject(data.supplHistory)) saveSupplHistory(data.supplHistory);
    applyTheme(); renderHome(); renderSettings();
    toast('✅ Veri içe aktarıldı!');
  };
  reader.readAsText(file);
  evt.target.value = '';
}

function resetData() {
  if (!confirm('Tüm veriler silinecek! Bu işlem geri alınamaz. Emin misiniz?')) return;
  if (!confirm('Son onay: Gerçekten tüm verileri silmek istiyor musunuz?')) return;
  discardActive();
  // Sadece bu uygulamaya ait anahtarlar silinir
  lsOwnKeys().forEach(k => { try { localStorage.removeItem(k); } catch(e) {} });
  lsSet('migrated', '1');
  DB = loadData();
  syncOrder();
  migrateDB();
  applyTheme();
  renderHome(); renderSettings();
  toast('🗑️ Tüm veriler sıfırlandı.');
}
