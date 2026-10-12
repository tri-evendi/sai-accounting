# 13 — Audit Desain Skema Basis Data

> Dijalankan 12 Oktober 2026 · [indeks](./README.md)
>
> **Metode.** Setiap angka di dokumen ini berasal dari **skema Prisma dan basis
> data produksi yang berjalan**, bukan dari pembacaan selera. Yang tidak diukur
> tidak diklaim. Satu pengukuran yang saya salah baca lebih dulu ikut dicatat
> apa adanya di §2.1, sebab cara mengukurnya ternyata lebih mudah salah daripada
> hasilnya.
>
> **Pertanyaannya:** apakah skema ini bisa dipelihara ke depan — dan apa yang
> berubah kalau ia pindah ke PostgreSQL.

## 0. Putusan

**Skemanya sehat, dan jauh lebih disiplin daripada rata-rata aplikasi
akuntansi.** Enam sifat di §1 bukan kebetulan: ia hasil `docs/DATABASE.md`
ditegakkan, dan ia yang membuat migrasi mesin menjadi pekerjaan mekanis alih-alih
proyek.

Tiga temuan yang perlu dikerjakan, dan **urutannya penting**:

| | Temuan | Dampak | Kapan |
|---|---|---|---|
| **S1** | **18 kolom FK yang indeksnya dibuat MySQL secara IMPLISIT** | Di PostgreSQL indeks itu **tidak ada** — 242 indeks hilang tanpa satu pun galat | **SEBELUM** pindah mesin |
| **S2** | **10 kolom `*_id` tanpa indeks apa pun** — sudah begitu hari ini | Pemindaian tabel penuh saat tumbuh; `audit_logs.user_id` yang paling terasa | Kapan saja, murah |
| **S3** | **Nol CHECK constraint**, dan nilai enum-like **sudah terbukti menyimpang** | 101 baris `contracts.status = "completed"` di luar kosakata | Data **dibersihkan dulu**, baru dibatasi |

S1 adalah satu-satunya yang **wajib** selesai sebelum penukaran mesin. S3 punya
urutan yang tidak boleh dibalik: memasang constraint lebih dulu akan menolak data
yang sudah ada.

---

## 1. Yang sudah benar, dan harus dijaga tetap begitu

Bagian ini bukan pujian; ia daftar sifat yang **akan hilang kalau tidak ada yang
menyadarinya sebagai sifat**.

### 1.1 Nol drift di 17 buku — diukur, bukan diasumsikan

Model basis-data-per-PT punya satu mode kegagalan khas: buku-buku perlahan
berbeda satu sama lain, dan setiap laporan harus belajar menghadapi semua
variannya. Di sini tidak terjadi:

| | Nilai, **identik di 17 buku** |
|---|---|
| Tabel per buku | **62** |
| Kolom per buku | **668** |
| Indeks per buku | **253** |

`GROUP_CONCAT(DISTINCT …)` atas ke-17 skema memulangkan **satu** angka untuk
ketiganya. Itu bukti `db:migrate:all` benar-benar dijalankan ke semua buku, dan
sifat inilah yang membuat satu laporan bisa dipercaya di semua PT.

### 1.2 Disiplin uang utuh — nol `Float`

| Presisi | Jumlah kolom | Untuk |
|---|---|---|
| `Decimal(15,2)` | **81** | uang |
| `Decimal(15,3)` | **18** | kuantitas |
| `Decimal(18,6)` | **16** | kurs |
| `Decimal(5,2)` | 1 | tarif pajak persen — berkomentar, disengaja |

**Nol kolom `Float`.** Di aplikasi akuntansi itu pembeda antara neraca yang
seimbang dan selisih satu rupiah yang tidak pernah bisa dijelaskan. PostgreSQL
`numeric` justru **lebih ketat** dari MariaDB soal pembulatan, jadi sifat ini
berpindah dengan aman.

### 1.3 Nol relasi tanpa `onDelete` eksplisit

53 `Restrict` · 34 `Cascade` · 8 `SetNull` — dan **nol** yang menyerahkan
keputusan ke bawaan. Pada data akuntansi, `Restrict` sebagai pilihan mayoritas
adalah jawaban yang benar: dokumen yang sudah diposting tidak boleh ikut terhapus
bersama master data.

### 1.4 Konvensi penamaan ditegakkan 100%

**Nol** pelanggaran: setiap model punya `@@map` `snake_case` jamak, dan setiap
tabel punya `id` + `created_at` + `updated_at`.

Satu pengecualian, dan ia **benar**: `TenantAuditLog` tanpa `updated_at` — jejak
audit bersifat hanya-tambah dan tidak pernah di-*update*; kolom yang tak pernah
berubah hanya akan menjadi kolom yang membohongi pembacanya. **Yang perlu
diperbaiki bukan tabelnya, melainkan `docs/DATABASE.md`** yang menulis aturannya
tanpa pengecualian ini.

### 1.5 Permukaan tipe sempit — dan itu yang membuatnya portabel

Hanya **empat** keluarga tipe native di seluruh 89 model: `VarChar` (247),
`Decimal` (116), `Text` (43), `Date` (2). Nol `Json`, nol `Bytes`, nol enum
native, nol `TinyInt`.

Aturan `docs/DATABASE.md` yang mewajibkan *enum-like* ditulis
`String @db.VarChar` + `z.enum` — yang terasa bertele-tele saat menulisnya —
adalah alasan tunggal kenapa tidak ada satu pun tipe yang menuntut desain ulang
saat berpindah mesin. Ia juga sumber temuan **S3**: harga dari portabilitas itu
adalah ketiadaan penjaga di tingkat basis data.

### 1.6 Setiap tabel nyata punya indeks sekunder

Satu-satunya tabel tanpa indeks selain `PRIMARY` adalah `_prisma_migrations`,
milik Prisma.

---

## 2. S1 — 18 indeks yang dibuat MySQL untuk kita, dan PostgreSQL tidak

**Ini temuan terpenting di dokumen ini**, dan ia tidak akan pernah muncul sebagai
galat.

MySQL/MariaDB **mewajibkan** indeks pada kolom FK dan **membuatnya sendiri** bila
tidak dideklarasikan — nama indeksnya berakhiran `_fkey`. PostgreSQL **tidak**:
sebuah `FOREIGN KEY` di PostgreSQL tidak membawa indeks sama sekali. Jadi setiap
kolom FK yang indeksnya tidak ditulis di skema Prisma akan **kehilangan
indeksnya** saat pindah, dan satu-satunya gejalanya adalah kueri yang perlahan
melambat.

Diukur di basis data hidup — kolom FK yang **tidak punya** indeks selain yang
berakhiran `_fkey`:

| Basis data | Kolom |
|---|---|
| buku PT (×17) | `approval_requests.rule_id` · `contract_items.contract_id` · `contract_payments.contract_id` · `documents.contract_id` · `fixed_assets.{asset,accumulated,expense}_account_id` · `fixed_asset_categories.{asset,accumulated,expense}_account_id` · `invoice_items.invoice_id` · `invoice_payments.invoice_id` · `journals.reversal_of_id` · `production_orders.cost_center_id` |
| `sai_control` | `api_tokens.created_by_user_id` |
| `sai_platform` | `payments.platform_invoice_id` · `platform_invoices.subscription_id` · `platform_invoices.target_plan_id` · `subscriptions.plan_id` |

**14 per buku × 17 buku + 1 + 3 = 242 indeks** yang tidak akan dibuat.

Dua di antaranya menunjuk tabel yang sudah cukup besar untuk terasa:
`contract_items` (767 baris) dan `contract_payments` (720) — dan keduanya diambil
lewat `contract_id` pada setiap pembukaan detail kontrak.

**Perbaikannya benar di kedua mesin:** deklarasikan `@@index` di skema Prisma.
Di MariaDB itu tidak mengubah apa pun secara fungsional (indeksnya sudah ada,
hanya namanya menjadi eksplisit); di PostgreSQL itu satu-satunya hal yang
membuatnya ada. Jadi **dikerjakan sekarang, bukan saat migrasi** — dengan begitu
ia ikut teruji oleh produksi yang berjalan sebelum mesinnya berganti.

### 2.1 Catatan metode: sapuan skema saja menjawab salah

Sapuan pertama saya atas skema Prisma memulangkan **32** kolom `*Id` tanpa
`@@index`. Angka itu salah dua arah sekaligus:

- Regex `@relation` saya tidak menangkap deklarasi **multi-baris**, jadi
  `fixed_assets.asset_account_id` tercatat "bukan relasi" padahal ia FK — dan
  terbukti punya indeks `_fkey` di basis data hidup.
- Sebaliknya, beberapa kolom `*Id` memang **bukan** FK sama sekali (lihat §3),
  jadi ia bukan bagian dari temuan ini.

Jawaban yang benar hanya bisa datang dari **`information_schema` basis data yang
berjalan**, bukan dari membaca skema. Dicatat di sini karena siapa pun yang
mengulang audit ini akan tergoda mengulangi kesalahan yang sama.

---

## 3. S2 — 10 kolom `*_id` yang tidak terindeks di mesin mana pun

Berbeda dari S1, ini **sudah** menjadi keadaan hari ini: kolom ini bukan FK, jadi
MySQL tidak membuatkan apa pun, dan skemanya juga tidak meminta.

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

**Ketiadaan FK-nya benar** dan tidak boleh "diperbaiki": itu aturan isolasi
multi-PT. **Ketiadaan indeksnya tidak.** Yang paling terasa `audit_logs.user_id`
— halaman audit menyaring per pengguna, dan tabel itu tumbuh selamanya tanpa
pernah dipangkas.

---

## 4. S3 — tidak ada penjaga nilai di basis data, dan nilainya sudah menyimpang

`docs/DATABASE.md` memilih `String @db.VarChar` + `z.enum` alih-alih enum native.
Alasannya kuat (§1.5): portabilitas, dan menambah nilai enum di MySQL adalah
`ALTER TABLE` yang mengunci. Tapi konsekuensinya harus dinyatakan dengan jujur:
**`z.enum` menjaga jalur tulis lewat aplikasi, dan tidak menjaga apa pun selain
itu.**

**CHECK constraint di `sai_production`: 0.**

Dan ini bukan risiko teoretis. Kosakata `src/lib/constants.ts:168`:

```ts
export const CONTRACT_STATUSES = ["signed", "pending", "canceled"] as const;
```

Nilai yang **benar-benar ada** di buku pt-sai:

| status | baris |
|---|---|
| `pending` | 469 |
| **`completed`** | **101** ← di luar kosakata |
| `canceled` | 39 |
| ~~`signed`~~ | **0** ← ada di kosakata, tak pernah dipakai |

Dua kesalahan berlawanan arah sekaligus: satu nilai dipakai 101 kali tanpa pernah
diizinkan, satu nilai diizinkan tanpa pernah dipakai. Inilah 101 dari 1.439
temuan `check-data-conformance` — jadi pemeriksa kesesuaian **sudah** menemukan
ini; yang tidak ada adalah sesuatu yang **mencegahnya**.

🔶 Tersimpulkan: `completed` masuk lewat impor data warisan, bukan lewat form.
Itu konsisten dengan `signed` yang nol — kosakata aplikasi dan kosakata data
warisan tidak pernah dipertemukan.

### 4.0 Dari mana `completed` datang — ditelusuri 12 Okt 2026

Keputusan kosakata butuh bukti, bukan dugaan. Ini buktinya.

**Ia datang dari impor warisan, bukan dari pemakaian aplikasi.** Ketiga status di
buku pt-sai lahir dalam jendela **dua detik yang sama**:

| status | baris | pertama | terakhir |
|---|---|---|---|
| `pending` | 469 | 2026-07-18 11:42:45.130 | 11:42:46.835 |
| `completed` | 101 | 2026-07-18 11:42:45.139 | 11:42:46.509 |
| `canceled` | 39 | 2026-07-18 11:42:45.093 | 11:42:45.921 |

**Dan status di aplikasi lama berupa ANGKA.** Di dump warisan
(`subt5236_sai_prod_18july.sql`), `tb_trans_contract.status` adalah
`varchar(40) DEFAULT '0'` dengan nilai `'0'` (1.297×), `'2'` (646×), `'7'`
(180×), `'30'`, `'1'`, dan seterusnya. Jadi **pengimpor yang memetakan angka
menjadi kata**, dan ia memakai kosakata yang lebih kaya daripada yang dimiliki
aplikasi.

**`completed` tidak ada di kode mana pun.** Disapu seluruh `src/`: nol
kemunculan sebagai status kontrak — bukan di `CONTRACT_STATUSES`, bukan di
query, bukan di UI.

**Tapi `signed` BUKAN kosakata mati.** Ia bisa dipilih di form pembuatan
kontrak (`contract-form.tsx:94`). Ia nol baris karena pengimpor tidak pernah
menghasilkannya dan belum ada pengguna yang menyetelnya di buku ini.

#### Jadi pertanyaannya menjadi tajam, dan ia bukan pertanyaan teknis

**Apakah bisnis ini membedakan kontrak yang DITANDATANGANI dari kontrak yang
SELESAI DIKERJAKAN?**

| Kalau YA | Kalau TIDAK |
|---|---|
| `completed` adalah status keempat yang sah, dan pengimpor benar | 101 baris itu dipetakan ke `signed`, dan `completed` dihapus |
| Tambahkan ke `CONTRACT_STATUSES` + label 3 bahasa + posisi warna + tombol saringan | Satu migration `UPDATE`, nol perubahan kode |
| Nol data berubah | Informasi "sudah selesai" HILANG dari 101 kontrak, tanpa jalan balik |

🔶 **Rekomendasi saya: YA** — untuk kontrak, "ditandatangani" dan "selesai
dikerjakan" memang dua keadaan berbeda, dan memetakan 101 baris ke `signed`
membuang informasi yang tidak bisa dipulihkan. Tapi ini **semantik akuntansi
pemilik**, bukan keputusan teknis, jadi saya tidak mengambilnya.

### 4.0.1 Yang SUDAH diperbaiki tanpa menunggu keputusan itu

Penelusuran di atas menemukan cacat yang **tidak** bergantung pada keputusan
kosakata — dan karena itu dikerjakan sekarang.

**Donat status di halaman kontrak dibangun dari tiga status yang DIPAKU:**

```ts
{ name: sah,        value: countByStatus.get("signed")   ?? 0 },
{ name: menunggu,   value: countByStatus.get("pending")  ?? 0 },
{ name: dibatalkan, value: countByStatus.get("canceled") ?? 0 },
```

Diukur di produksi: **609 kontrak · 508 masuk grafik · 101 HILANG** — 16,6%.

Yang membuatnya berbahaya: **grafiknya tidak terlihat salah.** Ia menggambar
tiga irisan rapi dengan jumlah yang tampak masuk akal. Dan tabel di halaman yang
SAMA justru benar — `StatusBadge` punya cadangan dan menampilkan "Completed" —
jadi dua permukaan di satu halaman menjawab berbeda tentang data yang sama.

Diperbaiki lewat `src/lib/contract-status-chart.ts`: tiga yang dikenal tetap di
posisi 0-1-2 (warna dipasangkan per POSISI, bukan per nama), lalu status di luar
kosakata menyusul dan mendapat `unknownTone` yang memang sudah jadi cadangan di
`dashboard-charts.tsx`.

`tests/contract-status-chart.test.ts` menegakkan invariannya: **jumlah irisan =
jumlah kontrak**, apa pun statusnya. Dan ia menolak kembalinya daftar yang dipaku.

Efek sampingnya berguna: **grafiknya sekarang menjadi bukti untuk keputusan
§4.0** — irisan "Completed" terlihat, dengan jumlahnya.

### 4.1 Urutan perbaikan yang tidak boleh dibalik

1. **Putuskan kosakatanya** (keputusan pemilik): apakah `completed` sah dan harus
   masuk `CONTRACT_STATUSES`, atau 101 baris itu harus dipetakan ke `signed`?
2. **Perbaiki datanya** lewat migration bertanggal.
3. **Baru** pasang penjaga tingkat basis data.

Memasang penjaga lebih dulu akan **menolak data yang sudah ada** — dan di
PostgreSQL `ALTER TABLE … ADD CONSTRAINT … CHECK` memvalidasi seluruh baris saat
dipasang, jadi ia akan gagal keras. Itu sebenarnya kabar baik: gagal keras lebih
baik daripada diam, tapi hanya kalau urutannya benar.

### 4.2 Pilihan penjaga di PostgreSQL

| Pilihan | Untung | Rugi |
|---|---|---|
| **`CHECK (status IN (…))`** ← disarankan | Nol tipe baru; `ALTER` menambah nilai tidak mengunci; tetap `text` bagi Prisma | Daftar nilai hidup di dua tempat (kode + DB) — harus dibangkitkan dari `constants.ts`, jangan diketik ulang |
| Enum native PostgreSQL | Penjaga terkuat | Mengubah skema Prisma ke `enum`, dan `ALTER TYPE … ADD VALUE` tidak bisa di dalam transaksi |
| Tabel referensi + FK | Paling fleksibel | 20+ tabel kecil baru; berlebihan untuk kosakata yang jarang berubah |

Disarankan **`CHECK`**: ia menutup lubangnya tanpa menyentuh satu pun tipe, jadi
sifat portabel §1.5 tetap utuh.

---

## 5. Keputusan desain yang harus diambil SAAT pindah mesin

### 5.1 Zona waktu — 165 kolom waktu, semuanya naif

Di buku produksi: **165 kolom `datetime`** dan 2 `date`. `datetime` MariaDB
**tidak menyimpan zona waktu**, dan Prisma memetakan `DateTime` ke
`timestamp(3)` **tanpa** zona di PostgreSQL — jadi bawaannya mempertahankan
perilaku yang sama.

Tapi "sama" di sini berarti mempertahankan satu asumsi yang tak pernah ditulis:
**semua waktu disimpan UTC, dan tampilan mengubahnya ke WIB.** Untuk aplikasi
akuntansi yang penutupan periodenya berbasis tanggal, asumsi yang tak tertulis
itu adalah bom waktu — satu dokumen yang diposting 23:30 WIB bisa jatuh ke
periode yang salah kalau ada satu saja jalur yang lupa mengubahnya.

**Pindah mesin adalah momen termurah untuk memutuskannya**, dan ada dua jawaban
yang sah:

- `timestamptz` untuk kolom **peristiwa** (`created_at`, `posted_at`, `sent_at`)
  — PostgreSQL menyimpan titik waktu absolut, dan konversi berhenti menjadi
  tanggung jawab kode.
- `date` tetap `date` untuk kolom **tanggal akuntansi** (`invoice_date`,
  `period`) — tanggal buku bukan titik waktu, dan memberinya zona waktu justru
  menciptakan kesalahan baru.

❓ **Keputusan pemilik.** Yang TIDAK boleh terjadi: memilih tanpa menyadari bahwa
sebuah pilihan sedang dibuat.

### 5.2 `serial` vs `identity`

99 migration memakai `AUTO_INCREMENT` (49 berkas). Prisma memetakan
`autoincrement()` ke `SERIAL` di PostgreSQL. `GENERATED … AS IDENTITY` adalah
bentuk baku SQL yang lebih bersih, tapi Prisma belum membangkitkannya —
**terima `SERIAL`**, jangan tulis tangan sesuatu yang `prisma migrate` akan
melawan di migration berikutnya.

### 5.3 Satu trigger harus ditulis ulang

`companies_slug_immutable` (satu-satunya trigger di seluruh pemasangan,
dihitung di produksi). PostgreSQL menuntut `CREATE FUNCTION … RETURNS trigger`
lalu `CREATE TRIGGER` — penulisan ulang, bukan terjemahan. Pembuktinya
`scripts/prove-company-slug-immutable.ts` ikut berubah.

---

## 6. Yang TIDAK saya temukan, dan itu berarti

Agar audit ini bisa dipercaya, berikut yang dicari dan **tidak ada**:

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

**Skema ini bisa dipelihara.** Yang membuatnya begitu bukan keberuntungan: tiga
aturan di `docs/DATABASE.md` — uang `Decimal`, enum-like sebagai `String`, dan
`db:migrate:all` ke semua buku — ditegakkan tanpa pengecualian, dan ketiganya
terukur di produksi.

Yang perlu dikerjakan, dalam urutan ini:

1. **S1 sekarang** (sebelum pindah mesin) — deklarasikan 18 `@@index`. Benar di
   kedua mesin; menundanya sampai migrasi berarti ia tidak pernah teruji
   produksi.
2. **S2 kapan saja** — 10 indeks, terutama `audit_logs.user_id`.
3. **S3 bertahap** — kosakata → data → penjaga. Jangan dibalik.
4. **§5.1 saat pindah** — putuskan `timestamptz`, jangan mewarisi asumsi yang tak
   tertulis.

Dan satu pelajaran soal cara mengaudit: **`information_schema` basis data yang
berjalan adalah satu-satunya sumber kebenaran.** Dua dari tiga temuan di dokumen
ini tidak terlihat di skema Prisma, dan satu angka yang saya baca dari skema
ternyata salah (§2.1).

---

## 8. Dikerjakan pada hari yang sama — S1 & S2 DITUTUP

Audit yang temuannya tidak dikerjakan akan ditemukan ulang. S1 dan S2 ditutup
12 Okt 2026; S3 menunggu satu keputusan kosakata.

### 8.1 Kriterianya diperbaiki di tengah jalan, dan itu menemukan 4 lagi

Mula-mula saya mencari "kolom FK yang indeksnya hanya implisit". Kriteria itu
salah — yang menentukan bukan *bagaimana indeksnya dibuat*, melainkan **apakah ia
dideklarasikan di skema Prisma**, sebab PostgreSQL akan dibangun dari skema itu.

Dengan kriteria yang benar — diff **indeks hidup** vs **indeks terdeklarasi** —
muncul empat yang lolos dari analisis berbasis-FK:

| Yang lolos | Kenapa lolos |
|---|---|
| `landed_cost_items.receipt_movement_id` | FK nyata, tapi indeksnya dibuat migration tulis-tangan dengan nama `_idx`, jadi tidak tampak "implisit" — dan tetap tidak terdeklarasi |
| `landed_cost_items.adjustment_movement_id` | sama |
| `approval_requests.decided_by_id` | **Tidak punya FK sama sekali** — indeksnya bernama `_fkey` tapi itu sisa dari constraint yang pernah dicabut. Namanya membohongi pembacanya |
| `companies.is_demo` | Bukan kolom FK sama sekali, jadi tak pernah masuk pencarian FK |

### 8.2 Hasil akhir: nol indeks akan hilang

**28 + 4 = 32 deklarasi `@@index`** ditambahkan ke tiga skema, dan tiga migration
tulis-tangan menyesuaikan basis datanya:

| Migration | Isi |
|---|---|
| `prisma/migrations/0065_indeks_fk_eksplisit` | 15 `RENAME INDEX` + 6 `CREATE INDEX` |
| `prisma/control/migrations/0018_indeks_fk_eksplisit` | 1 `RENAME` + 3 `CREATE` |
| `prisma/platform/migrations/0019_indeks_fk_eksplisit` | 3 `RENAME` |

**`RENAME`, bukan `CREATE`** untuk yang sudah ada: indeksnya memang sudah ada di
MariaDB, jadi `CREATE INDEX` akan menghasilkan indeks **kedua** pada kolom yang
sama — dua kali biaya tulis, nol manfaat baca. Mengganti nama memindahkan nol
byte data.

**Dibuktikan di basis data sekali-pakai** (struktur produksi disalin, migration
diterapkan, lalu dibandingkan dua arah dengan skemanya):

| | indeks hidup | terdeklarasi tapi tak ada | ada tapi tak terdeklarasi |
|---|---|---|---|
| perusahaan | 259 (dari 253) | **0** | **0** |
| kendali | 60 (dari 57) | **0** | **0** |
| platform | 45 | **0** | **0** |

Nol `_fkey` tersisa. Basis data sekali-pakainya dibuang setelah pembuktian.

### 8.3 Penjaga permanen, bukan sekadar perbaikan sekali

`tests/index-fk-parity.test.ts` membaca ketiga skema dan menolak **setiap relasi
tanpa `@@index`**. Ia berjalan di CI pada setiap PR, jadi relasi ke-19 ditolak
pada hari ia ditulis — bukan ditemukan dua tahun kemudian oleh audit berikutnya.

Tiga hal yang membuatnya bukan tes kosong:

1. **`@relation` multi-baris ikut terbaca.** Sapuan pertama saya memakai
   `@relation\([^)]*fields:` yang berhenti di baris pertama, dan karenanya
   melaporkan `fixed_assets.asset_account_id` sebagai "bukan relasi" padahal ia
   FK. Ada tes terpisah yang menjaga pembacanya sendiri — kalau ia kembali ke
   bentuk naif, seluruh berkas uji ini akan hijau karena **tidak melihat apa
   pun**, kegagalan paling berbahaya yang bisa dimiliki sebuah tes.
2. **Indeks komposit hanya menutupi PREFIKSnya.** `[a, b]` tidak menutupi kueri
   atas `b` saja. Memperlakukannya sebagai tertutup akan meloloskan persis kelas
   cacat yang dijaga.
3. **Sudah dilihat MERAH lebih dulu.** Mencabut `@@index([reversalOfId])` dari
   `Journal` membuatnya gagal dan menyebut `Journal.[reversalOfId]` dengan nama.
   Probe pertama saya keliru — saya mencabut salah satu dari enam
   `@@index([invoiceId])` yang ternyata masih tertutup indeks lain di model yang
   sama, dan tesnya hijau dengan benar.

### 8.4 Yang MASIH terbuka

**S3 — penjaga nilai enum-like.** Butuh satu keputusan pemilik lebih dulu:
apakah `completed` sah dan masuk `CONTRACT_STATUSES`, atau 101 baris itu
dipetakan ke `signed`? Setelah itu: perbaiki data, **baru** pasang `CHECK`.
Urutannya tidak boleh dibalik — `ALTER TABLE … ADD CHECK` di PostgreSQL
memvalidasi seluruh baris saat dipasang, jadi ia akan gagal keras.

**§5.1 — zona waktu.** Keputusan `timestamptz` vs `timestamp` harus diambil
**saat** pindah mesin, bukan diwarisi tanpa disadari.
