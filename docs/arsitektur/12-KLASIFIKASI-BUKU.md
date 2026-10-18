# 12 — Klasifikasi Buku: Produksi atau Uji

> **ARSIP: potret 11 Oktober 2026**, diambil di MariaDB sebelum penukaran ke
> PostgreSQL · [indeks](./README.md)
>
> Sesudahnya: PostgreSQL 15 Okt 2026 ([dok 11](./11-RENCANA-POSTGRESQL.md)),
> monorepo 18 Okt 2026 ([dok 14](./14-RENCANA-MONOREPO.md)). Status terkini:
> aturan dan putusannya (§2, §4, §5) tetap berlaku; dua keputusan pemilik di §6
> masih terbuka. Tabel di §3 tidak diperbarui; untuk angka per buku hari ini,
> jalankan ulang `bun run classify:books` (atau `-- --json`). Hasil di dokumen
> ini dibangkitkan skrip itu pada tanggal di atas.

## 0. Hasilnya, dalam satu angka

> **2 dari 17 buku** berisi data sungguhan, sehingga temuan kesesuaiannya layak
> dipercaya.

Laporan `job-conformance`, yang sudah menemukan cacat senilai Rp 774 juta,
dengan begitu ikut menyapu 15 buku yang temuannya tidak menyangkut pembukuan
siapa pun. Temuan dari buku percobaan bercampur dengan temuan nyata dan
mengurangi kepercayaan pada laporannya.

## 1. Kenapa nama tidak boleh menjadi dasarnya

Instans produksi memuat nama yang berpola uji (`..._uji_wisaya_416`,
`..._data_dummy`, `..._demo`) dan tiga kelompok yang nyaris kembar
(`pt_saro` / `pt_saroo` / `pt_saro_sejati`). Klasifikasi dari nama keliru ke dua
arah:

- `sai_t4_sai` dan `sai_t4_selamat` terdengar seperti uji;
- `sai_t5_pt_rio_alexander_silaban` terdengar sungguhan.

Keduanya tidak bisa dibuktikan dari namanya. Kekeliruan yang mahal adalah
memperlakukan buku nyata sebagai uji, karena pembukuan seseorang lalu
dikecualikan dari pemeriksaan.

## 2. Dasar yang dipakai

Dua tanda yang tidak bisa dipalsukan oleh penamaan:

| Tanda | Kenapa ia bukti |
|---|---|
| **Pelanggan & kontrak tanpa tanda `[CONTOH]`** | Wisaya penyiapan menyemai data contoh ke setiap PT baru, dan semuanya bertanda. Apa pun di luar itu diketik orang |
| **Bentuk semai**: 28 dokumen (12 kas + 7 faktur + 5 pembayaran + 4 pemasok) + 1 saldo awal | Bentuknya tetap. Buku yang jurnalnya persis sebentuk itu belum pernah dipakai |

Ada satu tanda turunan: `reversal` sebanyak ~28 adalah jejak data contoh yang
dibersihkan (izin `sample.clear`). Buku seperti itu pernah disiapkan lalu
dikosongkan, pola yang khas untuk percobaan.

Aturannya fungsi murni: `src/lib/book-classification.ts`, dijaga
`tests/book-classification.test.ts` (19 tes). Salah satu tesnya menuntut
agar tidak ada alasan yang menyebut nama basis data, supaya pembaca tidak
menyangka nama ikut menjadi dasar.

## 3. Hasil per buku

| Kelas | Buku | Dasar |
|---|---|---|
| **produksi** | `sai_production` | 66 pelanggan + 609 kontrak nyata |
| **dipakai-ringan** | `sai_t1_uji_wisaya_416` | 37 jurnal, 21 di luar semai; aktivitas terakhir 51 hari lalu |
| **semai-saja** | `sai_t2_demo` *(`is_demo`)* | 29 jurnal, 16 bertanda `[CONTOH]` |
| **semai-saja** | `sai_t11_data_dummy` | 28 jurnal, 16 bertanda `[CONTOH]` |
| **semai-dibersihkan** | `sai_t8_pt_saroo` | 28 pembalikan ≈ bentuk semai |
| **semai-dibersihkan** | `sai_t9_pt_saro` | 29 pembalikan |
| **semai-dibersihkan** | `sai_t9_cv_saro` | 28 pembalikan |
| **semai-dibersihkan** | `sai_t10_suburanugerahindonesia` | 29 pembalikan |
| **nyaris-kosong** | `sai_t3_pt_movin_nusantara_cakrawala` | 1 jurnal, nol `[CONTOH]` |
| **nyaris-kosong** | `sai_t4_sai` | 5 jurnal, nol `[CONTOH]`, 3 data nyata |
| **nyaris-kosong** | `sai_t6_pt_subur_anugerah_indonesia` | 1 jurnal, 3 data nyata |
| **nyaris-kosong** | `sai_t1_uji_pindahan_425` | 3 jurnal, 4 data nyata |
| **nyaris-kosong** | `sai_t8_pt_saro` | 1 jurnal, 4 data nyata |
| **nyaris-kosong** | `sai_t8_pt_saro_sejati` | 2 jurnal, 1 data nyata |
| **kosong** | `sai_t5_pt_rio_alexander_silaban` | nol jurnal |
| **kosong** | `sai_t7_pt_subur_anugerah_indonesia` | nol jurnal |
| **kosong** | `sai_t4_selamat` | nol jurnal |

```
produksi            1
dipakai-ringan      1
semai-saja          2
semai-dibersihkan   4
nyaris-kosong       6
kosong              3
──────────────────────
total              17
```

### Catatan, bukan rekomendasi

Nama `sai_t1_uji_wisaya_416` menyebut uji wisaya (#416), tetapi isinya
menunjukkan aktivitas di luar semai. Aturannya melaporkan apa adanya tanpa
menebak. Apakah buku itu dianggap uji adalah keputusan pemilik.

## 4. `is_demo` bukan penanda yang dicari

Kolom `companies.is_demo` sudah ada, tetapi jangan dipakai untuk menandai buku
uji. Kolom ini mengubah perilaku:

| Pembacanya | Akibatnya |
|---|---|
| `demoWriteRefusal` di `page-auth.ts` dan `auth-guard.ts` | Buku menjadi hanya-baca |
| `demo-company-banner.tsx` | Banner muncul di layar pengguna |
| `subscription-lifecycle.ts` | Perlakuan langganan berbeda |
| 4 produser penjadwal (`notify:*`, `remind:customers`, `recurring:run`) | Buku dikecualikan dari pekerjaan latar |

Menandai buku uji sebagai `is_demo` akan menolak tulisan di buku yang mungkin
masih dipakai seseorang. Per 11 Okt 2026 hanya satu buku ber-`is_demo`:
`sai_t2_demo`.

Penanda "buku ini uji, kecualikan dari laporan kesesuaian" harus terpisah dari
`is_demo`. Penanda itu belum dibuat; lihat §6.

## 5. Pertanyaan cadangan: terjawab

Peta jalan (§2.2 butir 3) menyisakan pertanyaan apakah buku uji perlu
dikecualikan dari cadangan, dengan catatan *"ukur dulu ukuran dumpnya; bila
kecil, biarkan."*

Sudah diukur (di MariaDB, 11 Okt 2026):

| | |
|---|---|
| Seluruh `sai_*` | **78,1 MB** |
| `sai_production` (satu-satunya buku produksi) | 11,7 MB |
| Setiap buku lainnya | **tepat 4,0 MB** |

Angka 4,0 MB yang sama di 16 buku adalah overhead struktural InnoDB untuk 62
tabel, bukan data. Ukuran di PostgreSQL berbeda (ukur ulang dengan
`pg_database_size`), tetapi putusannya tidak bergantung pada angka persisnya.
Mengecualikan 15 buku menghemat ~60 MB dari 78 MB. Penghematan itu tidak
sepadan dengan daftar pengecualian yang harus dipelihara tangan.

> **Putusan: jangan kecualikan dari cadangan.** Dump seluruh server
> (`pg_dumpall`; dulu `--all-databases`) dipilih karena daftar tangan akan
> tertinggal saat pelanggan baru mendaftar, dan buku yang tertinggal tidak
> tercadangkan tanpa ada yang tahu.

## 6. Yang masih terbuka

| # | Hal | Siapa yang memutuskan |
|---|---|---|
| 1 | Penanda "buku uji" terpisah dari `is_demo` (kolom baru, atau konvensi yang dibaca skrip) | Pengembang, setelah #2 dijawab |
| 2 | Apakah buku uji dikecualikan dari laporan kesesuaian | ❓ Pemilik. Mengecualikan berarti berhenti memeriksanya, padahal buku uji yang rusak kadang menandakan masalah nyata |
| 3 | Apakah 3 buku `kosong` + 4 `semai-dibersihkan` dirapikan | ❓ Pemilik. Penghapusan basis data tidak bisa dibalik |

Butir 2 dan 3 sengaja tidak diputuskan di sini. Modul klasifikasinya juga tidak
pernah menyarankan penghapusan: "tampaknya tidak dipakai" bukan dasar yang
memadai untuk tindakan yang tidak bisa dibalik. Buku yang tidak dipakai enam
bulan tetap milik seseorang.

## 7. Menjalankan ulang

```bash
bun run classify:books              # tabel + ringkasan
bun run classify:books -- --json    # keluaran mesin

# Di server (klien butuh jaringan Docker; layanan `migrate` tersambung langsung
# ke `pg:5432`, tidak lewat PgBouncer; kredensialnya dari DATABASE_URL /
# CONTROL_DATABASE_URL layanan itu):
docker compose run --rm --no-deps migrate bun run classify:books
```

Skripnya hanya membaca. Dijaga `tests/book-classification.test.ts`, yang
menolak setiap pernyataan SQL pengubah data dan setiap `.create(`/`.update(`/
`.delete(`/`.upsert(` di sumbernya.
