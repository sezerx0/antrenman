// Antrenman Takip — Ölçümler: profil, hızlı tartı, detaylı ölçüm ve yağ oranı, trend grafiği, geçmiş.

// ═══════════════════════════════════════════════
//  MEASUREMENTS
// ═══════════════════════════════════════════════
let selectedGender = 'male';
let fatChart = null;

function setGender(g, silent) {
  selectedGender = g;
  document.getElementById('gbtn-male').classList.toggle('active', g === 'male');
  document.getElementById('gbtn-female').classList.toggle('active', g === 'female');
  document.getElementById('hip-row').style.display = g === 'female' ? 'flex' : 'none';
  if (!silent) saveProfile();
}

function parseBirthYear(v) {
  const y = int(v);
  const now = new Date().getFullYear();
  return y >= 1900 && y <= now ? y : null;
}

function saveProfile(showToast) {
  const birthYear = parseBirthYear(document.getElementById('m-birthyear').value);
  const height = num(document.getElementById('m-height').value);
  DB.settings.profile = { gender: selectedGender, birthYear, height: height > 0 ? height : null };
  saveData('settings', DB.settings);
  const badge = document.getElementById('profile-saved-badge');
  if (badge) badge.style.display = (birthYear || height > 0) ? 'inline' : 'none';
  if (showToast) toast('✅ Profil kaydedildi.');
}

function loadProfile() {
  const p = DB.settings.profile;
  const badge = document.getElementById('profile-saved-badge');
  if (!p) { if (badge) badge.style.display = 'none'; return; }
  setGender(p.gender === 'female' ? 'female' : 'male', true);
  if (p.birthYear) document.getElementById('m-birthyear').value = p.birthYear;
  if (p.height) document.getElementById('m-height').value = p.height;
  if (badge) badge.style.display = (p.birthYear || p.height) ? 'inline' : 'none';
}

function getProfileAge() {
  const p = DB.settings.profile;
  return p && p.birthYear ? new Date().getFullYear() - p.birthYear : null;
}

function measVal(id) {
  const v = num(document.getElementById(id).value);
  return v > 0 ? v : null;
}

const MEAS_FIELDS = {
  weight: 'm-weight', neck: 'm-neck', chest: 'm-chest', shoulder: 'm-shoulder', waist: 'm-waist', hip: 'm-hip',
  armR: 'm-arm-r', armL: 'm-arm-l', forearmR: 'm-forearm-r', forearmL: 'm-forearm-l',
  thighR: 'm-thigh-r', thighL: 'm-thigh-l', calfR: 'm-calf-r', calfL: 'm-calf-l',
};

function computeFat(gender, height, neck, waist, hip) {
  if (!height || !neck || !waist) return null;
  let fat;
  if (gender === 'male') {
    fat = 495 / (1.0324 - 0.19077 * Math.log10(waist - neck) + 0.15456 * Math.log10(height)) - 450;
  } else {
    if (!hip) return null;
    fat = 495 / (1.29579 - 0.35004 * Math.log10(waist + hip - neck) + 0.22100 * Math.log10(height)) - 450;
  }
  fat = Math.round(fat * 10) / 10;
  return isFinite(fat) && fat >= 1 && fat <= 70 ? fat : NaN;
}

function fatCategory(gender, fat) {
  if (gender === 'male') {
    if (fat < 6) return 'Temel Yağ';
    if (fat < 14) return 'Sporcu';
    if (fat < 18) return 'Fit';
    if (fat < 25) return 'Ortalama';
    return 'Obez';
  }
  if (fat < 14) return 'Temel Yağ';
  if (fat < 21) return 'Sporcu';
  if (fat < 25) return 'Fit';
  if (fat < 32) return 'Ortalama';
  return 'Obez';
}

// Bugünün kaydıyla birleştirir: yeni girilen değerler eskilerin üzerine yazar,
// boş bırakılanlar korunur
function upsertMeasurement(partial) {
  const date = today();
  const existing = DB.measurements.find(m => m.date === date) || { date };
  const merged = { ...existing };
  Object.entries(partial).forEach(([k, v]) => { if (v != null) merged[k] = v; });
  DB.measurements = DB.measurements.filter(m => m.date !== date);
  DB.measurements.push(merged);
  DB.measurements.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  saveData('measurements', DB.measurements);
  return merged;
}

function saveQuickWeight() {
  const input = document.getElementById('quick-weight');
  const w = num(input.value);
  if (!(w >= 20 && w <= 400)) { toast('Geçerli bir kilo gir.'); return; }
  upsertMeasurement({ weight: round2(w) });
  input.value = '';
  input.blur();
  toast('✅ Kilo kaydedildi.');
  renderMeasurements();
}

function toggleLimbRows() {
  const rows = document.getElementById('limb-rows');
  const btn = document.getElementById('limb-toggle');
  const open = rows.style.display === 'none';
  rows.style.display = open ? 'block' : 'none';
  btn.setAttribute('aria-expanded', String(open));
}

function calculateFat() {
  const profile = DB.settings.profile || {};
  const height = profile.height || measVal('m-height');
  const vals = {};
  Object.entries(MEAS_FIELDS).forEach(([k, id]) => { vals[k] = measVal(id); });
  if (selectedGender !== 'female') vals.hip = null;
  if (!Object.values(vals).some(v => v != null)) { toast('Kaydedilecek ölçüm yok.'); return; }

  const fat = computeFat(selectedGender, height, vals.neck, vals.waist, vals.hip);
  if (Number.isNaN(fat)) { toast('Yağ oranı hesaplanamadı, boyun/bel değerlerini kontrol et.', 3000); return; }

  const entry = { ...vals, gender: selectedGender, age: getProfileAge() };
  if (fat != null) entry.fat = fat;
  const saved = upsertMeasurement(entry);
  Object.values(MEAS_FIELDS).forEach(id => { document.getElementById(id).value = ''; });

  const rc = document.getElementById('fat-result-card');
  if (fat != null) {
    const weight = saved.weight;
    rc.style.display = 'block';
    rc.innerHTML = `<div class="result-card">
      <div class="result-pct">%${fat}</div>
      <div class="result-label">Vücut Yağ Oranı</div>
      <div class="result-cat">${fatCategory(selectedGender, fat)}</div>
      ${weight ? `<div style="margin-top:8px;font-size:13px;opacity:0.88;">Yağ: ~${Math.round(fat/100*weight)} kg · Yağsız Kütle: ~${Math.round((1-fat/100)*weight)} kg</div>` : ''}
    </div>`;
    toast('✅ Ölçüm kaydedildi!');
  } else {
    rc.style.display = 'none';
    toast(vals.neck || vals.waist ? '✅ Kaydedildi. Yağ oranı için boyun ve bel birlikte gerekli.' : '✅ Ölçüm kaydedildi!', 3000);
  }
  renderMeasurements();
}

// Boş alanlarda son ölçülen değer soluk renkte görünür
function fillMeasPlaceholders() {
  const lastOf = key => { for (let i = DB.measurements.length - 1; i >= 0; i--) if (DB.measurements[i][key] != null) return DB.measurements[i][key]; return null; };
  Object.entries(MEAS_FIELDS).forEach(([k, id]) => {
    const v = lastOf(k);
    document.getElementById(id).placeholder = v != null ? String(v).replace('.', ',') : '—';
  });
  const w = lastOf('weight');
  document.getElementById('quick-weight').placeholder = w != null ? String(w).replace('.', ',') : '—';
  document.getElementById('m-birthyear').placeholder = '1995';
  document.getElementById('m-height').placeholder = '175';
}

function renderMeasurements() {
  loadProfile();
  fillMeasPlaceholders();
  renderMeasSummaryCard();
  renderFatChart();
  renderMeasHistory();
}

function renderMeasSummaryCard() {
  const card = document.getElementById('meas-summary-card');
  if (!card) return;
  const data = DB.measurements;
  if (!data.length) { card.style.display = 'none'; return; }

  // Her değer için en son ve bir önceki ölçüm (o değerin girildiği kayıtlar arasından)
  const lastTwo = key => data.filter(m => m[key] != null).slice(-2);
  const [fPrev, fLast] = (a => a.length === 2 ? a : [null, a[0] || null])(lastTwo('fat'));
  const [wPrev, wLast] = (a => a.length === 2 ? a : [null, a[0] || null])(lastTwo('weight'));
  if (!fLast && !wLast) { card.style.display = 'none'; return; }

  const diffBadge = (diff, unit) => {
    if (diff === null) return '';
    const color = diff === 0 ? 'var(--text-secondary)' : diff < 0 ? 'var(--green)' : '#ff3b30';
    const sign = diff > 0 ? '+' : '';
    return `<span style="font-size:12px;font-weight:600;color:${color};margin-left:6px;">${sign}${Math.round(diff*10)/10}${unit}</span>`;
  };
  const fatDiff = fLast && fPrev ? fLast.fat - fPrev.fat : null;
  const wDiff = wLast && wPrev ? wLast.weight - wPrev.weight : null;
  const lastDate = data[data.length - 1].date;
  const leanW = fLast && wLast ? wLast.weight : null;

  card.style.display = 'block';
  card.innerHTML = `<div class="card meas-summary-card">
    <div class="meas-sum-date">${fmtDate(lastDate)} · Son ölçüm</div>
    <div class="meas-sum-row">
      ${fLast ? `<div class="meas-sum-item">
        <div class="meas-sum-val">%${escapeHtml(fLast.fat)}</div>
        <div class="meas-sum-lbl">Yağ Oranı ${diffBadge(fatDiff, '%')}</div>
      </div>` : ''}
      ${fLast && wLast ? '<div class="meas-sum-divider"></div>' : ''}
      ${wLast ? `<div class="meas-sum-item">
        <div class="meas-sum-val">${escapeHtml(wLast.weight)} kg</div>
        <div class="meas-sum-lbl">Vücut Ağırlığı ${diffBadge(wDiff, ' kg')}</div>
        ${(() => { const av = weightAverages(data); const n = data.filter(m => m.weight != null).length; return n >= 3 ? `<div class="meas-sum-avg">7 gün ort. ${av[av.length - 1]} kg</div>` : ''; })()}
      </div>` : ''}
    </div>
    ${leanW ? `<div class="meas-sum-sub">
      Yağ kütlesi: ~${Math.round(fLast.fat/100*leanW)} kg &nbsp;·&nbsp; Yağsız kütle: ~${Math.round((1-fLast.fat/100)*leanW)} kg
    </div>` : ''}
  </div>`;
}

let currentTrendKey = 'fat';
function switchTrend(key, btn) {
  currentTrendKey = key;
  document.querySelectorAll('.trend-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderFatChart();
}

const trendMeta = {
  fat:    { label: 'Yağ Oranı', color: '#007AFF', suffix: v => '%' + v },
  weight: { label: 'Ağırlık',   color: '#34c759', suffix: v => v + ' kg' },
  armR:   { label: 'Kol',       color: '#ff9f0a', suffix: v => v + ' cm' },
  chest:  { label: 'Göğüs',     color: '#ff3b30', suffix: v => v + ' cm' },
  waist:  { label: 'Bel',       color: '#af52de', suffix: v => v + ' cm' },
  thighR: { label: 'Uyluk',     color: '#5ac8fa', suffix: v => v + ' cm' },
};

// Her tartı günü için o gün dahil son 7 günün ortalaması
function weightAverages(data) {
  const pts = data.filter(m => m.weight != null).map(m => ({ date: m.date, t: new Date(m.date + 'T00:00:00').getTime(), w: m.weight }));
  return pts.map(p => {
    const win = pts.filter(q => q.t <= p.t && q.t > p.t - 7 * 86400000);
    return Math.round(win.reduce((a, q) => a + q.w, 0) / win.length * 10) / 10;
  });
}

function renderFatChart() {
  const canvas = document.getElementById('fat-chart');
  if (fatChart) { fatChart.destroy(); fatChart = null; }
  const meta = trendMeta[currentTrendKey] || trendMeta.fat;
  const key = trendMeta[currentTrendKey] ? currentTrendKey : 'fat';
  const data = DB.measurements.filter(m => m[key] != null);
  const empty = document.getElementById('fat-chart-empty');
  if (empty) empty.style.display = data.length < 2 ? 'flex' : 'none';
  if (data.length < 2 || !window.Chart) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
  const textColor = '#8e8e93';
  const col = chartColor(meta.color);
  const isWeight = key === 'weight';
  // Kilo: günlük tartı su/tuzla oynar; noktalar ham değer, kalın çizgi 7 günlük ortalama
  const datasets = isWeight ? [
    { label: 'Tartı', data: data.map(m => m.weight), showLine: false, pointRadius: 3, pointBackgroundColor: col + '80', pointBorderColor: 'transparent', order: 2 },
    { label: '7 günlük ortalama', data: weightAverages(data), borderColor: col, backgroundColor: col + '1f', borderWidth: 3, fill: true, tension: 0.35, pointRadius: 0, order: 1 },
  ] : [{
    label: meta.label,
    data: data.map(m => m[key]),
    borderColor: col,
    backgroundColor: col + '1f',
    fill: true, tension: 0.4, pointRadius: 4, pointBackgroundColor: col,
  }];
  fatChart = new Chart(canvas, {
    type: 'line',
    data: { labels: data.map(m => fmtDateShort(m.date)), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: isWeight, position: 'bottom', labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, color: textColor, font: { size: 11 } } } },
      scales: {
        x: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
        y: { grid: { color: gridColor }, ticks: { color: textColor, font: { size: 11 }, callback: meta.suffix }, ...(key === 'fat' ? { min: 0 } : {}) }
      }
    }
  });
}

function renderMeasHistory() {
  const list = document.getElementById('meas-history-list');
  const items = DB.measurements.map((m, idx) => ({ m, idx })).reverse();
  if (!items.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-secondary);font-size:14px;">Henüz ölçüm kaydedilmedi.</div>';
    return;
  }
  list.innerHTML = items.map(({ m, idx }) => {
    const d = new Date(m.date + 'T00:00:00');
    const day = isNaN(d) ? '?' : d.getDate();
    const mo = isNaN(d) ? '' : d.toLocaleDateString('tr-TR', { month:'short' });
    const extras = [
      m.waist    ? `Bel ${m.waist} cm` : null,
      m.chest    ? `Göğüs ${m.chest} cm` : null,
      m.shoulder ? `Omuz ${m.shoulder} cm` : null,
      m.armR     ? `Kol ${m.armR} cm` : null,
      m.thighR   ? `Uyluk ${m.thighR} cm` : null,
      m.calfR    ? `Baldır ${m.calfR} cm` : null,
    ].filter(Boolean).join(' · ');
    return `<div class="meas-history-item" style="flex-direction:column;align-items:stretch;gap:6px;padding:14px 16px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="meas-date-badge"><span>${day}<br>${escapeHtml(mo)}</span></div>
        <div style="flex:1;">
          <div style="font-size:14px;font-weight:600;">${m.fat != null ? `%${escapeHtml(m.fat)} yağ oranı` : m.weight ? `${escapeHtml(m.weight)} kg` : 'Ölçüm'}</div>
          <div style="font-size:12px;color:var(--text-secondary);">${m.fat != null ? (m.weight ? escapeHtml(m.weight) + ' kg · ' : '') + (m.gender === 'female' ? 'Kadın' : 'Erkek') : (m.weight ? 'Tartı' : '')}</div>
        </div>
        <button class="delete-btn" onclick="deleteMeasurement(${idx})" aria-label="Ölçümü sil">${icon('x')}</button>
      </div>
      ${extras ? `<div style="font-size:12px;color:var(--text-secondary);padding-left:2px;">${escapeHtml(extras)}</div>` : ''}
    </div>`;
  }).join('');
}

function deleteMeasurement(idx) {
  if (!DB.measurements[idx]) return;
  if (!confirm('Bu ölçümü silmek istiyor musunuz?')) return;
  DB.measurements.splice(idx, 1);
  saveData('measurements', DB.measurements);
  renderMeasurements();
  toast('Ölçüm silindi.');
}
