# Multi-tenant: dari multi-PT menjadi platform SaaS

Issue #133 (epik), lanjutan dari #104 yang membangun multi-PT untuk satu grup
usaha. Dokumen ini merancang apa yang berubah bila pelanggannya tidak saling
kenal dan mendaftar sendiri.

> **Status: terimplementasi.** Kesembilan tahap §12 (#134–#142) sudah
> dibangun: skema `tenants`, pemisahan izin tenant dan perusahaan, email sebagai
> pengenal login, basis data `sai_platform`, pendaftaran mandiri, undangan staf,
> langganan/suspensi, penagihan Indonesia, dan kepatuhan (lihat
> [`COMPLIANCE.md`](./COMPLIANCE.md)). Dokumen ini kini berisi rancangan beserta
> alasannya. Keadaan komersial yang berlaku (mis. penagihan otomatis yang
> dihentikan) ada di [`KOMERSIALISASI.md`](./KOMERSIALISASI.md), aturan
> multi-PT di [`MULTI-COMPANY.md`](./MULTI-COMPANY.md).

---

## 1. Ringkasan

Perjalanan yang dituju:

> **pelanggan** mendaftar → menyiapkan perusahaannya (bisa lebih dari satu) →
> mendaftarkan stafnya → berlangganan.

Bentuk itu lazim. Penghalang utamanya saat dirancang adalah satu izin yang
ruang lingkupnya salah (§4.2). Surel, penagihan, dan kuota adalah pekerjaan
tambahan, bukan penghalang.

Perubahan ini menyentuh autentikasi, otorisasi, dan penyediaan basis data
sekaligus, jadi rancangannya ditulis rinci.

---

## 2. Dua istilah yang harus dibedakan sejak awal

Dokumen sebelumnya memakai satu kata untuk dua hal. Tabel ini memisahkannya.

| Istilah | Artinya di sini | Hidup di |
|---|---|---|
| **Tenant** (pelanggan) | Pihak yang berlangganan & membayar. Satu badan usaha/orang yang memakai platform. | tabel `tenants`, basis data control |
| **Company** (PT) | Satu buku besar. Satu tenant boleh punya beberapa. | tabel `companies` + **satu basis data sendiri** |
| **User** (orang) | Manusia yang masuk. Bisa jadi anggota beberapa company, di dalam satu tenant. | tabel `users`, basis data control |

Aturan yang berlaku di seluruh kode:

> **Company selalu milik tepat satu tenant. User selalu milik tepat satu
> tenant.** Tidak ada user yang menyeberang antar-tenant.

Akun yang menyeberang ("akuntan saya melayani dua klien") merusak model
isolasi: pencabutan akses, penagihan, dan penghapusan data tidak lagi punya
jawaban tunggal. Bila kebutuhan itu nyata, jawabannya akun terpisah per tenant,
seperti di Xero dan QuickBooks.

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

- **`TenantMembership`** menjawab "boleh membuat perusahaan, mengubah paket,
  mengundang orang?". Pertanyaan ini harus bisa dijawab tanpa perusahaan aktif,
  karena pelanggan baru belum punya satu pun.
- **`Membership`** (sudah ada) menjawab "boleh menulis faktur di PT ini?" dan
  tidak berubah.

---

## 4. Yang dulu menghalangi — semuanya ditutup

Daftar penghalang yang ditemukan di kode saat epik ini dirancang. Rinciannya
ada di riwayat git berkas ini; komentar kode masih merujuk nomornya.

| # | Penghalang (dulu) | Ditutup di |
|---|---|---|
| 4.1 | Tidak ada pendaftaran, kolom email, maupun pengirim surel | #136, #138 |
| 4.2 | **Penghalang utama:** `company.create` dilingkup PERUSAHAAN — untuk membuat perusahaan perlu keanggotaan, untuk punya keanggotaan perlu perusahaan | #135 (izin lingkup TENANT) |
| 4.3 | Username unik se-pemasangan | #136 (unik per tenant; email jadi pengenal login) |
| 4.4 | Kebocoran enumerasi: 409 `username_taken` memantulkan id global | #136, #139 (undangan menjawab seragam) |
| 4.5 | "Satu login banyak PT" tanpa UI (`addExistingUserToCompany` tanpa pemanggil) | #139 |
| 4.6 | Pembatas laju hanya di memori | #138 (persisten di basis data control) |
| 4.7 | Jejak audit tanpa tingkat tenant | #142 (`tenant_audit_logs` di control) |
| 4.8 | Tidak ada scheduler | #140 (kini layanan `job-scheduler`) |

---

## 4A. Pemisahan basis data: tiga lapis, bukan dua

Data bisnis SaaS tidak boleh bercampur dengan data pelanggan. Letak garis
pemisahnya ditentukan oleh satu batasan yang sudah dikenal kode ini:

> **Foreign key tidak bisa menyeberangi basis data, begitu pula transaksi.**

`docs/MULTI-COMPANY.md` sudah melarang FK dari basis data perusahaan ke
`users`, sehingga `periods.closed_by_id` hanya menyimpan id global tanpa FK.
Setiap garis pemisah baru membayar isolasi dengan harga yang sama.

### Yang diusulkan

| Lapis | Basis data | Isinya | Disentuh |
|---|---|---|---|
| **Platform** | `sai_platform` | `plans`, `subscriptions`, `payments`, `platform_invoices`, `usage_counters` — **bisnis KAMI** | jarang: pendaftaran, siklus tagih, webhook pembayaran |
| **Control** | `sai_control` | `tenants`, `users`, `tenant_memberships`, `companies` (registry), `memberships` — **identitas & perutean** | **setiap permintaan** |
| **Perusahaan** | `sai_pt_*` | jurnal, faktur, stok, kas — **buku pelanggan** | setiap permintaan yang menyentuh buku |

### Kenapa `tenants` tinggal di CONTROL, bukan di platform

`tenants` dibaca di setiap permintaan: pengguna ini tenant mana, perusahaan apa
yang boleh ia lihat, dan apakah tenantnya `suspended` (hanya-baca). Bila tabel
itu ada di basis data lain, setiap pemuatan halaman menambah satu lompatan
lintas-basis-data, dan `TenantMembership → User` kehilangan FK-nya.

Alasan yang lebih menentukan: pendaftaran harus atomik. `Tenant`, `User`
(owner), dan `TenantMembership` dibuat bersamaan. Bila `Tenant` ada di basis
data lain, ketiganya tidak bisa satu transaksi, dan kegagalan di tengah
meninggalkan akun tanpa tenant yang tidak bisa dipulihkan.

Karena itu garisnya ditarik di penagihan, bukan di tenant.

### Yang dibeli oleh pemisahan itu

- **Dampak kegagalan terbatas.** Migration atau bug penagihan tidak menyentuh
  tabel yang mengautentikasi semua orang. Bila penagihan mati, orang tetap bisa
  masuk dan bekerja.
- **Retensi & backup berbeda.** Catatan pembayaran punya kewajiban simpannya
  sendiri, lepas dari buku pelanggan.
- **Hak akses berbeda.** Pengguna basis data aplikasi tidak perlu menyentuh
  `sai_platform` sama sekali di jalur permintaan biasa.

### Harganya, dan cara membayarnya

`subscriptions` merujuk `tenants` tanpa FK, dengan id biasa seperti
`periods.closed_by_id`. Konsistensinya pindah ke lapisan aplikasi dan
ditegakkan oleh urutan tulis, bukan transaksi:

> Tulis di `sai_platform` dulu, baru tandai di `sai_control`.

Pola yang sama dipakai `provisionCompany`: basis data dibuat, migration
diterapkan, lalu registry ditulis paling akhir. Kegagalan di tengah tidak
meninggalkan perusahaan yang bisa dipilih tetapi belum bisa dibuka. Untuk
langganan, arahnya sama: pembayaran yang tercatat tanpa tenant naik kelas bisa
direkonsiliasi, sedangkan tenant yang naik kelas tanpa pembayaran tidak akan
ketahuan.

Karena itu perlu pekerjaan rekonsiliasi berkala yang membandingkan keduanya.
Ini salah satu alasan scheduler (§4.8) masuk daftar.

### Yang TIDAK berubah

Buku besar pelanggan tetap satu basis data per PT. Tidak ada tabel platform
yang masuk ke sana, dan tidak ada angka akuntansi yang keluar darinya.

---

## 5. Model data

Tambahan di basis data control (`sai_control`), tidak di basis data perusahaan
maupun `sai_platform` (alasannya di §4A).

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

Tabel pendukung baru di `sai_control`: `email_verification_tokens`,
`password_reset_tokens`, `invitations`.

Tabel di `sai_platform` (basis data terpisah, §4A): `plans`, `subscriptions`,
`payments`, `platform_invoices`, dan `usage_counters`. `platform_invoices` adalah
tagihan kami ke pelanggan, sengaja dinamai berbeda dari `invoices` milik buku
besar pelanggan. Semuanya merujuk `tenant_id` sebagai `Int` biasa tanpa FK,
seperti `periods.closed_by_id`. Isi katalog `plans` (angka, alasan, cara
mengubah harga) ada di `docs/PRICING.md` (#404).

Konsekuensinya bagi kode: satu generator Prisma lagi
(`packages/db/prisma/platform/schema.prisma` → `packages/db/generated/platform`), satu
`PLATFORM_DATABASE_URL`, dan satu perintah migration lagi di `db:migrate:all`.

Sesuai `docs/DATABASE.md`: Inggris · `snake_case` via `@map` · tabel jamak ·
`id` + `created_at` + `updated_at` di setiap tabel · uang `Decimal(15,2)` ·
enum-like = `String @db.VarChar` + `z.enum`.

---

## 6. Pemisahan izin: platform vs perusahaan

Ini inti pekerjaannya. Matriks izin semula hanya punya satu lingkup; ia perlu
dua.

| Lingkup | Contoh | Dijawab | Guard |
|---|---|---|---|
| **Tenant** | `tenant.home`, `company.create`, `tenant.billing`, `tenant.member.invite`, `tenant.settings` | `TenantMembership` | `requireTenantPermission` (**baru**) |
| **Perusahaan** | seluruh matriks sekarang (`invoice.write`, `report.read`, …) | `Membership` | `requireApiPermission` / `requirePagePermission` (tidak berubah) |

> **Aturan: izin tingkat tenant tidak boleh diperiksa guard perusahaan.**

Guard perusahaan menuntut konteks perusahaan, padahal ketiadaan konteks itu
adalah keadaan sah saat pelanggan baru membuat perusahaan pertamanya. Memakai
guard lama untuk kasus ini menuntut pengecualian yang melemahkan jaminan #104.

`tests/authz-coverage.test.ts` mencakup rute tingkat tenant: setiap rute itu
harus mendeklarasikan guard-nya, sama seperti rute perusahaan. Tanpa itu,
rute tenant, tempat penagihan berada, bisa lahir tanpa guard.

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

Langkah 2 sengaja menjadi gate: penyediaan basis data tidak boleh terjangkau
permintaan anonim (§9).

### 7.2 Staf diundang — bukan dibuatkan kata sandi

Admin tidak lagi mengetikkan kata sandi orang lain. Kata sandi yang diketik
admin lalu dikirim lewat WhatsApp sudah bocor sebelum dipakai.

| # | Langkah |
|---|---|
| 1 | Owner/admin → `/users` → undang: **email** + peran di PT ini |
| 2 | Kuota `maxUsers` dicek |
| 3 | Surel undangan berisi token berbatas waktu |
| 4 | Penerima klik → **menentukan kata sandinya sendiri** |
| 5 | `User` + `Membership` dibuat; `mustChangePassword` tidak lagi perlu |

### 7.3 Orang yang sudah ada, ditambahkan ke PT kedua

Alur ini menutup §4.4 dan §4.5 sekaligus.

Undangan dikirim ke sebuah email. Sistem selalu menjawab sama ("undangan sudah
dikirim"); yang berbeda hanya isi surelnya:

- email sudah punya akun **di tenant ini** → "Anda ditambahkan ke PT B, klik
  untuk membuka" (tanpa membuat akun baru; `addExistingUserToCompany`);
- belum punya → "buat kata sandi Anda".

Jawaban yang seragam diperlukan karena jawaban yang berbeda adalah kebocoran
enumerasi (§4.4).

### 7.4 Langganan

```
trialing ──(bayar)──> active ──(gagal bayar)──> past_due ──(masa tenggang habis)──> suspended
    │                    ↑                          │
    └──(trial habis)─────┘                          └──(bayar)──> active
                                                          
suspended ──(berhenti)──> cancelled          [buku besar TIDAK PERNAH dihapus otomatis]

trialing/active/past_due ──(operator_suspend)──> suspended     [manual, issue #155]
suspended ──(operator_restore)──> active                       [manual, issue #155]
```

Dua perpindahan terakhir adalah tindakan manual operator di luar siklus dunning
(permintaan pelanggan, penyalahgunaan). Keduanya tetap lewat mesin siklus hidup,
wajib beralasan, dan tercatat di jejak audit tenant dengan operator sebagai
aktor.

**`suspended` berarti hanya-baca**, tidak terkunci dan tidak terhapus. Pelanggan
yang berhenti membayar tetap wajib menyimpan pembukuannya (§10) dan harus bisa
mengunduhnya. Mengunci buku besarnya karena tagihan tertunggak berarti
menghalangi kewajiban hukumnya.

### 7.4-IP Daftar IP operator dan proxy di depannya (issue #154/#162)

`OPERATOR_IP_ALLOWLIST` adalah lapisan terluar konsol operator. Di belakangnya
masih ada hostname operator sendiri, bcrypt, dan TOTP wajib. Ia fail-closed:
kosong atau tidak diset berarti menolak semua orang; `*` (khusus pengembangan
lokal) mengizinkan semua.

Alamat klien yang dibandingkan dengan daftar itu dibaca dari `x-forwarded-for`.
Header itu bertambah dari kiri ke kanan: setiap proxy menambahkan alamat lawan
bicaranya di ujung kanan. Entri paling kiri berisi apa pun yang mula-mula ada
di header, termasuk yang diketik klien sendiri.

Aplikasi mengambil entri ke-N dari kanan, dengan
N = `OPERATOR_TRUSTED_PROXY_HOPS` (bawaan 1):

| Susunan | `OPERATOR_TRUSTED_PROXY_HOPS` | Yang dibaca |
| --- | --- | --- |
| klien → Traefik → app (sekarang) | `1` (bawaan) | entri paling kanan — satu-satunya yang ditulis Traefik |
| klien → CDN → Traefik → app | `2` | entri kedua dari kanan — alamat klien menurut CDN |

Ini bergantung pada konfigurasi Traefik, dan perubahannya tidak terlihat dari
kode. Selama `forwardedHeaders.trustedIPs` kosong, Traefik menimpa
`x-forwarded-for` kiriman klien, jadi hanya ada satu entri. Begitu `trustedIPs`
diisi (misalnya saat Cloudflare atau load-balancer kedua ditaruh di depan),
Traefik mempertahankan header kiriman klien. Sebelum #162 aplikasi membaca
entri pertama, sehingga dalam susunan itu daftar IP operator bisa dilewati
dengan mengirim `X-Forwarded-For: <ip-yang-diizinkan>`. Perubahannya terjadi di
berkas infrastruktur, dan tidak ada tes yang akan gagal.

Karena itu yang diperbaiki adalah cara membacanya: menghitung dari kanan
membuat entri yang disisipkan klien di depan tidak pernah terbaca. Asumsinya
dijaga tes (`tests/operator-plane.test.ts`), dan peringatannya juga ditulis di
`docker-compose.yml` di sebelah label Traefik, tempat `trustedIPs` akan
ditambahkan.

Dua sifat tambahan:

- **Rantai yang lebih pendek dari `hops` ditolak.** Itu berarti permintaan
  tidak melewati jalur yang diharapkan (mis. langsung ke Traefik, melewati
  CDN).
- **`x-real-ip` hanya dipakai bila `x-forwarded-for` tidak ada sama sekali dan
  `hops` = 1.** Dengan proxy berlapis, `x-real-ip` berisi alamat proxy
  sebelumnya, sehingga daftar IP operator akan dibandingkan dengan IP milik
  CDN.

### 7.4a Tindakan TULIS konsol operator (issue #155)

Konsol operator (#154) mula-mula hanya membaca. Tindakan tulisnya lebih
berisiko: setiap tombol memindahkan uang, mencabut akses, atau menghapus data.
Karena itu keempat tindakan tunduk pada empat aturan yang sama, ditegakkan di
inti (`apps/operator/src/lib/operator/writes.ts`; ganti paket di
`packages/platform/src/billing/change-tenant-plan.ts` sejak 17 Okt 2026 karena
rute pelanggan juga memakainya), tidak diserahkan ke pemanggil:

1. Satu baris jejak audit tenant per tindakan sukses, dengan operator sebagai
   aktor (`operator:<nama>` dari sesi konsol, `cli:<user>` dari skrip), tidak
   atas nama pengguna pelanggan.
2. Alasan yang diketik operator wajib (minimal 5 karakter) dan tersimpan apa
   adanya di jejak. Tindakan tanpa alasan tidak bisa ditinjau ulang.
3. Urutan tulis §4A: `sai_platform` dulu, `sai_control` belakangan.
4. Cache status tenant dijatuhkan (`invalidateTenantState()`) oleh server action
   begitu tindakannya berhasil, sehingga suspensi langsung berlaku, tidak
   menunggu TTL 60 detik.

Keempat tindakannya:

| Tindakan | Inti | Catatan |
| --- | --- | --- |
| Tandai tagihan lunas (transfer manual) | `recordManualPayment` | `PAYMENT_GATEWAY=manual` adalah BAWAAN; sebelum #155 pelunasan dilakukan `UPDATE` SQL langsung di produksi. Memakai `processPaymentNotification` yang SAMA dengan webhook — satu jalur transisi status, bukan dua yang menyimpang. Referensi bank menjadi `gateway_ref` yang UNIQUE: transfer yang sama tidak bisa tercatat dua kali, juga saat operator & scheduler bergerak bersamaan (P2002 → duplikat, bukan pembayaran kedua). |
| Ganti paket | `changeTenantPlan` | Menggantikan `bun run change-plan`; skripnya kini pembungkus tipis atas inti yang sama. Kuota baru yang lebih kecil dari pemakaian nyata adalah **peringatan, bukan penghalang** — turun paket keputusan yang sah — dan konsekuensinya ikut tercatat di jejak. Tenant `suspended` **tidak** dipulihkan oleh ganti paket: pemulihan keputusan terpisah dengan alasannya sendiri. |
| Tangguhkan / pulihkan | `setTenantSuspension` | Lewat mesin siklus hidup (`operator_suspend` / `operator_restore`), bukan `UPDATE` status langsung. Layar menyatakan gamblang: `suspended` = HANYA-BACA, bukan terkunci dan bukan terhapus. |
| Eksekusi penghapusan | `executeTenantDeletion` | Hanya atas permintaan `pending` yang masa tenggangnya SUDAH lewat (§10). Konfirmasi dengan **mengetik ulang slug tenant**, bukan "Ya". Layar menyebut apa yang TIDAK dihapus dan kenapa. Gate kedua (`--drop-ledgers`) sengaja TIDAK diberi tombol konsol. |

Skrip CLI-nya tetap ada sebagai jalur pemulihan saat konsol tidak bisa dibuka
(host salah konfigurasi, IP belum di-allowlist, Next mati). Skrip itu kini
pembungkus tipis atas inti yang sama, dan `--reason` wajib di sana seperti di
konsol.

### 7.5 Berhenti dan menghapus akun

Lihat §10. Penghapusan akun lebih dari sekadar `DELETE`.

---

## 8. Migrasi pemasangan yang sudah berjalan

Keputusan: `pt-sai` dimasukkan ke dalam satu `Tenant`. Bila tenant hanya
berlaku untuk pendaftar baru, setiap guard harus selamanya menangani keadaan
"tanpa tenant", dan branch yang jarang dilewati jarang teruji.

Urutannya tidak boleh ditukar:

1. Migration control: tabel & kolom baru, semuanya **nullable**.
2. Skrip adopsi: buat satu `Tenant`, tautkan `pt-sai` dan seluruh penggunanya,
   lalu isi email tiap pengguna. Data email harus disiapkan manusia lebih dulu;
   mesin tidak bisa menebaknya.
3. Buktikan: setiap `companies.tenant_id` dan `users.email` terisi, dan
   tidak ada email kembar.
4. Baru jadikan NOT NULL + unik.
5. Baru guard tingkat tenant boleh mengandalkan keberadaannya.

Pelajaran migrasi #104 berlaku: cadangkan dulu, dan jalankan di salinan lebih
dulu. Gladi resik #104 menemukan dua hal yang tidak terlihat dari membaca kode:
hak akses yang kurang (`P1010`) dan skrip yang menyebut kolom yang belum ada.

---

## 9. Ongkos yang berubah di bawah pendaftaran mandiri

Isolasi fisik tetap dipertahankan: kebocoran buku besar lintas pelanggan
menjadi tidak mungkin secara struktur.

Pendaftaran mandiri mengubah ongkosnya. Sebelumnya perusahaan dibuat sesekali,
oleh operator. Dengan `/register`, siapa pun bisa membuat basis data, dan
`db:migrate:all` menyusuri semuanya pada setiap penerapan.

| Jumlah PT | Keadaan |
|---|---|
| puluhan | wajar, seperti sekarang |
| ratusan | `db:migrate:all` jadi lambat; butuh paralel + laporan per-PT |
| ribuan | masalah operasional dominan; pool koneksi & waktu penerapan jadi penentu |

Yang wajib ada sejak awal:

- **Verifikasi email sebelum penyediaan** — penyediaan tak terjangkau anonim.
- **Kuota `maxCompanies` per tenant**, diperiksa di server.
- **Pembatas laju persisten** di `/register` (§4.6).
- **Peninjauan `DB_CONNECTION_LIMIT` + pool/LRU klien.** Kendala ini sudah
  disebut di #104; skalanya berubah di sini.

---

## 10. Kepatuhan Indonesia — dan kenapa "hapus akun" tidak sesederhana kelihatannya

> ⚠ Bagian ini harus dikonfirmasi ke penasihat hukum/pajak sebelum dijadikan
> janji ke pelanggan. Ia ditulis di sini karena memengaruhi rancangan, tidak
> hanya syarat dan ketentuan.

**Retensi wajib.** UU KUP menuntut buku, catatan, dan dokumen dasar pembukuan
disimpan 10 tahun, termasuk yang dikelola secara elektronik. Akibatnya,
berhenti berlangganan tidak boleh menghapus buku besar. Alurnya: `suspended`
(hanya-baca), ekspor, lalu penghapusan hanya atas permintaan eksplisit dan
setelah masa retensi, dengan pelanggan diberi tahu apa yang ia tanggung.

**Tempat penyimpanan.** Ketentuan yang sama menyebut penyimpanan di Indonesia.
Bila berlaku untuk SaaS pembukuan, ketentuan itu menentukan pilihan hosting,
yang jauh lebih mahal diubah belakangan.

**UU PDP (No. 27/2022).** Data pribadi menuntut dasar pemrosesan, hak akses &
penghapusan, serta pemberitahuan kebocoran. Yang perlu dibangun: ekspor data
mandiri, jalur permintaan penghapusan, dan retensi yang tertulis.

**PPN atas langganan.** Tagihan kami ke pelanggan kena PPN dan menuntut
e-Faktur. Aplikasi ini sudah punya mesin PPN dan e-Faktur
(`packages/core/src/tax.ts`, `/tax/efaktur`) untuk pelanggan, dan mesin yang
sama dipakai untuk tagihan platform.

**Pembayaran.** Standar Indonesia: Midtrans / Xendit / Doku — Virtual Account,
QRIS, kartu. Harga dalam Rupiah. Berlangganan berulang lewat VA umumnya berarti
tagih-lalu-ingatkan, bukan auto-debit seperti kartu.

---

## 11. Di luar lingkup

- **Pelaporan konsolidasi lintas-PT.** Alasan sama dengan #104: di situlah
  basis-data-per-perusahaan memang menyulitkan.
- **SSO / login pihak ketiga.** Bila diinginkan, ia memengaruhi §5 dan harus
  dibicarakan sebelum email dikunci sebagai pengenal.
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
| 5 | Pendaftaran mandiri + gate penyediaan (§7.1, §9) | 2, 3 | #138 |
| 6 | Undangan staf + akses multi-PT (§7.2, §7.3) | 3 | #139 |
| 7 | Langganan, kuota, trial, suspensi (§7.4) | 2, 4 | #140 |
| 8 | Penagihan Indonesia — gateway, PPN, e-Faktur (§10) | 7 | #141 |
| 9 | Kepatuhan & siklus hidup akun (§10) | 7 | #142 |

Tahap 2 menyelesaikan ketergantungan melingkar §4.2. Tanpa tahap itu,
pendaftaran mandiri tidak mungkin, berapa pun layar yang dibuat.
