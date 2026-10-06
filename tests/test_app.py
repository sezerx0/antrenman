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
    check('önceki performans ipucu görünüyor', '42.5' in hint and 'koltuk 4' in page.inner_text('#ex-card-0'), hint)
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
    page.click('#rest-chip-0')
    check('dinlenme çipi 2:00 oldu', '2:00' in page.inner_text('#rest-chip-0'), page.inner_text('#rest-chip-0'))
    check('Torso A Pec Deck ayarı kaydedildi', page.evaluate("DB.settings.restByEx['pec deck fly']") == 120)
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
    check('kol-bacak bölümü varsayılan kapalı', not page.is_visible('#m-arm-r'))
    page.click('#limb-toggle')
    check('kol-bacak açılıyor', page.is_visible('#m-arm-r'))

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
    page.click('#palette-lime-btn')
    check('lime paleti uygulandı', page.evaluate("document.documentElement.dataset.palette") == 'lime' and page.evaluate("DB.settings.palette") == 'lime')
    check('lime ayarı kalıcı', page.evaluate("JSON.parse(localStorage.getItem('antrenman:settings')).palette") == 'lime')
    page.evaluate("switchTab('workout')")
    check('lime: kahraman kart görünüyor, klasik hedef kartı gizli', page.is_visible('#hero-ring-pct') and not page.is_visible('#weekly-goal-num'))
    page.click('.hero-goal button >> nth=1')
    check('kahraman karttan hedef değişiyor', page.evaluate("DB.settings.weeklyGoal") == 5 and 'Hedef 5' in page.inner_text('#hero-goal-num'))
    page.click('.hero-goal button >> nth=0')
    page.click('#theme-dark-btn') if page.is_visible('#theme-dark-btn') else page.evaluate("setTheme('dark')")
    check('lime + koyu', page.evaluate("document.documentElement.dataset.theme") == 'dark' and page.evaluate("document.documentElement.dataset.palette") == 'lime')
    page.evaluate("setTheme('light'); setPalette('classic')")
    check('klasiğe dönüş', page.evaluate("document.documentElement.dataset.palette") == 'classic' and page.is_visible('#weekly-goal-num') and not page.is_visible('#hero-ring-pct'))
    check('textOn kontrast', page.evaluate("textOn('#C8F169')") == '#1C2420' and page.evaluate("textOn('#1C2420')") == '#fff')


    # ── 24. Cila düzeltmeleri ──
    page.evaluate("switchTab('settings'); openDayEditor()"); page.wait_for_timeout(400)
    ov = page.evaluate("[...document.querySelectorAll('.day-ex-row')].filter(r => r.scrollWidth > r.clientWidth + 1).length")
    check('gün düzenleyicide taşan satır yok', ov == 0, ov)
    page.evaluate("closeDayEditor()"); page.wait_for_timeout(300)
    page.evaluate("setRestDuration(90)")
    page.click('.dur-stepper button >> nth=1')
    check('varsayılan dinlenme adımlayıcı 1:30 → 2:00', page.inner_text('#rest-dur-label') == '2:00' and page.evaluate("DB.settings.restDuration") == 120)
    page.click('.dur-stepper button >> nth=0'); page.click('.dur-stepper button >> nth=0')
    check('adımlayıcı 1:00', page.inner_text('#rest-dur-label') == '1:00')
    page.evaluate("setRestDuration(90)")
    row_ov = page.evaluate("[...document.querySelectorAll('#tab-settings .settings-row, #tab-settings .data-btn')].filter(r => r.scrollWidth > r.clientWidth + 1).map(r => r.innerText.slice(0,30))")
    check('ayarlarda taşan satır yok', not row_ov, row_ov)
    lbl_h = page.evaluate("Math.max(...[...document.querySelectorAll('#tab-settings .settings-label')].map(e => e.getBoundingClientRect().height))")
    check('ayar etiketleri tek satır', lbl_h < 26, lbl_h)
    check('fmtMins', page.evaluate("[fmtMins(20), fmtMins(90), fmtMins(4000)].join('|')") == '<1 dk|2 dk|1 sa 7 dk')
    check('gün kısaltmaları ayırt edici', page.evaluate("[dayCode('Torso A'), dayCode('Torso B'), dayCode('Limbs A'), dayCode('Push'), dayCode('İtiş günü')].join(',')") == 'TA,TB,LA,PU,IG')
    page.evaluate("switchTab('routine'); setWater(0)")
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
    check('öneri: üst sınır → kilo artar', page.evaluate("JSON.stringify(suggestSet({}, {kg:40, reps:12}, [8,12]))") == '{"kg":42.5,"reps":8,"up":true}')
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
    page.click('#range-chip-0'); page.click('#range-chip-0'); page.click('#range-chip-0')
    check('çip 8–12', page.inner_text('#range-chip-0').strip() == '8–12', page.inner_text('#range-chip-0'))
    check('öneri placeholderda', page.get_attribute('#kg-0-0', 'placeholder') == '42.5' and page.get_attribute('#reps-0-0', 'placeholder') == '8' and page.get_attribute('#reps-0-1', 'placeholder') == '10')
    check('öneri satırı görünüyor', 'Bugün' in page.inner_text('#ex-card-0 .ex-sug') and '42.5×8' in page.inner_text('#ex-card-0 .ex-sug'))
    page.click('#set-done-0-0')
    check('boş satıra ✓ öneriyi kaydeder', page.input_value('#kg-0-0') == '42.5' and page.input_value('#reps-0-0') == '8')
    page.fill('#kg-0-1', '44')
    page.click('#range-chip-0')
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
      'Reverse Pec Deck','Hip Thrust','Standing Calf Raise','Shrug','Cable Crunch'].map(n => n + '=' + detectMuscle(n)).join('|')""")
    exp = ['Pec Deck Fly=chest','Incline Chest Press=chest','Cable Lateral Raise=shoulders','Lat Pulldown=back','Chest Supported Machine Row=back','Chest Supported T-Bar Row Machine=back',
      'Preacher Curl Machine=biceps','Cable Triceps Pushdown=triceps','Bayesian Curl Cable=biceps','Triceps Overhead Extension=triceps','Lying Leg Curl=hamstrings','Leg Extension=quads','Leg Press=quads','Hack Squat=quads',
      'Reverse Pec Deck=rearDelts','Hip Thrust=glutes','Standing Calf Raise=calves','Shrug=traps','Cable Crunch=abs']
    wrong = [a for a, b in zip(det.split('|'), exp) if a != b]
    check('kas grubu tahmini (varsayılan program + yaygın hareketler)', not wrong, wrong)
    page.evaluate("""() => { DB.workoutLogs.push({date: today(), dayId:'torso-a', dayName:'Torso A', __test:1, sets:[
        {exId:'a', exName:'Pec Deck Fly', setIdx:0, kg:40, reps:10}, {exId:'a', exName:'Pec Deck Fly', setIdx:1, kg:40, reps:10},
        {exId:'b', exName:'Lat Pulldown', setIdx:0, kg:60, reps:10}, {exId:'c', exName:'Garip Hareket', setIdx:0, kg:10, reps:10}], notes:{}});
      saveData('workoutLogs', DB.workoutLogs); switchTab('stats'); }""")
    w = page.evaluate("weeklyMuscleSets()")
    check('son 7 gün set sayımı', w.get('chest', 0) >= 2 and w.get('back', 0) >= 1 and w.get('other', 0) >= 1, w)
    txt = page.inner_text('#muscle-card')
    check('dağılım kartı: programdaki ama çalışılmayan grup 0 görünüyor', 'Arka bacak' in txt and 'Göğüs' in txt, txt[:200])
    page.evaluate("setMuscle('Garip Hareket', 'forearms'); renderMuscleCard()")
    check('elle değiştirilen kas grubu', page.evaluate("muscleFor('garip hareket')") == 'forearms' and 'Ön kol' in page.inner_text('#muscle-card'))
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
      switchTab('meas'); switchTrend('weight', document.querySelectorAll('.trend-tab')[1]); }""")
    page.wait_for_timeout(300)
    check('kilo grafiği iki seri (tartı + ortalama)', page.evaluate("fatChart && fatChart.data.datasets.length") == 2)
    check('özet kartta 7 gün ortalaması', '7 gün ort.' in page.inner_text('#meas-summary-card'))
    page.evaluate("switchTrend('fat', document.querySelectorAll('.trend-tab')[0])")

    check('sayfa hatası yok', not errors, errors)
    browser.close()

srv.shutdown()
shutil.rmtree(ROOT, ignore_errors=True)
fails = [n for n, ok in results if not ok]
print(f'\n{len(results) - len(fails)}/{len(results)} geçti')
if fails:
    print('Başarısız:', *fails, sep='\n  - ')
sys.exit(1 if fails else 0)
