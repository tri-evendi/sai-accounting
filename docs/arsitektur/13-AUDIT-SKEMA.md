# 13 — Audit Desain Skema Basis Data

> **ARSIP: dijalankan 12 Oktober 2026**, di MariaDB sebelum penukaran · [indeks](./README.md)
>
> Sesudahnya: PostgreSQL 15 Okt 2026 ([dok 11](./11-RENCANA-POSTGRESQL.md)),
> monorepo 18 Okt 2026 ([dok 14](./14-RENCANA-MONOREPO.md)). Status per 18 Okt
> 2026: S1 ✅ dan S2 ✅ ditutup 12 Okt (§8). S3 ❌ masih terbuka:
> `CONTRACT_STATUSES` di `packages/core/src/constants.ts` masih tiga nilai tanpa
> `completed`, dan belum ada CHECK constraint. Keputusan §5 sudah lewat momen
> penukarannya; keadaannya kini dicatat di §5.
>
> **Metode.** Setiap angka berasal dari skema Prisma dan basis data produksi yang
> berjalan. Yang tidak diukur tidak diklaim. Satu pengukuran yang awalnya salah
> dibaca dicatat di §2.1, karena cara mengukurnya ternyata mudah keliru.
>
> **Pertanyaannya:** apakah skema ini bisa dipelihara ke depan, dan apa yang
> berubah bila ia pindah ke PostgreSQL.

## 0. Putusan

**Skemanya sehat dan jauh lebih disiplin daripada rata-rata aplikasi
akuntansi.** Enam sifat di §1 adalah hasil `docs/DATABASE.md` ditegakkan, dan
sifat-sifat itu membuat migrasi mesin menjadi pekerjaan mekanis.

Ada tiga temuan, dan urutan pengerjaannya penting:

| | Temuan | Dampak | Kapan | Status 18 Okt |
|---|---|---|---|---|
| **S1** | **18 kolom FK yang indeksnya dibuat MySQL secara implisit** | Di PostgreSQL indeks itu tidak ada: 242 indeks hilang tanpa galat | Sebelum pindah mesin | ✅ ditutup 12 Okt (§8) |
| **S2** | **10 kolom `*_id` tanpa indeks apa pun** | Pemindaian tabel penuh saat data tumbuh; paling terasa di `audit_logs.user_id` | Kapan saja, murah | ✅ ditutup 12 Okt (§8) |
| **S3** | **Nol CHECK constraint**, dan nilai enum-like sudah terbukti menyimpang | 101 baris `contracts.status = "completed"` di luar kosakata | Bersihkan data dulu, baru batasi | ❌ terbuka; menunggu keputusan kosakata pemilik |

Hanya S1 yang wajib selesai sebelum penukaran mesin. Urutan S3 tidak boleh
dibalik: constraint yang dipasang lebih dulu akan menolak data yang sudah ada.

---

## 1. Yang sudah benar dan harus dipertahankan

Sifat-sifat berikut mudah hilang bila tidak ada yang menyadarinya.

### 1.1 Nol drift di 17 buku (diukur)

Model basis-data-per-PT punya satu risiko khas: buku-buku perlahan berbeda satu
sama lain, dan setiap laporan harus menangani semua variannya. Di sini hal itu
tidak terjadi:

| | Nilai, **identik di 17 buku** |
|---|---|
| Tabel per buku | **62** |
| Kolom per buku | **668** |
| Indeks per buku | **253** |

`GROUP_CONCAT(DISTINCT …)` atas ke-17 skema memulangkan satu angka untuk
ketiganya. Artinya `db:migrate:all` memang dijalankan ke semua buku, sehingga
satu laporan bisa dipercaya di semua PT.

### 1.2 Disiplin uang: nol `Float`

| Presisi | Jumlah kolom | Untuk |
|---|---|---|
| `Decimal(15,2)` | **81** | uang |
| `Decimal(15,3)` | **18** | kuantitas |
| `Decimal(18,6)` | **16** | kurs |
| `Decimal(5,2)` | 1 | tarif pajak persen — berkomentar, disengaja |

Tidak ada kolom `Float`. Di aplikasi akuntansi, itulah yang mencegah selisih
satu rupiah yang tidak bisa dijelaskan. `numeric` PostgreSQL lebih ketat dari
MariaDB soal pembulatan, jadi sifat ini aman saat pindah.

### 1.3 Semua relasi punya `onDelete` eksplisit

53 `Restrict` · 34 `Cascade` · 8 `SetNull`, dan tidak ada yang memakai bawaan.
Untuk data akuntansi, `Restrict` sebagai pilihan mayoritas sudah tepat: dokumen
yang sudah diposting tidak boleh ikut terhapus bersama master data.

### 1.4 Konvensi penamaan ditegakkan 100%

Tidak ada pelanggaran: setiap model punya `@@map` `snake_case` jamak, dan setiap
tabel punya `id` + `created_at` + `updated_at`.

Satu pengecualian, dan itu benar: `TenantAuditLog` tanpa `updated_at`. Jejak
audit hanya-tambah dan tidak pernah di-*update*, jadi kolom itu tidak akan
pernah bermakna. Yang perlu diperbaiki adalah `docs/DATABASE.md`, yang menulis
aturannya tanpa pengecualian ini.

### 1.5 Permukaan tipe sempit, dan karena itu portabel

Hanya empat keluarga tipe native di seluruh 89 model *(per 12 Okt; 93 per 18 Okt)*: `VarChar` (247),
`Decimal` (116), `Text` (43), `Date` (2). Nol `Json`, nol `Bytes`, nol enum
native, nol `TinyInt`.

Aturan `docs/DATABASE.md` yang mewajibkan enum-like ditulis
`String @db.VarChar` + `z.enum` adalah alasan tidak ada tipe yang menuntut desain
ulang saat pindah mesin. Aturan yang sama juga sumber temuan S3: portabilitas itu
dibayar dengan tidak adanya penjaga nilai di tingkat basis data.

### 1.6 Setiap tabel nyata punya indeks sekunder

Satu-satunya tabel tanpa indeks selain `PRIMARY` adalah `_prisma_migrations`,
milik Prisma.

---

## 2. S1 — 18 indeks yang dibuat MySQL untuk kita, dan PostgreSQL tidak

Ini temuan terpenting di dokumen ini, dan ia tidak akan pernah muncul sebagai
galat.

MySQL/MariaDB mewajibkan indeks pada kolom FK dan membuatnya sendiri bila tidak
dideklarasikan, dengan nama berakhiran `_fkey`. PostgreSQL tidak: `FOREIGN KEY`
di PostgreSQL tidak membawa indeks. Setiap kolom FK yang indeksnya tidak ditulis
di skema Prisma akan kehilangan indeksnya saat pindah. Gejalanya hanya kueri yang
perlahan melambat.

Diukur di basis data hidup, kolom FK yang tidak punya indeks selain yang
berakhiran `_fkey`:

| Basis data | Kolom |
|---|---|
| buku PT (×17) | `approval_requests.rule_id` · `contract_items.contract_id` · `contract_payments.contract_id` · `documents.contract_id` · `fixed_assets.{asset,accumulated,expense}_account_id` · `fixed_asset_categories.{asset,accumulated,expense}_account_id` · `invoice_items.invoice_id` · `invoice_payments.invoice_id` · `journals.reversal_of_id` · `production_orders.cost_center_id` |
| `sai_control` | `api_tokens.created_by_user_id` |
| `sai_platform` | `payments.platform_invoice_id` · `platform_invoices.subscription_id` · `platform_invoices.target_plan_id` · `subscriptions.plan_id` |

Totalnya 14 per buku × 17 buku + 1 + 3 = 242 indeks yang tidak akan dibuat.

Dua di antaranya ada di tabel yang sudah cukup besar: `contract_items` (767
baris) dan `contract_payments` (720). Keduanya dibaca lewat `contract_id` setiap
kali detail kontrak dibuka.

**Perbaikannya berlaku di kedua mesin:** deklarasikan `@@index` di skema Prisma.
Di MariaDB tidak ada perubahan fungsional (indeksnya sudah ada, hanya namanya
menjadi eksplisit). Di PostgreSQL, deklarasi itulah satu-satunya yang membuat
indeksnya ada. Karena itu dikerjakan sebelum migrasi, supaya sudah teruji di
produksi sebelum mesinnya berganti.

### 2.1 Catatan metode: sapuan skema saja memberi jawaban salah

Sapuan pertama atas skema Prisma memulangkan 32 kolom `*Id` tanpa `@@index`.
Angka itu salah ke dua arah:

- Regex `@relation` yang dipakai tidak menangkap deklarasi multi-baris, sehingga
  `fixed_assets.asset_account_id` tercatat "bukan relasi". Padahal kolom itu FK
  dan punya indeks `_fkey` di basis data hidup.
- Sebaliknya, beberapa kolom `*Id` memang bukan FK (lihat §3), jadi tidak
  termasuk temuan ini.

Jawaban yang benar hanya datang dari `information_schema` basis data yang
berjalan. Ini dicatat supaya audit berikutnya tidak mengulang kesalahan yang
sama.

---

## 3. S2 — 10 kolom `*_id` yang tidak terindeks di mesin mana pun

Berbeda dari S1, ini sudah menjadi keadaan saat audit. Kolom-kolom ini bukan FK,
jadi MySQL tidak membuatkan indeks, dan skemanya juga tidak memintanya.

| Kolom | Kenapa tanpa FK |
|---|---|
| `audit_logs.user_id` | **Disengaja** — id pengguna bersifat global, dan basis data perusahaan tidak boleh ber-FK ke `users` (`docs/MULTI-COMPANY.md`) |
| `tenant_audit_logs.user_id` | sama |
| `invitations.invited_by_user_id` | sama |
| `tenant_deletion_requests.requested_by_user_id` | sama |
| `invoice_sends.sent_by_user_id` | sama |
| `year_closes.closed_by_id`, `.reversed_by_id` | sama |
| `company_settings.opening_journal_id` | 🔶 tampak sengaja — satu baris per buku, jadi indeks tidak berguna |
| `recurring_occurrences.document_id` | ❓ belum jelas kenapa tanpa FK |
| `recurring_templates.source_id` | ❓ polimorfik (menunjuk beberapa jenis dokumen) — FK memang tak mungkin |

Ketiadaan FK-nya benar dan tidak boleh "diperbaiki", karena itu aturan isolasi
multi-PT. Ketiadaan indeksnya yang salah. Paling terasa di `audit_logs.user_id`:
halaman audit menyaring per pengguna, dan tabel itu terus tumbuh tanpa
dipangkas.

---

## 4. S3 — tidak ada penjaga nilai di basis data, dan nilainya sudah menyimpang

`docs/DATABASE.md` memilih `String @db.VarChar` + `z.enum` alih-alih enum native.
Alasannya kuat (§1.5): portabilitas, dan menambah nilai enum di MySQL adalah
`ALTER TABLE` yang mengunci. Konsekuensinya: `z.enum` hanya menjaga tulisan yang
lewat aplikasi.

CHECK constraint di `sai_production`: 0.

Kosakata di `packages/core/src/constants.ts:168` (dulu `src/lib/constants.ts`):

```ts
export const CONTRACT_STATUSES = ["signed", "pending", "canceled"] as const;
```

Nilai yang ada di buku pt-sai:

| status | baris |
|---|---|
| `pending` | 469 |
| **`completed`** | **101** ← di luar kosakata |
| `canceled` | 39 |
| ~~`signed`~~ | **0** ← ada di kosakata, tak pernah dipakai |

Ada dua penyimpangan berlawanan arah: satu nilai dipakai 101 kali tanpa
diizinkan, dan satu nilai diizinkan tetapi tidak pernah dipakai. Ke-101 baris itu
termasuk dalam 1.439 temuan `check-data-conformance`. Pemeriksa kesesuaian sudah
menemukannya; yang belum ada adalah mekanisme yang mencegahnya.

🔶 Tersimpulkan: `completed` masuk lewat impor data warisan, bukan lewat form. Ini
konsisten dengan `signed` yang nol: kosakata aplikasi dan kosakata data warisan
tidak pernah diselaraskan.

### 4.0 Asal `completed` (ditelusuri 12 Okt 2026)

Nilai ini berasal dari impor warisan. Ketiga status di buku pt-sai tercatat
dalam jendela dua detik yang sama:

| status | baris | pertama | terakhir |
|---|---|---|---|
| `pending` | 469 | 2026-07-18 11:42:45.130 | 11:42:46.835 |
| `completed` | 101 | 2026-07-18 11:42:45.139 | 11:42:46.509 |
| `canceled` | 39 | 2026-07-18 11:42:45.093 | 11:42:45.921 |

Status di aplikasi lama berupa angka. Di dump warisan
(`subt5236_sai_prod_18july.sql`), `tb_trans_contract.status` adalah
`varchar(40) DEFAULT '0'` dengan nilai `'0'` (1.297×), `'2'` (646×), `'7'`
(180×), `'30'`, `'1'`, dan seterusnya. Pengimpor memetakan angka itu menjadi kata,
dengan kosakata yang lebih kaya daripada yang dimiliki aplikasi.

`completed` tidak ada di kode mana pun. Sapuan seluruh `src/` tidak menemukannya
sebagai status kontrak, baik di `CONTRACT_STATUSES`, di query, maupun di UI.

`signed` masih dipakai: ia bisa dipilih di form pembuatan kontrak
(`contract-form.tsx:94`). Jumlahnya nol karena pengimpor tidak pernah
menghasilkannya dan belum ada pengguna yang menyetelnya di buku ini.

#### Pertanyaan untuk pemilik

**Apakah bisnis ini membedakan kontrak yang sudah ditandatangani dari kontrak
yang sudah selesai dikerjakan?**

| Kalau YA | Kalau TIDAK |
|---|---|
| `completed` adalah status keempat yang sah, dan pengimpor benar | 101 baris itu dipetakan ke `signed`, dan `completed` dihapus |
| Tambahkan ke `CONTRACT_STATUSES` + label 3 bahasa + posisi warna + tombol saringan | Satu migration `UPDATE`, nol perubahan kode |
| Nol data berubah | Informasi "sudah selesai" HILANG dari 101 kontrak, tanpa jalan balik |

🔶 Rekomendasi: ya. Untuk kontrak, "ditandatangani" dan "selesai dikerjakan"
adalah dua keadaan berbeda, dan memetakan 101 baris ke `signed` membuang
informasi yang tidak bisa dipulihkan. Namun ini menyangkut semantik akuntansi
pemilik, jadi keputusannya tidak diambil di sini.

### 4.0.1 Yang sudah diperbaiki tanpa menunggu keputusan itu

Penelusuran di atas menemukan cacat yang tidak bergantung pada keputusan
kosakata, jadi langsung dikerjakan.

Grafik donat status di halaman kontrak dibangun dari tiga status yang dipaku:

```ts
{ name: sah,        value: countByStatus.get("signed")   ?? 0 },
{ name: menunggu,   value: countByStatus.get("pending")  ?? 0 },
{ name: dibatalkan, value: countByStatus.get("canceled") ?? 0 },
```

Diukur di produksi: 609 kontrak, 508 masuk grafik, 101 hilang (16,6%).

Grafiknya tidak terlihat salah: tiga irisan rapi dengan jumlah yang tampak masuk
akal. Tabel di halaman yang sama justru benar (`StatusBadge` punya cadangan dan
menampilkan "Completed"), sehingga dua bagian di satu halaman memberi jawaban
berbeda tentang data yang sama.

Diperbaiki lewat `src/lib/contract-status-chart.ts`. Tiga status yang dikenal
tetap di posisi 0-1-2 (warna dipasangkan per posisi, bukan per nama). Status di
luar kosakata menyusul dan mendapat `unknownTone`, cadangan yang sudah ada di
`dashboard-charts.tsx`.

`tests/contract-status-chart.test.ts` menjaga invariannya: jumlah irisan sama
dengan jumlah kontrak, apa pun statusnya. Tes itu juga menolak kembalinya daftar
yang dipaku.

Sekarang irisan "Completed" terlihat beserta jumlahnya, sehingga grafiknya bisa
dipakai sebagai bahan keputusan §4.0.

### 4.1 Urutan perbaikan yang tidak boleh dibalik

1. **Putuskan kosakatanya** (keputusan pemilik): apakah `completed` sah dan masuk
   `CONTRACT_STATUSES`, atau 101 baris itu dipetakan ke `signed`.
2. **Perbaiki datanya** lewat migration bertanggal.
3. **Baru kemudian** pasang penjaga di tingkat basis data.

Penjaga yang dipasang lebih dulu akan menolak data yang sudah ada. Di
PostgreSQL, `ALTER TABLE … ADD CONSTRAINT … CHECK` memvalidasi seluruh baris saat
dipasang, jadi pemasangannya akan gagal dengan galat. Itu lebih baik daripada
gagal tanpa suara, tetapi urutannya tetap harus benar.

### 4.2 Pilihan penjaga di PostgreSQL

| Pilihan | Untung | Rugi |
|---|---|---|
| **`CHECK (status IN (…))`** ← disarankan | Nol tipe baru; `ALTER` menambah nilai tidak mengunci; tetap `text` bagi Prisma | Daftar nilai hidup di dua tempat (kode + DB) — harus dibangkitkan dari `constants.ts`, jangan diketik ulang |
| Enum native PostgreSQL | Penjaga terkuat | Mengubah skema Prisma ke `enum`, dan `ALTER TYPE … ADD VALUE` tidak bisa di dalam transaksi |
| Tabel referensi + FK | Paling fleksibel | 20+ tabel kecil baru; berlebihan untuk kosakata yang jarang berubah |

Yang disarankan `CHECK`: ia menutup celahnya tanpa mengubah tipe, sehingga sifat
portabel §1.5 tetap utuh.

---

## 5. Keputusan desain saat pindah mesin, dan keadaannya sesudah penukaran

| | Keadaan 18 Okt 2026 |
|---|---|
| 5.1 Zona waktu | Timestamp naif dipertahankan: baseline PostgreSQL memakai `TIMESTAMP(3)` tanpa zona. ❓ Pemilik, bila `timestamptz` diinginkan untuk kolom peristiwa (kini migration tersendiri, tidak lagi bagian penukaran) |
| 5.2 `serial` vs `identity` | ✅ `SERIAL`, sesuai saran; sequence terbukti ≥ `MAX(id)` sesudah pemuatan (dok 11 §10.2) |
| 5.3 Trigger | ✅ ditulis ulang di `prisma/postgresql/control/0002_slug_permanen`, dijaga `tests/pg-trigger-parity.test.ts`. ❌ Pembuktinya `scripts/prove-company-slug-immutable.ts` masih berdialek MySQL (placeholder `?`, `trigger_schema = <nama db>`) |

Analisis aslinya, sebagai alasan di balik tabel di atas:

### 5.1 Zona waktu — 165 kolom waktu, semuanya naif

Di buku produksi ada 165 kolom `datetime` dan 2 `date`. `datetime` MariaDB tidak
menyimpan zona waktu, dan Prisma memetakan `DateTime` ke `timestamp(3)` tanpa
zona di PostgreSQL. Bawaannya karena itu mempertahankan perilaku yang sama.

Perilaku yang sama itu bergantung pada asumsi yang tidak pernah ditulis: semua
waktu disimpan dalam UTC, dan tampilan mengubahnya ke WIB. Penutupan periode di
aplikasi ini berbasis tanggal. Bila satu jalur lupa mengubah zona, dokumen yang
diposting pukul 23:30 WIB bisa masuk ke periode yang salah.

Pindah mesin adalah momen termurah untuk memutuskannya (momen itu lewat tanpa
keputusan; bawaannya dipertahankan). Ada dua jawaban yang sah:

- `timestamptz` untuk kolom peristiwa (`created_at`, `posted_at`, `sent_at`).
  PostgreSQL menyimpan titik waktu absolut, dan konversi tidak lagi menjadi
  tanggung jawab kode.
- `date` tetap `date` untuk kolom tanggal akuntansi (`invoice_date`, `period`).
  Tanggal buku bukan titik waktu; memberinya zona waktu justru menimbulkan
  kesalahan baru.

❓ Keputusan pemilik. Yang perlu dihindari: memilih tanpa sadar bahwa sebuah
pilihan sedang dibuat.

### 5.2 `serial` vs `identity`

99 migration memakai `AUTO_INCREMENT` (49 berkas). Prisma memetakan
`autoincrement()` ke `SERIAL` di PostgreSQL. `GENERATED … AS IDENTITY` adalah
bentuk baku SQL yang lebih bersih, tetapi Prisma belum membangkitkannya. Terima
`SERIAL`; jangan menulis tangan sesuatu yang akan dilawan `prisma migrate` di
migration berikutnya.

### 5.3 Satu trigger harus ditulis ulang

`companies_slug_immutable` adalah satu-satunya trigger di seluruh pemasangan
(dihitung di produksi). PostgreSQL menuntut `CREATE FUNCTION … RETURNS trigger`
lalu `CREATE TRIGGER`, jadi trigger ini harus ditulis ulang, tidak cukup
diterjemahkan. Skrip pembuktinya, `scripts/prove-company-slug-immutable.ts`,
ikut berubah.

---

## 6. Yang dicari dan tidak ditemukan

Supaya audit ini bisa diperiksa, berikut yang dicari dan tidak ada:

| Dicari | Hasil |
|---|---|
| Kolom uang bertipe `Float`/`Int` | **nol** |
| Tabel tanpa `@@map` atau `@@map` bukan `snake_case` | **nol** |
| Tabel tanpa `id`/`created_at`/`updated_at` | **nol** (satu pengecualian yang benar, §1.4) |
| Relasi tanpa `onDelete` eksplisit | **nol** |
| Enum native (menghalangi portabilitas) | **nol** |
| Kolom `Json`/`Bytes` (menyulitkan migrasi) | **nol** |
| Drift skema antar 17 buku | **nol** |
| Tabel nyata tanpa indeks sekunder | **nol** |
| FK dari basis data perusahaan ke `users` | **nol** — aturan `docs/MULTI-COMPANY.md` ditegakkan |

## 7. Ringkasan untuk pemelihara berikutnya

**Skema ini bisa dipelihara.** Tiga aturan di `docs/DATABASE.md` (uang
`Decimal`, enum-like sebagai `String`, dan `db:migrate:all` ke semua buku)
ditegakkan tanpa pengecualian, dan ketiganya terukur di produksi.

Yang perlu dikerjakan, dalam urutan ini:

1. **S1 sekarang** (sebelum pindah mesin): deklarasikan 18 `@@index`. Benar di
   kedua mesin; bila ditunda sampai migrasi, perubahannya tidak pernah teruji di
   produksi.
2. **S2 kapan saja**: 10 indeks, terutama `audit_logs.user_id`.
3. **S3 bertahap**: kosakata → data → penjaga. Jangan dibalik.
4. **§5.1**: tidak diputuskan saat pindah; timestamp naif dipertahankan.
   ❓ Pemilik, bila `timestamptz` diinginkan.

*Status 18 Okt 2026: butir 1 & 2 ✅ (§8), butir 3 ❌ terbuka, butir 4 ❓.*

Pelajaran soal cara mengaudit: `information_schema` basis data yang berjalan
adalah satu-satunya sumber kebenaran. Dua dari tiga temuan di dokumen ini tidak
terlihat di skema Prisma, dan satu angka yang dibaca dari skema ternyata salah
(§2.1).

---

## 8. Dikerjakan pada hari yang sama: S1 & S2 ditutup

S1 dan S2 ditutup 12 Okt 2026. S3 menunggu satu keputusan kosakata.

### 8.1 Kriteria diperbaiki di tengah jalan, dan menemukan 4 lagi

Kriteria awalnya "kolom FK yang indeksnya hanya implisit". Kriteria itu salah.
Yang menentukan adalah apakah indeksnya dideklarasikan di skema Prisma, karena
PostgreSQL dibangun dari skema itu, tidak peduli bagaimana indeksnya dulu
dibuat.

Dengan kriteria yang benar (diff indeks hidup vs indeks terdeklarasi), muncul
empat kolom yang lolos dari analisis berbasis FK:

| Yang lolos | Kenapa lolos |
|---|---|
| `landed_cost_items.receipt_movement_id` | FK nyata, tapi indeksnya dibuat migration tulis-tangan dengan nama `_idx`, jadi tidak tampak "implisit" — dan tetap tidak terdeklarasi |
| `landed_cost_items.adjustment_movement_id` | sama |
| `approval_requests.decided_by_id` | **Tidak punya FK sama sekali** — indeksnya bernama `_fkey` tapi itu sisa dari constraint yang pernah dicabut. Namanya membohongi pembacanya |
| `companies.is_demo` | Bukan kolom FK sama sekali, jadi tak pernah masuk pencarian FK |

### 8.2 Hasil akhir: tidak ada indeks yang akan hilang

32 deklarasi `@@index` (28 + 4) ditambahkan ke tiga skema, dan tiga migration
tulisan tangan menyesuaikan basis datanya:

| Migration | Isi |
|---|---|
| `prisma/migrations/0065_indeks_fk_eksplisit` *(arsip MariaDB)* | 15 `RENAME INDEX` + 6 `CREATE INDEX` |
| `prisma/control/migrations/0018_indeks_fk_eksplisit` *(arsip MariaDB)* | 1 `RENAME` + 3 `CREATE` |
| `prisma/platform/migrations/0019_indeks_fk_eksplisit` *(arsip MariaDB)* | 3 `RENAME` |

Di PostgreSQL ke-32 indeks itu langsung ada di `0001_baseline` tiap basis data,
karena baseline dibangkitkan dari skema yang sudah mendeklarasikannya.

Untuk indeks yang sudah ada dipakai `RENAME`, bukan `CREATE`. Indeksnya sudah ada
di MariaDB, jadi `CREATE INDEX` akan membuat indeks kedua pada kolom yang sama:
biaya tulis dua kali tanpa manfaat baca. Mengganti nama tidak memindahkan data.

Dibuktikan di basis data sekali-pakai (struktur produksi disalin, migration
diterapkan, lalu dibandingkan dua arah dengan skemanya):

| | indeks hidup | terdeklarasi tapi tak ada | ada tapi tak terdeklarasi |
|---|---|---|---|
| perusahaan | 259 (dari 253) | **0** | **0** |
| kendali | 60 (dari 57) | **0** | **0** |
| platform | 45 | **0** | **0** |

Tidak ada `_fkey` yang tersisa. Basis data sekali-pakai dibuang setelah
pembuktian.

### 8.3 Penjaga permanen

`tests/index-fk-parity.test.ts` membaca ketiga skema dan menolak setiap relasi
tanpa `@@index`. Tes ini berjalan di CI pada setiap PR, jadi relasi baru tanpa
indeks ditolak pada hari ia ditulis.

Tiga hal yang membuat tes ini benar-benar memeriksa:

1. **`@relation` multi-baris ikut terbaca.** Sapuan pertama memakai
   `@relation\([^)]*fields:`, yang berhenti di baris pertama, sehingga
   `fixed_assets.asset_account_id` dilaporkan "bukan relasi" padahal FK. Ada tes
   terpisah untuk pembacanya. Bila pembaca kembali ke bentuk naif, seluruh tes
   akan hijau karena tidak melihat apa pun.
2. **Indeks komposit hanya menutupi prefiksnya.** `[a, b]` tidak menutupi kueri
   atas `b` saja. Menganggapnya tertutup akan meloloskan cacat yang justru
   dijaga.
3. **Sudah dilihat merah lebih dulu.** Mencabut `@@index([reversalOfId])` dari
   `Journal` membuat tes gagal dan menyebut `Journal.[reversalOfId]`. Percobaan
   pertama keliru: yang dicabut salah satu dari enam `@@index([invoiceId])` yang
   masih tertutup indeks lain di model yang sama, dan tesnya memang hijau.

### 8.4 Yang masih terbuka

**S3, penjaga nilai enum-like.** Butuh satu keputusan pemilik lebih dulu:
apakah `completed` sah dan masuk `CONTRACT_STATUSES`, atau 101 baris itu
dipetakan ke `signed`. Sesudah itu perbaiki data, baru pasang `CHECK`. Urutannya
tidak boleh dibalik, karena `ALTER TABLE … ADD CHECK` di PostgreSQL memvalidasi
seluruh baris saat dipasang dan akan gagal.

**§5.1, zona waktu.** Tidak diputuskan saat penukaran; baseline PostgreSQL
mempertahankan `TIMESTAMP(3)` naif. ❓ Tetap keputusan pemilik bila
`timestamptz` diinginkan untuk kolom peristiwa, kini sebagai migration
tersendiri.
