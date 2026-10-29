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
  const cr = cableRatio();
  document.getElementById('cable-ratio-label').textContent = String(cr).replace('.', ',') + ':1';
  document.getElementById('cable-ratio-note').textContent = `Kablo hareketlerinde tek / çift makara seçilebilir. Çift makarada yazan 40 kg ≈ tek makarada ${fmtKg(Math.round(40 / cr * 2) / 2)} kg sayılır; rekor ve grafikler buna göre hesaplanır. Fark daha az hissediliyorsa oranı düşür.`;
  document.getElementById('theme-light-btn').classList.toggle('active', s.theme !== 'dark');
  document.getElementById('theme-dark-btn').classList.toggle('active', s.theme === 'dark');
  document.getElementById('rest-toggle').checked = !!s.restTimerEnabled;
  document.getElementById('keep-awake-toggle').checked = s.keepAwake !== false;
  document.getElementById('rir-toggle').checked = s.rirEnabled !== false;
  document.getElementById('mod-suppl-toggle').checked = supplOn();
  document.getElementById('feedback-toggle').checked = feedbackOn();
  document.getElementById('mod-water-toggle').checked = waterOn();
  document.getElementById('suppl-settings-section').style.display = supplOn() ? '' : 'none';
  document.getElementById('workout-notif-toggle').checked = workoutNotifOn();
  renderNotifStatus();
  document.getElementById('rest-comp-label').textContent = fmtRest(s.restCompound || 150);
  document.getElementById('rest-iso-label').textContent = fmtRest(s.restIsolation || s.restDuration || 90);
  document.getElementById('default-inc-label').textContent = fmtKg(kgStep()) + ' kg';
  document.getElementById('pmode-all-btn').classList.toggle('active', progressMode() === 'all');
  document.getElementById('pmode-set-btn').classList.toggle('active', progressMode() === 'perSet');
  document.getElementById('pmode-note').textContent = progressMode() === 'all'
    ? 'Programdaki tüm setler kaydedilip en ağır kilodaki setlerin hepsi üst sınıra ulaşınca kilo artar; ulaşmayan varsa +1 tekrar. Daha hafif setler kendi başına ağırlaşır.'
    : 'Her set kendi başına: üst sınıra ulaşan set ağırlaşır.';
  document.getElementById('rirprog-toggle').checked = rirProgression();
  document.getElementById('day-count-label').textContent = DB.workoutDays.length + ' gün';
  const curTpl = currentTemplate();
  document.getElementById('program-label').textContent = curTpl ? curTpl.name : 'Özel';
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
// Tek renk paleti: Lime (açık / koyu mod seçilebilir)
function isLime() { return true; }
function isDarkMode() { return DB.settings.theme === 'dark'; }
function applyTheme() {
  const isDark = isDarkMode();
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : '');
  document.documentElement.setAttribute('data-palette', isLime() ? 'lime' : 'classic');
  const bar = isLime() ? (isDark ? '#0F1311' : '#F1F1EA') : (isDark ? '#1c1c1e' : '#ffffff');
  document.getElementById('theme-color-meta').setAttribute('content', bar);
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
// ── Antrenman bildirimi ──
// iPhone'da web bildirimleri yalnızca ana ekrana eklenmiş uygulamada (iOS 16.4+)
// ve kullanıcı izin verdiyse çalışır. İzin isteği bir dokunuşla tetiklenmeli.
function isIOS() {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
function isStandalone() {
  return navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
}
function notifSupport() {
  if ('Notification' in window && 'serviceWorker' in navigator) return 'ok';
  return isIOS() && !isStandalone() ? 'needs-install' : 'unsupported';
}
function notifPermission() { return 'Notification' in window ? Notification.permission : 'unsupported'; }
function workoutNotifOn() { return DB.settings.workoutNotif === true && notifPermission() === 'granted'; }

let notifProblem = null;
function renderNotifStatus() {
  const el = document.getElementById('notif-status');
  if (!el) return;
  let msg = '';
  if (notifProblem === 'needs-install') msg = "iPhone'da bildirimler için uygulamayı Safari'de Paylaş → Ana Ekrana Ekle ile ekleyip ana ekrandaki simgeden açman gerekiyor.";
  else if (notifProblem === 'denied' || (DB.settings.workoutNotif && notifPermission() === 'denied')) msg = 'Bildirim izni kapalı. iPhone Ayarlar → Bildirimler → Antrenman bölümünden açıp tekrar dene.';
  else if (notifProblem === 'unsupported') msg = 'Bu tarayıcı bildirimleri desteklemiyor.';
  else if (workoutNotifOn()) msg = 'Antrenman sürerken uygulamadan çıkınca bildirim gelir; dokununca kaldığın yerden açılır.';
  el.textContent = msg;
  el.classList.toggle('warn', !!notifProblem || (DB.settings.workoutNotif && notifPermission() === 'denied'));
  el.style.display = msg ? 'block' : 'none';
}
async function toggleWorkoutNotif(val) {
  const box = document.getElementById('workout-notif-toggle');
  notifProblem = null;
  if (!val) {
    DB.settings.workoutNotif = false;
    saveData('settings', DB.settings);
    clearWorkoutNotification();
    renderNotifStatus();
    return;
  }
  const support = notifSupport();
  if (support !== 'ok') { notifProblem = support; box.checked = false; renderNotifStatus(); return; }
  let perm = Notification.permission;
  if (perm === 'default') {
    try { perm = await Notification.requestPermission(); } catch(e) { perm = 'denied'; }
  }
  if (perm !== 'granted') { notifProblem = 'denied'; box.checked = false; renderNotifStatus(); return; }
  DB.settings.workoutNotif = true;
  saveData('settings', DB.settings);
  box.checked = true;
  renderNotifStatus();
  toast('✅ Antrenman bildirimi açık');
}

function toggleFeedback(val) {
  DB.settings.feedback = !!val;
  saveData('settings', DB.settings);
}
function toggleModSuppl(val) {
  DB.settings.modSuppl = !!val;
  saveData('settings', DB.settings);
  applyModules(); renderSettings();
}
function toggleModWater(val) {
  DB.settings.modWater = !!val;
  saveData('settings', DB.settings);
  applyModules(); renderSettings();
}
function toggleRir(val) {
  DB.settings.rirEnabled = !!val;
  saveData('settings', DB.settings);
  if (active) { captureActive(); renderExerciseCards(); applyActiveValues(); }
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
// Varsayılan dinlenme: çok eklemli (press, row, pulldown…) ve izolasyon ayrı
function stepRestDefault(kind, dir) {
  const key = kind === 'compound' ? 'restCompound' : 'restIsolation';
  const cur = kind === 'compound' ? (DB.settings.restCompound || 150) : (DB.settings.restIsolation || DB.settings.restDuration || 90);
  DB.settings[key] = Math.max(REST_MIN, Math.min(REST_MAX, cur + dir * REST_STEP));
  saveData('settings', DB.settings);
  renderSettings();
  if (active) refreshCardsAfterSetting();
}
function setProgressMode(m) {
  DB.settings.progressMode = m === 'perSet' ? 'perSet' : 'all';
  saveData('settings', DB.settings);
  renderSettings();
  if (active) refreshCardsAfterSetting();
}
function toggleRirProgression(val) {
  DB.settings.rirProgression = !!val;
  saveData('settings', DB.settings);
  if (active) refreshCardsAfterSetting();
}
function stepCableRatio(dir) {
  DB.settings.cableRatio = Math.round(Math.max(1.2, Math.min(3, cableRatio() + dir * 0.1)) * 10) / 10;
  saveData('settings', DB.settings);
  renderSettings();
  if (active) refreshCardsAfterSetting();
}
function stepDefaultInc(dir) {
  const cur = kgStep();
  let i = INC_OPTIONS.indexOf(cur);
  if (i === -1) i = INC_OPTIONS.findIndex(v => v > cur) - (dir > 0 ? 1 : 0);
  DB.settings.kgStep = INC_OPTIONS[Math.max(0, Math.min(INC_OPTIONS.length - 1, i + dir))];
  saveData('settings', DB.settings);
  renderSettings();
  if (active) refreshCardsAfterSetting();
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

// ═══════════════════════════════════════════════
//  PROGRAM ŞABLONLARI
// ═══════════════════════════════════════════════
// ── Programın: tek program (Push / Pull + Legs, 5 gün) ──
// [hareket, set, tekrar aralığı]
const MY_PROGRAM = {
  id: 'ppl5', name: 'Push / Pull + Legs',
  desc: 'Pzt Push A · Sal Pull A · Çar dinlenme · Per Push B · Cum Pull B · Cmt Legs · Paz dinlenme. Uygulama sırayla bir sonraki günü önerir; dinlenme günlerini girmen gerekmez.',
  days: [
    ['push-a', 'Push A', [
      ['Incline Chest Press Machine', 3, [6, 10]], ['Pec Deck Fly', 2, [10, 15]], ['Cable Lateral Raise', 4, [12, 20]],
      ['Smith Machine JM Press', 2, [8, 12]], ['Cable Overhead Triceps Extension', 2, [10, 15]]]],
    ['pull-a', 'Pull A', [
      ['Lat Pulldown', 3, [6, 12]], ['Chest Supported Machine Row', 3, [8, 12]], ['Reverse Pec Deck', 2, [12, 20]],
      ['Preacher Curl Machine', 2, [8, 12]], ['Bayesian Cable Curl', 2, [10, 15]]]],
    ['push-b', 'Push B', [
      ['Horizontal Chest Press Machine', 3, [6, 10]], ['Shoulder Press Machine', 2, [8, 12]], ['Pec Deck Fly', 2, [10, 15]],
      ['Cable Lateral Raise', 4, [12, 20]], ['Smith Machine JM Press', 2, [8, 12]], ['Cable Overhead Triceps Extension', 2, [10, 15]]]],
    ['pull-b', 'Pull B', [
      ['Chest Supported T-Bar Row', 3, [8, 12]], ['Lat Pulldown', 2, [8, 12]], ['Reverse Pec Deck', 2, [12, 20]],
      ['Bayesian Cable Curl', 2, [10, 15]], ['Preacher Curl Machine', 2, [8, 12]], ['EZ Bar Reverse Curl (Preacher Pad)', 2, [10, 15]]]],
    ['legs', 'Legs', [
      ['Leg Press', 2, [8, 12]], ['Leg Extension', 2, [10, 15]], ['Lying Leg Curl', 2, [10, 15]], ['Romanian Deadlift', 2, [8, 12]]]],
  ],
  // Eski adı → yeni adı (aynı hareket; geçmiş, rekor ve ayarlar yeni isme taşınır)
  renames: {
    'Incline Chest Press': 'Incline Chest Press Machine',
    'Horizontal Chest Press': 'Horizontal Chest Press Machine',
    'Bayesian Curl Cable': 'Bayesian Cable Curl',
    'Chest Supported T-Bar Row Machine': 'Chest Supported T-Bar Row',
    'Triceps Overhead Extension': 'Cable Overhead Triceps Extension',
    'Reverse Curl': 'EZ Bar Reverse Curl (Preacher Pad)',
  },
};
function myProgramDays() {
  return MY_PROGRAM.days.map(([id, name, list]) => ({ id, name,
    exercises: list.map(([n, sets, range], i) => ({ id: `${id}-${i + 1}`, name: n, sets, repRange: range })) }));
}
// Tek seferlik düzeltme (açılışta): Pull B'de Incline Dumbbell Curl → Bayesian Cable Curl.
// Eski adla ("Bayesian Curl Cable") kalan Bayesian kayıtları da yeni isme taşınır;
// böylece "Önceki", öneriler ve rekorlar Bayesian geçmişiyle devam eder.
function applyProgramFixes() {
  if (lsGet('fix-pullb-bayesian')) return;
  const NEW = 'Bayesian Cable Curl', OLD = 'Bayesian Curl Cable';
  const used = n => DB.workoutDays.some(d => d.exercises.some(e => normName(e.name) === normName(n)));
  if (getLogsByExName(OLD).length && !used(OLD)) {
    migrateExName(OLD, NEW);
    saveData('workoutLogs', DB.workoutLogs);
    saveData('settings', DB.settings);
  }
  const day = getDayById('pull-b');
  const ex = day && day.exercises.find(e => normName(e.name) === 'incline dumbbell curl');
  if (ex) {
    ex.name = NEW;
    if (!repRangeFor(NEW) && ex.repRange == null) ex.repRange = [10, 15];
    saveData('workoutDays', DB.workoutDays);
  }
  lsSet('fix-pullb-bayesian', '1');
}
// Hareketin adını her yerde değiştir: kayıtlar, notlar, hareket ayarları
function migrateExName(from, to) {
  const f = normName(from), t = normName(to);
  if (f === t) return;
  DB.workoutLogs.forEach(log => {
    (log.sets || []).forEach(s => { if (setMatchesName(s, log, f)) s.exName = to; });
    if (log.exNotes && log.exNotes[f]) { if (!log.exNotes[t]) log.exNotes[t] = log.exNotes[f]; delete log.exNotes[f]; }
  });
  ['repRangeByEx', 'restByEx', 'incByEx', 'muscleByEx'].forEach(k => {
    const m = DB.settings[k];
    if (m && m[f] != null) { if (m[t] == null) m[t] = m[f]; delete m[f]; }
  });
}
// Tekrar aralıkları: hareket her yerde aynı aralıktaysa hareket ayarına,
// günden güne farklıysa (Lat Pulldown 6–12 / 8–12) o günün hareketine yazılır
function applyRepRanges(days) {
  const byName = {};
  days.forEach(d => d.exercises.forEach(e => {
    if (!e.repRange) return;
    (byName[normName(e.name)] = byName[normName(e.name)] || []).push(e.repRange.join('-'));
  }));
  DB.settings.repRangeByEx = DB.settings.repRangeByEx || {};
  days.forEach(d => d.exercises.forEach(e => {
    if (!e.repRange) return;
    const k = normName(e.name), list = byName[k];
    if (!DB.settings.repRangeByEx[k]) DB.settings.repRangeByEx[k] = e.repRange;
    if (list.every(r => r === list[0])) { DB.settings.repRangeByEx[k] = e.repRange; delete e.repRange; }
  }));
}

function programSignature(days) {
  return JSON.stringify((days || []).map(d => [normName(d.name), d.exercises.map(e => [normName(e.name), e.sets])]));
}

// Önceki programlar (en yeni başta, en fazla 5, aynıları tekrar edilmez)
function getProgramHistory() {
  let h = readJSON('programHistory', null);
  if (!Array.isArray(h)) {
    h = [];
    const old = readJSON('programBackup', null);   // ilk sürümdeki tek yedek
    if (isPlainObject(old)) h.push(old);
  }
  return h.filter(x => isPlainObject(x) && Array.isArray(x.days) && x.days.length);
}
function saveProgramToHistory(entry) {
  const sig = programSignature(entry.days);
  const h = getProgramHistory().filter(x => programSignature(x.days) !== sig);
  h.unshift(entry);
  lsSet('programHistory', JSON.stringify(h.slice(0, 5)));
  lsRemove('programBackup');
}

function programTemplates() {
  return [{ id: MY_PROGRAM.id, name: MY_PROGRAM.name, desc: MY_PROGRAM.desc, days: myProgramDays(), renames: MY_PROGRAM.renames }];
}
function currentTemplate() {
  const sig = programSignature(DB.workoutDays);
  return programTemplates().find(t => programSignature(t.days) === sig) || null;
}
function programSummary(days) {
  const sets = days.reduce((a, d) => a + d.exercises.reduce((x, e) => x + e.sets, 0), 0);
  return `${days.length} gün · ${sets} set`;
}

function openTemplateSheet() {
  renderTemplateList();
  document.getElementById('template-sheet').classList.add('open');
  pushLayer('templateSheet');
}
function closeTemplateSheet() { closeLayer('templateSheet'); }

let templateCandidates = {};
function renderTemplateList() {
  const cur = programSignature(DB.workoutDays);
  templateCandidates = {};
  const card = (key, name, desc, days, opts = {}) => {
    templateCandidates[key] = { name, days, order: opts.order || null, renames: opts.renames || null };
    const isCur = programSignature(days) === cur;
    const dayLines = days.map(d => {
      const n = d.exercises.reduce((a, e) => a + e.sets, 0);
      const exs = d.exercises.map(e => { const r = e.repRange || repRangeFor(e.name, e); return `${escapeHtml(e.name)} <b>${e.sets}</b>${r ? `×${r[0]}–${r[1]}` : ''}`; }).join(' · ');
      return `<div class="tpl-day"><div class="tpl-day-head"><b>${escapeHtml(d.name)}</b><span>${d.exercises.length} hareket · ${n} set</span></div><div class="tpl-day-ex">${exs}</div></div>`;
    }).join('');
    return `<div class="tpl-card${isCur ? ' current' : ''}${opts.cls || ''}">
      <div class="tpl-head"><span class="tpl-name">${escapeHtml(name)}</span>${isCur ? `<span class="tpl-badge">${icon('check')}Kullanılıyor</span>` : `<span class="tpl-meta">${programSummary(days)}</span>`}</div>
      <div class="tpl-desc">${escapeHtml(desc)}</div>
      ${opts.check ? `<div class="tpl-check">${icon('check-circle')}${escapeHtml(opts.check)}</div>` : ''}
      <div class="tpl-days">${dayLines}</div>
      ${isCur ? '' : `<button class="btn-primary tpl-apply" onclick="applyTemplate(${jsArg(key)})">Bu programa geç</button>`}
    </div>`;
  };
  const tpls = programTemplates();
  const tplSigs = new Set(tpls.map(t => programSignature(t.days)));
  let html = '';
  // Kullanıcının kendi önceki programları önce (şablonlarla aynı olanlar hariç)
  getProgramHistory().forEach((h, i) => {
    if (tplSigs.has(programSignature(h.days))) return;
    html += card(`history:${i}`, 'Önceki programın', `${fmtDate(h.date)} tarihinde değiştirdiğin program: ${h.days.map(d => d.name).join(', ')}.`, h.days, { cls: ' backup', order: h.order });
  });
  html = tpls.map(t => card(t.id, t.name, t.desc, t.days, { renames: t.renames })).join('') + html;
  document.getElementById('template-list').innerHTML = html;
}

function applyTemplate(key) {
  if (active) { toast('Önce devam eden antrenmanı bitir ya da iptal et.', 3000); return; }
  const cand = templateCandidates[key];
  if (!cand) return;
  if (!confirm(`Programın "${cand.name}" ile değiştirilecek.\n\nGeçmiş kayıtların ve grafiklerin korunur. Şu anki programın saklanır, istediğin zaman buradan geri dönebilirsin.`)) return;

  // Adı değişen hareketler: geçmişi olanları sor, onaylanırsa her yerde yeni isme taşı
  const renames = Object.entries(cand.renames || {}).filter(([from]) => getLogsByExName(from).length);
  if (renames.length && confirm(`Adı değişen hareketler:\n${renames.map(([f, t]) => `• ${f} → ${t}`).join('\n')}\n\nGeçmiş kayıtlar, rekorlar ve hareket ayarları yeni isme taşınsın mı?`)) {
    renames.forEach(([f, t]) => migrateExName(f, t));
    saveData('workoutLogs', DB.workoutLogs);
  }

  // Şu anki programı sakla; hiçbir program kaybolmaz
  saveProgramToHistory({ days: deepCopy(DB.workoutDays), order: [...DB.workoutOrder], date: today() });

  // Sağ/sol ayrı tekrar ayarı hareket adına göre korunur
  const bilateral = new Set();
  DB.workoutDays.forEach(d => d.exercises.forEach(e => { if (e.bilateral) bilateral.add(normName(e.name)); }));
  const newDays = normalizeDays(deepCopy(cand.days));
  newDays.forEach(d => d.exercises.forEach(e => {
    if (e.bilateral || bilateral.has(normName(e.name))) e.bilateral = true; else delete e.bilateral;
  }));

  applyRepRanges(newDays);
  saveData('settings', DB.settings);
  DB.workoutDays = newDays;
  DB.workoutOrder = Array.isArray(cand.order) ? cand.order.map(String) : newDays.map(d => d.id);
  syncOrder();
  saveData('workoutDays', DB.workoutDays);
  saveData('workoutOrder', DB.workoutOrder);

  closeTemplateSheet();
  renderHome();
  renderSettings();
  toast(`✅ Program değişti: ${cand.name}`, 2600);
}
