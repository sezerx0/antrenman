// Antrenman Takip — Günlük rutin: supplement listesi, su takibi ve takvim.

// ═══════════════════════════════════════════════
//  SUPPLEMENT / DAILY ROUTINE
// ═══════════════════════════════════════════════
const SUPPL_COLORS = ['#5ac8fa','#34c759','#ff9f0a','#af52de','#ff3b30','#007aff','#ff6b6b','#ffd93d'];

function getDefaultSupplements() {
  return [
    { id: 'kreatin', name: 'Kreatin', color: '#5ac8fa' },
    { id: 'protein', name: 'Protein', color: '#34c759' },
  ];
}
function getSupplements() {
  if (!Array.isArray(DB.settings.supplements)) DB.settings.supplements = getDefaultSupplements();
  return DB.settings.supplements;
}

function getSupplHistory() {
  const h = readJSON('supplHistory', {});
  return isPlainObject(h) ? h : {};
}
function saveSupplHistory(h) { lsSet('supplHistory', JSON.stringify(h)); }

function getSuppl(date) {
  const d = date || today();
  const h = getSupplHistory();
  // Çok eski tek-günlük formatı taşı
  if (!h[d] && !date) {
    const o = readJSON('suppl', null);
    if (isPlainObject(o) && o.date === d) {
      const items = {};
      getSupplements().forEach(s => { items[s.id] = !!o[s.id]; });
      return { items, water: o.water || 0 };
    }
  }
  return isPlainObject(h[d]) ? h[d] : { items: {}, water: 0 };
}
function saveTodaySuppl(data) {
  const h = getSupplHistory();
  h[today()] = data;
  saveSupplHistory(h);
}

function toggleSuppl(id) {
  const data = getSuppl();
  data.items = data.items || {};
  data.items[id] = !data.items[id];
  saveTodaySuppl(data);
  renderSuppl();
  renderSupplCalendar();
}
function addWater() {
  const data = getSuppl();
  data.water = (data.water || 0) + 1;
  saveTodaySuppl(data);
  renderSuppl();
  renderSupplCalendar();
}
function removeWater(i) {
  const data = getSuppl();
  data.water = i;
  saveTodaySuppl(data);
  renderSuppl();
  renderSupplCalendar();
}
function setWater(n) {
  const data = getSuppl();
  data.water = Math.max(0, n);
  saveTodaySuppl(data);
  renderSuppl();
  renderSupplCalendar();
}
function getWaterGoal() { return DB.settings.waterGoal || 8; }
function changeWaterGoal(d) {
  DB.settings.waterGoal = Math.max(1, Math.min(20, getWaterGoal() + d));
  saveData('settings', DB.settings);
  renderSuppl();
}

function renderSuppl() {
  const data = getSuppl();
  const supps = getSupplements();
  const list = document.getElementById('suppl-checklist');
  if (list) {
    list.innerHTML = supps.map(s => {
      const done = !!(data.items && data.items[s.id]);
      const color = safeColor(s.color);
      return `<div class="suppl-row" onclick="toggleSuppl(${jsArg(s.id)})">
        <div class="suppl-check ${done ? 'done' : ''}" style="${done ? `background:${color};border-color:${color};` : ''}"></div>
        <span class="suppl-label ${done ? 'done' : ''}">${escapeHtml(s.name)}</span>
        <span style="width:10px;height:10px;border-radius:50%;background:${color};display:inline-block;flex-shrink:0;"></span>
      </div>`;
    }).join('');
  }
  const drops = document.getElementById('water-drops');
  if (!drops) return;
  const filled = Math.max(0, parseInt(data.water) || 0);
  const goal = getWaterGoal();
  // Hedef kadar damla; dolu damlaya dokununca oraya kadar geri alınır,
  // boş damlaya dokununca oraya kadar doldurulur. Hedef aşılırsa + ile devam.
  const slots = Math.max(goal, filled + (filled >= goal ? 1 : 0));
  drops.innerHTML = Array.from({ length: slots }, (_, i) => {
    if (i < filled) return `<button class="water-drop filled" onclick="setWater(${i})" aria-label="${i + 1}. bardağı geri al">${icon('droplet')}</button>`;
    if (i < goal) return `<button class="water-drop" onclick="setWater(${i + 1})" aria-label="${i + 1} bardağa tamamla">${icon('droplet')}</button>`;
    return `<button class="water-drop extra" onclick="setWater(${filled + 1})" aria-label="Bir bardak daha">${icon('plus')}</button>`;
  }).join('');
  const totalEl = document.getElementById('water-total');
  if (totalEl) totalEl.textContent = `${filled} / ${goal} bardak · ${(filled * 0.25).toLocaleString('tr-TR')} L`;
  document.getElementById('water-goal-num').textContent = goal;
  document.getElementById('water-bar-fill').style.width = Math.min(100, Math.round(filled / goal * 100)) + '%';
}

let supplCalOffset = 0;
function shiftSupplCal(d) { supplCalOffset += d; renderSupplCalendar(); }

function renderSupplCalendar() {
  const titleEl = document.getElementById('suppl-cal-title');
  const dowsEl = document.getElementById('suppl-cal-dows');
  const gridEl = document.getElementById('suppl-cal-grid');
  const legendEl = document.getElementById('suppl-legend');
  if (!gridEl) return;

  const supps = getSupplements();
  const supplHist = getSupplHistory();
  // Önce ayın 1'ine al; yoksa 31'inde bir önceki aya geçerken tarih taşar
  const base = logicalNow();
  base.setDate(1);
  base.setMonth(base.getMonth() + supplCalOffset);
  const year = base.getFullYear();
  const month = base.getMonth();

  titleEl.textContent = base.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  dowsEl.innerHTML = ['Pt','Sa','Ça','Pe','Cu','Ct','Pz'].map(d => `<div class="suppl-cal-dow">${d}</div>`).join('');

  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = today();

  let html = '';
  for (let i = 0; i < firstDow; i++) html += `<div class="suppl-cal-day empty-day"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const entry = supplHist[dateStr];
    const taken = entry && isPlainObject(entry.items) ? supps.filter(s => entry.items[s.id]) : [];
    const isToday = dateStr === todayStr ? ' today' : '';
    let inner = '';
    if (taken.length) {
      inner = `<div class="suppl-cal-fill">${taken.map(s => `<div class="suppl-cal-fill-seg" style="background:${safeColor(s.color)};"></div>`).join('')}</div>`;
    }
    html += `<div class="suppl-cal-day${isToday}">${inner}</div>`;
  }
  gridEl.innerHTML = html;

  legendEl.innerHTML = supps.map(s =>
    `<div class="suppl-legend-item"><div class="suppl-legend-dot" style="background:${safeColor(s.color)};"></div>${escapeHtml(s.name)}</div>`
  ).join('');
}

function renderSupplSettings() {
  const supps = getSupplements();
  const el = document.getElementById('suppl-settings-list');
  if (!el) return;
  if (!supps.length) {
    el.innerHTML = '<div style="padding:14px 16px;color:var(--text-secondary);font-size:14px;">Supplement eklenmedi.</div>';
    return;
  }
  el.innerHTML = supps.map(s => `
    <div class="suppl-setting-item">
      <div class="suppl-color-swatch" style="background:${safeColor(s.color)};width:12px;height:12px;border-radius:50%;flex-shrink:0;"></div>
      <span class="suppl-setting-name">${escapeHtml(s.name)}</span>
      <button class="suppl-remove-btn" onclick="removeSupplement(${jsArg(s.id)})">−</button>
    </div>`).join('');
}

function addSupplement() {
  const input = document.getElementById('new-suppl-input');
  const name = input.value.trim();
  if (!name) { toast('Supplement adı girin.'); return; }
  const supps = getSupplements();
  if (supps.find(s => normName(s.name) === normName(name))) { toast('Bu supplement zaten var.'); return; }
  supps.push({ id: uid(), name, color: SUPPL_COLORS[supps.length % SUPPL_COLORS.length] });
  DB.settings.supplements = supps;
  saveData('settings', DB.settings);
  input.value = '';
  renderSupplSettings();
  renderSuppl();
  renderSupplCalendar();
  toast('✅ Supplement eklendi.');
}

function removeSupplement(id) {
  if (!confirm('Bu supplementi silmek istiyor musunuz?')) return;
  DB.settings.supplements = getSupplements().filter(s => s.id !== id);
  saveData('settings', DB.settings);
  renderSupplSettings();
  renderSuppl();
  renderSupplCalendar();
  toast('Supplement silindi.');
}
