# RBAC — Otorisasi Berbasis Izin (WAJIB untuk halaman/route baru)

> Hasil refactor audit RBAC 2026-07 (PR #70, #71, dst). Satu sumber kebenaran:
> **`src/lib/authz.ts`**. Kode tidak pernah bertanya "perannya bos atau core?" —
> kode bertanya **"punya izin `resource.action`?"**
> Sejak issue #73 matriks di kode adalah **BAWAAN (baseline)**; matriks
> **EFEKTIF** = bawaan + override DB yang dikelola dari halaman `/permissions`
> (lihat § Konfigurasi runtime).

## Peran

Tiga peran statis di kode (`src/lib/constants.ts` — `ROLES`, `ROLE_VALUES`, `roleEnum`
di `validations/common.ts` untuk zod):

| Peran | Label | Ringkas |
|-------|-------|---------|
| `bos` | Pimpinan | Memegang SEMUA izin |
| `core` | Staf Kantor | Dokumen harian baca+tulis; TANPA hapus master, laporan, akuntansi, administrasi |
| `ptg` | Bagian Gudang | Stok saja + halaman bersama (persetujuan, kamus, pengaturan) |

Menambah peran = tambah di `ROLES`, lalu `tsc` memandu ke semua `Record` yang wajib diisi.

## Matriks izin

`PERMISSION_ROLES` di `src/lib/authz.ts`: `"<resource>.<action>"` → daftar peran.
Aksi baku: `read` · `write` · `delete` · `manage` · view/decide/export untuk kasus khusus.
Invarian dijaga `tests/authz.test.ts`: bos memegang semua; hapus master = bos-only
(kecuali `advance.delete`, terdokumentasi); **`delete ⊆ write ⊆ read`** — aksi lebih
berbahaya tak pernah lebih longgar; `can()` deny-by-default (peran tak dikenal ditolak).

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
  Indonesia): bos tidak pernah bisa kehilangan `authz.manage` & `user.manage`
  (`PROTECTED_CELLS`); `delete ⊆ write ⊆ read` wajib tetap berlaku pada matriks
  EFEKTIF hasil usulan; sel kembar/peran asing ditolak.
- **UI**: halaman `/permissions` ("Hak Akses", grup Bantuan & Pengaturan),
  penjaga `authz.manage` (bawaan: bos). API `GET/PUT /api/authz/overrides`
  (PUT = GANTI seluruh set; daftar kosong = reset). Setiap simpan **diaudit**
  (`authz.override.update`/`.reset`) beserta aktor + perannya.
- **Tampilan ikut efektif**: sidebar memuat set izin efektif dari
  `GET /api/user/permissions` (self-scoped, tampilan saja); `nav.ts` &
  `quick-actions.ts` kini mendeklarasikan **izin** per item (bukan daftar
  peran) dan menerima set efektif; keputusan server component (beranda,
  tombol hapus detail, panel audit Pengaturan) membaca loader efektif.

## Empat lapisan penegakan

1. **Halaman** — `requirePagePermission("izin")` (`src/lib/page-auth.ts`). Tanpa sesi →
   `/login`; tanpa izin → `/dashboard`. Izin di `ACCOUNTING_PERMISSIONS` otomatis
   berlapis **Mode Akuntan** (issue #11). Halaman client? Pecah: `page.tsx` server
   pemanggil penjaga + `<nama>-form.tsx` client (pola `journal/new`).
2. **API** — `requireApiPermission("izin")` (`src/lib/auth-guard.ts`). 401/403. Murni
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
`resetPassword`; nilai kata sandi tidak pernah dicatat.

## Checklist fitur baru

- [ ] Tambah baris izin di `PERMISSION_ROLES` (bukan daftar peran lokal).
- [ ] Halaman: `requirePagePermission`; API: `requireApiPermission`; tampilan: `can()`.
- [ ] Halaman client dipecah server-wrapper + form.
- [ ] Butuh pengecualian cakupan? Daftarkan di `tests/authz-coverage.test.ts` + alasan.
- [ ] `npx vitest run tests/authz.test.ts tests/authz-coverage.test.ts` hijau.
