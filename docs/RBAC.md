# RBAC — Otorisasi Berbasis Izin (WAJIB untuk halaman/route baru)

> Hasil refactor audit RBAC 2026-07 (PR #70, #71, dst). Satu sumber kebenaran:
> **`src/lib/authz.ts`**. Kode tidak pernah bertanya "perannya Direktur Utama
> atau Manajer Keuangan?" —
> kode bertanya **"punya izin `resource.action`?"**
> Sejak issue #73 matriks di kode adalah **BAWAAN (baseline)**; matriks
> **EFEKTIF** = bawaan + override DB yang dikelola dari halaman `/permissions`;
> sejak issue #75 di atasnya masih ada lapisan **izin khusus per PENGGUNA**;
> sejak issue #99 di ATAS semuanya ada lapisan **modul per kategori usaha**
> (fitur yang tidak dipakai perusahaan ini tidak terjangkau siapa pun — tetapi
> tak pernah menggerbangi buku besar). Lihat § Konfigurasi runtime.

## Peran

Empat peran SISTEM di kode (`src/lib/constants.ts` — `ROLES`, `ROLE_VALUES`, `roleEnum`
di `validations/common.ts` untuk zod). Kuncinya nama jabatan baku Bahasa Inggris
`snake_case` sejak **migration 0032** (konvensi docs/DATABASE.md); singkatan lama
`bos`/`core`/`ptg` sudah tidak ada lagi, baik di DB maupun di kode.

| Peran | Label (id) | Ringkas |
|-------|-----------|---------|
| `managing_director` | Direktur Utama | Memegang SEMUA izin |
| `administrator` | Administrator Sistem | Memegang SEMUA izin — **kembar** dengan Direktur Utama |
| `finance_manager` | Manajer Keuangan | Dokumen harian baca+tulis; TANPA hapus master, laporan, akuntansi, administrasi |
| `warehouse_head` | Kepala Gudang | Stok saja + halaman bersama (persetujuan, kamus, pengaturan) |

**Kenapa `administrator` kembar dengan `managing_director`** (bukan admin teknis
dengan izin terbatas): harus selalu ada DUA jalan masuk yang berdiri sendiri untuk
mengelola pengguna & hak akses, supaya satu akun yang hilang tak pernah mengunci
seluruh perusahaan. Pemisahan tugas ditukar dengan ketahanan secara sadar; jejaknya
tetap terbaca karena catatan audit menyimpan peran aktor. Keduanya berada di
`FULL_ACCESS_ROLES` (`src/lib/constants.ts`) — SATU sumber untuk matriks izin,
bawaan Mode Akuntan, dan sel anti-lockout.

Menambah peran = tambah di `ROLES`, lalu `tsc` memandu ke semua `Record` yang wajib diisi.
Peran KUSTOM (di luar empat peran sistem) dibuat dari /permissions dan hidup sebagai
data di tabel `roles` (migration 0031).

## Matriks izin

`PERMISSION_ROLES` di `src/lib/authz.ts`: `"<resource>.<action>"` → daftar peran.
Aksi baku: `read` · `write` · `delete` · `manage` · view/decide/export untuk kasus khusus.
Invarian dijaga `tests/authz.test.ts`: kedua peran berakses penuh memegang semua;
hapus master = akses-penuh-saja (kecuali `advance.delete`, terdokumentasi);
**`delete ⊆ write ⊆ read`** — aksi lebih berbahaya tak pernah lebih longgar;
`can()` deny-by-default (peran tak dikenal ditolak).

## Konfigurasi runtime (issue #73) — bawaan + override

- **Bawaan tetap di kode.** `PERMISSION_ROLES` adalah baseline dan nilai
  "Reset ke bawaan". Tabel `role_permission_overrides` (migrasi 0029) menyimpan
  PENYIMPANGAN per sel (peran × izin): `allowed` true menghadiahkan izin, false
  mencabut. **Tabel kosong = perilaku persis bawaan.**
- **Matriks efektif** dirakit `src/lib/authz-effective.ts` (satu-satunya pembaca
  tabelnya), logika murninya di `src/lib/authz-overrides.ts`
  (`tests/authz-overrides.test.ts`). Baris yatim (izin/peran yang tak dikenal
  kode) diabaikan — deny-by-default tak bisa dibobol lewat data.
- **Cache ±60 dtk** (seirama revalidasi sesi fase 3) + invalidasi eksplisit
  saat menulis: di proses yang sama perubahan seketika, lintas proses paling
  lama satu TTL. Total jeda terasa ≤ ±1 menit.
- **Penegakan memakai efektif**: `requirePagePermission`/`requireApiPermission`
  memanggil `canEffective()`. `can()`/`rolesFor()` bawaan tinggal untuk tes dan
  fallback tampilan.
- **Anti-lockout & invarian saat MENULIS** (`validateOverrides`, pesan
  Indonesia): Direktur Utama MAUPUN Administrator tidak pernah bisa kehilangan
  `authz.manage` & `user.manage` (`PROTECTED_CELLS` — empat sel, dua peran ×
  dua izin); `delete ⊆ write ⊆ read` wajib tetap berlaku pada matriks
  EFEKTIF hasil usulan; sel kembar/peran asing ditolak.
- **UI**: halaman `/permissions` ("Hak Akses", grup Bantuan & Pengaturan),
  penjaga `authz.manage` (bawaan: peran berakses penuh). API `GET/PUT /api/authz/overrides`
  (PUT = GANTI seluruh set; daftar kosong = reset). Setiap simpan **diaudit**
  (`authz.override.update`/`.reset`) beserta aktor + perannya.
- **Tampilan ikut efektif**: sidebar memuat set izin efektif dari
  `GET /api/user/permissions` (self-scoped, tampilan saja; sejak #75 sudah
  TERMASUK izin khusus per pengguna); `nav.ts` & `quick-actions.ts` kini
  mendeklarasikan **izin** per item (bukan daftar peran) dan menerima set
  efektif; keputusan server component (beranda, tombol hapus detail, panel
  audit Pengaturan) membaca loader efektif.

### Izin khusus per pengguna (issue #75) — lapisan di atas peran

- **Urutan evaluasi** sebuah izin untuk seorang pengguna:
  `bawaan di kode` → `override peran (role_permission_overrides)` →
  `override pengguna (user_permission_overrides, migrasi 0030)`. Baris
  pengguna MENANG atas keputusan perannya: `allowed` true menghadiahkan izin
  yang perannya tidak punya, false mencabutnya. **Pengguna tanpa baris =
  mengikuti perannya sepenuhnya** ("Ikuti peran"). Baris yatim diabaikan —
  deny-by-default tetap tak bisa dibobol lewat data.
- **Logika murni** di `src/lib/authz-user-overrides.ts`
  (`tests/authz-user-overrides.test.ts`); sambungan Prisma tetap hanya di
  `authz-effective.ts` (`canEffective()` kini membaca keduanya;
  `effectivePermissionsFor()` = set FINAL seorang pengguna).
- **Cache PER PENGGUNA ± 60 dtk** (konstanta TTL yang sama dengan matriks
  efektif) + invalidasi eksplisit per id saat menulis — total jeda terasa
  tetap ≤ ±1 menit. Gagal baca DB → jatuh ke izin level peran (dicatat,
  tidak disembunyikan). `session_version` SENGAJA tidak dinaikkan saat
  menyimpan: izin tidak hidup di JWT, penegakan membaca cache ber-TTL yang
  sama dengan revalidasi sesi, jadi menaikkan versi hanya memaksa login
  ulang tanpa mempercepat propagasi.
- **Anti-lockout & invarian saat MENULIS** (`validateUserOverrides`, pesan
  Indonesia): pengguna ber-peran berakses penuh tidak bisa dicabut
  `authz.manage` / `user.manage`-nya (sel `PROTECTED_CELLS` yang sama dengan #73);
  `delete ⊆ write ⊆ read` wajib tetap berlaku pada set izin **FINAL**
  pengguna hasil usulan; izin asing/kembar ditolak. Baris yang sama dengan
  nilai efektif perannya dinormalkan (dibuang) — yang tersimpan selalu
  penyimpangan sungguhan.
- **UI**: panel "Izin Khusus" di halaman `/users` (per pengguna, tri-state
  "Ikuti peran (Boleh/Tidak)" / "Selalu boleh" / "Selalu tidak"). API
  `GET/PUT /api/users/[id]/permissions`, penjaga **`authz.manage`** (mengubah
  otorisasi = kewenangan /permissions, bukan sekadar `user.manage`; PUT =
  GANTI seluruh set; daftar kosong = ikuti peran). Setiap simpan **diaudit**
  (`user.authz.override.update`/`.reset`) beserta aktor + perannya.
- **Catatan**: mengganti PERAN pengguna tidak menghapus izin khususnya —
  baris lama ikut diterapkan di atas peran barunya (tampak di panelnya dan
  bisa dihapus dari sana). Validasi invarian dievaluasi saat MENULIS; seperti
  di #73, perubahan matriks peran belakangan tidak divalidasi ulang terhadap
  override pengguna yang sudah tersimpan.

### Modul per kategori usaha (issue #99) — lapisan yang memperkecil permukaan

- **Apa yang diputuskan**: fitur mana yang DIPAKAI perusahaan ini. Peta
  `RESOURCE_MODULE` (`src/lib/business-modules.ts`) memberi setiap **sumber daya
  izin** tepat satu modul (10 modul untuk 33 sumber daya). `Record` bertipe
  penuh atas `PermissionResource` ⇒ sumber daya izin baru tanpa modul **ditolak
  `tsc`**, sama seperti `RESOURCE_LABELS`.
- **Penyimpanan**: satu kolom `company_settings.enabled_modules` (migrasi 0034),
  dipisah koma, urut deklarasi. **NULL/kosong = SEMUA modul aktif** — tanpa
  backfill, tanpa perubahan perilaku untuk pemasangan yang sudah berjalan; modul
  yang ditambahkan ke kode belakangan pun ikut menyala sendiri.
  `business_category` hanya PRESET (nilai awal wizard), tak pernah dibaca saat
  menegakkan apa pun.
- **Urutan evaluasi** `canEffective` kini: **modul** → bawaan → override peran →
  override pengguna. Izin di modul non-aktif ditolak untuk SEMUA orang,
  termasuk peran berakses penuh. `effectivePermissionsFor` ikut menyaring, jadi
  menu, Aksi Cepat, dan tombol hilang tanpa satu pun halaman diubah.
- **Modul TIDAK PERNAH menggerbangi buku besar.** Jurnal yang lahir dari
  dokumen sebuah modul tetap ada, dan laporan tetap rekonsiliasi, setelah
  modulnya dimatikan. Mesin laporan/posting tak boleh punya JALUR IMPOR apa pun
  ke `business-modules.ts`/penjaga otorisasi — dijaga
  `tests/business-modules-ledger.test.ts`.
- **Izin ≠ modul.** Halaman diarahkan ke `/feature-inactive` ("fitur ini belum
  aktif untuk perusahaan Anda"), API menjawab 403 ber-`code: "module_inactive"`;
  penolakan peran tetap berbunyi seperti dulu. Baris override di DB tidak pernah
  disentuh, jadi menyalakan modul kembali **tidak memberi izin kepada siapa
  pun** — hanya membuat yang sudah dimiliki terjangkau lagi. `/permissions` dan
  panel "Izin Khusus" MENYEMBUNYIKAN baris modul non-aktif, tetapi tetap
  menyusun draft & payload dari daftar izin LENGKAP (kalau tidak, menyimpan akan
  menghapus override milik modul yang sedang mati).
- **Anti-lockout**: `core_accounting` (akun, jurnal, buku besar, laporan,
  anggaran, periode, audit, setup, pengaturan, pusat biaya, kamus, **`authz` &
  `user`**) tak bisa dimatikan. Ditegakkan di server —
  `validateEnabledModules` di route PUT modul MAUPUN di `POST /api/setup` —
  bukan sekadar checkbox yang di-`disabled`.
- **Cache**: TTL yang SAMA dengan matriks izin efektif + invalidasi eksplisit
  saat menulis (route modul & wizard). Gagal baca DB = semua modul aktif
  (fail-open, dicatat): modul menyusutkan permukaan, jadi gagal-tertutup akan
  melenyapkan aplikasi gara-gara DB yang sedang bermasalah.
- **UI**: langkah "Modul Usaha" di wizard penyiapan (preset kategori = nilai
  awal saja) dan kartu "Modul Usaha" di **/settings** — ber-gate
  `company_setting.manage`, karena modul menjawab "perusahaan ini bidangnya apa"
  (sekeluarga dengan profil & identitas pajak), bukan "siapa boleh apa".
  Keduanya memakai satu komponen `components/settings/module-picker.tsx`.
  API `GET/PUT /api/company-settings/modules`; setiap simpan diaudit
  (`company_setting.modules.update`, beserta keadaan sebelumnya).

## Lingkup TENANT (issue #135) — matriks kedua, penjaga kedua

Sejak epik multi-tenant (#133), izin punya DUA lingkup dan keduanya tidak
pernah bercampur:

| Lingkup | Matriks | Penjaga | Sumber jawaban |
|---|---|---|---|
| **Tenant** (`company.create`, `tenant.billing`, `tenant.member.invite`, `tenant.settings`) | `TENANT_PERMISSION_ROLES` di `src/lib/tenant-authz.ts` | `requireTenantApiPermission` / `requireTenantPagePermission` (`src/lib/tenant-guard.ts`) | `tenant_memberships` (owner/admin/member) di basis data kendali |
| **Perusahaan** (seluruh matriks di atas) | `PERMISSION_ROLES` di `src/lib/authz.ts` | `requireApiPermission` / `requirePagePermission` | `memberships` per-PT |

Aturannya: **izin tenant TIDAK BOLEH diperiksa penjaga perusahaan** — penjaga
perusahaan menuntut konteks perusahaan, dan ketiadaan konteks itu justru
keadaan yang SAH di lingkup tenant (pemilik tenant yang belum punya satu pun
PT sedang membuat yang pertama). Kedua himpunan kunci izin saling lepas, jadi
salah matriks ditolak `tsc`; halaman grup `(tenant)` dan route yang terdaftar
di `TENANT_API_ROUTES` dijaga `tests/authz-coverage.test.ts`.

Peran tenant: `owner` (semua, termasuk penagihan; yang terakhir tidak bisa
dihapus/diturunkan — `validateTenantMembershipChange`, teruji), `admin` (buat
perusahaan & undang, tanpa penagihan), `member` (tanpa izin tenant). Matriks
tenant TIDAK bisa di-override dari /permissions — perannya kontraktual.

## Empat lapisan penegakan

1. **Halaman** — `requirePagePermission("izin")` (`src/lib/page-auth.ts`). Tanpa sesi →
   `/login`; modul non-aktif → `/feature-inactive` (issue #99); tanpa izin → `/dashboard`. Izin di `ACCOUNTING_PERMISSIONS` otomatis
   berlapis **Mode Akuntan** (issue #11). Halaman client? Pecah: `page.tsx` server
   pemanggil penjaga + `<nama>-form.tsx` client (pola `journal/new`).
2. **API** — `requireApiPermission("izin")` (`src/lib/auth-guard.ts`). 401/403 (403
   ber-`code: "module_inactive"` bila yang menutup adalah modulnya, issue #99). Murni
   peran (Mode Akuntan = preferensi tampilan, bukan otorisasi). Cek yang lebih halus
   (mis. persetujuan: peran harus = `approverRole` aturan; aksi self-scoped) ditulis
   inline SETELAH penjaga izin — pelengkap, bukan pengganti.
3. **Proxy** (`src/proxy.ts` — Next 16: pengganti `middleware.ts`) — jaring pengaman
   AUTENTIKASI: verifikasi JWT + alur wajib-ganti-kata-sandi. Gerbang per-prefix
   dari matriks statis DIHAPUS di issue #73: matriksnya kini bisa di-override DB,
   dan salinan bawaan di proxy akan memblokir izin yang justru DIHADIAHKAN
   override (cache efektif + invalidasinya tak terlihat dari proxy — dokumen Next
   melarang proxy mengandalkan modul/global bersama). Route dashboard =
   authenticated-only di lapisan ini; penegakan izin sepenuhnya lapisan 1–2, dan
   `tests/authz-coverage.test.ts` membuktikan setiap halaman/route memanggil
   penjaganya.
4. **Tampilan** — menu (`nav.ts`), Aksi Cepat, tombol (pakai `can()`) — TAMPILAN SAJA,
   tidak pernah dianggap pengamanan.

**Cakupan dipaksa tes** (`tests/authz-coverage.test.ts`): setiap `page.tsx` dashboard
dan `route.ts` API wajib memanggil penjaganya — file tanpa deklarasi izin = tes merah.
Pengecualian eksplisit + alasannya ada di file tes itu (beranda, NextAuth, endpoint
self-scoped, health).

## Sesi & pencabutan (fase 3)

Peran hidup di JWT (24 jam) + `users.session_version` (migrasi 0028). Callback `jwt`
merevalidasi ke DB tiap ≥60 dtk (`src/lib/session-guard.ts`): baris hilang / versi
beda / token tanpa versi → **sesi dicabut**; selainnya peran/status disalin ulang
(perubahan peran terasa ≤60 dtk). Ganti peran & reset kata sandi oleh admin menaikkan
versi; hapus pengguna mencabut otomatis.

## Audit

`writeAuditLog` mencatat aktor **beserta perannya saat beraksi**. Mutasi manajemen
pengguna (`user.create/update/delete`) wajib diaudit — detail `roleFrom→roleTo` /
`resetPassword`; nilai kata sandi tidak pernah dicatat. Catatan audit LAMA menyimpan
nama peran yang berlaku saat aksi itu terjadi (`bos`/`core`/`ptg`) dan sengaja TIDAK
ditulis ulang oleh migration 0032 — jejak sejarah tidak dipalsukan.

## Checklist fitur baru

- [ ] Tambah baris izin di `PERMISSION_ROLES` (bukan daftar peran lokal).
- [ ] Sumber daya izin BARU? Beri modulnya di `RESOURCE_MODULE`
      (`src/lib/business-modules.ts`) — `tsc` menolak yang belum diberi.
- [ ] Halaman: `requirePagePermission`; API: `requireApiPermission`; tampilan: `can()`.
- [ ] Halaman client dipecah server-wrapper + form.
- [ ] Butuh pengecualian cakupan? Daftarkan di `tests/authz-coverage.test.ts` + alasan.
- [ ] `bunx vitest run tests/authz.test.ts tests/authz-coverage.test.ts` hijau.
