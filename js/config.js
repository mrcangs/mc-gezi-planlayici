// Firebase web yapılandırması (Firebase Console → Proje ayarları → Web uygulaması).
// Bu değerler gizli değildir; güvenlik database.rules.json ile sağlanır.
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBcEVPwhZzPvZQEoloXAN8PvP07q8L2wWc',
  authDomain: 'mc-gezi-planlayici.firebaseapp.com',
  databaseURL: 'https://mc-gezi-planlayici-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'mc-gezi-planlayici',
  storageBucket: 'mc-gezi-planlayici.firebasestorage.app',
  messagingSenderId: '288108954689',
  appId: '1:288108954689:web:f3b3752896d3efd39572c0'
};

// İsteğe bağlı: YouTube Data API anahtarı. Varsa AI, video açıklamasıyla birlikte en çok beğenilen yorumları da okur.
// Google Cloud Console'da yalnızca bu sitenin adresi (HTTP referrer) ve "YouTube Data API v3" ile sınırlandırılmalıdır.
window.YOUTUBE_API_KEY = '';
