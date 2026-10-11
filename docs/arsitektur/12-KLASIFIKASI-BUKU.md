# 12 — Klasifikasi Buku: Produksi atau Uji

> Potret **11 Oktober 2026** · [indeks](./README.md)
>
> **Dibangkitkan, bukan diketik.** Jalankan ulang kapan pun:
> `bun run classify:books` (atau `-- --json`). Dokumen ini merekam hasilnya pada
> tanggal di atas; angka tanpa tanggal adalah angka yang akan dipercaya terlalu
> lama.

## 0. Hasilnya, dalam satu angka

> **2 dari 17 buku** punya data yang temuan kesesuaiannya layak dipercaya
> sebagai data **sungguhan**.

Artinya laporan `job-conformance` — alat yang sudah menemukan cacat senilai
Rp 774 juta — menyapu **15 buku yang temuannya bukan tentang pembukuan siapa
pun**. Itu bukan sekadar pemborosan: temuan dari buku percobaan **mencemari**
laporan yang nilainya justru bergantung pada dipercaya.

## 1. Kenapa nama tidak boleh menjadi dasarnya

Instans produksi memuat nama yang berpola uji (`..._uji_wisaya_416`,
`..._data_dummy`, `..._demo`) dan tiga kelompok yang nyaris kembar
(`pt_saro` / `pt_saroo` / `pt_saro_sejati`). Menggodanya untuk mengklasifikasi
dari nama, dan itu salah di **dua arah**:

- `sai_t4_sai` dan `sai_t4_selamat` **terdengar** seperti uji;
- `sai_t5_pt_rio_alexander_silaban` **terdengar** sungguhan.

Keduanya tidak bisa dibuktikan dari namanya. Dan keliru ke arah
"memperlakukan buku nyata sebagai uji" adalah kekeliruan yang **mahal** —
karena konsekuensinya mengecualikan pembukuan seseorang dari pemeriksaan.

## 2. Dasar yang dipakai

Dua tanda yang tidak bisa dipalsukan oleh penamaan:

| Tanda | Kenapa ia bukti |
|---|---|
| **Pelanggan & kontrak tanpa tanda `[CONTOH]`** | Wisaya penyiapan menyemai data contoh ke setiap PT baru, dan **semuanya bertanda**. Apa pun di luar itu diketik orang |
| **Bentuk semai** — 28 dokumen (12 kas + 7 faktur + 5 pembayaran + 4 pemasok) + 1 saldo awal | Bentuknya tetap. Buku yang jurnalnya persis sebentuk itu belum pernah dipakai |

Plus satu tanda turunan yang menjelaskan banyak: **`reversal` sebanyak ~28**
adalah jejak data contoh yang **dibersihkan** (izin `sample.clear`). Buku
seperti itu pernah disiapkan, lalu dikosongkan — pola percobaan, bukan pola
pemakaian.

Aturannya fungsi murni: `src/lib/book-classification.ts`, dijaga
`tests/book-classification.test.ts` (19 tes). Salah satu tesnya menuntut
**tak satu pun alasan menyebut nama basis datanya** — alasan yang menyebut nama
akan membuat pembacanya menyangka nama ikut menjadi dasar.

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

### Catatan yang tidak boleh dibaca sebagai rekomendasi

`sai_t1_uji_wisaya_416` **namanya** menyebut uji wisaya (#416), tetapi
**isinya** menunjukkan aktivitas di luar semai. Aturannya melaporkan apa
adanya dan **tidak menebak** — apakah buku itu pantas dianggap uji adalah
keputusan **pemilik**, bukan keputusan yang boleh diambil sebuah regex.

## 4. `is_demo` BUKAN penanda yang dicari

Kolom `companies.is_demo` sudah ada, dan menggoda untuk dipakai menandai buku
uji. **Jangan** — ia bukan penanda netral, ia **mengubah perilaku**:

| Pembacanya | Akibatnya |
|---|---|
| `demoWriteRefusal` di `page-auth.ts` **dan** `auth-guard.ts` | Buku menjadi **hanya-baca** |
| `demo-company-banner.tsx` | Banner muncul di layar pengguna |
| `subscription-lifecycle.ts` | Perlakuan langganan berbeda |
| 4 produser penjadwal (`notify:*`, `remind:customers`, `recurring:run`) | Buku dikecualikan dari pekerjaan latar |

Menandai buku uji sebagai `is_demo` akan **menolak tulisan** di buku yang
mungkin masih dipakai seseorang. Per 11 Okt 2026 hanya **satu** buku
ber-`is_demo`: `sai_t2_demo`.

Jadi penanda untuk "buku ini uji, kecualikan dari laporan kesesuaian" harus
**terpisah** dari `is_demo`. Itu belum dibuat — lihat §6.

## 5. Pertanyaan cadangan: TERJAWAB

Peta jalan (§2.2 butir 3) menyisakan pertanyaan apakah buku uji perlu
dikecualikan dari cadangan, dengan catatan *"ukur dulu ukuran dumpnya; bila
kecil, biarkan."*

Sudah diukur:

| | |
|---|---|
| Seluruh `sai_*` | **78,1 MB** |
| `sai_production` (satu-satunya buku produksi) | 11,7 MB |
| Setiap buku lainnya | **tepat 4,0 MB** |

Angka 4,0 MB yang identik di 16 buku bukan kebetulan: itu **overhead
struktural InnoDB** untuk 62 tabel, bukan data. Mengecualikan 15 buku akan
menghemat ~60 MB dari 78 MB — dan 78 MB adalah ukuran yang tidak layak
ditukar dengan satu daftar yang harus dipelihara tangan.

> **Putusan: JANGAN kecualikan dari cadangan.** `--all-databases` dipilih
> justru karena daftar tangan **pasti tertinggal** saat pelanggan baru
> mendaftar, dan cadangan "hampir semua" adalah janji yang diingkari
> diam-diam. Menukar jaminan itu dengan 60 MB adalah pertukaran yang buruk.

## 6. Yang masih terbuka

| # | Hal | Siapa yang memutuskan |
|---|---|---|
| 1 | Penanda "buku uji" **terpisah** dari `is_demo` (kolom baru, atau konvensi yang dibaca skrip) | Pengembang, setelah #2 dijawab |
| 2 | **Apakah** buku uji dikecualikan dari laporan kesesuaian | ❓ **PEMILIK** — mengecualikan berarti berhenti memeriksanya, dan buku uji yang rusak kadang justru pertanda masalah nyata |
| 3 | Apakah 3 buku `kosong` + 4 `semai-dibersihkan` dirapikan | ❓ **PEMILIK** — menghapus basis data **tidak bisa dibalik** |

Butir 2 dan 3 **sengaja tidak** diputuskan di sini. Modul klasifikasinya pun
tidak pernah menyarankan penghapusan: *"tampaknya tidak dipakai"* bukan dasar
yang memadai untuk tindakan yang tak bisa dibalik — buku yang tidur enam bulan
tetap buku seseorang.

## 7. Menjalankan ulang

```bash
bun run classify:books              # tabel + ringkasan
bun run classify:books -- --json    # keluaran mesin

# Di server (klien butuh jaringan Docker untuk menjangkau `db:3306`):
docker compose run --rm --no-deps migrate bun run classify:books
```

Skripnya **hanya membaca** — dijaga `tests/book-classification.test.ts`, yang
menolak setiap pernyataan SQL pengubah data **dan** setiap `.create(`/`.update(`/
`.delete(`/`.upsert(` di sumbernya.
