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
clearWorkoutNotification();

// Uygulama arka plana alınırken son durumu kaydet
// ve aktif antrenmanı bildirimde göster; geri dönünce bildirimi kaldır
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { captureActive(); postWorkoutNotification(); }
  else { acquireWakeLock(); clearWorkoutNotification(); }
});
window.addEventListener('pagehide', () => { captureActive(); postWorkoutNotification(); });

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
