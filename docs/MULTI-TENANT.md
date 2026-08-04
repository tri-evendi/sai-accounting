# Multi-tenant: dari multi-PT menjadi platform SaaS

Issue #133 (epik). Lanjutan dari #104, yang membangun multi-PT untuk **satu grup
usaha**; dokumen ini merancang apa yang berubah bila pelanggannya tidak lagi
saling kenal dan mendaftar sendiri.

> **STATUS: SEDANG DIKERJAKAN.** Tahap 1–3 (§12) sudah diimplementasikan:
> #134 skema `tenants`+`tenant_memberships` di `sai_control` beserta jalur
> adopsi (`adopt-tenant` → `prove-tenant` → migration NOT NULL), #135 pemisahan
> izin tenant vs perusahaan (`lib/tenant-authz.ts` + `requireTenantPermission`),
> #136 email sebagai pengenal login + mailer + atur-ulang kata sandi mandiri,
> #137 basis data `sai_platform` terpisah, #138 pendaftaran mandiri /register
> (verifikasi email sebagai gerbang penyediaan, kuota `max_companies` di
> server, pembatas laju persisten di basis data kendali), #139 undangan staf,
> #140 langganan/suspensi, #142 kepatuhan & siklus hidup akun (ekspor mandiri,
> jalur penghapusan ber-gerbang retensi, jejak audit tenant, S&K ber-versi —
> lihat [`COMPLIANCE.md`](./COMPLIANCE.md), termasuk KEPUTUSAN TERBUKA tempat
> penyimpanan). Tahap #141 (penagihan gateway) menyusul. Keadaan multi-PT yang
> berlaku tetap di [`MULTI-COMPANY.md`](./MULTI-COMPANY.md).

---

## 1. Ringkasan

Perjalanan yang dituju:

> **pelanggan** mendaftar → menyiapkan perusahaannya (bisa lebih dari satu) →
> mendaftarkan stafnya → berlangganan.

Bentuk itu lazim. Yang menghalanginya hari ini bukan layar yang belum dibuat,
melainkan **satu izin yang ruang lingkupnya salah** (§4.2). Sisanya — surel,
penagihan, kuota — adalah pekerjaan tambahan yang jujur, bukan penghalang.

Dokumen ini panjang dengan sengaja. Perubahan ini menyentuh autentikasi,
otorisasi, dan penyediaan basis data sekaligus; hal-hal yang tidak ditulis di
depan akan ditemukan di produksi.

---

## 2. Dua istilah yang harus dibedakan sejak awal

Kebingungan terbesar di dokumen-dokumen sebelumnya lahir dari satu kata yang
dipakai untuk dua hal.

| Istilah | Artinya di sini | Hidup di |
|---|---|---|
| **Tenant** (pelanggan) | Pihak yang berlangganan & membayar. Satu badan usaha/orang yang memakai platform. | tabel `tenants`, basis data kendali |
| **Company** (PT) | Satu buku besar. Satu tenant boleh punya beberapa. | tabel `companies` + **satu basis data sendiri** |
| **User** (orang) | Manusia yang masuk. Bisa jadi anggota beberapa company, di dalam satu tenant. | tabel `users`, basis data kendali |

Aturan yang menyusul dari tabel itu, dan yang harus dipegang di seluruh kode:

> **Company selalu milik TEPAT SATU tenant. User selalu milik TEPAT SATU
> tenant.** Tidak ada user yang menyeberang antar-tenant.

Menyeberang terdengar ramah ("akuntan saya melayani dua klien!") dan
menghancurkan seluruh model isolasi: satu akun yang hidup di dua tenant membuat
pencabutan akses, penagihan, dan penghapusan data tidak punya jawaban tunggal.
Bila kebutuhan itu nyata, jawabannya akun terpisah per tenant — sama seperti
Xero dan QuickBooks.

---

## 3. Bentuknya

```
  SEKARANG                             DITUJU
  ────────                             ──────
  (tidak ada)                          Tenant ── langganan, kuota, penagihan
                                          │
  Company ─< Membership >─ User           ├─< TenantMembership >─ User
     │                                    │        (owner / admin / member)
     └─ basis data sendiri                │
                                          ├─ Company ─< Membership >─ User
                                          │     └─ basis data sendiri   (peran per-PT)
                                          └─ Company
                                                └─ basis data sendiri
```

Dua tingkat keanggotaan, dan keduanya perlu:

- **`TenantMembership`** menjawab "boleh membuat perusahaan? boleh mengubah
  paket? boleh mengundang orang?" — pertanyaan yang harus bisa dijawab
  **tanpa perusahaan aktif**, karena pelanggan baru belum punya satu pun.
- **`Membership`** (sudah ada) menjawab "boleh menulis faktur di PT ini?" —
  tidak berubah sama sekali.

---

## 4. Yang menghalangi hari ini

Semuanya diperiksa langsung di kode, bukan diduga.

### 4.1 Tidak ada pendaftaran, tidak ada email, tidak ada pengirim surel

`src/proxy.ts` hanya melepas `/login`, `/api/health`, `/api/auth/*`. Tidak ada
`/register`.

`User` **tidak punya kolom email** — `session.user.email` hanyalah username
yang dialiaskan (`src/lib/auth.ts:83`). Dan tidak ada satu pun pustaka
pengirim surel di `package.json`. Verifikasi, undangan, atur-ulang kata sandi,
dan pemberitahuan penagihan semuanya bergantung pada infrastruktur yang belum
ada.

### 4.2 Penghalang utama: `company.create` dilingkup PERUSAHAAN

`src/lib/authz.ts:150` menaruh `"company.create"` di matriks izin **per
perusahaan**, dan `requireApiPermission` menuntut konteks perusahaan.

> **Untuk membuat perusahaan Anda perlu keanggotaan; untuk punya keanggotaan
> Anda perlu perusahaan.**

Pelanggan baru tidak punya keduanya. `/select-company` sudah mencatat
kejanggalan ini di komentarnya sendiri: tautan "Tambah Perusahaan" baru muncul
setelah ada perusahaan aktif, "sebab izin adalah milik keanggotaan di satu
perusahaan, bukan milik akun".

Gejala sampingannya di `src/app/api/companies/route.ts:70` — `role:
session.user.role!`, dan tanda seru itu bohong untuk pelanggan yang belum
memegang peran apa pun.

**Inilah satu perubahan yang membuka seluruh perjalanan.**

### 4.3 Username unik se-pemasangan

`findUserByUsername` mencari ke seluruh pemasangan
(`src/lib/users-directory.ts:137`). Pelanggan B tidak bisa membuat pengguna
`budi` hanya karena Pelanggan A sudah punya.

### 4.4 Kebocoran enumerasi lintas pelanggan

`src/app/api/users/route.ts:79-86` menjawab 409 dengan
`{ code: "username_taken", userId: existing.id }` — **beserta id global orang
itu** — kepada pemegang akses penuh perusahaan mana pun.

### 4.5 Janji "satu login banyak PT" belum punya UI

`addExistingUserToCompany` (`src/lib/users-directory.ts:195`) sudah ditulis dan
benar. **Tidak ada satu pun pemanggilnya.**

### 4.6 Pembatas laju hanya di memori

`src/lib/rate-limit.ts` menyimpan hitungannya di `Map` tingkat modul. Ia hilang
saat proses dimulai ulang dan tidak dibagi antar-instance. Untuk `/login`
internal itu masih bisa diterima; untuk `/register` dan atur-ulang kata sandi
yang **terbuka ke internet**, tidak.

### 4.7 Jejak audit tidak punya tingkat tenant

`writeAuditLog` menulis ke `data/audit/<slug>/audit.jsonl` — jejak milik sebuah
**perusahaan**. Peristiwa tingkat tenant (pendaftaran, ganti paket, pembuatan
perusahaan PERTAMA) tidak punya tempat sama sekali. `api/companies/route.ts`
hari ini menyiasatinya dengan menulis ke jejak perusahaan yang sedang dibuka
pembuatnya — yang untuk pelanggan baru belum ada.

### 4.8 Tidak ada penjadwal

Tidak ada cron/queue di `package.json`. Trial yang berakhir, penagihan ulang,
pengingat, dan percobaan ulang penyediaan yang gagal semuanya menuntutnya.

---

## 4A. Pemisahan basis data: tiga lapis, bukan dua

Data bisnis SaaS **tidak boleh** bercampur dengan data pelanggan. Tetapi garis
pemisahnya harus ditarik di tempat yang benar, dan yang menentukan tempatnya
adalah satu batasan keras yang sudah dikenal kode ini:

> **Foreign key tidak bisa menyeberangi basis data, dan transaksi juga tidak.**

Aturan itu sudah berlaku hari ini — `docs/MULTI-COMPANY.md` melarang FK dari
basis data perusahaan ke `users`, dan `periods.closed_by_id` karena itu hanya
menyimpan id global tanpa FK. Setiap garis pemisah baru membeli isolasi dengan
harga yang sama.

### Yang diusulkan

| Lapis | Basis data | Isinya | Disentuh |
|---|---|---|---|
| **Platform** | `sai_platform` | `plans`, `subscriptions`, `payments`, `platform_invoices`, `usage_counters` — **bisnis KAMI** | jarang: pendaftaran, siklus tagih, webhook pembayaran |
| **Kendali** | `sai_control` | `tenants`, `users`, `tenant_memberships`, `companies` (registry), `memberships` — **identitas & perutean** | **setiap permintaan** |
| **Perusahaan** | `sai_pt_*` | jurnal, faktur, stok, kas — **buku pelanggan** | setiap permintaan yang menyentuh buku |

### Kenapa `tenants` tinggal di KENDALI, bukan di platform

Ini bagian yang mudah salah, jadi ditulis alasannya.

`tenants` dibaca di **jalur panas**: pengguna ini tenant mana → perusahaan apa
saja yang boleh ia lihat → apakah tenantnya `suspended` (hanya-baca). Kalau ia
duduk di basis data lain, setiap pemuatan halaman menambah satu lompatan
lintas-basis-data, dan `TenantMembership → User` kehilangan FK-nya.

Lebih menentukan lagi: **pendaftaran harus atomik.** `Tenant` + `User`(owner) +
`TenantMembership` lahir bersamaan; kalau `Tenant` ada di basis data lain,
ketiganya tidak bisa satu transaksi, dan kegagalan di tengah meninggalkan akun
tanpa tenant — persis keadaan yang tak punya jalan pulang.

Karena itu garisnya ditarik di **penagihan**, bukan di tenant.

### Yang dibeli oleh pemisahan itu

- **Radius ledakan.** Migration atau bug penagihan tidak boleh mengancam tabel
  yang mengautentikasi semua orang. Penagihan mati = orang tetap bisa masuk dan
  bekerja.
- **Retensi & cadangan berbeda.** Catatan pembayaran punya kewajiban simpannya
  sendiri, lepas dari buku pelanggan.
- **Hak akses berbeda.** Pengguna basis data aplikasi tidak perlu menyentuh
  `sai_platform` sama sekali di jalur permintaan biasa.

### Harganya, dan cara membayarnya

`subscriptions` merujuk `tenants` **tanpa FK** — id biasa, persis pola
`periods.closed_by_id`. Konsistensinya pindah ke lapisan aplikasi, dan yang
menegakkannya adalah **urutan**, bukan transaksi:

> Tulis di `sai_platform` DULU, baru tandai di `sai_control`.

Pola ini sudah dipakai dan terbukti di `provisionCompany`: basis data dibuat →
migration diterapkan → **registry ditulis paling akhir**, supaya kegagalan di
tengah tidak meninggalkan perusahaan yang bisa dipilih tapi belum bisa dibuka.
Kegagalan langganan harus meninggalkan jejak yang sama arahnya: lebih baik
pembayaran tercatat tanpa tenant yang naik kelas (bisa direkonsiliasi) daripada
tenant naik kelas tanpa pembayaran (tidak akan pernah ketahuan).

Perlu satu **pekerjaan rekonsiliasi** yang membandingkan keduanya secara
berkala — dan itu salah satu alasan §4.8 (penjadwal) ada di daftar.

### Yang TIDAK berubah

Buku besar pelanggan tetap satu basis data per PT. Tidak ada satu pun tabel
platform yang masuk ke sana, dan tidak ada satu pun angka akuntansi yang keluar
darinya.

---

## 5. Model data

Tambahan di **basis data kendali** (`sai_control`) — bukan di basis data
perusahaan, dan bukan pula di `sai_platform` (alasannya §4A).

```prisma
model Tenant {
  id        Int    @id @default(autoincrement())
  slug      String @unique @db.VarChar(50)
  name      String @db.VarChar(150)

  /// pending_verification | trialing | active | past_due | suspended | cancelled
  /// String + z.enum, snake_case — konvensi docs/DATABASE.md, bukan enum Prisma.
  status    String @default("pending_verification") @db.VarChar(30)

  planKey   String @default("trial") @map("plan_key") @db.VarChar(30)
  trialEndsAt DateTime? @map("trial_ends_at")

  /// Batas dari paket, DISALIN saat paket berubah — bukan dibaca dari tabel
  /// paket saat dipakai. Alasannya sama dengan snapshot peran penyetuju di
  /// aturan persetujuan: menaikkan harga paket tidak boleh diam-diam
  /// mempersempit pelanggan yang sudah berjalan.
  maxCompanies Int @default(1) @map("max_companies")
  maxUsers     Int @default(3) @map("max_users")

  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  companies   Company[]
  memberships TenantMembership[]

  @@index([status])
  @@map("tenants")
}

model TenantMembership {
  id       Int    @id @default(autoincrement())
  tenantId Int    @map("tenant_id")
  userId   Int    @map("user_id")
  /// owner | admin | member. BUKAN peran akuntansi — itu milik `memberships`.
  role     String @db.VarChar(20)

  @@unique([tenantId, userId])
  @@map("tenant_memberships")
}
```

Perubahan pada tabel yang sudah ada:

| Tabel | Perubahan | Catatan |
|---|---|---|
| `companies` | `+ tenant_id` (FK) | nullable dulu, NOT NULL setelah migrasi §8 terbukti |
| `users` | `+ email` (unik), `+ email_verified_at`, `+ tenant_id` | `username` berhenti unik-global |
| `users` | `+ invited_by_user_id`, `+ invite_accepted_at` | alur undangan §7.2 |

Tabel baru pendukung **di `sai_control`**: `email_verification_tokens`,
`password_reset_tokens`, `invitations`.

Tabel **di `sai_platform`** (basis data terpisah, §4A): `plans`,
`subscriptions`, `payments`, `platform_invoices` (tagihan KAMI ke pelanggan —
sengaja dinamai berbeda dari `invoices` milik buku besar pelanggan),
`usage_counters`. Semuanya merujuk `tenant_id` sebagai **Int biasa tanpa FK**,
persis pola `periods.closed_by_id`.

Konsekuensi yang harus diikuti kode: satu generator Prisma lagi
(`prisma/platform/schema.prisma` → `src/generated/platform`), satu
`PLATFORM_DATABASE_URL`, dan satu perintah migration lagi di `db:migrate:all`.

**Sesuai `docs/DATABASE.md`:** Inggris · `snake_case` via `@map` · tabel jamak ·
`id` + `created_at` + `updated_at` di setiap tabel · uang `Decimal(15,2)` ·
enum-like = `String @db.VarChar` + `z.enum`.

---

## 6. Pemisahan izin: platform vs perusahaan

Inti pekerjaannya. Matriks izin hari ini punya SATU lingkup; ia perlu DUA.

| Lingkup | Contoh | Dijawab | Penjaga |
|---|---|---|---|
| **Tenant** | `tenant.home`, `company.create`, `tenant.billing`, `tenant.member.invite`, `tenant.settings` | `TenantMembership` | `requireTenantPermission` (**baru**) |
| **Perusahaan** | seluruh matriks sekarang (`invoice.write`, `report.read`, …) | `Membership` | `requireApiPermission` / `requirePagePermission` (tidak berubah) |

> **Aturan: izin tingkat tenant TIDAK BOLEH diperiksa penjaga perusahaan.**

Penjaga yang ada menuntut konteks perusahaan, dan justru **ketiadaan konteks itu
adalah keadaan yang sah** saat pelanggan baru membuat perusahaan pertamanya.
Memaksakannya lewat penjaga lama hanya akan melahirkan pengecualian diam-diam
yang menggerogoti jaminan #104.

`tests/authz-coverage.test.ts` **wajib diperluas**: setiap rute bertingkat tenant
harus mendeklarasikan penjaganya, persis seperti rute perusahaan hari ini. Tanpa
itu, permukaan tenant lahir tanpa pagar — dan permukaan tenant adalah tempat
penagihan tinggal.

Peran tenant bawaan:

| Peran | Boleh |
|---|---|
| `owner` | semuanya, termasuk penagihan & penghapusan tenant. Minimal satu, tidak bisa dihapus terakhir (anti-lockout, pola sama dengan peran sistem) |
| `admin` | buat perusahaan, undang orang. **Tidak** menyentuh penagihan |
| `member` | hanya `tenant.home` — membuka halaman akun `/platform`, tempat ia melihat perusahaan yang boleh dibukanya (issue #172). Selebihnya aksesnya murni dari `Membership` per-PT |

---

## 7. Perjalanan, langkah demi langkah

### 7.1 Pelanggan baru mendaftar sendiri

| # | Langkah | Keadaan tenant | Catatan |
|---|---|---|---|
| 1 | `/register` — nama, email, kata sandi, setuju S&K | — | rute publik; butuh pembatas laju persisten (§4.6) |
| 2 | Surel verifikasi terkirim | `pending_verification` | **belum ada basis data dibuat** |
| 3 | Klik tautan verifikasi | `trialing` | `Tenant` + `User`(owner) + `TenantMembership(owner)` |
| 4 | Layar "buat perusahaan pertama" | `trialing` | BUKAN `/select-company` — belum ada apa pun untuk dipilih |
| 5 | `/companies/new` → aliran penyediaan | `trialing` | kuota `maxCompanies` dicek di sini |
| 6 | Wizard `/setup` (6 langkah) | `trialing` | tidak berubah |
| 7 | `/setup/done` → beranda "Langkah Pertama" | `trialing` | tidak berubah |

**Langkah 2 adalah gerbangnya, dan itu disengaja.** Lihat §9: penyediaan basis
data tidak boleh terjangkau permintaan anonim.

### 7.2 Staf diundang — bukan dibuatkan kata sandi

Perbedaan penting dari hari ini: admin **berhenti mengetikkan kata sandi orang
lain**. Kata sandi yang diketik admin lalu dikirim lewat WhatsApp adalah kata
sandi yang bocor sebelum dipakai.

| # | Langkah |
|---|---|
| 1 | Owner/admin → `/users` → undang: **email** + peran di PT ini |
| 2 | Kuota `maxUsers` dicek |
| 3 | Surel undangan berisi token berbatas waktu |
| 4 | Penerima klik → **menentukan kata sandinya sendiri** |
| 5 | `User` + `Membership` dibuat; `mustChangePassword` tidak lagi perlu |

### 7.3 Orang yang sudah ada, ditambahkan ke PT kedua

Ini yang memperbaiki §4.4 **dan** §4.5 sekaligus.

Undangan dikirim ke sebuah email. Sistem **menjawab identik** apa pun
kenyataannya — "undangan sudah dikirim" — dan isi SURELnya yang berbeda:

- email sudah punya akun **di tenant ini** → "Anda ditambahkan ke PT B, klik
  untuk membuka" (tanpa membuat akun baru; `addExistingUserToCompany`);
- belum punya → "buat kata sandi Anda".

Penuntutnya bukan kerapian, melainkan §4.4: jawaban yang berbeda **adalah**
kebocoran enumerasinya.

### 7.4 Langganan

```
trialing ──(bayar)──> active ──(gagal bayar)──> past_due ──(masa tenggang habis)──> suspended
    │                    ↑                          │
    └──(trial habis)─────┘                          └──(bayar)──> active
                                                          
suspended ──(berhenti)──> cancelled          [buku besar TIDAK PERNAH dihapus otomatis]

trialing/active/past_due ──(operator_suspend)──> suspended     [manual, issue #155]
suspended ──(operator_restore)──> active                       [manual, issue #155]
```

Dua perpindahan terakhir adalah tindakan MANUAL operator di luar siklus
dunning (permintaan pelanggan, penyalahgunaan) — tetap lewat mesin siklus
hidup, wajib beralasan, dan tercatat di jejak audit tenant dengan operator
sebagai aktornya.

**`suspended` berarti HANYA-BACA, bukan terkunci dan bukan terhapus.** Ini
bukan kemurahan hati, melainkan keharusan: pelanggan yang berhenti membayar
tetap wajib menyimpan pembukuannya (§10) dan tetap harus bisa mengunduhnya.
Mengunci buku besar seseorang karena tagihan tertunggak berarti menghalangi
kewajiban hukumnya.

### 7.4-IP Daftar IP operator dan proxy di depannya (issue #154/#162)

`OPERATOR_IP_ALLOWLIST` adalah lapisan **terluar** konsol operator — di
belakangnya masih ada hostname operator sendiri, bcrypt, dan TOTP wajib. Ia
gagal-tertutup: kosong/tidak diset menolak **semua orang**; `*` (khusus
pengembangan lokal) mengizinkan semua.

Alamat klien yang dibandingkan dengan daftar itu dibaca dari
`x-forwarded-for`, dan **header itu bertambah dari kiri ke kanan**: setiap
proxy menambahkan alamat lawan bicaranya di ujung kanan. Karena itu entri
paling kiri bukan "IP klien" melainkan *apa pun yang mula-mula ada di header*
— termasuk yang diketik klien sendiri.

Aplikasi mengambil **entri ke-N dari kanan**, dengan
N = `OPERATOR_TRUSTED_PROXY_HOPS` (bawaan **1**):

| Susunan | `OPERATOR_TRUSTED_PROXY_HOPS` | Yang dibaca |
| --- | --- | --- |
| klien → Traefik → app (sekarang) | `1` (bawaan) | entri paling kanan — satu-satunya yang ditulis Traefik |
| klien → CDN → Traefik → app | `2` | entri kedua dari kanan — alamat klien menurut CDN |

**Ini ketergantungan pada konfigurasi Traefik, dan ia sunyi.** Selama
`forwardedHeaders.trustedIPs` kosong, Traefik **menimpa** `x-forwarded-for`
kiriman klien, jadi hanya ada satu entri. Begitu `trustedIPs` diisi — persis
yang dilakukan orang saat menaruh Cloudflare atau load-balancer kedua di depan
— Traefik mulai **mempertahankan** header kiriman klien. Sebelum #162 aplikasi
membaca entri pertama, dan sejak detik itu daftar IP operator bisa dilewati
hanya dengan mengirim `X-Forwarded-For: <ip-yang-diizinkan>`. Perubahannya
terjadi di berkas infrastruktur, jauh dari kode ini, dan **tidak ada tes yang
akan berubah warna**.

Karena itu yang diperbaiki bukan konfigurasinya melainkan cara membacanya:
menghitung dari kanan membuat sampah yang disisipkan klien di depan tidak
pernah terbaca, berapa pun banyaknya. Asumsinya kini hidup sebagai tes
(`tests/operator-plane.test.ts`), bukan komentar, dan peringatannya juga
ditulis di `docker-compose.yml` tepat di sebelah label Traefik — tempat orang
yang menambahkan `trustedIPs` benar-benar bekerja.

Dua sifat yang menyertainya:

- **Rantai lebih pendek dari `hops` → ditolak, bukan ditebak.** Itu berarti
  permintaan tidak melewati jalur yang kita kira (mis. menembus langsung ke
  Traefik, melewati CDN).
- **`x-real-ip` hanya dipakai bila `x-forwarded-for` tidak ada sama sekali,
  dan hanya saat `hops` = 1.** Dengan proxy berlapis, `x-real-ip` berisi
  alamat proxy sebelumnya — memakainya berarti membandingkan daftar IP
  operator dengan IP milik CDN.

### 7.4a Tindakan TULIS konsol operator (issue #155)

Konsol operator (#154) mula-mula hanya membaca — dan itu bisa dirilis tanpa
risiko. Tindakan tulisnya tidak: setiap tombol memindahkan uang, mencabut
akses, atau menghancurkan data. Karena itu keempatnya tunduk pada empat aturan
yang sama, ditegakkan di INTI (`src/lib/operator/writes.ts`), bukan
diserahkan ke pemanggil:

1. **satu baris jejak audit tenant per tindakan sukses**, dengan OPERATOR
   sebagai aktor (`operator:<nama>` dari sesi konsol, `cli:<user>` dari skrip)
   — bukan atas nama pengguna pelanggan;
2. **alasan yang diketik operator WAJIB** (minimal 5 karakter) dan tersimpan
   apa adanya di jejak — tindakan tanpa alasan tidak bisa ditinjau ulang;
3. **urutan tulis §4A**: `sai_platform` DULU, `sai_control` BELAKANGAN;
4. **cache status tenant dijatuhkan** (`invalidateTenantState()`) oleh server
   action begitu tindakannya berhasil — suspensi terasa SEKETIKA, bukan
   setelah TTL 60 detik.

Keempat tindakannya:

| Tindakan | Inti | Catatan |
| --- | --- | --- |
| Tandai tagihan lunas (transfer manual) | `recordManualPayment` | `PAYMENT_GATEWAY=manual` adalah BAWAAN; sebelum #155 pelunasan dilakukan `UPDATE` SQL langsung di produksi. Memakai `processPaymentNotification` yang SAMA dengan webhook — satu jalur transisi status, bukan dua yang menyimpang. Referensi bank menjadi `gateway_ref` yang UNIQUE: transfer yang sama tidak bisa tercatat dua kali, juga saat operator & penjadwal bergerak bersamaan (P2002 → duplikat, bukan pembayaran kedua). |
| Ganti paket | `changeTenantPlan` | Menggantikan `bun run change-plan`; skripnya kini pembungkus tipis atas inti yang sama. Kuota baru yang lebih kecil dari pemakaian nyata adalah **peringatan, bukan penghalang** — turun paket keputusan yang sah — dan konsekuensinya ikut tercatat di jejak. Tenant `suspended` **tidak** dipulihkan oleh ganti paket: pemulihan keputusan terpisah dengan alasannya sendiri. |
| Tangguhkan / pulihkan | `setTenantSuspension` | Lewat mesin siklus hidup (`operator_suspend` / `operator_restore`), bukan `UPDATE` status langsung. Layar menyatakan gamblang: `suspended` = HANYA-BACA, bukan terkunci dan bukan terhapus. |
| Eksekusi penghapusan | `executeTenantDeletion` | Hanya atas permintaan `pending` yang masa tenggangnya SUDAH lewat (§10). Konfirmasi dengan **mengetik ulang slug tenant**, bukan "Ya". Layar menyebut apa yang TIDAK dihapus dan kenapa. Gerbang kedua (`--drop-ledgers`) sengaja TIDAK diberi tombol konsol. |

Skrip CLI-nya **tetap ada** sebagai jalur pemulihan saat konsolnya sendiri
tidak bisa dibuka (host salah konfigurasi, IP belum di-allowlist, Next mati) —
tetapi kini pembungkus tipis atas inti yang sama, dan `--reason` wajib di sana
persis seperti di konsol.

### 7.5 Berhenti dan menghapus akun

Lihat §10 — ini bukan sekadar `DELETE`, dan tidak boleh dirancang seperti itu.

---

## 8. Migrasi pemasangan yang sudah berjalan

Keputusan: **`pt-sai` dimasukkan ke dalam satu `Tenant`**, bukan dibiarkan
tanpa tenant. Bila tenant hanya berlaku untuk pendaftar baru, setiap penjaga
harus selamanya menangani keadaan "tanpa tenant" — dan cabang yang jarang
dilewati adalah cabang yang jarang diuji.

Urutannya, dan **urutannya tidak boleh ditukar**:

1. Migration kendali: tabel & kolom baru, semuanya **nullable**.
2. Skrip adopsi: buat satu `Tenant`, tautkan `pt-sai` dan seluruh penggunanya,
   lalu **isi email tiap pengguna**. Inilah langkah yang tidak bisa ditebak
   mesin — datanya harus disiapkan manusia lebih dulu.
3. **Buktikan**: setiap `companies.tenant_id` dan `users.email` terisi, dan
   tidak ada email kembar.
4. Baru jadikan NOT NULL + unik.
5. Baru penjaga tingkat tenant boleh mengandalkan keberadaannya.

Pelajaran migrasi #104 berlaku penuh: **cadangkan dulu, jalankan di salinan
lebih dulu.** Gladi resik #104 menemukan dua hal yang tidak terlihat dari
membaca kode — hak akses yang kurang (`P1010`) dan skrip yang menyebut kolom
yang belum ada.

---

## 9. Ongkos yang berubah di bawah pendaftaran mandiri

Isolasi fisik adalah hal terbaik dalam arsitektur ini dan **tidak dikorbankan**:
kebocoran buku besar lintas pelanggan menjadi tidak mungkin, bukan sekadar tidak
terjadi.

Tetapi pendaftaran mandiri mengubah kurva ongkosnya. Hari ini perusahaan lahir
sesekali, oleh operator, dengan sengaja. Dengan `/register`, **siapa pun bisa
membuat sebuah basis data**, dan `db:migrate:all` menyusuri semuanya pada setiap
penerapan.

| Jumlah PT | Keadaan |
|---|---|
| puluhan | wajar, seperti sekarang |
| ratusan | `db:migrate:all` jadi lambat; butuh paralel + laporan per-PT |
| ribuan | masalah operasional dominan; pool koneksi & waktu penerapan jadi penentu |

Yang wajib ada sejak awal, bukan nanti:

- **Verifikasi email sebelum penyediaan** — penyediaan tak terjangkau anonim.
- **Kuota `maxCompanies` per tenant**, diperiksa di server.
- **Pembatas laju persisten** di `/register` (§4.6).
- **Peninjauan `DB_CONNECTION_LIMIT` + pool/LRU klien** — kendala yang sudah
  disebut #104 dan yang skalanya berubah di sini.

---

## 10. Kepatuhan Indonesia — dan kenapa "hapus akun" tidak sesederhana kelihatannya

> ⚠️ Bagian ini **harus dikonfirmasi ke penasihat hukum/pajak** sebelum
> dijadikan janji ke pelanggan. Ditulis di sini karena ia mengubah RANCANGAN,
> bukan sekadar syarat & ketentuan.

**Retensi wajib.** UU KUP menuntut buku, catatan, dan dokumen yang menjadi dasar
pembukuan disimpan **10 tahun** — termasuk yang dikelola secara elektronik.
Akibatnya untuk rancangan kita: **berhenti berlangganan tidak boleh menghapus
buku besar.** Yang benar: `suspended` (hanya-baca) → ekspor → penghapusan hanya
atas permintaan eksplisit dan setelah masa retensi, dengan pelanggan
diberitahu apa yang ia tanggung.

**Tempat penyimpanan.** Ketentuan yang sama menyebut penyimpanan **di
Indonesia**. Bila benar berlaku untuk SaaS pembukuan, itu menentukan pilihan
hosting — dan itu keputusan yang jauh lebih mahal diubah belakangan daripada
diputuskan sekarang.

**UU PDP (No. 27/2022).** Data pribadi menuntut dasar pemrosesan, hak akses &
penghapusan, serta pemberitahuan kebocoran. Yang perlu dibangun: ekspor data
mandiri, jalur permintaan penghapusan, dan retensi yang tertulis.

**PPN atas langganan.** Tagihan KAMI ke pelanggan kena PPN dan menuntut
e-Faktur. Ironi yang layak disadari: aplikasi ini sudah punya mesin PPN &
e-Faktur (`src/lib/tax.ts`, `/tax/efaktur`) untuk pelanggan — dan kita akan
membutuhkannya untuk diri sendiri.

**Pembayaran.** Standar Indonesia: Midtrans / Xendit / Doku — Virtual Account,
QRIS, kartu. Harga dalam Rupiah. Berlangganan berulang lewat VA umumnya berarti
tagih-lalu-ingatkan, bukan auto-debit seperti kartu.

---

## 11. Di luar lingkup

- **Pelaporan konsolidasi lintas-PT.** Alasan sama dengan #104: di situlah
  basis-data-per-perusahaan memang menyulitkan.
- **SSO / login pihak ketiga.** Bila diinginkan, ia memengaruhi §5 dan harus
  dibicarakan **sebelum** email dikunci sebagai pengenal.
- **Akun yang menyeberang tenant** (§2). Bila kebutuhannya nyata, jawabannya
  akun terpisah per tenant.
- **White-label / domain kustom per pelanggan.**

---

## 12. Urutan pengerjaan

Tiap tahap berdiri sendiri dan meninggalkan aplikasi dalam keadaan hidup.
Nomor issue diisi saat dibuat.

| # | Tahap | Bergantung pada | Issue |
|---|---|---|---|
| 1 | Skema tenant di `sai_control` + migrasi `pt-sai` (§5, §8) | — | #134 |
| 2 | Pemisahan izin platform vs perusahaan (§6) | 1 | #135 |
| 3 | Identitas email + infrastruktur surel (§4.1) | 1 | #136 |
| 4 | Basis data `sai_platform` terpisah + rekonsiliasinya (§4A) | 1 | #137 |
| 5 | Pendaftaran mandiri + gerbang penyediaan (§7.1, §9) | 2, 3 | #138 |
| 6 | Undangan staf + akses multi-PT (§7.2, §7.3) | 3 | #139 |
| 7 | Langganan, kuota, trial, suspensi (§7.4) | 2, 4 | #140 |
| 8 | Penagihan Indonesia — gateway, PPN, e-Faktur (§10) | 7 | #141 |
| 9 | Kepatuhan & siklus hidup akun (§10) | 7 | #142 |

**Tahap 2 adalah yang memecah ayam-dan-telur.** Sebelum itu, pendaftaran mandiri
tidak mungkin berapa pun layar yang dibuat.

---

## 13. Sebelum mengerjakan ini

Sejujurnya, sama seperti catatan penutup #104: **bila pelanggannya masih satu
grup usaha, arsitektur hari ini sudah benar.**

Yang layak dikerjakan lebih dulu — dan berdiri sendiri, tanpa menunggu satu pun
tahap di atas — hanyalah **§4.5**: menyambungkan 409 yang sudah ada ke
`addExistingUserToCompany` yang sudah ditulis, supaya janji "satu login mencakup
semua PT" benar-benar bisa dipakai dari antarmuka. Itu pekerjaan kecil dengan
hasil langsung.

Seluruh sisanya baru berbayar bila memang akan ada pelanggan yang tidak saling
kenal di dalam satu pemasangan.
