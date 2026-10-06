// Antrenman Takip — Açılış: ilk çizim, yarım kalan antrenmanı geri yükleme, olay dinleyicileri. En son yüklenir.

// ═══════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════
hydrateIcons();
applyTheme();
setGender('male', true);
loadProfile();
renderHome();
renderSettings();
restoreActiveWorkout();
ensurePersistentStorage();

// Uygulama arka plana alınırken son durumu kaydet
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') captureActive();
  else acquireWakeLock();
});
window.addEventListener('pagehide', () => captureActive());

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
