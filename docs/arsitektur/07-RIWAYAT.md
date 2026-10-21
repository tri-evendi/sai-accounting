# 07 — Riwayat & Keputusan Lama

> Keadaan 18 Okt 2026 (`main@ca0cd038`) · [indeks](./README.md)

Kenapa sistem ini berbentuk seperti sekarang. Isinya hanya **keputusan yang
masih mengikat** dan **apa yang masih terbuka** dari empat pekerjaan besar
(migrasi PostgreSQL, monorepo, audit skema, klasifikasi buku); jalannya
pekerjaan ada di riwayat git.

## 1. Migrasi ke PostgreSQL

Keputusan yang masih mengikat:

| Keputusan | Alasan |
|---|---|
| **Basis data per PT**, bukan *schema-per-tenant* | Schema-per-tenant lebih hemat koneksi tetapi membatalkan #104: `search_path` yang salah menulis ke buku PT lain **tanpa error**. Harganya PgBouncer wajib |
| **Baseline**, bukan port 99 migration MariaDB | Yang dibutuhkan skema akhirnya, bukan riwayatnya. Tiap basis data dapat satu `0001_baseline` |
| **PostgreSQL jadi kanonik** | Skema PG turunan di samping skema MySQL menghasilkan image dengan adapter PG tetapi **mesin kueri berdialek MySQL** — itu sebab penukaran pertama gagal |
| **Klien ≥ server** | `pg_dump` menolak server yang lebih baru; klien 15 gagal terhadap server 17.11, dan gagalnya baru terlihat pada backup pertama sesudah penukaran. Dijaga `tests/pg-client-version.test.ts` |
| **Trigger ditulis tangan** | Prisma tidak membangkitkan trigger, fungsi, view, atau grant. Dijaga `tests/pg-trigger-parity.test.ts` |
| **Indeks FK eksplisit** | MySQL membuat indeks FK sendiri, PostgreSQL tidak. Dijaga `tests/index-fk-parity.test.ts` |
| **Timestamp naif dipertahankan** | `TIMESTAMP(3)` tanpa zona, setara `datetime` MariaDB. Peralihan ke `timestamptz` ❓ menunggu pemilik |

Empat pelajaran yang masih berlaku:

1. **Uji lapisan yang dipakai produksi.** Fase persiapan menguji adapter, skema, indeks, data, dan trigger — tetapi tidak menjalankan klien Prisma hasil bangkitan terhadap PostgreSQL. Lapisan itulah yang menentukan dialek.
2. **Yang tidak ada di skema Prisma tidak ikut dibangkitkan.** Trigger, fungsi, view, grant harus diperiksa manual setiap pindah mesin.
3. **Sebagian kegagalan baru muncul pada hari pertama sesudah penukaran** — klien `pg_dump` terlalu tua, `backup.sh` memaku host `db`, `SUM(boolean)` di pemeriksa kesesuaian. Ketiganya lolos `verify` dan build.
4. **Fallback adalah syarat.** Penukaran pertama bisa dipulihkan dalam hitungan menit karena MariaDB dibiarkan hidup dan tidak ditulisi.

### Yang masih terbuka

| # | Risiko | Usul |
|---|---|---|
| 1 | **Aplikasi tersambung sebagai superuser.** Role `sai` adalah `rolsuper`, jadi pembatasan pola `sai\_t%` yang ada di MariaDB hilang. Satu injeksi SQL di `$queryRawUnsafe` memberi akses penuh ke **server** | Role aplikasi `NOSUPERUSER CREATEDB`; superuser hanya untuk `migrate`/`svc-tenant` (jalur yang mendump SETIAP basis data) |
| 2 | **Pencarian jadi peka huruf besar-kecil.** Filter `contains`/`startsWith` tanpa `mode: "insensitive"` — `abadi` tidak lagi menemukan `PT ABADI` | Tambahkan `mode: "insensitive"` di jalur pencarian |
| 3 | **Collation `C` di semua basis data.** `ORDER BY name` mengurutkan per byte, dan `@unique` pada kode/nomor mengizinkan `ABC` dan `abc` sekaligus | `citext` atau indeks `lower(...)`, per kolom |
| 4 | **Tiga skrip operator masih berdialek MySQL** — `pause-platform-billing.ts`, `adopt-existing-company.ts`, `prove-company-slug-immutable.ts` | Port ke dialek PostgreSQL |
| 5 | **Login username tidak dinormalkan.** `auth.ts` mencari `username: parsed.data.identifier`, bukan `identifier` yang sudah di-`toLowerCase()` | Pakai `identifier` yang sudah dinormalkan |

Ditambah **#636, cabut MariaDB** (service `db`, volume `db_data`,
`@prisma/adapter-mariadb`, branch MySQL di `packages/db`). Paling cepat 22 Okt
2026, sesudah dump terakhir disimpan di luar mesin. Butir 1–4 sebaiknya ditutup
lebih dulu.

## 2. Monorepo

Keputusan yang masih mengikat:

- **Monorepo, bukan multi-repo.** 19 basis data berbagi satu skema; dua repo menambah sinkronisasi lintas-repo tanpa manfaat.
- **Migration & `prisma*.config.ts` tetap di akar.** Memindahkan direktori migration yang sudah diterapkan mempertaruhkan `migrate deploy` pada seluruh basis data produksi demi kerapian.
- **Aplikasi customer tetap di `src/`**, tidak dipindah ke `apps/customer`: diff terkecil, dan setiap jalur yang di-scan tes tetap berlaku.
- **`operator-plane` tetap dipakai sisi customer.** Ia yang menolak permintaan bila Traefik salah arah.
- **Kedua image dari `sha-` yang sama.** Dua binari di atas satu skema bisa berbeda versi.
- **Logika penagihan bukan logika operator.** `changeTenantPlan` dipakai dua rute customer, jadi tinggal di `packages/platform`; konsol mengimpornya, tidak sebaliknya.
- **Yang sengaja tetap di aplikasi customer:** `src/lib/i18n/{actions,labels}.ts`, `src/lib/plan-catalog.ts`, dan lima wrapper di `src/components/ui`.

Satu risiko benar-benar terjadi: **scanner yang hanya menyapu `src/` lulus
dengan nol pelanggar** begitu berkasnya pindah. Dua puluh scanner dialihkan ke
`tests/akar-sumber.ts`, dan perubahannya dibuktikan dengan pelanggaran yang
sengaja ditanam di dalam paket.

> ⚠ **Rollback lintas 18 Okt:** tag `sha-` sebelum 18 Okt tidak punya image
> `-operator`, jadi menukar `SAI_TAG` saja tidak cukup — `docker-compose.yml`
> lama dari commit yang sama harus ikut dikembalikan.

## 3. Audit desain skema

Putusan: skemanya sehat. Sifat yang harus dipertahankan, diukur 12 Okt 2026:

| Sifat | Angka |
|---|---|
| Nol drift di 17 buku | Tabel 62, kolom 668, indeks 253 — identik di ke-17 buku |
| Disiplin uang: nol `Float` | `Decimal(15,2)` 81 kolom · `(15,3)` 18 · `(18,6)` 16 · `(5,2)` 1 |
| Semua relasi punya `onDelete` eksplisit | 53 `Restrict` · 34 `Cascade` · 8 `SetNull` |
| Konvensi penamaan 100% | Setiap model ber-`@@map` `snake_case` jamak + `id`/`created_at`/`updated_at`. Satu pengecualian yang benar: `TenantAuditLog` tanpa `updated_at` |
| Permukaan tipe sempit | `VarChar` (247), `Decimal` (116), `Text` (43), `Date` (2). **Nol** `Json`, `Bytes`, enum native |

Tiga aturan dari audit itu yang masih dipakai saat menyentuh indeks: yang
menentukan adalah **apakah indeksnya dideklarasikan di skema Prisma**, bukan
apakah MySQL membuatnya sendiri · sapuan skema dengan regex memberi jawaban
salah, hanya `information_schema` basis data yang berjalan yang benar · untuk
indeks yang sudah ada pakai `RENAME`, bukan `CREATE`, supaya tidak lahir indeks
kedua pada kolom yang sama.

### S3 — satu-satunya temuan yang masih terbuka

`z.enum` hanya menjaga tulisan yang lewat aplikasi; CHECK constraint di buku
produksi: **0**. `CONTRACT_STATUSES = ["signed", "pending", "canceled"]`,
sedangkan yang ada di buku produksi:

| status | baris | |
|---|---|---|
| `pending` | 469 | |
| **`completed`** | **101** | ← di luar kosakata |
| `canceled` | 39 | |
| `signed` | **0** | ← ada di kosakata, tak pernah dipakai |

Ketiganya tercatat dalam jendela **dua detik yang sama** (18 Jul 2026), yaitu
impor warisan: di dump lama `status` berisi angka, dan pengimpor memetakannya
dengan kosakata yang **lebih kaya** daripada yang dimiliki aplikasi.

**Pertanyaan untuk pemilik: apakah bisnis ini membedakan kontrak yang sudah
ditandatangani dari yang sudah selesai dikerjakan?**

| Kalau YA | Kalau TIDAK |
|---|---|
| `completed` status keempat yang sah | 101 baris dipetakan ke `signed` |
| Tambahkan ke `CONTRACT_STATUSES` + label 3 bahasa + warna + saringan | Satu migration `UPDATE`, nol perubahan kode |
| Nol data berubah | Informasi "sudah selesai" **hilang**, tanpa jalan balik |

🔶 Rekomendasi: **ya** — memetakan 101 baris ke `signed` membuang informasi
yang tidak bisa dipulihkan.

**Urutan perbaikan yang tidak boleh dibalik:** putuskan kosakatanya → perbaiki
datanya lewat migration → **baru** pasang guard. Guard yang dipasang lebih dulu
menolak data yang sudah ada, karena `ADD CONSTRAINT … CHECK` memvalidasi
seluruh baris saat dipasang. Pilihan guard-nya `CHECK (status IN (…))`, dan
daftarnya **harus dibangkitkan dari `constants.ts`**, jangan diketik ulang.

Satu cacat sudah diperbaiki tanpa menunggu keputusan itu: grafik donat status
kontrak dibangun dari tiga status yang dipaku, sehingga **101 dari 609 kontrak
(16,6%) hilang** dan grafiknya tetap terlihat benar — tiga irisan rapi dengan
jumlah yang masuk akal, sementara tabel di halaman yang sama menunjukkan angka
berbeda. `src/lib/contract-status-chart.ts` kini memasangkan warna **per
posisi**, dan status di luar kosakata menyusul dengan `unknownTone`.

### Zona waktu

Di buku produksi ada 165 kolom waktu, semuanya naif, dan perilakunya bergantung
pada asumsi yang **tidak pernah ditulis**: semua waktu disimpan UTC, tampilan
mengubahnya ke WIB. Penutupan periode berbasis tanggal, jadi bila satu jalur
lupa mengubah zona, dokumen yang diposting pukul 23:30 WIB bisa masuk periode
yang salah.

Dua jawaban yang sah: `timestamptz` untuk kolom **peristiwa** (`created_at`,
`posted_at`, `sent_at`), dan `date` tetap `date` untuk kolom **tanggal
akuntansi** (`invoice_date`, `period`) — tanggal buku bukan titik waktu.

## 4. Klasifikasi buku

> Dijalankan 11 Okt 2026. Untuk angka hari ini jalankan ulang
> `bun run classify:books` — skripnya hanya membaca.

**2 dari 17 buku** berisi data sungguhan: 1 `produksi` (66 pelanggan + 609
kontrak nyata), 1 `dipakai-ringan`, 2 `semai-saja`, 4 `semai-dibersihkan`,
6 `nyaris-kosong`, 3 `kosong`.

**Nama tidak boleh jadi dasarnya.** Klasifikasi dari nama keliru ke dua arah,
dan kekeliruan yang mahal adalah memperlakukan buku **nyata** sebagai uji.
Dua tanda yang tidak bisa dipalsukan penamaan dipakai sebagai dasar: pelanggan
& kontrak **tanpa tanda `[CONTOH]`** (wisaya menyemai data contoh bertanda ke
setiap PT baru, jadi apa pun di luar itu diketik orang), dan **bentuk semai**
yang tetap — 28 dokumen + 1 saldo awal. Aturannya fungsi murni
(`src/lib/book-classification.ts`), dan salah satu tesnya menuntut agar tidak
ada alasan yang menyebut nama basis data.

Dua putusan yang sudah diambil:

- **`is_demo` bukan penanda yang dicari.** Kolom itu **mengubah perilaku**: buku jadi hanya-baca + banner + dikecualikan dari scheduler. Menandai buku uji sebagai `is_demo` akan menolak tulisan di buku yang mungkin masih dipakai seseorang.
- **Jangan kecualikan dari backup.** Seluruh `sai_*` 78,1 MB; 16 buku non-produksi **tepat 4,0 MB masing-masing** — itu overhead struktural, bukan data. Mengecualikan 15 buku menghemat ~60 MB, tidak sepadan dengan daftar pengecualian yang harus dipelihara tangan dan akan tertinggal saat customer baru mendaftar.

Yang masih terbuka: penanda "buku uji" terpisah dari `is_demo` · ❓ apakah buku
uji dikecualikan dari laporan kesesuaian · ❓ apakah 3 buku `kosong` + 4
`semai-dibersihkan` dirapikan. Modul klasifikasinya tidak pernah menyarankan
penghapusan: "tampaknya tidak dipakai" bukan dasar yang memadai untuk tindakan
yang tidak bisa dibalik.
