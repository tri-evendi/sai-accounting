# RBAC — Otorisasi berbasis izin (wajib untuk halaman/route baru)

> Hasil refactor audit RBAC 2026-07 (PR #70, #71, dst.). Sumber kebenarannya
> satu: **`packages/core/src/authz.ts`**. Kode tidak bertanya "apakah perannya
> Direktur Utama atau Manajer Keuangan?", tetapi "apakah ia punya izin
> `resource.action`?".
> Sejak issue #73 matriks di kode adalah **bawaan** (baseline); matriks
> **efektif** = bawaan + override DB yang dikelola dari halaman `/permissions`.
> Sejak issue #75 ada lapisan izin khusus per pengguna di atasnya. Sejak issue
> #99 ada lapisan modul per kategori usaha di atas semuanya: fitur yang tidak
> dipakai perusahaan tidak terjangkau siapa pun, tetapi modul tidak pernah
> menggerbangi buku besar. Lihat § Konfigurasi runtime.

## Peran

Ada empat peran sistem di kode (`packages/core/src/constants.ts`: `ROLES`,
`ROLE_VALUES`; `roleEnum` di `validations/common.ts` untuk zod). Sejak
migration 0032 kuncinya nama jabatan baku berbahasa Inggris dalam `snake_case`
(konvensi docs/DATABASE.md). Singkatan lama `bos`/`core`/`ptg` sudah tidak ada,
baik di DB maupun di kode.

| Peran | Label (id) | Ringkas |
|-------|-----------|---------|
| `managing_director` | Direktur Utama | Memegang SEMUA izin |
| `administrator` | Administrator Sistem | Memegang SEMUA izin — **kembar** dengan Direktur Utama |
| `finance_manager` | Manajer Keuangan | Dokumen harian baca+tulis; TANPA hapus master, laporan, akuntansi, administrasi |
| `warehouse_head` | Kepala Gudang | Stok saja + halaman bersama (persetujuan, kamus, pengaturan) |

**Kenapa `administrator` kembar dengan `managing_director`**, dan bukan admin
teknis dengan izin terbatas: harus selalu ada dua jalan masuk yang berdiri
sendiri untuk mengelola pengguna dan hak akses, supaya satu akun yang hilang
tidak mengunci seluruh perusahaan. Pemisahan tugas sengaja ditukar dengan
ketahanan; jejaknya tetap terbaca karena catatan audit menyimpan peran aktor.
Keduanya ada di `FULL_ACCESS_ROLES` (`packages/core/src/constants.ts`), satu
sumber untuk matriks izin, bawaan Mode Akuntan, dan sel anti-lockout.

**Peran bawaan pembuat perusahaan adalah `administrator`**, bukan
`managing_director` (`src/app/api/companies/route.ts`; `scripts/create-company.ts`
untuk jalur operator). "Direktur Utama" adalah nama jabatan, dan nama itu
terbaca di daftar pengguna, jejak audit, dan pilihan penyetuju. Yang
mendaftarkan PT biasanya staf akunting, IT, atau konsultan; begitu direktur
aslinya dibuatkan akun, buku itu akan punya dua Direktur Utama. Kuasa kedua
peran identik (`FULL_ACCESS_ROLES`), jadi yang berubah hanya ketepatan namanya.
Direktur Utama yang sebenarnya cukup mengubah perannya sendiri di /users.
Perpindahan antarperan berakses penuh tidak pernah membuatnya kehilangan akses.

Kepemilikan langganan tidak diatur di sini. Tempatnya `tenant_memberships.role
= owner` (`TENANT_ROLES`, docs/MULTI-COMPANY.md). Keanggotaan lama sengaja
tidak dimigrasi: sebagian pemilik buku lama memang direkturnya, dan menulis
ulang peran mereka secara massal berarti mengubah fakta yang sudah tercatat di
jejak audit.

Menambah peran: tambahkan di `ROLES`, lalu `tsc` menunjukkan semua `Record`
yang wajib diisi. Peran kustom (di luar empat peran sistem) dibuat dari
/permissions dan disimpan sebagai data di tabel `roles` (migration 0031).

## Matriks izin

`PERMISSION_ROLES` di `packages/core/src/authz.ts`: `"<resource>.<action>"` →
daftar peran. Aksi baku: `read` · `write` · `delete` · `manage`, serta
view/decide/export untuk kasus khusus. Invarian yang dijaga
`tests/authz.test.ts`:

- kedua peran berakses penuh memegang semua izin;
- hapus master hanya untuk akses penuh (kecuali `advance.delete`, terdokumentasi);
- **`delete ⊆ write ⊆ read`**: aksi yang lebih berbahaya tidak pernah lebih longgar;
- `can()` deny-by-default (peran tak dikenal ditolak).

## Konfigurasi runtime (issue #73) — bawaan + override

- **Bawaan tetap di kode.** `PERMISSION_ROLES` adalah baseline dan nilai "Reset
  ke bawaan". Tabel `role_permission_overrides` (migration 0029) menyimpan
  penyimpangan per sel (peran × izin): `allowed` true memberi izin, false
  mencabut. Tabel kosong berarti perilaku sama dengan bawaan.
- **Matriks efektif** dirakit `src/lib/authz-effective.ts` (satu-satunya
  pembaca tabelnya). Logika murninya di `src/lib/authz-overrides.ts`
  (`tests/authz-overrides.test.ts`). Baris yatim (izin/peran yang tidak dikenal
  kode) diabaikan, jadi deny-by-default tidak bisa ditembus lewat data.
- **Cache ±60 detik** (seirama revalidasi sesi fase 3) dengan invalidasi
  eksplisit saat menulis. Di proses yang sama perubahan berlaku seketika; lintas
  proses paling lama satu TTL. Total jeda paling lama sekitar satu menit.
- **Penegakan memakai matriks efektif.** `requirePagePermission`/
  `requireApiPermission` memanggil `canEffective()`. `can()`/`rolesFor()`
  bawaan tinggal untuk tes dan fallback tampilan.
- **Anti-lockout dan invarian saat menulis** (`validateOverrides`, pesan
  berbahasa Indonesia): Direktur Utama maupun Administrator tidak bisa
  kehilangan `authz.manage` dan `user.manage` (`PROTECTED_CELLS`: empat sel, dua
  peran × dua izin). `delete ⊆ write ⊆ read` harus tetap berlaku pada matriks
  efektif hasil usulan. Sel kembar dan peran asing ditolak.
- **UI**: halaman `/permissions` ("Hak Akses", grup Bantuan & Pengaturan),
  penjaga `authz.manage` (bawaan: peran berakses penuh). API
  `GET/PUT /api/authz/overrides`; PUT mengganti seluruh set, daftar kosong
  berarti reset. Setiap simpan diaudit (`authz.override.update`/`.reset`)
  beserta aktor dan perannya.
- **Tampilan ikut matriks efektif.** Sidebar memuat set izin efektif dari
  `GET /api/user/permissions` (self-scoped, untuk tampilan saja; sejak #75
  termasuk izin khusus per pengguna). `nav.ts` dan `quick-actions.ts`
  mendeklarasikan izin per item, bukan daftar peran, dan menerima set efektif.
  Keputusan server component (beranda, tombol hapus di detail, panel audit
  Pengaturan) membaca loader efektif.

### Izin khusus per pengguna (issue #75) — lapisan di atas peran

- **Urutan evaluasi** sebuah izin untuk seorang pengguna:
  `bawaan di kode` → `override peran (role_permission_overrides)` →
  `override pengguna (user_permission_overrides, migration 0030)`. Baris
  pengguna menang atas keputusan perannya: `allowed` true memberi izin yang
  tidak dimiliki perannya, false mencabutnya. Pengguna tanpa baris mengikuti
  perannya sepenuhnya ("Ikuti peran"). Baris yatim diabaikan.
- **Logika murni** di `src/lib/authz-user-overrides.ts`
  (`tests/authz-user-overrides.test.ts`). Sambungan Prisma tetap hanya di
  `authz-effective.ts`: `canEffective()` membaca keduanya, dan
  `effectivePermissionsFor()` menghasilkan set akhir seorang pengguna.
- **Cache per pengguna ±60 detik** (konstanta TTL yang sama dengan matriks
  efektif), dengan invalidasi eksplisit per id saat menulis. Total jeda tetap
  paling lama sekitar satu menit. Bila pembacaan DB gagal, izin jatuh ke level
  peran dan kegagalannya dicatat. `session_version` sengaja tidak dinaikkan
  saat menyimpan: izin tidak disimpan di JWT, dan penegakan membaca cache ber-TTL
  yang sama dengan revalidasi sesi. Menaikkan versi hanya memaksa login ulang
  tanpa mempercepat propagasi.
- **Anti-lockout dan invarian saat menulis** (`validateUserOverrides`, pesan
  berbahasa Indonesia): pengguna berperan akses penuh tidak bisa dicabut
  `authz.manage`/`user.manage`-nya (sel `PROTECTED_CELLS` yang sama dengan #73).
  `delete ⊆ write ⊆ read` harus tetap berlaku pada set izin akhir pengguna hasil
  usulan. Izin asing atau kembar ditolak. Baris yang nilainya sama dengan nilai
  efektif perannya dinormalkan (dibuang), jadi yang tersimpan selalu
  penyimpangan nyata.
- **UI**: panel "Izin Khusus" di halaman `/users` (per pengguna, tiga keadaan:
  "Ikuti peran (Boleh/Tidak)" / "Selalu boleh" / "Selalu tidak"). API
  `GET/PUT /api/users/[id]/permissions` dengan penjaga `authz.manage`, karena
  mengubah otorisasi adalah kewenangan /permissions, bukan sekadar
  `user.manage`. PUT mengganti seluruh set; daftar kosong berarti ikuti peran.
  Setiap simpan diaudit (`user.authz.override.update`/`.reset`) beserta aktor
  dan perannya.
- **Catatan**: mengganti peran pengguna tidak menghapus izin khususnya. Baris
  lama tetap diterapkan di atas peran barunya (terlihat di panel dan bisa
  dihapus dari sana). Invarian divalidasi saat menulis; seperti di #73,
  perubahan matriks peran sesudahnya tidak divalidasi ulang terhadap override
  pengguna yang sudah tersimpan.

### Modul per kategori usaha (issue #99) — lapisan yang memperkecil permukaan

- **Yang diputuskan**: fitur mana yang dipakai perusahaan. Peta
  `RESOURCE_MODULE` (`src/lib/business-modules.ts`) memberi setiap sumber daya
  izin tepat satu modul (`BUSINESS_MODULES`). Karena `Record`-nya bertipe penuh
  atas `PermissionResource`, sumber daya izin baru tanpa modul ditolak `tsc`,
  sama seperti `RESOURCE_LABELS`.
- **Penyimpanan**: satu kolom `company_settings.enabled_modules` (migration
  0034), dipisah koma, urut deklarasi. NULL atau kosong berarti semua modul
  aktif. Dengan begitu tidak perlu backfill, pemasangan yang sudah berjalan
  tidak berubah perilakunya, dan modul yang ditambahkan ke kode belakangan ikut
  menyala. `business_category` hanya preset (nilai awal wizard) dan tidak
  pernah dibaca saat penegakan.
- **Urutan evaluasi** `canEffective`: modul → bawaan → override peran →
  override pengguna. Izin di modul nonaktif ditolak untuk semua orang,
  termasuk peran berakses penuh. `effectivePermissionsFor` ikut menyaring, jadi
  menu, Aksi Cepat, dan tombol hilang tanpa mengubah satu halaman pun.
- **Modul tidak pernah menggerbangi buku besar.** Jurnal yang berasal dari
  dokumen sebuah modul tetap ada, dan laporan tetap rekonsiliasi, setelah
  modulnya dimatikan. Mesin laporan dan posting tidak boleh punya jalur impor
  apa pun ke `business-modules.ts` atau penjaga otorisasi; dijaga
  `tests/business-modules-ledger.test.ts`.
- **Izin ≠ modul.** Halaman diarahkan ke `/feature-inactive` ("fitur ini belum
  aktif untuk perusahaan Anda"), dan API menjawab 403 dengan
  `code: "module_inactive"`. Penolakan karena peran tetap berbunyi seperti
  sebelumnya. Baris override di DB tidak disentuh, jadi menyalakan modul
  kembali tidak memberi izin baru kepada siapa pun; izin yang sudah dimiliki
  hanya terjangkau lagi. `/permissions` dan panel "Izin Khusus" menyembunyikan
  baris modul nonaktif, tetapi tetap menyusun draft dan payload dari daftar izin
  lengkap. Kalau tidak, menyimpan akan menghapus override milik modul yang
  sedang mati.
- **Anti-lockout**: `core_accounting` (akun, jurnal, buku besar, laporan,
  anggaran, periode, audit, setup, pengaturan, pusat biaya, kamus, `authz`, dan
  `user`) tidak bisa dimatikan. Ini ditegakkan di server lewat
  `validateEnabledModules`, di route PUT modul maupun di `POST /api/setup`,
  bukan hanya lewat checkbox yang dinonaktifkan.
- **Cache**: TTL yang sama dengan matriks izin efektif, dengan invalidasi
  eksplisit saat menulis (route modul dan wizard). Bila pembacaan DB gagal,
  semua modul dianggap aktif (fail-open, dicatat). Modul hanya memperkecil
  permukaan, jadi fail-closed akan menghilangkan seluruh aplikasi karena DB
  yang sedang bermasalah.
- **UI**: langkah "Modul Usaha" di wizard penyiapan (preset kategori hanya nilai
  awal) dan kartu "Modul Usaha" di /settings, dengan penjaga
  `company_setting.manage`. Modul menjawab "bidang usaha perusahaan ini apa"
  (sekelompok dengan profil dan identitas pajak), bukan "siapa boleh apa".
  Keduanya memakai satu komponen `components/settings/module-picker.tsx`. API
  `GET/PUT /api/company-settings/modules`; setiap simpan diaudit
  (`company_setting.modules.update`, beserta keadaan sebelumnya).

## Lingkup tenant (issue #135) — matriks kedua, penjaga kedua

Sejak epik multi-tenant (#133), izin punya dua lingkup yang tidak pernah
dicampur:

| Lingkup | Matriks | Penjaga | Sumber jawaban |
|---|---|---|---|
| **Tenant** (`tenant.home`, `company.create`, `tenant.billing`, `tenant.member.invite`, `tenant.settings`) | `TENANT_PERMISSION_ROLES` di `src/lib/tenant-authz.ts` | `requireTenantApiPermission` / `requireTenantPagePermission` (`src/lib/tenant-guard.ts`) | `tenant_memberships` (owner/admin/member) di basis data kendali |
| **Perusahaan** (seluruh matriks di atas) | `PERMISSION_ROLES` di `packages/core/src/authz.ts` | `requireApiPermission` / `requirePagePermission` | `memberships` per-PT |

Aturannya: **izin tenant tidak boleh diperiksa penjaga perusahaan.** Penjaga
perusahaan menuntut konteks perusahaan, sedangkan di lingkup tenant ketiadaan
konteks itu sah (pemilik tenant yang belum punya PT sedang membuat yang
pertama). Kedua himpunan kunci izin terpisah, jadi salah matriks ditolak `tsc`.
Halaman grup `(tenant)` dan route yang terdaftar di `TENANT_API_ROUTES` dijaga
`tests/authz-coverage.test.ts`.

Peran tenant: `owner` (semua, termasuk penagihan; owner terakhir tidak bisa
dihapus atau diturunkan, `validateTenantMembershipChange`, teruji), `admin`
(membuat perusahaan dan mengundang, tanpa penagihan), `member` (tanpa izin
tenant). Matriks tenant tidak bisa di-override dari /permissions karena
perannya kontraktual.

## Empat lapisan penegakan

1. **Halaman**: `requirePagePermission("izin")` (`src/lib/page-auth.ts`). Tanpa
   sesi → `/login`; modul nonaktif → `/feature-inactive` (issue #99); tanpa
   izin → `/dashboard`. Izin di `ACCOUNTING_PERMISSIONS` otomatis ikut dijaga
   Mode Akuntan (issue #11). Untuk halaman client, pecah menjadi `page.tsx`
   server yang memanggil penjaga + `<nama>-form.tsx` client (pola `journal/new`).
2. **API**: `requireApiPermission("izin")` (`src/lib/auth-guard.ts`). Menjawab
   401/403 (403 dengan `code: "module_inactive"` bila yang menutup adalah
   modulnya, issue #99). Hanya berdasar peran; Mode Akuntan adalah preferensi
   tampilan, bukan otorisasi. Pemeriksaan yang lebih halus (mis. persetujuan:
   peran harus sama dengan `approverRole` aturan; aksi self-scoped) ditulis
   inline sesudah penjaga izin, sebagai pelengkap.
3. **Proxy** (`src/proxy.ts`; di Next 16 pengganti `middleware.ts`): lapisan
   pengaman autentikasi, yaitu verifikasi JWT dan alur wajib-ganti-kata-sandi.
   Gerbang per-prefix dari matriks statis dihapus di issue #73. Matriksnya kini
   bisa di-override DB, dan salinan bawaan di proxy akan memblokir izin yang
   justru diberikan override. Cache efektif dan invalidasinya tidak terlihat
   dari proxy, dan dokumentasi Next melarang proxy bergantung pada modul/global
   bersama. Di lapisan ini route dashboard hanya menuntut autentikasi;
   penegakan izin sepenuhnya di lapisan 1–2, dan `tests/authz-coverage.test.ts`
   membuktikan setiap halaman/route memanggil penjaganya.
4. **Tampilan**: menu (`nav.ts`), Aksi Cepat, tombol (pakai `can()`). Ini hanya
   tampilan dan tidak pernah dianggap pengamanan.

**Cakupan dipaksa tes** (`tests/authz-coverage.test.ts`): setiap `page.tsx`
dashboard dan `route.ts` API wajib memanggil penjaganya; berkas tanpa
deklarasi izin membuat tes merah. Pengecualian eksplisit beserta alasannya ada
di berkas tes itu (beranda, NextAuth, endpoint self-scoped, health).

## Kunci buku — otentikasi ulang sebelum masuk ke buku sebuah PT

Membuka buku sebuah perusahaan menuntut sandi sekali lagi, sekali per hari
kerja per PT. Gerbangnya berada paling awal di `gateAfterCompany()`
(`src/lib/page-auth.ts`), sebelum gerbang penyiapan, modul, dan suspensi.

Fitur ini bukan tambalan celah, dan jangan dihapus karena dianggap berlebihan.
Sejak issue #158 tidak ada "sesi perusahaan" yang memberi akses:
`session.user.companyId` hanya catatan "terakhir dibuka", jalur kanonik
`/t/{tenant}/{company}/…` membawa perusahaannya, dan penjaga memeriksa ulang
keanggotaan di setiap permintaan. Mengetik URL buku PT lain sudah ditolak tanpa
fitur ini. Yang diberikannya adalah bukti kehadiran (pola `sudo`). Sesi yang
ditinggalkan terbuka di laptop yang tidak terkunci tetap bisa membuka menu mana
pun, dan kunci ini membuat akses ke buku (tempat jurnal ditulis dan saldo awal
dibukukan) menuntut sandi.

- **Sandinya sama dengan sandi login.** Identitas di aplikasi ini tunggal (basis
  data kendali); peran melekat pada keanggotaan per PT, dan pembuat PT otomatis
  menjadi `ADMINISTRATOR` (peran berakses penuh) di PT yang baru dibuat
  (`src/app/api/companies/route.ts`). Kredensial terpisah per PT pernah
  ditimbang dan ditolak. `docs/MULTI-COMPANY.md` melarang FK ke `users` dari
  basis data perusahaan, jadi model itu menuntut sistem identitas kedua beserta
  reset sandi, undangan, dan audit yang digandakan per PT.
- **Mekanismenya cookie ber-HMAC**, bukan klaim di JWT. Penjaga halaman butuh
  jawabannya di server, secara sinkron, pada permintaan yang sedang berjalan,
  sedangkan `update()` NextAuth berjalan di klien. Cookie ditandatangani
  `AUTH_SECRET`, dan `users.id` ikut ditandatangani, jadi cookie yang tertinggal
  setelah berganti akun di peramban yang sama tidak berlaku. Lihat
  `src/lib/company-unlock.ts`.
- **Kedaluwarsa per PT**: delapan jam (satu hari kerja). Membuka PT kedua tidak
  memperpanjang kunci PT pertama.
- **Pembuka kuncinya** `POST /api/company-unlock`: sesi, keanggotaan di PT itu,
  dan bcrypt atas sandi pemanggil. Setiap kegagalan dijawab dengan kalimat yang
  sama (anti-enumerasi) dan dibatasi laju per pengguna dengan anggaran
  `RATE_LIMITS.login`. Route ini terdaftar di `API_EXCEPTIONS`
  `tests/authz-coverage.test.ts` dan **tidak boleh** memakai
  `requireApiPermission`: penjaga itu memanggil gerbang kunci, sehingga route
  pembuka kunci akan menuntut kunci yang belum ada.
- **Layar promptnya** `/unlock` di grup `(auth)`, satu-satunya tempat yang
  memang memakai `AuthShell`. Halaman ini sengaja tidak memakai
  `requirePagePermission`, karena ia akan me-redirect ke dirinya sendiri;
  penjaganya ringan dan ditulis di halaman itu. Slug yang bukan milik pemanggil
  dijawab `notFound()`, bukan pesan lain, supaya halaman itu tidak bisa dipakai
  menebak keberadaan PT.
- Tesnya `tests/company-unlock.test.ts`: tanda tangan yang diubah, isi yang
  diubah dengan tanda tangan lama, cookie milik pengguna lain, entri
  kedaluwarsa, dan `AUTH_SECRET` yang hilang (harus melempar galat, tidak boleh
  memakai nilai bawaan).

## Sesi & pencabutan (fase 3)

Peran disimpan di JWT (24 jam) + `users.session_version` (migration 0028).
Callback `jwt` merevalidasi ke DB setiap ≥60 detik (`src/lib/session-guard.ts`).
Bila baris hilang, versi berbeda, atau token tanpa versi, sesi dicabut; selain
itu peran/status disalin ulang (perubahan peran berlaku dalam ≤60 detik). Ganti
peran dan reset kata sandi oleh admin menaikkan versi; menghapus pengguna
mencabut sesinya otomatis.

## Audit

`writeAuditLog` mencatat aktor beserta perannya saat beraksi. Mutasi manajemen
pengguna (`user.create/update/delete`) wajib diaudit, dengan detail
`roleFrom→roleTo` / `resetPassword`; nilai kata sandi tidak pernah dicatat.
Catatan audit lama menyimpan nama peran yang berlaku saat aksi itu terjadi
(`bos`/`core`/`ptg`) dan sengaja tidak ditulis ulang oleh migration 0032, supaya
jejak sejarahnya tetap asli.

## Checklist fitur baru

- [ ] Tambah baris izin di `PERMISSION_ROLES` (bukan daftar peran lokal).
- [ ] Sumber daya izin baru? Beri modulnya di `RESOURCE_MODULE`
      (`src/lib/business-modules.ts`); `tsc` menolak yang belum diberi.
- [ ] Halaman: `requirePagePermission`; API: `requireApiPermission`; tampilan: `can()`.
- [ ] Halaman client dipecah menjadi server-wrapper + form.
- [ ] Butuh pengecualian cakupan? Daftarkan di `tests/authz-coverage.test.ts` beserta alasannya.
- [ ] `bunx vitest run tests/authz.test.ts tests/authz-coverage.test.ts` hijau.
