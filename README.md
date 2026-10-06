# Antrenman Takip

Kişisel antrenman takip uygulaması. Telefona ana ekran uygulaması (PWA) olarak kurulur, internet olmadan çalışır ve tüm veriler cihazda saklanır.

Canlı sürüm: https://sezerx0.github.io/antrenman/

## Yapı

```
index.html          Sayfa iskeleti (sekmeler, ekranlar, modallar)
css/app.css         Tüm stiller (Klasik ve Lime paletleri, açık/koyu mod)
js/core.js          İkonlar, veri katmanı (localStorage), yardımcılar, geri tuşu yönetimi
js/home.js          Ana sekme: gün seçimi, haftalık hedef, takvim, yedek hatırlatması
js/workout.js       Antrenman ekranı, ilerleme önerisi, hareket menüsü, dinlenme sayacı
js/stats.js         Grafikler, PR listesi, 1RM, kas grubu dağılımı, plato tespiti
js/measurements.js  Ölçümler, yağ oranı, kilo trendi
js/routine.js       Supplement ve su takibi
js/settings.js      Ayarlar, gün/sıra düzenleyici, yedek alma ve geri yükleme
js/main.js          Açılış (en son yüklenir)
sw.js               Service worker: çevrimdışı çalışma için önbellek
vendor/             Chart.js (MIT)
tests/              Uçtan uca testler
```

Script dosyaları sıradan (modül olmayan) scriptlerdir ve `index.html`'deki sırayla yüklenir. Açılışta çalışan kod yalnızca `core.js` (verinin yüklenmesi) ve `main.js` (ilk çizim) içindedir. Yeni bir dosya eklerken `sw.js`'teki `PRECACHE` listesine de ekleyip `CACHE` sürümünü artırın.

## Veri

Veriler tarayıcının `localStorage`'ında `antrenman:` önekiyle tutulur. Ayarlar > Veri > **Yedek Al** tüm veriyi bir JSON dosyasına aktarır; **Yedekten Geri Yükle** aynı dosyayı geri yükler. Eski sürümlerin verisi açılışta otomatik olarak yeni biçime taşınır.

## Testler

Testler uygulamayı gerçek bir Chromium tarayıcısında açar ve senaryoları çalıştırır: eski veriden geçiş, antrenman akışı, ölçümler, temalar, düzen taşmaları ve çevrimdışı çalışma.

```
pip install -r tests/requirements.txt
python -m playwright install chromium
python tests/test_app.py
```

Her push'ta GitHub Actions'ta otomatik çalışırlar (`.github/workflows/test.yml`).
