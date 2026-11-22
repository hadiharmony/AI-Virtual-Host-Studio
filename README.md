# AI Virtual Host Studio (`AI Host Studio`)

**Autonomous AI Livestreaming Platform** — aplikasi Android (Kotlin + Jetpack Compose + Material 3 + Firebase) untuk membuat, mengonfigurasi, melatih, menguji, dan mengorkestrasi virtual host AI manusia secara otonom untuk ekosistem livestreaming (dengan fokus awal TikTok LIVE serta arsitektur modular multi-karakter & multi-platform).

Seluruh antarmuka pengguna, navigasi, formulir, notifikasi, dan panduan disajikan dalam **Bahasa Indonesia alami**, sementara kode sumber, arsitektur, dan dokumentasi teknis menggunakan Bahasa Inggris.

---

## 1. Architecture Summary

AI Virtual Host Studio menggunakan **Hybrid Modular Architecture** dengan pemisahan tanggung jawab yang jelas:

- **Presentation Layer (`app/src/main/java/com/example/ui/`)**:
  - Jetpack Compose + Material 3 Adaptive Shell (`StudioShell.kt` — `NavigationBar` pada perangkat ringkas dan `NavigationRail` pada layar lebar/tablet).
  - Centralized `StudioViewModel` + `StateFlow<StudioUiState>` dengan `collectAsStateWithLifecycle()`.
  - Custom theme (`Color.kt`, `Type.kt`, `Theme.kt`) menggunakan font lokal Space Grotesk, Plus Jakarta Sans, dan JetBrains Mono.
- **Domain & Engine Layer (`domain/model/`, `engine/`)**:
  - Multi-character & multi-platform data models (`StudioModels.kt`).
  - `InteractionManager.kt`: normalisasi komentar, filter spam/duplikasi/kata kasar, ekstraksi kata kunci, antrean prioritas (`HIGH`, `MEDIUM`, `LOW`), dan jaminan antrean suara tidak tumpang tindih (`isSpeaking`).
- **Modular Provider Layer (`providers/`)**:
  - `LLMProvider` -> `GeminiLLMProvider` (menggunakan **Firebase AI Logic / `Firebase.ai`** + Firebase App Check tanpa menyimpan kunci API Gemini di klien; mendukung model `gemini-3.8-flash` & `gemini-3.5-flash-lite`).
  - `AvatarProvider` -> `HeyGenAvatarAdapter`, `BytePlusAvatarAdapter` (adapter modular siap produksi yang memvalidasi kredensial dan memanggil endpoint resmi; tidak memalsukan status terhubung).
  - `VoiceProvider` -> `AndroidSystemTtsVoiceProvider` (Android `TextToSpeech` lokal Bahasa Indonesia) & `ElevenLabsVoiceAdapter` (validasi kredensial & API `v1/user`).
  - `StreamingPlatformProvider` -> `TikTokLiveAdapter` & `YouTubeLiveAdapter` (terkunci sampai OAuth/kredensial resmi tersedia; menyediakan jalur `MODE SIMULASI` terpisah).
- **Data & Security Layer (`core/firebase/`, `data/`)**:
  - **Firebase Authentication** via Jetpack Credential Manager (`GetSignInWithGoogleOption` — tanpa anonymous login).
  - **Cloud Firestore** dengan database ID kustom (`R.string.firestore_database_id`), listener real-time, serta aturan keamanan Zero-Trust (`firestore.rules`) yang telah diuji terhadap Firestore Emulator (`firestore.test.js`).

---

## 2. Implemented Modules (A – I)

| Module | Screen | Capabilities |
| :--- | :--- | :--- |
| **A — Dashboard** | `DashboardScreen.kt` | Status karakter aktif, AI Brain, Avatar, Voice, TikTok, Livestream, aktivitas terakhir, total sesi/komentar/respons (memisahkan statistik aktual vs simulasi), estimasi pemakaian & biaya API. |
| **B — Character Studio** | `CharacterStudioScreen.kt` | Buat, ubah, pratinjau, pilih aktif, dan hapus karakter (dengan konfirmasi). Memisahkan desain visual/referensi gambar dari registrasi avatar provider pihak ketiga. |
| **C — AI Brain Studio** | `AiBrainStudioScreen.kt` | Pengaturan LLM, 7 preset kepribadian (Ramah, Humoris, Profesional, Penasaran, Edukatif, Misterius, Menghibur), editor System Prompt, memori percakapan, gaya respons, moderasi, dan uji obrolan Gemini langsung. |
| **D — Knowledge Center** | `KnowledgeCenterScreen.kt` | Input dokumen teks/FAQ/deskripsi produk, kategori, pemecahan chunk otomatis untuk RAG kontekstual, status pemrosesan jujur (`READY` / `FAILED`), pencarian, dan penghapusan dokumen. |
| **E — Live Control Center** | `LiveControlScreen.kt` | Panel kontrol siaran, tombol **Start Live (Terkunci)** untuk TikTok LIVE resmi, **Mode Simulasi Interaktif (`MODE SIMULASI`)**, panggung virtual host, pengiriman komentar uji, respons AI + suara TTS real-time, dan Emergency Stop. |
| **F — Interaction Manager** | `InteractionManagerScreen.kt` | Konfigurasi filter spam, duplikasi, kata terlarang, pemantauan antrean prioritas komentar, statistik komentar diterima/difilter, serta kontrol jeda & antrean bicara. |
| **G — Autonomous Live Manager** | `AutonomousLiveScreen.kt` | Konfigurasi 4 mode otonom (*Greeting*, *Interactive*, *Proactive*, *Continuation*), interval keheningan, pemicu sapaan pembuka, topik proaktif cadangan, dan pengujian kalimat otonom. |
| **H — Analytics & History** | `AnalyticsHistoryScreen.kt` | Riwayat sesi livestream & percakapan, rincian metrik aktual vs estimasi biaya API, pemisahan sesi simulasi vs resmi, serta ekspor ringkasan laporan. |
| **I — Integration & Settings** | `IntegrationsSettingsScreen.kt` | Pengaturan provider LLM, Avatar, Voice, dan Platform Streaming, status koneksi jujur, uji koneksi langsung, log sistem terstruktur, dan keluar akun. |

---

## 3. Cloud Firestore Schema & Security Rules

Seluruh data pengguna terisolasi di bawah `/users/{userId}/...` dan dilindungi oleh `firestore.rules` (Zero-Trust, validasi tipe & panjang field, pencegahan ghost-field, pembatasan timestamp `<= request.time`, dan penguncian terminal state `ENDED`/`EMERGENCY_STOPPED` pada `livestream_sessions`).

Daftar 12 koleksi:
1. `users/{userId}` — Profil workspace & preferensi pengguna
2. `users/{userId}/characters/{characterId}` — Profil & konfigurasi karakter virtual host
3. `users/{userId}/ai_personalities/{configId}` — Konfigurasi AI Brain, preset, system prompt, moderasi
4. `users/{userId}/knowledge_documents/{docId}` — Metadata & konten dokumen pengetahuan
5. `users/{userId}/knowledge_chunks/{chunkId}` — Potongan teks terindeks untuk RAG
6. `users/{userId}/conversation_sessions/{sessionId}` — Sesi percakapan uji & simulasi
7. `users/{userId}/conversation_messages/{messageId}` — Riwayat pesan pengguna & respons AI
8. `users/{userId}/autonomous_configs/{configId}` — Konfigurasi perilaku otonom 4 mode
9. `users/{userId}/livestream_sessions/{liveId}` — Sesi livestream & metrik simulasi/aktual
10. `users/{userId}/integration_settings/{providerId}` — Status & konfigurasi modular tiap provider
11. `users/{userId}/usage_records/{recordId}` — Catatan penggunaan token & estimasi biaya API
12. `users/{userId}/system_logs/{logId}` — Log operasional & diagnostik sistem

Lihat skema lengkap di [`firebase-blueprint.json`](./firebase-blueprint.json) dan aturan di [`firestore.rules`](./firestore.rules).

---

## 4. Environment Variables & Credentials

- **Google Gemini AI (Firebase AI Logic)**: **Tidak memerlukan `GEMINI_API_KEY`**. Aplikasi menggunakan `Firebase.ai` + Firebase App Check yang terkonfigurasi otomatis melalui `app/google-services.json` dan `app/src/main/res/values/firebase_applet_config.xml`.
- **Optional Third-Party Integrations**: Dideklarasikan di [`.env.example`](./.env.example) dan disuntikkan via Secrets Gradle Plugin ke `BuildConfig` saat pengguna menambahkan kredensial di **AI Studio Secrets Panel**:
  - `HEYGEN_API_KEY` — HeyGen Streaming Avatar API
  - `BYTEPLUS_API_KEY` — BytePlus / Volcano Engine Avatar API
  - `ELEVENLABS_API_KEY` — ElevenLabs Real-Time TTS API
  - `TIKTOK_CLIENT_KEY` — TikTok LIVE Official OAuth / Partner API

> **Security Note:** Jangan pernah menyimpan atau melakukan commit file `.env` berisi API key asli ke repositori Git. Untuk produksi rilis publik, tempatkan seluruh kredensial API pihak ketiga di backend proxy server-side agar tidak pernah dibundel ke dalam APK.

---

## 5. Build, Verification & Testing

### Compile Android Project
```bash
gradle :app:compileDebugKotlin
gradle :app:assembleDebug
```

### Run Firestore Security Rules Emulator Tests
```bash
firebase emulators:start --only firestore
# Di terminal terpisah:
FIRESTORE_EMULATOR_HOST="127.0.0.1:8085" node --test firestore.test.js
```

### Deploy Firestore Rules
```bash
firebase deploy --only firestore:rules
```

---

## 6. Integration Readiness Checklist

- [x] Firebase Authentication (Google Sign-In via Jetpack Credential Manager)
- [x] Cloud Firestore persistent workspace & real-time sync (12 collections)
- [x] Hardened Firestore Security Rules verified with emulator test suite (`5/5` passed)
- [x] Google Gemini AI via Firebase AI Logic (`Firebase.ai`) + App Check
- [x] Local Indonesian Voice Synthesis via Android `TextToSpeech`
- [x] Full Live Simulator (`MODE SIMULASI`) with Interaction Manager & Autonomous 4-mode engine
- [ ] Third-party Avatar streaming (HeyGen / BytePlus) — requires user API credentials & WebRTC/avatar registration
- [ ] Premium Cloud TTS (ElevenLabs) — requires `ELEVENLABS_API_KEY`
- [ ] Official TikTok LIVE broadcast connector — requires approved TikTok LIVE Developer/Partner OAuth credentials
