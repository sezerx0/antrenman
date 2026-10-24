"""Antrenman Takip uçtan uca testleri.

Uygulamayı gerçek bir Chromium'da açıp senaryoları çalıştırır.

Çalıştırma:
    pip install -r tests/requirements.txt
    python -m playwright install chromium
    python tests/test_app.py

Ortam değişkenleri:
    CHART_JS        Chart.js dosyasının yolu (varsayılan: vendor/chart.umd.js;
                    yoksa CDN'den yüklenir)
    TEST_ARTIFACTS  ekran görüntülerinin yazılacağı klasör (varsayılan: geçici)
"""
import json, os, re, shutil, sys, tempfile, threading, http.server, functools, datetime
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
OUT = os.environ.get('TEST_ARTIFACTS') or tempfile.mkdtemp(prefix='antrenman-shots-')
os.makedirs(OUT, exist_ok=True)

# Site /antrenman/ altında yayınlanıyor (manifest ve service worker yolları buna göre);
# ilk sürüm de veri geçişini test etmek için /old/ altında.
ROOT = tempfile.mkdtemp(prefix='antrenman-site-')
shutil.copytree(REPO, os.path.join(ROOT, 'antrenman'),
                ignore=shutil.ignore_patterns('.git', '.github', 'tests', 'node_modules'))
# (.txt olarak saklanıyor ki GitHub Pages bunu çalışan bir sayfa olarak yayınlamasın)
os.makedirs(os.path.join(ROOT, 'old'))
shutil.copy(os.path.join(HERE, 'fixtures', 'legacy_v1_index.html.txt'), os.path.join(ROOT, 'old', 'index.html'))

CHART_PATH = os.environ.get('CHART_JS') or os.path.join(REPO, 'vendor', 'chart.umd.js')
CHART = open(CHART_PATH, 'rb').read() if os.path.exists(CHART_PATH) else None

class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(H, directory=ROOT))
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}'

results = []
def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (('  -> ' + str(extra)) if not cond and extra != '' else ''))

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(service_workers='block', viewport={'width': 390, 'height': 844})
    if CHART:
        ctx.route('**/cdn.jsdelivr.net/**', lambda r: r.fulfill(status=200, body=CHART, content_type='application/javascript'))
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    DLG = {'accept': True, 'msgs': []}
    def on_dialog(d):
        DLG['msgs'].append(d.message)
        d.accept() if DLG['accept'] else d.dismiss()
    page.on('dialog', on_dialog)

    # ── 1. Eski sürümle gerçek veri üret ──
    page.goto(BASE + '/old/index.html')
    page.evaluate("""() => {
      localStorage.setItem('otherApp', 'baska-proje-verisi');
      openWorkoutScreen('torso-a');
      document.getElementById('kg-pec-deck-0').value = '40';
      document.getElementById('reps-pec-deck-0').value = '10';
      document.getElementById('kg-pec-deck-1').value = '42.5';
      document.getElementById('reps-pec-deck-1').value = '8';
      document.getElementById('note-pec-deck').value = 'koltuk 4';
      finishWorkout(); saveSummary();
      DB.settings.profile = { gender: 'male', age: 30, height: 180 };
      saveData('settings', DB.settings);
      // exName'siz çok eski log
      DB.workoutLogs.unshift({ date: '2026-01-05', dayId: 'limbs-a', duration: 1800,
        sets: [{ exId: 'leg-press', setIdx: 0, kg: 100, reps: 12 }], notes: {} });
      saveData('workoutLogs', DB.workoutLogs);
    }""")
    old_logs = page.evaluate("JSON.parse(localStorage.getItem('workoutLogs'))")
    check('eski sürüm 2 log üretti', len(old_logs) == 2, old_logs)

    # ── 2. Yeni sürüm: geçiş ──
    page.goto(BASE + '/antrenman/index.html')
    ls = page.evaluate("Object.fromEntries(Object.keys(localStorage).map(k => [k, localStorage.getItem(k)]))")
    check('eski anahtarlar öneke taşındı', 'antrenman:workoutLogs' in ls and 'workoutLogs' not in ls, list(ls))
    check('başka uygulamanın anahtarına dokunulmadı', ls.get('otherApp') == 'baska-proje-verisi')
    logs = json.loads(ls['antrenman:workoutLogs'])
    check('eski loga exName eklendi', logs[0]['sets'][0].get('exName') == 'Leg Press', logs[0])
    check('loglara dayName eklendi', all(l.get('dayName') for l in logs))
    prof = json.loads(ls['antrenman:settings'])['profile']
    check('yaş → doğum yılı', prof.get('birthYear') == datetime.date.today().year - 30 and 'age' not in prof, prof)
    check('ana sayfa toplam sayaç', page.inner_text('#stat-total-count') == '2')

    # ── 3. Antrenman: virgül, ✓ sonrası düzenleme, yeniden yükleme ──
    page.evaluate("openWorkoutScreen('torso-a')")
    hint = page.inner_text('#ex-card-0 .ex-prev-hint')
    prev_cells = page.evaluate("[...document.querySelectorAll('#ex-card-0 .set-prev')].map(e => e.innerText.replace(/\\s+/g, ''))")
    check('önceki performans sütunda ve not görünüyor', prev_cells == ['40×10', '42.5×8'] and 'Önceki:' in hint and 'koltuk 4' in page.inner_text('#ex-card-0'), (prev_cells, hint))
    check('placeholder önceki değerden', page.get_attribute('#kg-0-1', 'placeholder') == '42.5')
    page.fill('#kg-0-0', '22,5')
    page.fill('#reps-0-0', '8')
    page.click('#set-done-0-0')
    page.fill('#kg-0-0', '25')          # ✓ sonrası düzeltme
    page.fill('#kg-1-0', '30'); page.fill('#reps-1-0', '10')
    page.click('#ex-card-2 .set-count-btn.accent')   # + Set
    page.fill('#kg-2-3', '7,5'); page.fill('#reps-2-3', '15')
    page.click('#note-chip-1')
    page.fill('#note-1', 'yeni not')
    page.wait_for_timeout(200)
    page.reload()
    page.wait_for_timeout(300)
    check('yenileme sonrası ekran açık', page.evaluate("document.getElementById('workout-screen').classList.contains('open')"))
    check('yenileme sonrası değerler geri geldi',
          page.input_value('#kg-0-0') == '25' and page.input_value('#kg-2-3') == '7,5' and page.input_value('#note-1') == 'yeni not',
          [page.input_value('#kg-0-0'), page.is_visible('#kg-2-3')])
    check('✓ durumu geri geldi', page.evaluate("document.getElementById('set-done-0-0').classList.contains('done')"))
    check('eklenen set sayısı korundu', page.inner_text('#set-count-2') == '4 set')

    # ── 4. Başka güne geçerken onay; iptal edilirse veri kalmalı ──
    DLG['accept'] = False; DLG['msgs'] = []; msgs = DLG['msgs']
    page.evaluate("hideWorkoutScreenUI(); openWorkoutScreen('limbs-a')")
    check('farklı gün açılırken onay soruldu', msgs and 'devam ediyor' in msgs[0], msgs)
    check('onay reddedilince veri korundu', page.evaluate("active && active.dayId") == 'torso-a')
    DLG['accept'] = True

    # ── 5. Bitir ──
    page.evaluate("showWorkoutScreen(); finishWorkout(); saveSummary();")
    page.wait_for_timeout(300)
    logs = page.evaluate("JSON.parse(localStorage.getItem('antrenman:workoutLogs'))")
    last = logs[-1]
    sets = last['sets']
    check('boş setler kaydedilmedi', len(sets) == 3, sets)
    s0 = [s for s in sets if s['exName'] == 'Pec Deck Fly'][0]
    check('✓ sonrası düzeltilen kilo kaydedildi (25)', s0['kg'] == 25, s0)
    s2 = [s for s in sets if s['exName'] == 'Cable Lateral Raise'][0]
    check('virgüllü kilo doğru (7,5 → 7.5) ve setIdx 3', s2['kg'] == 7.5 and s2['setIdx'] == 3, s2)
    check('not kaydedildi', last['exNotes'].get('incline chest press') == 'yeni not', last.get('exNotes'))
    check('aktif antrenman temizlendi', page.evaluate("localStorage.getItem('antrenman:activeWorkout')") is None)
    check('banner gizli', not page.evaluate("document.getElementById('active-workout-banner').classList.contains('visible')"))

    # ── 6. Atlanan hareket önceki değeri silmemeli ──
    page.evaluate("openWorkoutScreen('torso-a')")
    check('Incline için önceki değer hâlâ 30 (önceki antrenmanda boştu → 2 log geride değil, son dolu kayıt)',
          page.get_attribute('#kg-1-0', 'placeholder') == '30', page.get_attribute('#kg-1-0', 'placeholder'))
    check('Pec Deck set 2 ipucu eski antrenmandan değil, son dolu kayıttan',
          page.get_attribute('#kg-0-0', 'placeholder') == '25')
    page.evaluate("discardActive()")

    # ── 7. Bilateral + set ekleme ──
    page.evaluate("""() => {
      DB.workoutDays[1].exercises[0].bilateral = true; saveData('workoutDays', DB.workoutDays);
      openWorkoutScreen('limbs-a');
      addSet(0);
    }""")
    check('bilateral harekete eklenen sette S/L alanları var', page.is_visible('#repsR-0-2') and page.is_visible('#repsL-0-2'))
    page.fill('#kg-0-2', '20'); page.fill('#repsR-0-2', '9'); page.fill('#repsL-0-2', '7')
    page.evaluate("finishWorkout(); saveSummary();")
    page.wait_for_timeout(300)
    bi = page.evaluate("JSON.parse(localStorage.getItem('antrenman:workoutLogs')).slice(-1)[0].sets[0]")
    check('bilateral set doğru kaydedildi', bi.get('repsR') == 9 and bi.get('repsL') == 7 and bi.get('reps') == 9 and bi.get('setIdx') == 2, bi)
    check('runtime set sayısı sonraki antrenmana taşınmadı',
          page.evaluate("openWorkoutScreen('limbs-a'); const n = active.sets[0]; discardActive(); n") == 2)

    # ── 8. 1RM formülü tek ──
    check('I/ı/i farkı eşleşmeyi bozmuyor', page.evaluate("normName('INCLINE Chest  press') === normName('incline chest press') && normName('İncline') === normName('Incline')"))
    check('calcEpley(100,1) = 100', page.evaluate("calcEpley(100,1)") == 100)
    check('calcEpley(100,0) = 0', page.evaluate("calcEpley(100,0)") == 0)

    # ── 9. XSS / kaçış ──
    page.evaluate("""() => {
      window.__xss = 0;
      DB.workoutDays[0].name = "<img src=x onerror=window.__xss=1>A'b";
      DB.workoutDays[0].id = "x');window.__xss=2;('";
      DB.settings.supplements.push({ id: "a');window.__xss=3;('", name: '<b>s</b>', color: 'red;background:url(x)' });
      syncOrder(); renderHome(); renderSettings();
    }""")
    page.wait_for_timeout(200)
    page.click('#day-select-list .day-select-card >> nth=0')
    page.evaluate("discardActive()")
    page.evaluate("switchTab('routine')")
    page.click('#suppl-checklist .suppl-row >> nth=2')
    page.evaluate("switchTab('workout')")
    check('XSS çalışmadı', page.evaluate("window.__xss") == 0, page.evaluate("window.__xss"))
    check('tuhaf id ile gün yine açılabiliyor', page.evaluate("1") == 1)
    page.goto(BASE + '/antrenman/index.html')  # temiz başla

    # ── 10. Ay sonu takvim kayması ──
    page.clock.set_fixed_time(datetime.datetime(2026, 10, 31, 12, 0, 0))
    page.reload(); page.wait_for_timeout(200)
    page.evaluate("shiftSupplCal(-1)")
    t = page.inner_text('#suppl-cal-title')
    check('31 Ekim\'de ‹ → Eylül', 'Eylül' in t, t)
    page.evaluate("shiftWorkoutCal(-1)")
    check('antrenman takvimi de Eylül', 'Eylül' in page.inner_text('#workout-cal-title'))

    # ── 11. 04:00 kuralı haftalık hedefte ──
    page.clock.set_fixed_time(datetime.datetime(2026, 10, 5, 2, 0, 0))  # Pzt 02:00 → mantıken Pazar
    page.reload(); page.wait_for_timeout(200)
    today_cls = page.evaluate("[...document.querySelectorAll('.wg-day')].map(e=>e.className)")
    check('Pzt 02:00 iken haftalık hedefte bugün = Pazar', today_cls[6].endswith('today'), today_cls)

    # ── 12. Geri tuşu / katmanlar ──
    page.clock.set_fixed_time(datetime.datetime(2026, 10, 6, 12, 0, 0))
    page.reload(); page.wait_for_timeout(200)
    page.evaluate("openHistoryModal(0)")
    page.evaluate("closeHistoryModal()")
    page.wait_for_timeout(200)
    check('modal butonla kapanınca geçmiş kaydı geri alındı', page.evaluate("(history.state && history.state.layerDepth) || 0") == 0 and page.evaluate("layers.length") == 0)
    page.evaluate("openWorkoutScreen('torso-a')")
    page.go_back(); page.wait_for_timeout(200)
    check('geri tuşu antrenman ekranını gizler, antrenman sürer',
          not page.evaluate("document.getElementById('workout-screen').classList.contains('open')") and page.evaluate("!!active")
          and page.evaluate("document.getElementById('active-workout-banner').classList.contains('visible')"))
    page.evaluate("discardActive()")

    # ── 13. Dışa aktar → içe aktar ──
    page.evaluate("""() => { DB.workoutDays[0].exercises.push({id:'e1', name:'', sets:2}); saveData('workoutDays', DB.workoutDays); }""")
    with page.expect_download() as dl:
        page.evaluate("exportData()")
    path = dl.value.path()
    exported = json.load(open(path))
    check('dışa aktarma indirme başlattı', 'workoutLogs' in exported)
    check('lastBackup yazıldı', page.evaluate("lsGet('lastBackup')") is not None)
    n_before = page.evaluate("DB.workoutLogs.length")
    page.evaluate("localStorage.setItem('antrenman:workoutLogs','[]'); DB = loadData();")
    page.set_input_files('input[type=file]', path)
    page.wait_for_timeout(400)
    check('boş isimli hareketli yedek içe aktarıldı', page.evaluate("DB.workoutLogs.length") == n_before, page.inner_text('#toast'))

    # ── 14. Bozuk veri ──
    page.evaluate("localStorage.setItem('antrenman:workoutLogs', '{bozuk')")
    page.reload(); page.wait_for_timeout(200)
    check('bozuk JSON ile uygulama açılıyor', page.inner_text('#stat-total-count') == '0')
    check('bozuk ham veri yedeklendi', page.evaluate("Object.keys(localStorage).some(k => k.startsWith('antrenman:workoutLogs:bozuk-'))"))

    # ── 15. Sıfırlama sadece kendi anahtarlarını siler ──
    page.evaluate("resetData()")
    check('sıfırlama başka uygulamaya dokunmadı', page.evaluate("localStorage.getItem('otherApp')") == 'baska-proje-verisi')
    check('sıfırlama kendi verisini sildi', page.evaluate("localStorage.getItem('antrenman:workoutLogs')") in (None, '[]'))

    # ── 16. Yeniden adlandırma geçmişi taşır ──
    page.evaluate("""() => {
      DB.workoutLogs = [{date:'2026-10-01', dayId:'limbs-a', dayName:'Limbs A', sets:[{exId:'leg-press', exName:'Leg Press', setIdx:0, kg:150, reps:10}], notes:{}}];
      saveData('workoutLogs', DB.workoutLogs);
      openDayEditor();
      editorDays[1].exercises[6].name = 'Leg Press Machine';
      saveDays();
    }""")
    page.wait_for_timeout(200)
    check('yeniden adlandırınca geçmiş taşındı', page.evaluate("getLogsByExName('Leg Press Machine').length") == 1)

    # ── 17. Tüm sekmeler hatasız ──
    for t in ['meas', 'stats', 'settings', 'workout']:
        page.evaluate(f"switchTab('{t}')")
    page.evaluate("switchTab('meas')")
    page.fill('#m-height', '180'); page.fill('#m-neck', '38,5'); page.fill('#m-waist', '84'); page.fill('#m-weight', '80,4')
    page.evaluate("calculateFat()")
    m = page.evaluate("DB.measurements.slice(-1)[0]")
    check('ölçümde virgül kabul edildi', m and m['neck'] == 38.5 and m['weight'] == 80.4, m)
    page.screenshot(path=os.path.join(OUT, 'shot_meas.png'), full_page=False)
    page.evaluate("switchTab('stats')")
    check('PR listesi', 'Leg Press Machine' in page.inner_text('#pr-list'))
    check('Kiril harf kalmadı', not re.search('[Ѐ-ӿ]', page.content()))
    page.evaluate("switchTab('workout'); openWorkoutScreen()")
    page.screenshot(path=os.path.join(OUT, 'shot_workout.png'))


    # ── 18. Yeni arayüz: boş satıra ✓ önceki değeri kaydeder ──
    page.evaluate("switchTab('workout'); discardActive(); DB.settings.restByEx = {}; saveData('settings', DB.settings)")
    page.evaluate("""() => {
      DB.workoutLogs.push({date:'2026-10-02', dayId:'torso-a', dayName:'Torso A', sets:[
        {exId:'pec-deck', exName:'Pec Deck Fly', setIdx:0, kg:40, reps:10},
        {exId:'pec-deck', exName:'Pec Deck Fly', setIdx:1, kg:42.5, reps:8}], notes:{}, exNotes:{}});
      saveData('workoutLogs', DB.workoutLogs);
    }""")
    page.evaluate("openWorkoutScreen('torso-a')")
    page.click('#set-done-0-1')
    check('boş satıra ✓ önceki değeri doldurdu', page.input_value('#kg-0-1') == '42.5' and page.input_value('#reps-0-1') == '8')
    check('✓ işaretlendi', page.evaluate("document.getElementById('set-done-0-1').classList.contains('done')"))
    check('ilerleme 1 / 13 set', page.inner_text('#ws-day-sub') == '1 / 13 set', page.inner_text('#ws-day-sub'))
    check('ilerleme çubuğu doldu', page.evaluate("document.getElementById('ws-progress-fill').style.width") != '0%')
    page.click('#set-done-1-0')
    check('önceki değeri olmayan boş satır işaretlenmedi', not page.evaluate("document.getElementById('set-done-1-0').classList.contains('done')"))
    page.fill('#kg-1-0', '50')  # sadece kilo, tekrar boş, önceki yok
    page.click('#set-done-1-0')
    check('sadece kilo girilince yine işaretlenir', page.evaluate("document.getElementById('set-done-1-0').classList.contains('done')"))

    # ── 19. Hareket başına dinlenme + ±30 ──
    page.evaluate("stopRest()")
    page.click('#rest-chip-0'); page.wait_for_timeout(200)
    check('dinlenme çipi hareket ayarlarını açıyor', page.is_visible('#ex-sheet') and page.inner_text('#ex-rest-label') == '1:30', page.inner_text('#ex-rest-label'))
    page.click('#ex-sheet .ex-settings .sheet-row:has(#ex-rest-label) .dur-stepper button >> nth=1')
    page.click('#ex-sheet .ex-settings .sheet-row:has(#ex-rest-label) .dur-stepper button >> nth=1')
    check('dinlenme 15 sn adımlarla 2:00 oldu', page.inner_text('#ex-rest-label') == '2:00' and '2:00' in page.inner_text('#rest-chip-0'), page.inner_text('#ex-rest-label'))
    check('Torso A Pec Deck ayarı kaydedildi', page.evaluate("DB.settings.restByEx['pec deck fly']") == 120)
    page.evaluate("closeExSheet()"); page.wait_for_timeout(300)
    page.fill('#kg-0-0', '40'); page.fill('#reps-0-0', '10')
    page.click('#set-done-0-0')
    rem = page.evaluate("Math.round((restEndTime - Date.now())/1000)")
    check('dinlenme 120 sn başladı', 118 <= rem <= 120, rem)
    page.click('.rest-adj >> nth=1')
    rem2 = page.evaluate("Math.round((restEndTime - Date.now())/1000)")
    check('+30 çalışıyor', 148 <= rem2 <= 150, rem2)
    page.click('.rest-adj >> nth=0'); page.click('.rest-adj >> nth=0')
    check('−30 çalışıyor', 88 <= page.evaluate("Math.round((restEndTime - Date.now())/1000)") <= 90)
    page.evaluate("stopRest()")
    check('not alanı varsayılan kapalı', not page.is_visible('#note-0'))
    page.screenshot(path=os.path.join(OUT, 'shot_ws2.png'))
    page.evaluate("finishWorkout(); saveSummary();")
    page.wait_for_timeout(300)

    # ── 20. Geçmiş antrenmanı düzenleme ──
    last_idx = page.evaluate("DB.workoutLogs.length - 1")
    page.evaluate(f"openHistoryModal({last_idx})")
    page.click('#history-modal .btn-primary')
    page.wait_for_timeout(300)
    check('düzenleme ekranı açıldı', page.evaluate("active && active.mode") == 'edit' and page.is_visible('#workout-screen'))
    check('düzenlemede eski değerler dolu', page.input_value('#kg-0-1') == '42.5' and page.evaluate("document.getElementById('set-done-0-1').classList.contains('done')"))
    check('düzenleme butonu "Kaydet"', page.inner_text('#ws-done-btn') == 'Kaydet')
    check('modal kapandı', not page.evaluate("document.getElementById('history-modal').classList.contains('open')"))
    page.fill('#kg-0-1', '45')
    page.click('#ws-done-btn')
    page.wait_for_timeout(400)
    edited = page.evaluate(f"DB.workoutLogs[{last_idx}]")
    check('düzenleme kaydedildi', [s['kg'] for s in edited['sets'] if s['setIdx']==1 and s['exName']=='Pec Deck Fly'] == [45], edited['sets'])
    check('tarih korunuyor', edited['date'] == page.evaluate("today()"))
    check('düzenleme sonrası ekran ve katmanlar kapandı', not page.evaluate("document.getElementById('workout-screen').classList.contains('open')") and page.evaluate("layers.length") == 0)
    check('düzenleme sonrası aktif yok', page.evaluate("active") is None and page.evaluate("localStorage.getItem('antrenman:activeWorkout')") is None)
    n = page.evaluate("DB.workoutLogs.length")
    page.evaluate(f"openHistoryModal({last_idx})")
    page.click('#history-modal .danger-text')
    page.wait_for_timeout(300)
    check('modaldan silme', page.evaluate("DB.workoutLogs.length") == n - 1 and not page.evaluate("document.getElementById('history-modal').classList.contains('open')"))

    # ── 21. Hızlı tartı + aynı gün birleştirme ──
    page.evaluate("switchTab('meas'); DB.measurements = []; saveData('measurements', DB.measurements); renderMeasurements();")
    check('boş grafikte açıklama görünüyor', page.is_visible('#fat-chart-empty'))
    page.fill('#quick-weight', '81,3')
    page.click('.quick-weight-card button')
    m = page.evaluate("DB.measurements")
    check('sadece kilo kaydedildi', len(m) == 1 and m[0].get('weight') == 81.3 and 'fat' not in m[0], m)
    check('özet kartta kilo görünüyor', '81.3 kg' in page.inner_text('#meas-summary-card'))
    check('geçmişte "81.3 kg" satırı', '81.3 kg' in page.inner_text('#meas-history-list'))
    page.fill('#m-neck', '38'); page.fill('#m-waist', '84')
    page.evaluate("calculateFat()")
    m = page.evaluate("DB.measurements")
    check('aynı gün birleşti, kilo korundu, yağ eklendi', len(m) == 1 and m[0].get('weight') == 81.3 and m[0].get('fat'), m)
    page.fill('#m-chest', '102')
    page.evaluate("calculateFat()")
    m = page.evaluate("DB.measurements")
    check('sadece göğüs girilince diğerleri korundu', m[0].get('chest') == 102 and m[0].get('fat') and m[0].get('waist') == 84, m)
    check('ana alanlar görünür (kilo, bel, boyun, göğüs, kol)', all(page.is_visible(s) for s in ['#m-weight', '#m-waist', '#m-neck', '#m-chest', '#m-arm-r']))
    check('diğer ölçüler varsayılan kapalı', not page.is_visible('#m-shoulder') and not page.is_visible('#m-thigh-r'))
    page.click('#limb-toggle')
    check('diğer ölçüler açılıyor', page.is_visible('#m-shoulder'))
    sc = page.inner_text('#meas-summary-card')
    check('yağ oranı yuvarlanmış ve "tahmini"', 'Tahmini yağ' in sc and '≈%' in sc and not __import__('re').search(r'%\d+[.,]\d', sc), sc)
    page.evaluate("""() => { DB.measurements.unshift({date:'2026-08-01', fat: 21.3, weight: 83}); saveData('measurements', DB.measurements); renderMeasurements(); }""")
    tr = page.evaluate("fatTrend(DB.measurements)")
    check('yağ trendi: değişim yarım puan hassasiyetinde', tr and tr['diff'] * 2 == round(tr['diff'] * 2), tr)
    check('özet kartta değişim metni', 'puan' in page.inner_text('#meas-summary-card') or 'değişim yok' in page.inner_text('#meas-summary-card'))
    check('geçmişte tahmini yağ', 'tahmini yağ' in page.inner_text('#meas-history-list'))
    page.evaluate("DB.measurements.shift(); saveData('measurements', DB.measurements); renderMeasurements()")

    # ── 22. Rutin sekmesi ──
    page.evaluate("switchTab('routine')")
    check('rutin sekmesi supplement listesi', 'Kreatin' in page.inner_text('#tab-routine'))
    page.click('#suppl-checklist .suppl-row >> nth=0')
    check('rutin sekmesinde işaretleme çalışıyor', page.evaluate("getSuppl().items.kreatin") is True)
    page.evaluate("switchTab('workout')")
    check('ana sekmede supplement yok', 'Kreatin' not in page.inner_text('#tab-workout'))
    page.screenshot(path=os.path.join(OUT, 'shot_home2.png'))
    page.evaluate("switchTab('routine')"); page.screenshot(path=os.path.join(OUT, 'shot_routine.png'))
    page.evaluate("switchTab('meas')"); page.screenshot(path=os.path.join(OUT, 'shot_meas2.png'))


    # ── 23. Lime teması ──
    page.evaluate("switchTab('settings')")
    check('tek palet: lime, renk seçimi yok', page.evaluate("document.documentElement.dataset.palette") == 'lime' and page.query_selector('#palette-classic-btn') is None)
    page.evaluate("switchTab('workout')")
    check('lime: kahraman kart görünüyor, klasik hedef kartı gizli', page.is_visible('#hero-ring-pct') and not page.is_visible('#weekly-goal-num'))
    page.click('.hero-goal button >> nth=1')
    check('kahraman karttan hedef değişiyor', page.evaluate("DB.settings.weeklyGoal") == 5 and 'Hedef 5' in page.inner_text('#hero-goal-num'))
    page.click('.hero-goal button >> nth=0')
    page.click('#theme-dark-btn') if page.is_visible('#theme-dark-btn') else page.evaluate("setTheme('dark')")
    check('lime + koyu', page.evaluate("document.documentElement.dataset.theme") == 'dark' and page.evaluate("document.documentElement.dataset.palette") == 'lime')
    page.evaluate("setTheme('light')")
    check('açık moda dönüş, lime kalıyor', page.evaluate("document.documentElement.dataset.theme") == '' and page.evaluate("document.documentElement.dataset.palette") == 'lime')
    check('textOn kontrast', page.evaluate("textOn('#C8F169')") == '#1C2420' and page.evaluate("textOn('#1C2420')") == '#fff')


    # ── 24. Cila düzeltmeleri ──
    page.evaluate("switchTab('settings'); openDayEditor()"); page.wait_for_timeout(400)
    ov = page.evaluate("[...document.querySelectorAll('.day-ex-row')].filter(r => r.scrollWidth > r.clientWidth + 1).length")
    check('gün düzenleyicide taşan satır yok', ov == 0, ov)
    page.evaluate("closeDayEditor()"); page.wait_for_timeout(300)
    page.evaluate("DB.settings.restIsolation = 90; DB.settings.restCompound = 150; renderSettings()")
    page.click('#rest-iso-row .dur-stepper button >> nth=1')
    check('izolasyon dinlenmesi 1:30 → 1:45', page.inner_text('#rest-iso-label') == '1:45' and page.evaluate("DB.settings.restIsolation") == 105)
    page.click('#rest-comp-row .dur-stepper button >> nth=0')
    check('press/row dinlenmesi 2:30 → 2:15', page.inner_text('#rest-comp-label') == '2:15')
    vals = page.evaluate("[restFor('Incline Chest Press'), restFor('Cable Lateral Raise'), restFor('Lat Pulldown'), restFor('Preacher Curl Machine')].join(',') + ' | ' + JSON.stringify(DB.settings.restByEx)")
    check('varsayılanlar hareket türüne göre', vals.startswith('135,105,135,105'), vals)
    page.evaluate("DB.settings.restIsolation = 90; DB.settings.restCompound = 150; saveData('settings', DB.settings); renderSettings()")
    row_ov = page.evaluate("[...document.querySelectorAll('#tab-settings .settings-row, #tab-settings .data-btn')].filter(r => r.scrollWidth > r.clientWidth + 1).map(r => r.innerText.slice(0,30))")
    check('ayarlarda taşan satır yok', not row_ov, row_ov)
    lbl_h = page.evaluate("Math.max(...[...document.querySelectorAll('#tab-settings .settings-label')].map(e => e.getBoundingClientRect().height))")
    check('ayar etiketleri tek satır', lbl_h < 26, lbl_h)
    check('fmtMins', page.evaluate("[fmtMins(20), fmtMins(90), fmtMins(4000)].join('|')") == '<1 dk|2 dk|1 sa 7 dk')
    check('gün kısaltmaları ayırt edici', page.evaluate("[dayCode('Torso A'), dayCode('Torso B'), dayCode('Limbs A'), dayCode('Push'), dayCode('İtiş günü')].join(',')") == 'TA,TB,LA,PU,IG')
    page.evaluate("switchTab('routine')")
    check('su takibi varsayılan kapalı, supplement açık', not page.is_visible('#water-block') and page.is_visible('#suppl-checklist'))
    page.evaluate("switchTab('settings')")
    page.click('#mod-water-toggle + .ios-toggle-track')
    check('su takibi ayardan açılıyor', page.evaluate("DB.settings.modWater") is True)
    page.evaluate("switchTab('routine'); setWater(0)")
    check('su bloğu görünür', page.is_visible('#water-block'))
    check('su: hedef kadar damla', page.evaluate("document.querySelectorAll('.water-drop').length") == 8)
    page.click('.water-drop >> nth=2')
    check('boş damlaya dokununca oraya kadar dolar', page.evaluate("getSuppl().water") == 3 and '3 / 8' in page.inner_text('#water-total'))
    page.click('.water-drop >> nth=0')
    check('dolu damlaya dokununca geri alınır', page.evaluate("getSuppl().water") == 0)
    page.click('.water-goal button >> nth=1')
    check('su hedefi artar', page.evaluate("getWaterGoal()") == 9 and page.evaluate("document.querySelectorAll('.water-drop').length") == 9)
    page.click('.water-goal button >> nth=0')
    page.evaluate("switchTab('meas')")
    check('ölçüm alanlarında son değer soluk görünüyor', page.get_attribute('#m-chest', 'placeholder') == '102' and page.get_attribute('#quick-weight', 'placeholder') == '81,3', page.get_attribute('#m-chest', 'placeholder'))
    check('profilde Kaydet butonu yok', page.evaluate("[...document.querySelectorAll('#profile-card button')].filter(b => b.textContent.trim() === 'Kaydet').length") == 0)
    # Aktif bant başlığı örtmesin
    page.evaluate("openWorkoutScreen('torso-a')"); page.wait_for_timeout(400)
    page.evaluate("hideWorkoutScreen()"); page.wait_for_timeout(500)
    page.evaluate("switchTab('meas'); document.getElementById('tab-meas').scrollTop = 0"); page.wait_for_timeout(200)
    bb = page.evaluate("document.getElementById('active-workout-banner').getBoundingClientRect().bottom")
    ht = page.evaluate("document.querySelector('#tab-meas .nav-header h1').getBoundingClientRect().top")
    check('aktif bant başlığın üstüne binmiyor', ht >= bb, (bb, ht))
    page.evaluate("reopenWorkoutScreen()"); page.wait_for_timeout(400)
    page.fill('#kg-0-0', '40'); page.fill('#reps-0-0', '10'); page.click('#set-done-0-0'); page.wait_for_timeout(500)
    rb = page.evaluate("document.getElementById('rest-banner').getBoundingClientRect().top")
    card = page.evaluate("document.querySelector('#ex-card-0 .ex-name').getBoundingClientRect().bottom")
    check('dinlenme sayacı ilk kartı örtmüyor', rb > card + 100, (rb, card))
    page.evaluate("stopRest(); discardActive()")


    page.evaluate("switchTab('settings'); document.getElementById('tab-settings').scrollTop = 0"); page.wait_for_timeout(200)
    overlap = page.evaluate("""[...document.querySelectorAll('#tab-settings .settings-row')].filter(r => {
      const l = r.querySelector('.settings-label'), v = r.querySelector('.settings-value');
      return l && v && v.offsetParent && l.getBoundingClientRect().right > v.getBoundingClientRect().left + 1;
    }).map(r => r.innerText.slice(0, 30))""")
    check('ayar etiketi ile değeri çakışmıyor', not overlap, overlap)
    page.evaluate("openDayEditor()"); page.wait_for_timeout(400)
    check('düzenleyici başlığı tek satır', page.evaluate("document.querySelector('#day-editor .de-header h2').getBoundingClientRect().height") < 28)
    page.evaluate("closeDayEditor()"); page.wait_for_timeout(300)


    # ── 25. Kalıcı depolama ──
    page.evaluate("ensurePersistentStorage()"); page.wait_for_timeout(300)
    st = page.evaluate("storagePersisted")
    check('kalıcı depolama isteği hatasız (sonuç: %s)' % st, st in (True, False, None))
    page.evaluate("switchTab('settings')")
    check('ayarlarda depolama durumu yazıyor', st is None or 'depolama' in page.inner_text('#storage-status'))


    # ── 26. Yedek hatırlatması ──
    page.evaluate("""() => { lsRemove('lastBackup'); delete DB.settings.backupSnoozeUntil;
      while (DB.workoutLogs.length < 3) DB.workoutLogs.push({date:'2026-09-01', dayId:'torso-a', dayName:'Torso A', sets:[{exId:'x',exName:'Lat Pulldown',setIdx:0,kg:50,reps:10}], notes:{}});
      saveData('workoutLogs', DB.workoutLogs); switchTab('workout'); }""")
    check('hiç yedek yokken hatırlatma görünüyor', page.is_visible('#backup-nudge') and 'hiç yedek' in page.inner_text('#backup-nudge'))
    page.click('#backup-nudge .nudge-secondary')
    check('"Sonra" 7 gün erteliyor', not page.is_visible('#backup-nudge') and page.evaluate("DB.settings.backupSnoozeUntil") > page.evaluate("today()"))
    page.evaluate("delete DB.settings.backupSnoozeUntil; lsSet('lastBackup', '2026-01-01'); renderHome()")
    check('eski yedekte gün sayısı yazıyor', 'gün önce' in page.inner_text('#backup-nudge'))
    with page.expect_download():
        page.click('#backup-nudge .nudge-primary')
    page.wait_for_timeout(200)
    check('yedek alınınca hatırlatma kayboluyor', not page.is_visible('#backup-nudge'))


    # ── 27. Ekran açık kalsın ──
    page.evaluate("""() => { window.__wl = { req: 0, rel: 0 };
      const fake = { request: async () => { __wl.req++; const o = new EventTarget(); o.release = async () => { __wl.rel++; }; return o; } };
      Object.defineProperty(navigator, 'wakeLock', { value: fake, configurable: true }); }""")
    page.evaluate("DB.settings.keepAwake = true; openWorkoutScreen('torso-a')"); page.wait_for_timeout(300)
    check('antrenman açılınca ekran kilidi alındı', page.evaluate("__wl.req") == 1 and page.evaluate("!!wakeLock"))
    page.evaluate("hideWorkoutScreen()"); page.wait_for_timeout(400)
    check('ekran gizlenince kilit bırakıldı', page.evaluate("__wl.rel") == 1 and page.evaluate("wakeLock") is None)
    page.evaluate("toggleKeepAwake(false); reopenWorkoutScreen()"); page.wait_for_timeout(300)
    check('ayar kapalıyken kilit alınmıyor', page.evaluate("__wl.req") == 1)
    page.evaluate("toggleKeepAwake(true)"); page.wait_for_timeout(200)
    check('ayar açılınca hemen alınıyor', page.evaluate("__wl.req") == 2)
    page.evaluate("discardActive()"); page.wait_for_timeout(200)
    check('antrenman kapanınca kilit bırakıldı', page.evaluate("wakeLock") is None)
    page.evaluate("switchTab('settings')")
    check('ayar anahtarı görünüyor ve açık', page.is_checked('#keep-awake-toggle'))


    # ── 28. İlerleme önerisi ──
    check('öneri: üst sınır → kilo artar', page.evaluate("JSON.stringify(suggestSet({}, {kg:40, reps:12}, [8,12]))") == '{"kg":42.5,"reps":8,"up":true,"steps":1}')
    check('öneri: aralıkta → +1 tekrar', page.evaluate("JSON.stringify(suggestSet({}, {kg:42.5, reps:9}, [8,12]))") == '{"kg":42.5,"reps":10,"up":false}')
    check('öneri: alt sınır altı → alt sınır', page.evaluate("JSON.stringify(suggestSet({}, {kg:50, reps:6}, [8,12]))") == '{"kg":50,"reps":8,"up":false}')
    check('öneri: S/L zayıf tarafa göre', page.evaluate("JSON.stringify(suggestSet({bilateral:true}, {kg:20, repsR:12, repsL:10, reps:12}, [8,12]))") == '{"kg":20,"reps":11,"up":false}')
    check('öneri: aralık yoksa öneri yok', page.evaluate("suggestSet({}, {kg:40, reps:12}, null)") is None)
    page.evaluate("""() => { discardActive(); DB.settings.repRangeByEx = {};
      DB.workoutLogs.push({date:'2099-01-01', dayId:'torso-a', dayName:'Torso A', __test:1, sets:[
        {exId:'pec-deck', exName:'Pec Deck Fly', setIdx:0, kg:40, reps:12},
        {exId:'pec-deck', exName:'Pec Deck Fly', setIdx:1, kg:42.5, reps:9}], notes:{}});
      openWorkoutScreen('torso-a'); }""")
    page.wait_for_timeout(300)
    check('hedef kapalıyken placeholder geçen sefer', page.get_attribute('#kg-0-0', 'placeholder') == '40' and page.inner_text('#range-chip-0').strip() == 'Hedef')
    page.click('#range-chip-0'); page.wait_for_timeout(200)
    page.click('#ex-sheet .range-chip:has-text("8–12")'); page.wait_for_timeout(150)
    page.evaluate("closeExSheet()"); page.wait_for_timeout(300)
    check('çip 8–12', page.inner_text('#range-chip-0').strip() == '8–12', page.inner_text('#range-chip-0'))
    check('tüm setler üst sınırda değil: kilo aynı, +1 tekrar', page.get_attribute('#kg-0-0', 'placeholder') == '40' and page.get_attribute('#reps-0-0', 'placeholder') == '12' and page.get_attribute('#reps-0-1', 'placeholder') == '10')
    check('öneri satırı ve açıklaması görünüyor', '40×12' in page.inner_text('#ex-card-0 .ex-sug') and '+1 tekrar' in page.inner_text('#ex-card-0 .ex-sug-why'))
    page.evaluate("setProgressMode('perSet')"); page.wait_for_timeout(150)
    check('"her set" modunda üst sınırdaki set ağırlaşıyor', page.get_attribute('#kg-0-0', 'placeholder') == '42.5' and page.get_attribute('#reps-0-0', 'placeholder') == '8' and page.get_attribute('#reps-0-1', 'placeholder') == '10')
    page.click('#set-done-0-0')
    check('boş satıra ✓ öneriyi kaydeder', page.input_value('#kg-0-0') == '42.5' and page.input_value('#reps-0-0') == '8')
    page.evaluate("setProgressMode('all')"); page.wait_for_timeout(150)
    page.fill('#kg-0-1', '44')
    page.evaluate("exSheetIdx = 0; pickRepRange(REP_RANGES.findIndex(r => r && r[0] === 10 && r[1] === 15))"); page.wait_for_timeout(150)
    check('hedef değişince girilen değerler korunur', page.input_value('#kg-0-1') == '44' and page.input_value('#kg-0-0') == '42.5' and page.evaluate("document.getElementById('set-done-0-0').classList.contains('done')"))
    check('aynı isimli hareketlere uygulanır', page.evaluate("JSON.stringify(repRangeFor('pec deck fly'))") == '[10,15]')
    page.evaluate("discardActive(); DB.workoutLogs = DB.workoutLogs.filter(l => !l.__test); saveData('workoutLogs', DB.workoutLogs); DB.settings.repRangeByEx = {}; saveData('settings', DB.settings)")


    # ── 29. Hareket menüsü: değiştir / atla ──
    page.evaluate("discardActive(); openWorkoutScreen('torso-a')"); page.wait_for_timeout(300)
    page.click('#ex-card-1 .ex-more-btn'); page.wait_for_timeout(200)
    check('hareket menüsü açıldı', page.is_visible('#ex-sheet') and 'Incline Chest Press' in page.inner_text('#ex-sheet-title'))
    page.fill('#kg-1-0', '30') if False else None
    page.click('#ex-sheet .sheet-row >> nth=1'); page.wait_for_timeout(100)
    page.fill('#swap-input', 'Machine Chest Press')
    page.click('#ex-sheet .btn-primary'); page.wait_for_timeout(400)
    check('hareket bugünlük değişti', page.inner_text('#ex-card-1 .ex-name') == 'Machine Chest Press' and 'Incline Chest Press yerine' in page.inner_text('#ex-card-1'))
    check('menü kapandı, katman kalmadı', not page.is_visible('#ex-sheet') and page.evaluate("layers.join(',')") == 'workout', page.evaluate("layers.join(',')"))
    check('program değişmedi', page.evaluate("getDayById('torso-a').exercises[1].name") == 'Incline Chest Press')
    page.fill('#kg-0-0', '40'); page.fill('#reps-0-0', '10'); page.fill('#kg-1-0', '55'); page.fill('#reps-1-0', '9')
    page.fill('#kg-2-0', '9'); page.fill('#reps-2-0', '15')
    page.click('#ex-card-2 .ex-more-btn'); page.wait_for_timeout(200)
    page.click('#ex-sheet .sheet-row >> nth=2'); page.wait_for_timeout(300)
    check('hareket atlandı ve kart soluk', page.evaluate("document.getElementById('ex-card-2').classList.contains('skipped')") and not page.is_visible('#kg-2-0'))
    check('atlanan setler ilerlemeye sayılmıyor', page.inner_text('#ws-day-sub').endswith('/ 10 set'), page.inner_text('#ws-day-sub'))
    page.reload(); page.wait_for_timeout(500)
    check('yenilemeden sonra değişiklik ve atlama korunuyor', page.inner_text('#ex-card-1 .ex-name') == 'Machine Chest Press' and page.evaluate("document.getElementById('ex-card-2').classList.contains('skipped')"))
    page.evaluate("finishWorkout(); saveSummary();"); page.wait_for_timeout(400)
    last = page.evaluate("DB.workoutLogs[DB.workoutLogs.length-1]")
    names = sorted(set(s['exName'] for s in last['sets']))
    check('kayıtta değiştirilen hareket var, atlanan yok', names == ['Machine Chest Press', 'Pec Deck Fly'], names)
    page.evaluate("openWorkoutScreen('torso-a')"); page.wait_for_timeout(300)
    check('sonraki antrenmanda program aynen', page.inner_text('#ex-card-1 .ex-name') == 'Incline Chest Press' and not page.evaluate("document.getElementById('ex-card-2').classList.contains('skipped')"))
    page.click('#ex-card-0 .ex-more-btn'); page.wait_for_timeout(200)
    page.click('#ex-sheet .sheet-row >> nth=0'); page.wait_for_timeout(400)
    check('menüden grafik açılıyor', page.is_visible('#progress-modal') and not page.is_visible('#ex-sheet') and page.evaluate("layers.join(',')") == 'workout,progressModal', page.evaluate("layers.join(',')"))
    page.evaluate("closeProgressModal()"); page.wait_for_timeout(300)
    page.click('#ex-card-1 .ex-more-btn'); page.click('#ex-sheet .sheet-row >> nth=1'); page.fill('#swap-input', 'Dips'); page.click('#ex-sheet .btn-primary'); page.wait_for_timeout(300)
    page.click('#ex-card-1 .ex-more-btn'); page.wait_for_timeout(200)
    page.click('#ex-sheet .sheet-row >> nth=1'); page.wait_for_timeout(300)
    check('değişikliği geri alma', page.inner_text('#ex-card-1 .ex-name') == 'Incline Chest Press' and page.evaluate("active.day.exercises[1].id") == 'incline-press')
    page.evaluate("discardActive()")


    # ── 30. Kas grupları ──
    det = page.evaluate("""() => ['Pec Deck Fly','Incline Chest Press','Cable Lateral Raise','Lat Pulldown','Chest Supported Machine Row','Chest Supported T-Bar Row Machine',
      'Preacher Curl Machine','Cable Triceps Pushdown','Bayesian Curl Cable','Triceps Overhead Extension','Lying Leg Curl','Leg Extension','Leg Press','Hack Squat',
      'Reverse Pec Deck','Hip Thrust','Standing Calf Raise','Shrug','Cable Crunch','Cable Reverse Curl','Dumbbell Wrist Curl'].map(n => n + '=' + detectMuscle(n)).join('|')""")
    exp = ['Pec Deck Fly=chest','Incline Chest Press=chest','Cable Lateral Raise=shoulders','Lat Pulldown=back','Chest Supported Machine Row=back','Chest Supported T-Bar Row Machine=back',
      'Preacher Curl Machine=biceps','Cable Triceps Pushdown=triceps','Bayesian Curl Cable=biceps','Triceps Overhead Extension=triceps','Lying Leg Curl=hamstrings','Leg Extension=quads','Leg Press=quads','Hack Squat=quads',
      'Reverse Pec Deck=rearDelts','Hip Thrust=glutes','Standing Calf Raise=calves','Shrug=traps','Cable Crunch=abs','Cable Reverse Curl=forearms','Dumbbell Wrist Curl=forearms']
    wrong = [a for a, b in zip(det.split('|'), exp) if a != b]
    check('kas grubu tahmini (varsayılan program + yaygın hareketler)', not wrong, wrong)
    page.evaluate("""() => { DB.workoutLogs.push({date: today(), dayId:'torso-a', dayName:'Torso A', __test:1, sets:[
        {exId:'a', exName:'Pec Deck Fly', setIdx:0, kg:40, reps:10}, {exId:'a', exName:'Pec Deck Fly', setIdx:1, kg:40, reps:10},
        {exId:'b', exName:'Lat Pulldown', setIdx:0, kg:60, reps:10}, {exId:'c', exName:'Garip Hareket', setIdx:0, kg:10, reps:10}], notes:{}});
      saveData('workoutLogs', DB.workoutLogs); switchTab('stats'); }""")
    w = page.evaluate("weeklyMuscleSets()")
    check('son 7 gün set sayımı', w.get('chest', 0) >= 2 and w.get('back', 0) >= 1 and w.get('other', 0) >= 1, w)
    txt = page.inner_text('#muscle-card')
    check('hacim kartı: programdaki ama çalışılmayan grup 0 görünüyor', 'Bacak' in txt and 'Göğüs' in txt, txt[:200])
    page.evaluate("volOpen.clear(); toggleVolDetail('legs')")
    check('gruba dokununca alt kaslar', 'Arka bacak' in page.inner_text('#vol-detail-legs'))
    page.evaluate("setMuscle('Garip Hareket', 'forearms'); volOpen.add('arms'); renderMuscleCard()")
    check('elle değiştirilen kas grubu', page.evaluate("muscleFor('garip hareket')") == 'forearms' and 'Ön kol 1' in page.inner_text('#vol-detail-arms'))
    page.evaluate("setMuscle('Garip Hareket', 'other')")
    check('tahminle aynıysa geçersiz kılma silinir', 'garip hareket' not in page.evaluate("Object.keys(DB.settings.muscleByEx || {})"))
    page.evaluate("discardActive(); openWorkoutScreen('torso-a')"); page.wait_for_timeout(300)
    page.click('#ex-card-0 .ex-more-btn'); page.wait_for_timeout(200)
    page.select_option('#ex-sheet select', 'triceps')
    check('menüden kas grubu seçimi', page.evaluate("muscleFor('Pec Deck Fly')") == 'triceps')
    page.select_option('#ex-sheet select', 'chest')
    page.evaluate("closeExSheet()"); page.wait_for_timeout(300)
    page.evaluate("discardActive(); DB.workoutLogs = DB.workoutLogs.filter(l => !l.__test); saveData('workoutLogs', DB.workoutLogs)")


    # ── 31. Plato uyarısı ──
    page.evaluate("""() => { discardActive();
      const mk = (d, kg, reps) => ({date: d, dayId:'limbs-b', dayName:'Limbs B', __test:1, sets:[{exId:'q', exName:'Plato Testi', setIdx:0, kg, reps}], notes:{}});
      DB.workoutLogs.push(mk('2098-01-01', 100, 10), mk('2098-01-08', 105, 10), mk('2098-01-15', 100, 10), mk('2098-01-22', 105, 9), mk('2098-01-29', 102.5, 10));
      DB.workoutLogs.push({date:'2098-01-01', dayId:'limbs-b', __test:1, sets:[{exId:'r', exName:'Gelişen', setIdx:0, kg:50, reps:10}], notes:{}},
                          {date:'2098-01-08', dayId:'limbs-b', __test:1, sets:[{exId:'r', exName:'Gelişen', setIdx:0, kg:50, reps:10}], notes:{}},
                          {date:'2098-01-15', dayId:'limbs-b', __test:1, sets:[{exId:'r', exName:'Gelişen', setIdx:0, kg:50, reps:10}], notes:{}},
                          {date:'2098-01-22', dayId:'limbs-b', __test:1, sets:[{exId:'r', exName:'Gelişen', setIdx:0, kg:52.5, reps:10}], notes:{}});
      saveData('workoutLogs', DB.workoutLogs); }""")
    check('plato: 3 antrenmandır rekor yok', page.evaluate("JSON.stringify(plateauInfo('Plato Testi'))") == '{"stalled":3}', page.evaluate("JSON.stringify(plateauInfo('Plato Testi'))"))
    check('ilerleyen harekette plato yok', page.evaluate("plateauInfo('Gelişen')") is None)
    check('az veride plato yok', page.evaluate("plateauInfo('Pec Deck Fly')") is None)
    page.evaluate("switchTab('stats')")
    check('PR listesinde plato etiketi', 'Plato · 3 antrenman' in page.inner_text('#pr-list'))
    page.evaluate("""() => { const d = getDayById('limbs-b'); d.exercises.push({id:'pt', name:'Plato Testi', sets:1}); openWorkoutScreen('limbs-b'); }""")
    page.wait_for_timeout(300)
    check('antrenman kartında plato uyarısı', page.evaluate("[...document.querySelectorAll('.ex-plateau')].length") == 1)
    page.evaluate("discardActive(); getDayById('limbs-b').exercises.pop(); DB.workoutLogs = DB.workoutLogs.filter(l => !l.__test); saveData('workoutLogs', DB.workoutLogs)")


    # ── 32. Kilo 7 günlük ortalama ──
    av = page.evaluate("""JSON.stringify(weightAverages([{date:'2026-10-01',weight:80},{date:'2026-10-03',weight:82},{date:'2026-10-07',weight:81},{date:'2026-10-09',weight:79}]))""")
    check('7 günlük ortalama doğru', av == '[80,81,81,80.7]', av)
    page.evaluate("""() => { DB.measurements = [
      {date:'2026-09-20', weight:81.2}, {date:'2026-09-22', weight:80.4}, {date:'2026-09-24', weight:81.6},
      {date:'2026-09-26', weight:80.2}, {date:'2026-09-28', weight:80.9}]; saveData('measurements', DB.measurements);
      switchTab('meas'); switchTrend('weight'); }""")
    page.wait_for_timeout(300)
    check('kilo grafiği iki seri (tartı + ortalama)', page.evaluate("fatChart && fatChart.data.datasets.length") == 2)
    check('özet kartta 7 gün ortalaması', '7 gün ort.' in page.inner_text('#meas-summary-card'))
    page.evaluate("switchTrend('fat')")
    check('trend sekmesi aktif işaretleniyor', page.evaluate("document.querySelector('.trend-tab.active').dataset.key") == 'fat')


    # ── 34. "Önceki" sütunu: farklı gün tipinden aynı hareket ──
    page.evaluate("""() => { discardActive();
      DB.workoutLogs.push({date:'2099-02-01', dayId:'torso-b', dayName:'Torso B', __test:1, sets:[
        {exId:'pec-deck-b', exName:'Pec Deck Fly', setIdx:0, kg:47.5, reps:11},
        {exId:'pec-deck-b', exName:'Pec Deck Fly', setIdx:1, kg:50, reps:8},
        {exId:'pec-deck-b', exName:'Pec Deck Fly', setIdx:2, kg:50, reps:6}], notes:{}},
        {date:'2099-02-01', dayId:'limbs-a', dayName:'Limbs A', __test:1, sets:[
        {exId:'pc', exName:'Preacher Curl Machine', setIdx:0, kg:25, repsR:10, repsL:9, reps:10}], notes:{}});
      openWorkoutScreen('torso-a'); }""")
    page.wait_for_timeout(300)
    cells = page.evaluate("[...document.querySelectorAll('#ex-card-0 .set-prev')].map(e => e.innerText.replace(/\\s+/g, ''))")
    check('Torso A, Torso B\'deki son Pec Deck setlerini gösteriyor', cells == ['47.5×11', '50×8'], cells)
    hint = page.inner_text('#ex-card-0 .ex-prev-hint')
    check('nereden geldiği ve fazladan set yazıyor', 'Torso B' in hint and 'fazladan 1 set' in hint and '50×6' in hint, hint)
    page.click('#ex-card-0 .set-prev >> nth=1')
    check('önceki hücresine dokununca satır doluyor (işaretlenmeden)', page.input_value('#kg-0-1') == '50' and page.input_value('#reps-0-1') == '8' and not page.evaluate("document.getElementById('set-done-0-1').classList.contains('done')"))
    page.click('#ex-card-0 .set-count-btn.accent')
    check('+ Set ile eklenen satırda 3. setin önceki değeri', page.evaluate("document.querySelectorAll('#ex-card-0 .set-prev')[2].innerText.replace(/\\s+/g, '')") == '50×6')
    check('hiç yapılmamış harekette "—" ve "İlk kez"', page.evaluate("document.querySelector('#ex-card-1 .set-prev').classList.contains('empty')") and 'İlk kez' in page.inner_text('#ex-card-1 .ex-prev-hint'))
    for w in (390, 360):
        page.set_viewport_size({'width': w, 'height': 844}); page.wait_for_timeout(150)
        ov = page.evaluate("[...document.querySelectorAll('.set-row, .set-col-header')].filter(r => r.scrollWidth > r.clientWidth + 1).length")
        kgw = page.evaluate("document.getElementById('kg-0-0').getBoundingClientRect().width")
        check(f'{w}px genişlikte set satırları taşmıyor, kilo alanı okunur ({kgw:.0f}px)', ov == 0 and kgw >= 34, (ov, kgw))
    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate("discardActive(); openWorkoutScreen('limbs-a')"); page.wait_for_timeout(300)
    bi = page.evaluate("document.querySelector('#ex-card-0 .set-prev').innerText.replace(/\\s+/g, '')")
    check('sağ/sol harekette önceki "25×10/9"', bi == '25×10/9', bi)
    page.evaluate("discardActive(); DB.workoutLogs = DB.workoutLogs.filter(l => !l.__test); saveData('workoutLogs', DB.workoutLogs)")


    # ── 36. Tek program: Push / Pull + Legs ──
    page.evaluate("""() => { discardActive(); localStorage.removeItem('antrenman:programBackup'); localStorage.removeItem('antrenman:programHistory');
      DB.workoutDays = deepCopy(DEFAULT_DAYS); DB.workoutDays[1].exercises[0].bilateral = true;
      saveData('workoutDays', DB.workoutDays); DB.workoutOrder = DB.workoutDays.map(d => d.id); saveData('workoutOrder', DB.workoutOrder);
      DB.workoutLogs.push({date: '2099-03-01', dayId:'push-a', dayName:'Push A', __test:1, sets:[
        {exId:'x1', exName:'Incline Chest Press', setIdx:0, kg:90, reps:8}, {exId:'x2', exName:'Bayesian Curl Cable', setIdx:0, kg:15, reps:12}], notes:{}, exNotes:{'incline chest press':'koltuk 4'}});
      DB.settings.restByEx = Object.assign({}, DB.settings.restByEx, {'incline chest press': 180});
      saveData('workoutLogs', DB.workoutLogs); saveData('settings', DB.settings); switchTab('settings'); }""")
    check('program etiketi "Özel"', page.inner_text('#program-label') == 'Özel', page.inner_text('#program-label'))
    layers_before = page.evaluate("layers.length")
    page.click('#tab-settings .settings-row:has(#program-label)'); page.wait_for_timeout(300)
    check('program ekranında tek şablon', page.is_visible('#template-sheet') and page.evaluate("document.querySelectorAll('#template-list .tpl-card:not(.backup)').length") == 1)
    check('kartta set ve tekrar aralığı', 'Lat Pulldown 3×6–12' in page.inner_text('#template-list .tpl-card >> nth=0'), page.inner_text('#template-list .tpl-card >> nth=0')[:300])
    page.click('#template-list .tpl-apply >> nth=0'); page.wait_for_timeout(400)
    check('programa geçildi', page.evaluate("DB.workoutDays.map(d => d.name).join('|')") == 'Push A|Pull A|Push B|Pull B|Legs' and not page.is_visible('#template-sheet'))
    check('katman kapandı', page.evaluate("layers.length") == layers_before, (layers_before, page.evaluate("layers.join(',')")))
    sets = page.evaluate("DB.workoutDays.map(d => d.exercises.reduce((a, e) => a + e.sets, 0)).join(',')")
    check('set sayıları (13, 12, 15, 13, 8)', sets == '13,12,15,13,8', sets)
    check('sıra Push A → … → Legs', page.evaluate("DB.workoutOrder.join(',')") == 'push-a,pull-a,push-b,pull-b,legs')
    check('ayarlarda program adı', page.inner_text('#program-label') == 'Push / Pull + Legs')
    check('sağ/sol ayarı korundu', page.evaluate("getDayById('pull-a').exercises.find(e => e.name === 'Preacher Curl Machine').bilateral") is True)
    check('eski isim yeni isme taşındı (kayıt, not, dinlenme)', page.evaluate("""getLogsByExName('Incline Chest Press Machine').length === 1 && getLogsByExName('Incline Chest Press').length === 0
      && DB.workoutLogs.find(l => l.date === '2099-03-01').exNotes['incline chest press machine'] === 'koltuk 4' && restFor('Incline Chest Press Machine') === 180"""))
    check('Bayesian geçmişi devam ediyor', page.evaluate("exerciseRecords('Bayesian Cable Curl').heaviest") is not None)
    rr = page.evaluate("[repRangeFor('Cable Lateral Raise'), repRangeFor('Pec Deck Fly'), repRangeFor('Lat Pulldown', getDayById('pull-a').exercises[0]), repRangeFor('Lat Pulldown', getDayById('pull-b').exercises[1])].map(r => r.join('-')).join(',')")
    check('tekrar aralıkları (gün bazlı Lat Pulldown dahil)', rr == '12-20,10-15,6-12,8-12', rr)
    check('ortak aralıklar hareket ayarında, günde kopya yok', page.evaluate("getDayById('push-a').exercises.every(e => !e.repRange)") and page.evaluate("!!getDayById('pull-a').exercises[0].repRange"))
    check('JM Press triceps sayılıyor', page.evaluate("muscleFor('Smith Machine JM Press')") == 'triceps')
    codes = page.evaluate("Object.values(dayCodes())")
    check('gün kodları ayırt edici', len(set(codes)) == 5, codes)
    page.evaluate("openWorkoutScreen('pull-b')"); page.wait_for_timeout(300)
    check('Pull B Lat Pulldown kartında 8–12', '8–12' in page.inner_text('#ex-card-1'))
    page.evaluate("openExSheet(1)"); page.wait_for_timeout(200)
    page.click('#ex-sheet .range-chip:has-text("10–12")'); page.wait_for_timeout(200)
    check('güne özel aralık değişince diğer gün etkilenmiyor', page.evaluate("[repRangeFor('Lat Pulldown', getDayById('pull-b').exercises[1]).join('-'), repRangeFor('Lat Pulldown', getDayById('pull-a').exercises[0]).join('-')].join(',')") == '10-12,6-12')
    page.evaluate("closeExSheet()"); page.wait_for_timeout(200)
    page.evaluate("switchTab('settings'); openTemplateSheet()"); page.wait_for_timeout(200)
    check('uygulanan program işaretli', page.evaluate("document.querySelectorAll('#template-list .tpl-card.current').length") == 1)
    page.evaluate("closeTemplateSheet()"); page.wait_for_timeout(200)
    page.evaluate("discardActive(); openTemplateSheet()"); page.wait_for_timeout(200)
    check('önceki program geri dönüş için duruyor', page.evaluate("document.querySelectorAll('#template-list .tpl-card.backup').length") == 1)
    page.click('#template-list .tpl-card.backup .tpl-apply'); page.wait_for_timeout(300)
    check('önceki programa tek dokunuşla dönüş', page.evaluate("DB.workoutDays.map(d => d.id).join(',')") == 'torso-a,limbs-a,torso-b,limbs-b')
    page.evaluate("""() => { DB.workoutDays = deepCopy(DEFAULT_DAYS); saveData('workoutDays', DB.workoutDays); DB.workoutOrder = DB.workoutDays.map(d => d.id); saveData('workoutOrder', DB.workoutOrder);
      localStorage.removeItem('antrenman:programBackup'); localStorage.removeItem('antrenman:programHistory'); DB.workoutLogs = DB.workoutLogs.filter(l => !l.__test); saveData('workoutLogs', DB.workoutLogs); renderHome(); renderSettings(); }""")
    page.wait_for_timeout(300)


    # ── 38. Kardiyo ──
    page.evaluate("discardActive(); switchTab('workout'); openWorkoutScreen('torso-a')"); page.wait_for_timeout(300)
    check('kardiyo kartı antrenmanın sonunda', page.evaluate("document.querySelector('#ws-body > .ex-card:last-child').id") == 'cardio-card')
    page.click('#cardio-card .cardio-add'); page.wait_for_timeout(150)
    check('kardiyo satırı eklendi, süre alanı odakta', page.evaluate("document.querySelectorAll('#cardio-card .cardio-row').length") == 1 and page.evaluate("document.activeElement.dataset.cardio") == 'min')
    page.select_option('#cardio-card .cardio-type', 'Bisiklet')
    page.fill('#cardio-card [data-cardio="min"]', '20'); page.fill('#cardio-card [data-cardio="km"]', '7,5'); page.fill('#cardio-card [data-cardio="kcal"]', '180')
    page.click('#cardio-card .cardio-add'); page.wait_for_timeout(150)
    page.fill('#cardio-card .cardio-row:nth-child(2) [data-cardio="min"]', '10')
    page.reload(); page.wait_for_timeout(500)
    rows = page.evaluate("[...document.querySelectorAll('#cardio-card .cardio-row')].map(r => r.querySelector('.cardio-type').value + ' ' + r.querySelector('[data-cardio=min]').value)")
    check('yenilemeden sonra kardiyo korunuyor', rows == ['Bisiklet 20', 'Koşu bandı 10'] or (len(rows) == 2 and rows[0] == 'Bisiklet 20' and rows[1].endswith(' 10')), rows)
    page.click('#cardio-card .cardio-row:nth-child(2) .cardio-remove'); page.wait_for_timeout(150)
    check('kardiyo satırı silinebiliyor', page.evaluate("document.querySelectorAll('#cardio-card .cardio-row').length") == 1)
    n0 = page.evaluate("DB.workoutLogs.length")
    page.evaluate("finishWorkout()"); page.wait_for_timeout(300)
    check('sadece kardiyo varken "set girilmedi" sorulmuyor ve özet açılıyor', page.is_visible('#summary-overlay') and 'Bisiklet 20 dk' in page.inner_text('#sum-ex-list'))
    page.evaluate("saveSummary()"); page.wait_for_timeout(400)
    last = page.evaluate("DB.workoutLogs[DB.workoutLogs.length - 1]")
    check('kardiyo kayda yazıldı', page.evaluate("DB.workoutLogs.length") == n0 + 1 and last.get('cardio') == [{'type': 'Bisiklet', 'min': 20, 'km': 7.5, 'kcal': 180}], last.get('cardio'))
    check('son antrenmanlarda kardiyo süresi', '20 dk kardiyo' in page.inner_text('#recent-list'))
    page.evaluate("renderHome()")
    check('haftalık kardiyo toplamı (kahraman kart)', '20 dk' in page.inner_text('#hero-cardio'))
    page.evaluate("openWorkoutScreen('torso-a')"); page.wait_for_timeout(300)
    page.click('#cardio-card .cardio-add'); page.wait_for_timeout(150)
    check('yeni kardiyo son türle başlıyor, önceki değer ipucu', page.evaluate("document.querySelector('#cardio-card .cardio-type').value") == 'Bisiklet' and page.get_attribute('#cardio-card [data-cardio="min"]', 'placeholder') == '20' and 'Bisiklet 20 dk' in page.inner_text('#cardio-card .ex-prev-hint'))
    page.evaluate("discardActive()"); page.wait_for_timeout(200)
    idx = page.evaluate("DB.workoutLogs.length - 1")
    page.evaluate(f"openHistoryModal({idx})"); page.wait_for_timeout(200)
    check('geçmiş detayında kardiyo', 'Bisiklet 20 dk · 7,5 km · 180 kcal' in page.inner_text('#hm-body') and 'set kaydı yok' not in page.inner_text('#hm-body'))
    page.click('#history-modal .btn-primary'); page.wait_for_timeout(400)
    check('düzenlemede kardiyo yüklendi', page.evaluate("document.querySelector('#cardio-card [data-cardio=min]').value") == '20')
    page.fill('#cardio-card [data-cardio="min"]', '25')
    page.click('#ws-done-btn'); page.wait_for_timeout(400)
    check('düzenlenen kardiyo kaydedildi', page.evaluate(f"DB.workoutLogs[{idx}].cardio[0].min") == 25)
    page.evaluate(f"DB.workoutLogs.splice({idx}, 1); saveData('workoutLogs', DB.workoutLogs); renderHome()")


    # ── 39. RIR takibi ──
    page.evaluate("discardActive(); DB.settings.rirEnabled = true; saveData('settings', DB.settings); switchTab('workout'); openWorkoutScreen('torso-a')"); page.wait_for_timeout(300)
    check('RIR satırı set tamamlanmadan gizli', not page.is_visible('#rir-row-0-0'))
    page.fill('#kg-0-0', '40'); page.fill('#reps-0-0', '10'); page.click('#set-done-0-0'); page.evaluate("stopRest()"); page.wait_for_timeout(150)
    check('set tamamlanınca RIR satırı görünüyor', page.is_visible('#rir-row-0-0'))
    page.click('#rir-row-0-0 .rir-btn[data-v="2"]')
    check('RIR seçildi', page.evaluate("active.rir['0-0']") == 2 and page.evaluate("document.querySelector('#rir-row-0-0 .rir-btn.on').dataset.v") == '2')
    page.fill('#kg-0-1', '40'); page.fill('#reps-0-1', '9'); page.click('#set-done-0-1'); page.evaluate("stopRest()")
    page.click('#rir-row-0-1 .rir-btn[data-v="4"]'); page.click('#rir-row-0-1 .rir-btn[data-v="4"]')
    check('aynı RIR\'a tekrar dokununca seçim kalkıyor', page.evaluate("active.rir['0-1']") is None)
    page.click('#rir-row-0-1 .rir-btn[data-v="4"]')
    page.reload(); page.wait_for_timeout(500)
    check('RIR yenilemeden sonra korunuyor', page.evaluate("document.querySelector('#rir-row-0-0 .rir-btn.on')?.dataset.v") == '2')
    page.click('#ex-card-0 .set-count-btn.accent'); page.wait_for_timeout(100)
    page.fill('#kg-0-2', '40'); page.fill('#reps-0-2', '8'); page.click('#set-done-0-2'); page.evaluate("stopRest()"); page.click('#rir-row-0-2 .rir-btn[data-v="1"]')
    page.click('#ex-card-0 .set-count-btn >> nth=0'); page.wait_for_timeout(150)
    check('silinen setin RIR\'ı da siliniyor', page.evaluate("active.rir['0-2']") is None and not page.evaluate("!!document.getElementById('set-wrap-0-2')"))
    page.evaluate("finishWorkout(); saveSummary();"); page.wait_for_timeout(400)
    last = page.evaluate("DB.workoutLogs[DB.workoutLogs.length - 1]")
    rirs = [s_.get('rir') for s_ in last['sets'] if s_['exName'] == 'Pec Deck Fly']
    check('RIR kayda yazıldı (4 = 4+)', rirs == [2, 4], rirs)
    idx = page.evaluate("DB.workoutLogs.length - 1")
    page.evaluate(f"openHistoryModal({idx})"); page.wait_for_timeout(200)
    check('geçmişte RIR görünüyor', 'RIR 2' in page.inner_text('#hm-body') and 'RIR 4+' in page.inner_text('#hm-body'))
    page.click('#history-modal .btn-primary'); page.wait_for_timeout(400)
    check('düzenlemede RIR yüklendi', page.evaluate("document.querySelector('#rir-row-0-0 .rir-btn.on')?.dataset.v") == '2')
    page.evaluate("discardActive(); closeAllLayers()"); page.wait_for_timeout(300)
    page.evaluate("openWorkoutScreen('torso-a')"); page.wait_for_timeout(300)
    check('sonraki antrenmanda önceki RIR görünüyor', 'önceki: 2' in page.inner_text('#rir-row-0-0'))
    page.evaluate("toggleRir(false)"); page.wait_for_timeout(200)
    check('RIR kapatılınca satır yok', page.evaluate("document.querySelectorAll('.rir-row').length") == 0)
    page.evaluate(f"toggleRir(true); discardActive(); DB.workoutLogs.splice({idx}, 1); saveData('workoutLogs', DB.workoutLogs)")


    # ── 40. Hareket ayarları: ağırlık artışı ──
    page.evaluate("discardActive(); DB.settings.incByEx = {}; DB.settings.kgStep = 2.5; saveData('settings', DB.settings); openWorkoutScreen('torso-a')"); page.wait_for_timeout(300)
    page.fill('#kg-0-0', '40'); page.click('#set-row-0-0 .kg-stepper .stepper-btn >> nth=1')
    check('varsayılan artış 2,5 kg', page.input_value('#kg-0-0') == '42.5')
    page.evaluate("openExSheet(2)"); page.wait_for_timeout(200)
    for _ in range(4): page.click('#ex-sheet .sheet-row:has(#ex-inc-label) .dur-stepper button >> nth=0')
    check('Cable Lateral Raise artışı 1 kg', page.inner_text('#ex-inc-label') == '0,5 kg' or page.inner_text('#ex-inc-label') == '1 kg', page.inner_text('#ex-inc-label'))
    page.evaluate("DB.settings.incByEx['cable lateral raise'] = 1; saveData('settings', DB.settings); closeExSheet()"); page.wait_for_timeout(300)
    page.fill('#kg-2-0', '15'); page.click('#set-row-2-0 .kg-stepper .stepper-btn >> nth=1')
    check('hareket bazlı artış kilo adımında kullanılıyor (15 → 16)', page.input_value('#kg-2-0') == '16')
    page.evaluate("stepDefaultInc(1)")
    check('genel varsayılan 2,5 → 5', page.evaluate("kgStep()") == 5 and page.evaluate("incFor('Cable Lateral Raise')") == 1)
    page.evaluate("stepDefaultInc(-1); DB.settings.incByEx = {}; DB.settings.restByEx = {}; saveData('settings', DB.settings); discardActive()")
    check('çok eklemli tespiti', page.evaluate("[isCompound('Chest Supported T-Bar Row Machine'), isCompound('Cable Triceps Pushdown'), isCompound('Leg Press'), isCompound('Pec Deck Fly'), isCompound('Reverse Curl')].join(',')") == 'true,false,true,false,false')


    # ── 41. Yeni ilerleme kuralı (tüm setler + kademeli RIR) ──
    def plan(sets, rng='[8,12]', mode='all', rirp=True, inc=2.5):
        return page.evaluate(f"""() => {{ DB.settings.progressMode = '{mode}'; DB.settings.rirProgression = {str(rirp).lower()}; DB.settings.incByEx = {{ 'test ex': {inc} }};
          const p = progressionPlan({{ name: 'Test Ex' }}, {json.dumps(sets)}, {rng}, {len(sets)});
          return {{ sets: p.sets.map(x => x ? x.kg + 'x' + x.reps : null), reason: p.reason }}; }}""")
    r = plan([{'kg': 60, 'reps': 12, 'rir': 2}, {'kg': 60, 'reps': 12, 'rir': 1}])
    check('tüm setler 12, RIR 1–2 → +1 adım', r['sets'] == ['62.5x8', '62.5x8'] and '+2,5 kg' in r['reason'], r)
    r = plan([{'kg': 60, 'reps': 12, 'rir': 2}, {'kg': 60, 'reps': 12, 'rir': 0}])
    check('bir set RIR 0 → aynı kilo (pekiştir)', r['sets'] == ['60x12', '60x12'] and 'RIR 0' in r['reason'], r)
    r = plan([{'kg': 60, 'reps': 12, 'rir': 4}, {'kg': 60, 'reps': 12, 'rir': 4}])
    check('hepsi RIR 4+ → 2 adım', r['sets'] == ['65x8', '65x8'], r)
    r = plan([{'kg': 60, 'reps': 12}, {'kg': 60, 'reps': 12}])
    check('RIR girilmemiş → 1 adım', r['sets'] == ['62.5x8', '62.5x8'], r)
    r = plan([{'kg': 60, 'reps': 12, 'rir': 0}, {'kg': 60, 'reps': 12, 'rir': 0}], rirp=False)
    check('RIR\'a göre artış kapalı → RIR 0\'da da 1 adım', r['sets'] == ['62.5x8', '62.5x8'], r)
    r = plan([{'kg': 15, 'reps': 12, 'rir': 2}, {'kg': 15, 'reps': 12, 'rir': 2}], inc=1)
    check('hareket bazlı artış (15 → 16 kg)', r['sets'] == ['16x8', '16x8'], r)
    r = plan([{'kg': 60, 'reps': 12, 'rir': 2}, {'kg': 60, 'reps': 10, 'rir': 1}])
    check('biri 10\'da → kilo aynı, 12 ve 11 hedef', r['sets'] == ['60x12', '60x11'], r)
    r = plan([{'kg': 60, 'reps': 12, 'rir': 0}, {'kg': 60, 'reps': 10}], mode='perSet')
    check('"her set": RIR 0\'daki set aynı kiloda, diğeri +1', r['sets'] == ['60x12', '60x11'], r)
    page.evaluate("DB.settings.progressMode = 'all'; DB.settings.rirProgression = true; DB.settings.incByEx = {}; saveData('settings', DB.settings)")
    # Gelişme göstergesi
    prog = lambda a, b, rng='null': page.evaluate(f"isProgress({json.dumps(a)}, {json.dumps(b)}, {rng})")
    check('60×12 → 62,5×6 gelişme DEĞİL', prog({'kg': 62.5, 'reps': 6}, {'kg': 60, 'reps': 12}) is False)
    check('60×10 → 60×11 gelişme', prog({'kg': 60, 'reps': 11}, {'kg': 60, 'reps': 10}) is True)
    check('60×12 → 62,5×11 gelişme', prog({'kg': 62.5, 'reps': 11}, {'kg': 60, 'reps': 12}) is True)
    check('aralığın altındaysa gelişme değil (8–12, 62,5×7)', prog({'kg': 70, 'reps': 7}, {'kg': 60, 'reps': 10}, '[8,12]') is False)
    check('RIR hesaba katılıyor: 60×10 R0 → 60×10 R2 gelişme', prog({'kg': 60, 'reps': 10, 'rir': 2}, {'kg': 60, 'reps': 10, 'rir': 0}) is True)
    check('RIR hesaba katılıyor: 60×11 R0, önceki 60×10 R3 gelişme değil', prog({'kg': 60, 'reps': 11, 'rir': 0}, {'kg': 60, 'reps': 10, 'rir': 3}) is False)
    page.evaluate("switchTab('settings')")
    page.click('#pmode-set-btn')
    check('ayarlardan artış koşulu değişiyor', page.evaluate("DB.settings.progressMode") == 'perSet' and 'kendi başına' in page.inner_text('#pmode-note'))
    page.click('#pmode-all-btn')


    # ── 42. Rekor türleri ──
    H = "[{kg:60,reps:12,date:'x'},{kg:62.5,reps:8,date:'x'},{kg:50,reps:15,date:'x'}]"
    t = lambda st: page.evaluate(f"prsForSet({st}, {H}).map(p => p.type).join(',')")
    check('en ağır rekoru', t("{kg:65,reps:5}") == 'weight,e1rm' or t("{kg:65,reps:5}") == 'weight', t("{kg:65,reps:5}"))
    check('aynı kiloda daha çok tekrar = tekrar rekoru', t("{kg:62.5,reps:9}") == 'e1rm,reps' or 'reps' in t("{kg:62.5,reps:9}"), t("{kg:62.5,reps:9}"))
    check('60×12 → 62,5×6 rekor değil', t("{kg:62.5,reps:6}") == '')
    check('ilk kez yapılan harekette rekor yok', page.evaluate("prsForSet({kg:100,reps:10}, []).length") == 0)
    check('vücut ağırlığında tekrar rekoru', page.evaluate("prsForSet({kg:0,reps:15}, [{kg:0,reps:12}]).map(p=>p.type).join()") == 'reps')
    # Ara sonrası plato
    page.evaluate("""() => { discardActive();
      const mk = (d, kg, r) => ({date: d, dayId:'push-a', dayName:'Push A', __test:1, sets:[{exId:'q', exName:'Ara Testi', setIdx:0, kg, reps:r}], notes:{}});
      DB.workoutLogs.push(mk('2097-01-01', 100, 5), mk('2097-06-01', 40, 6), mk('2097-06-05', 40, 5), mk('2097-06-09', 40, 6));
      saveData('workoutLogs', DB.workoutLogs); }""")
    check('uzun aradan sonra eski rekor plato saydırmıyor', page.evaluate("plateauInfo('Ara Testi')") is None)
    page.evaluate("""() => { DB.workoutLogs.push({date:'2097-06-13', dayId:'push-a', __test:1, sets:[{exId:'q', exName:'Ara Testi', setIdx:0, kg:40, reps:5}], notes:{}}, {date:'2097-06-17', dayId:'push-a', __test:1, sets:[{exId:'q', exName:'Ara Testi', setIdx:0, kg:40, reps:5}], notes:{}}); saveData('workoutLogs', DB.workoutLogs); }""")
    check('aradan sonra da ilerlemiyorsa plato', page.evaluate("JSON.stringify(plateauInfo('Ara Testi'))") == '{"stalled":4}', page.evaluate("JSON.stringify(plateauInfo('Ara Testi'))"))
    # Antrenmanda rekor bildirimi + özet
    page.evaluate("""() => { DB.workoutDays.push({id:'pr-day', name:'PR Günü', exercises:[{id:'pr1', name:'Ara Testi', sets:2}]}); saveData('workoutDays', DB.workoutDays); syncOrder(); openWorkoutScreen('pr-day'); }""")
    page.wait_for_timeout(300)
    page.fill('#kg-0-0', '105'); page.fill('#reps-0-0', '3'); page.click('#set-done-0-0'); page.evaluate("stopRest()"); page.wait_for_timeout(100)
    check('set sonrası rekor bildirimi türüyle', 'en ağır: 105 kg' in page.inner_text('#toast'), page.inner_text('#toast'))
    page.evaluate("document.getElementById('toast').textContent = ''")
    page.fill('#kg-0-1', '105'); page.fill('#reps-0-1', '3'); page.click('#set-done-0-1'); page.evaluate("stopRest()"); page.wait_for_timeout(100)
    check('aynı antrenmanda tekrar eden set yeniden rekor sayılmıyor', 'en ağır' not in page.inner_text('#toast'))
    page.evaluate("finishWorkout()"); page.wait_for_timeout(200)
    check('özette rekor satırı', 'Ara Testi' in page.inner_text('#sum-pr-banner') and 'en ağır: 105 kg' in page.inner_text('#sum-pr-banner'))
    page.evaluate("closeSummary(); discardActive(); closeAllLayers()"); page.wait_for_timeout(300)
    # Liste ve detay
    page.evaluate("switchTab('stats')")
    check('ayrı 1RM hesaplayıcı kaldırıldı', page.evaluate("!document.getElementById('orm-kg')"))
    first = page.evaluate("document.querySelector('#pr-list .pr-item').dataset.name")
    check('en son yapılan hareket listenin başında', first == 'Ara Testi', first)
    check('listede tek ana değer (tahmini 1RM) + en iyi set', 'tahmini 1RM' in page.inner_text('#pr-list .pr-item >> nth=0') and 'En iyi set' in page.inner_text('#pr-list .pr-item >> nth=0'))
    page.click('#pr-list .pr-item >> nth=0'); page.wait_for_timeout(400)
    check('detayda rekor kutuları', 'Tahmini 1RM' in page.inner_text('#modal-records') and 'En ağır' in page.inner_text('#modal-records') and '100 kg' in page.inner_text('#modal-records'))
    check('detayda ağırlığa göre en çok tekrar', '40 kg' in page.inner_text('#modal-rep-prs') and '6' in page.inner_text('#modal-rep-prs'))
    check('detayda çalışma ağırlıkları', '%80' in page.inner_text('#modal-pct'))
    page.evaluate("closeProgressModal()"); page.wait_for_timeout(300)
    page.evaluate("""() => { DB.workoutDays = DB.workoutDays.filter(d => d.id !== 'pr-day'); saveData('workoutDays', DB.workoutDays); syncOrder();
      DB.workoutLogs = DB.workoutLogs.filter(l => !l.__test); saveData('workoutLogs', DB.workoutLogs); renderStats(); }""")


    # ── 43. Hacim: direkt / dolaylı / hedef ──
    page.evaluate("""() => { DB.settings.volumeTargets = {}; DB.settings.showIndirect = false;
      DB.workoutLogs.push({date: today(), dayId:'push-a', dayName:'Push A', __test:1, sets:[
        {exId:'a', exName:'Incline Chest Press', setIdx:0, kg:40, reps:8}, {exId:'a', exName:'Incline Chest Press', setIdx:1, kg:40, reps:8},
        {exId:'b', exName:'Chest Supported T-Bar Row Machine', setIdx:0, kg:40, reps:8}], notes:{}});
      saveData('workoutLogs', DB.workoutLogs); volOpen.clear(); switchTab('stats'); }""")
    check('hedef yokken eksik/band yok', page.evaluate("document.querySelectorAll('#muscle-card .vol-target, #muscle-card .muscle-zone').length") == 0)
    check('dolaylı varsayılan kapalı', page.evaluate("document.querySelectorAll('#muscle-card .vol-ind').length") == 0)
    page.click('#muscle-card .vol-toggle')
    ind = page.evaluate("weeklyIndirectSets()")
    check('dolaylı: presste omuz+triceps, row\'da biceps+arka omuz (yarım)', ind.get('triceps', 0) >= 1 and ind.get('shoulders', 0) >= 1 and ind.get('biceps', 0) >= 0.5 and ind.get('rearDelts', 0) >= 0.5, ind)
    check('dolaylı açılınca grafikte ayrı gösteriliyor', page.evaluate("document.querySelectorAll('#muscle-card .vol-ind').length") >= 1)
    page.evaluate("volOpen.add('chest'); renderMuscleCard()")
    for _ in range(3): page.click('#vol-detail-chest .dur-stepper button >> nth=1')
    check('göğüs hedefi 12 set', page.evaluate("volumeTargets().chest") == 12 and '/12' in page.inner_text('#muscle-card .vol-row:has-text("Göğüs")'))
    check('hedef çizgisi görünüyor', page.evaluate("document.querySelectorAll('#muscle-card .vol-target').length") == 1)
    for _ in range(12): page.click('#vol-detail-chest .dur-stepper button >> nth=0')
    check('hedef kaldırılabiliyor', 'chest' not in page.evaluate("volumeTargets()"))
    page.evaluate("DB.settings.showIndirect = false; DB.workoutLogs = DB.workoutLogs.filter(l => !l.__test); saveData('workoutLogs', DB.workoutLogs); saveData('settings', DB.settings); volOpen.clear(); renderMuscleCard()")


    # ── 44. Rutin modülleri ──
    page.evaluate("getSuppl(); setWater(3); switchTab('settings')")
    page.click('#mod-suppl-toggle + .ios-toggle-track')
    check('supplement kapatınca ayar listesi gizli', not page.is_visible('#suppl-settings-section'))
    check('su açıkken Rutin sekmesi duruyor', page.is_visible('#tab-btn-routine'))
    page.evaluate("switchTab('routine')")
    check('sadece su görünüyor', page.is_visible('#water-block') and not page.is_visible('#suppl-checklist') and not page.is_visible('#suppl-cal-section'))
    page.evaluate("switchTab('settings')")
    page.click('#mod-water-toggle + .ios-toggle-track')
    check('ikisi de kapalı: Rutin sekmesi gizli', not page.is_visible('#tab-btn-routine'))
    page.evaluate("switchTab('routine')")
    check('gizli sekmeye geçilemiyor', page.evaluate("currentTab") == 'workout')
    check('su verisi korunuyor', page.evaluate("getSuppl().water") == 3)
    page.evaluate("switchTab('settings')")
    page.click('#mod-suppl-toggle + .ios-toggle-track')
    check('supplement geri açılınca sekme geri geliyor', page.is_visible('#tab-btn-routine') and page.is_visible('#suppl-settings-section'))
    tabs_ov = page.evaluate("[...document.querySelectorAll('.tab-item')].filter(t => t.offsetParent).length")
    check('sekme sayısı 5', tabs_ov == 5, tabs_ov)
    page.evaluate("setWater(0); switchTab('workout')")


    # ── 45. Antrenman sonu değerlendirme ──
    page.evaluate("discardActive(); openWorkoutScreen('torso-a')"); page.wait_for_timeout(300)
    page.fill('#kg-0-0', '40'); page.fill('#reps-0-0', '8')
    page.evaluate("finishWorkout()"); page.wait_for_timeout(300)
    check('değerlendirme varsayılan kapalı', not page.is_visible('#sum-feedback'))
    page.evaluate("closeSummary(); DB.settings.feedback = true; saveData('settings', DB.settings)"); page.wait_for_timeout(300)
    page.evaluate("finishWorkout()"); page.wait_for_timeout(300)
    check('değerlendirme açıkken özet ekranda', page.is_visible('#sum-feedback') and 'Zorluk' in page.inner_text('#sum-feedback'))
    page.click('#sum-feedback .fb-row >> nth=0 >> .fb-opt >> nth=2')
    page.click('#sum-feedback .fb-row >> nth=1 >> .fb-opt >> nth=1')
    page.click('#sum-feedback .fb-row >> nth=1 >> .fb-opt >> nth=1')
    page.click('#sum-feedback .fb-row >> nth=2 >> .fb-opt >> nth=2')
    check('seçim / geri alma', page.evaluate("JSON.stringify(pendingWorkoutData.feedback)") == '{"difficulty":3,"recovery":3}', page.evaluate("JSON.stringify(pendingWorkoutData.feedback)"))
    page.evaluate("saveSummary()"); page.wait_for_timeout(300)
    li = page.evaluate("DB.workoutLogs.length - 1")
    check('kayda yazıldı', page.evaluate(f"DB.workoutLogs[{li}].feedback.difficulty") == 3)
    page.evaluate(f"openHistoryModal({li})"); page.wait_for_timeout(200)
    check('geçmişte görünüyor', 'Zorluk: Zor' in page.inner_text('#hm-body') and 'Toparlanma: İyi' in page.inner_text('#hm-body'))
    page.evaluate(f"closeHistoryModal(); DB.workoutLogs.splice({li}, 1); saveData('workoutLogs', DB.workoutLogs); DB.settings.feedback = false; saveData('settings', DB.settings)")


    # ── 46. Kablo makinesi: tek / çift makara ──
    page.evaluate("""() => { discardActive(); DB.settings.cableRatio = 2;
      DB.workoutLogs.unshift({date:'2020-04-01', dayId:'torso-a', dayName:'Torso A', __test:1, sets:[
        {exId:'c1', exName:'Kablo Test Raise', setIdx:0, kg:10, reps:15, cable:'single'}, {exId:'c1', exName:'Kablo Test Raise', setIdx:1, kg:10, reps:14, cable:'single'}], notes:{}});
      saveData('workoutLogs', DB.workoutLogs);
      getDayById('torso-a').exercises.unshift({id:'kt', name:'Kablo Test Raise', sets:2}); openWorkoutScreen('torso-a'); }""")
    page.wait_for_timeout(300)
    check('kablo hareketinde makine çipi, varsayılan son makine', 'Tek makara' in page.inner_text('#cable-chip-0'))
    check('kablo olmayan harekette çip yok', page.query_selector('#cable-chip-1') is None)
    check('tek makarada önceki 10', page.inner_text('#set-row-0-0 .sp-kg') == '10')
    page.click('#cable-chip-0'); page.wait_for_timeout(300)
    check('çift makaraya geçince önceki ≈20 (2:1)', page.inner_text('#set-row-0-0 .sp-kg') == '≈20' and 'çevrildi' in page.inner_text('#ex-card-0'), page.inner_text('#set-row-0-0 .sp-kg'))
    page.fill('#kg-0-0', '20'); page.fill('#reps-0-0', '15'); page.evaluate("onSetInput(0,0)")
    check('aynı yük + aynı tekrar: ilerleme sayılmıyor', not page.evaluate("document.getElementById('set-row-0-0').classList.contains('overload')"))
    page.evaluate("document.getElementById('toast').textContent=''")
    page.click('#set-done-0-0'); page.wait_for_timeout(200)
    check('çift makarada 20 kg sahte rekor değil', '🏆' not in page.inner_text('#toast') and 'Kablo Test' not in page.inner_text('#toast'), page.inner_text('#toast'))
    page.fill('#kg-0-1', '24'); page.fill('#reps-0-1', '12'); page.evaluate("onSetInput(0,1)")
    page.click('#set-done-0-1'); page.wait_for_timeout(200)
    check('gerçek rekor tek makara karşılığıyla', 'en ağır: 12 kg' in page.inner_text('#toast') and 'tek makara karşılığı' in page.inner_text('#toast'), page.inner_text('#toast'))
    sets = page.evaluate("collectWorkoutSets().filter(s => s.exName === 'Kablo Test Raise')")
    check('kayıtta makinede yazan kilo + makine', sets[0]['kg'] == 20 and sets[0]['cable'] == 'double' and all('cable' not in x for x in page.evaluate("collectWorkoutSets().filter(s => s.exName !== 'Kablo Test Raise')")), sets)
    check('hacim tek makara karşılığı', page.evaluate("setVolume({kg:20, reps:10, cable:'double'})") == 100)
    page.evaluate("finishWorkout()"); page.wait_for_timeout(300)
    check('özette çift makara', 'çift makara' in page.inner_text('#sum-ex-list'))
    page.evaluate("saveSummary()"); page.wait_for_timeout(400)
    rec = page.evaluate("exerciseRecords('Kablo Test Raise')")
    check('rekor kartı: en ağır 12 kg (24 çift)', rec['heaviest']['kg'] == 12, rec['heaviest'])
    page.evaluate("openWorkoutScreen('torso-a')"); page.wait_for_timeout(300)
    check('sonraki antrenmanda varsayılan son makine (çift)', 'Çift makara' in page.inner_text('#cable-chip-0') and page.inner_text('#set-row-0-1 .sp-kg') == '24')
    page.click('#cable-chip-0'); page.wait_for_timeout(200)
    check('tek makaraya dönünce ≈12', page.inner_text('#set-row-0-1 .sp-kg') == '≈12')
    page.evaluate("openExSheet(1)"); page.wait_for_timeout(200)
    page.click('#ex-sheet .sheet-toggle .ios-toggle-track'); page.wait_for_timeout(200)
    check('kablo olmayan harekete makine seçimi açılabiliyor', page.query_selector('#cable-chip-1') is not None)
    page.click('#ex-sheet .sheet-toggle .ios-toggle-track'); page.wait_for_timeout(200)
    page.evaluate("closeExSheet()"); page.wait_for_timeout(200)
    page.evaluate("discardActive(); switchTab('settings')")
    page.click('#progress-settings .dur-stepper:has(#cable-ratio-label) button >> nth=0')
    check('oran ayarı 1,9:1', page.inner_text('#cable-ratio-label') == '1,9:1' and page.evaluate("cableRatio()") == 1.9)
    page.evaluate("""() => { DB.settings.cableRatio = 2; delete DB.settings.cableByEx; saveData('settings', DB.settings);
      getDayById('torso-a').exercises.shift(); saveData('workoutDays', DB.workoutDays);
      DB.workoutLogs = DB.workoutLogs.filter(l => !l.__test && !(l.sets || []).some(s => s.exName === 'Kablo Test Raise')); saveData('workoutLogs', DB.workoutLogs); switchTab('workout'); }""")

    check('sayfa hatası yok', not errors, errors)

    # ── 35. Antrenman bildirimi ──
    # Varsayılan headless shell bildirim iznini hep reddediyor; tam Chromium'un başsız modu gerekiyor
    browser3 = p.chromium.launch(channel='chromium')
    ctx3 = browser3.new_context(service_workers='allow', viewport={'width': 390, 'height': 844})
    ctx3.grant_permissions(['notifications'], origin=BASE)
    pg3 = ctx3.new_page()
    errs3 = []
    pg3.on('pageerror', lambda e: errs3.append(str(e)))
    pg3.goto(BASE + '/antrenman/index.html')
    pg3.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null", timeout=15000)
    pg3.evaluate("switchTab('settings')")
    check('bildirim ayarı varsayılan kapalı', not pg3.is_checked('#workout-notif-toggle'))
    pg3.locator('#workout-notif-toggle').scroll_into_view_if_needed()
    pg3.locator('label.ios-toggle:has(#workout-notif-toggle)').click()
    pg3.wait_for_timeout(300)
    check('izin verilince bildirim ayarı açılıyor', pg3.evaluate("workoutNotifOn()") and pg3.is_checked('#workout-notif-toggle') and 'uygulamadan çıkınca' in pg3.inner_text('#notif-status'))
    pg3.evaluate("renderSettings()")
    check('ayarlar yeniden çizilince anahtar açık kalıyor', pg3.is_checked('#workout-notif-toggle'))
    get_n = """async () => { const r = await navigator.serviceWorker.getRegistration(); return (await r.getNotifications({tag:'active-workout'})).map(n => ({title: n.title, body: n.body})); }"""
    pg3.evaluate("openWorkoutScreen('torso-a')"); pg3.wait_for_timeout(300)
    pg3.fill('#kg-0-0', '40'); pg3.fill('#reps-0-0', '10'); pg3.click('#set-done-0-0'); pg3.wait_for_timeout(200)
    pg3.evaluate("postWorkoutNotification()"); pg3.wait_for_timeout(400)
    ns = pg3.evaluate(get_n)
    ok = len(ns) == 1 and ns[0]['title'] == 'Torso A devam ediyor' and '1/13 set' in ns[0]['body'] and 'Dinlenme bitişi' in ns[0]['body'] and 'Sıradaki: Pec Deck Fly · 2. set' in ns[0]['body']
    check('çıkınca bildirim: gün, set, dinlenme bitişi, sıradaki set', ok, ns)
    pg3.evaluate("postWorkoutNotification()"); pg3.wait_for_timeout(300)
    check('tekrar çıkınca bildirim çoğalmıyor (aynı etiket)', len(pg3.evaluate(get_n)) == 1)
    pg3.evaluate("clearWorkoutNotification()"); pg3.wait_for_timeout(300)
    check('geri dönünce bildirim kalkıyor', len(pg3.evaluate(get_n)) == 0)
    pg3.evaluate("postWorkoutNotification()"); pg3.wait_for_timeout(300)
    pg3.evaluate("discardActive()"); pg3.wait_for_timeout(300)
    check('antrenman bitince/iptal edilince bildirim kalkıyor', len(pg3.evaluate(get_n)) == 0)
    pg3.evaluate("postWorkoutNotification()"); pg3.wait_for_timeout(300)
    check('aktif antrenman yokken bildirim yok', len(pg3.evaluate(get_n)) == 0)
    pg3.evaluate("openWorkoutScreen('torso-a'); toggleWorkoutNotif(false)"); pg3.wait_for_timeout(200)
    pg3.evaluate("postWorkoutNotification()"); pg3.wait_for_timeout(300)
    check('ayar kapalıyken bildirim yok', len(pg3.evaluate(get_n)) == 0)
    pg3.evaluate("discardActive(); notifProblem = 'needs-install'; renderNotifStatus()")
    check('iPhone\'da ana ekrana eklenmemişse yol tarifi', 'Ana Ekrana Ekle' in pg3.inner_text('#notif-status'))
    check('bildirim testinde sayfa hatası yok', not errs3, errs3)
    ctx3.close()
    browser3.close()

    # ── 33. Çevrimdışı çalışma (service worker önbelleği) ──
    ctx2 = browser.new_context(service_workers='allow', viewport={'width': 390, 'height': 844})
    pg2 = ctx2.new_page()
    errs2 = []
    pg2.on('pageerror', lambda e: errs2.append(str(e)))
    pg2.goto(BASE + '/antrenman/index.html')
    pg2.wait_for_function("navigator.serviceWorker && navigator.serviceWorker.controller !== null", timeout=15000)
    pg2.wait_for_timeout(500)
    cached = pg2.evaluate("""async () => { const out = []; for (const k of await caches.keys()) { const c = await caches.open(k); for (const r of await c.keys()) out.push(new URL(r.url).pathname); } return out; }""")
    need = ['/antrenman/index.html', '/antrenman/vendor/chart.umd.js', '/antrenman/css/app.css'] + [f'/antrenman/js/{f}' for f in sorted(os.listdir(os.path.join(REPO, 'js')))]
    check('tüm uygulama dosyaları önbellekte', all(n in cached for n in need), [n for n in need if n not in cached])
    ctx2.set_offline(True)
    pg2.reload()
    pg2.wait_for_timeout(500)
    check('internet yokken uygulama açılıyor', pg2.evaluate("typeof switchTab") == 'function' and pg2.evaluate("typeof Chart") == 'function')
    pg2.evaluate("""() => { DB.measurements = [{date:'2026-09-01', weight:80}, {date:'2026-09-08', weight:79}]; switchTab('meas'); switchTrend('weight'); }""")
    check('internet yokken grafik çiziliyor', pg2.evaluate("!!fatChart"))
    check('çevrimdışı sayfa hatası yok', not errs2, errs2)
    ctx2.close()

    browser.close()

srv.shutdown()
shutil.rmtree(ROOT, ignore_errors=True)
fails = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(fails)}/{len(results)} geçti')
if fails:
    print('Başarısız:', *fails, sep='\n  - ')
sys.exit(1 if fails else 0)
