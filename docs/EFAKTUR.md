# e-Faktur (Coretax DJP) — runbook

Status per 23 Okt 2026. Ada dua jalur:

1. **Unggah XML manual ke Coretax.** Bisa dipakai hari ini tanpa kontrak apa pun.
2. **Kirim lewat PJAP** (Penyedia Jasa Aplikasi Perpajakan). Antrean, pelari Go,
   dan status per faktur sudah ada. Penyedia sungguhannya masih **kerangka**,
   menunggu pemilik memilih PJAP.

## 1. Jalur manual (hari ini)

1. Isi identitas pajak penjual di **Pajak → e-Faktur**: NPWP (15 atau 16 digit)
   dan NITKU (opsional; kosong = kantor pusat, NPWP + `000000`).
2. Lengkapi data pelanggan lokal: NPWP **atau** NIK (16 digit), NITKU cabang
   bila ada. Untuk pembeli pemungut PPN, isi juga *Jenis pembeli e-Faktur*
   (02 = instansi pemerintah, 03 = selainnya).
3. Pilih masa pajak, lalu lihat kartu **Perlu dilengkapi**. Faktur yang datanya
   kurang tidak dimasukkan ke berkas dan disebut alasannya.
4. Klik **Unduh XML Coretax**.
5. Di Coretax buka **e-Faktur → Pajak Keluaran → Impor Data**, unggah XML-nya,
   lalu tanda tangani faktur di Coretax. NSFP diberikan Coretax saat itu.
6. **Faktur ekspor (PEB) tidak diimpor.** PEB adalah dokumen yang dipersamakan
   dengan faktur pajak. Tarik datanya di **e-Faktur → Dokumen Lain → Pajak
   Keluaran → Prepopulated PEB**. NPWP pemilik barang harus cocok.

### Bentuk berkas

Pembangunnya `packages/core/src/coretax-xml.ts`. Golden file-nya ada di
`tests/golden/coretax-faktur-keluaran.xml`.

- **Struktur.** Akar `TaxInvoiceBulk` → `TIN` → `ListOfTaxInvoice` →
  `TaxInvoice` → `ListOfGoodService` → `GoodService`. Urutan elemen sama persis
  dengan sampel DJP, termasuk ejaan resmi `BuyerAdress` (dengan satu d).
- **Kode transaksi.** Tarif efektif **11%** ditulis sebagai kode **04** (DPP Nilai
  Lain): `OtherTaxBase` = 11/12 × `TaxBase`, `VATRate` 12 (PMK 131/2024). Tarif
  **12%** ditulis sebagai kode **01**, dengan `OtherTaxBase` = `TaxBase`. Pembeli
  pemungut PPN memakai **02/03** dengan DPP 11/12 yang sama.
- **Satuan.** Satuan bebas di baris faktur dipetakan ke kode `UM.00xx`, misalnya
  kg → `UM.0003`. Satuan yang tidak dikenal ditulis `UM.0033` (Lainnya) dan
  muncul sebagai peringatan.
- **Kode barang.** `Code` selalu `000000`, kode umum yang dipakai kedua sampel
  DJP. Kolom ini opsional.
- **Tidak didukung otomatis.** Kode 07/08 (fasilitas) butuh keterangan tambahan
  dan cap fasilitas yang tidak dicatat buku. Tarif 0% lokal juga tidak didukung.
  Faktur seperti itu ditahan dan dibuat manual di Coretax.
- **Batas.** Satu berkas paling banyak 1.000 faktur.

## 2. Jalur PJAP

```
app-customer ──(efaktur_submissions: queued + XML beku)──┐
     │ publishJob integration.efaktur_submit             │ buku PT
     ▼                                                    │
svc-integrator (jalur integration, Go) ── HTTP ──► PJAP   │
     │ publish efaktur.record / integration.efaktur_poll  │
     ▼                                                    │
svc-worker (peran interactive, Node) ── tulis status ─────┘
```

| Kind | Pengklaim | Isi |
|---|---|---|
| `integration.efaktur_submit` | Go `internal/integrationlane` | kirim XML beku + `idempotency_key` |
| `integration.efaktur_poll` | Go | tanya status; jeda = backoff kontrak; batas `efaktur.poll_max_rounds` (24 putaran ≈ 19 jam) |
| `integration.efaktur_cancel` | Go | batalkan faktur yang sudah disetujui |
| `efaktur.record` | Node `workers/interactive.ts` | tulis hasil (status, NSFP, pesan) ke `efaktur_submissions` |

- **Idempotensi.** Kuncinya per perusahaan + faktur + revisi
  (`sai-<company>-inv<id>-r<n>`) dan ikut dikirim ke PJAP. Pengulangan otomatis
  atas upaya yang sama tidak menerbitkan dua faktur. Kirim ulang sesudah ditolak
  membuat baris baru dengan revisi + 1.
- **Kegagalan.** Galat permanen (kredensial, penyedia belum ada) langsung
  menjadi `failed` beserta pesannya. Galat sementara (jaringan, 5xx) diulang
  dengan backoff kontrak, sampai 5 percobaan. Pada percobaan terakhir statusnya
  dicatat `failed` lebih dulu.
- **Status.** `queued → submitted → approved` (NSFP terbit), atau `rejected` /
  `failed`. Pembatalan: `approved → cancel_requested → canceled`. Bila PJAP
  menolak pembatalan, status kembali ke `approved` beserta pesannya. Kosakatanya
  ada di `contract/kinds.yaml` → `efaktur:` dan dijaga CHECK di migration
  company 0004.
- **Kredensial.** Disimpan per PT di `company_settings.efaktur_*`, tersegel
  AES-256-GCM dengan `SETTINGS_ENCRYPTION_KEY`. Hanya jalur `integration` yang
  membukanya, tepat sebelum kirim. Rahasia tidak pernah dicetak, tidak masuk
  muatan pekerjaan, dan tidak dikirim balik ke layar. `svc-integrator` kini
  menerima `SETTINGS_ENCRYPTION_KEY`, dengan nilai yang sama seperti di
  `app-customer`.
- **Izin.**
  - `tax.read`: lihat halaman, unduh XML/CSV.
  - `tax.submit`: kirim dan batalkan.
  - `tax.manage`: atur sambungan.

  Bawaan ketiganya akses penuh. Pemilik bisa memberikannya ke Manajer Keuangan
  lewat `/permissions`.
- **Konsol operator.** Halaman `/efaktur` menampilkan penyedia, mode,
  ada-tidaknya kredensial, dan jumlah kiriman per status untuk setiap PT.
  Kredensialnya sendiri tidak pernah ditampilkan.

### Penyedia

- **`mock`**: uji tanpa jaringan dan tanpa keadaan
  (`services/integrator/internal/efaktur/mock.go`).
  - Nama pembeli yang diawali `TOLAK` ditolak.
  - Selain itu kiriman diterima, lalu disetujui pada putaran pertama dengan NSFP
    tiruan berawalan `99`.
  - Layar menandai kirimannya dengan badge "uji".
- **`pjap`**: kerangka (`pjap.go`). Setiap metode gagal permanen dengan pesan
  "penyedia PJAP belum disambungkan". Tidak ada bentuk API yang ditebak.

## Keputusan: daftar-izin tulisan Go TIDAK bertambah

`efaktur_submissions` hidup di **buku PT** dan hanya ditulis Node. Go
melaporkan hasil sebagai pekerjaan `efaktur.record` (baris `jobs`, tabel yang
memang sudah boleh ditulisnya).

Alasan `backup_runs` boleh ditulis Go adalah Go tidak punya jalan lain. Untuk
e-Faktur alasan itu tidak berlaku, karena antrean sudah menjadi perantaranya.
I-3 (layanan tidak saling memanggil) tetap utuh. Penjaga yang menganggap seluruh
tabel buku PT sebagai buku juga tidak perlu dilubangi.

Alasannya juga ditulis di `tests/services-go.test.ts` (`BOLEH_DITULIS`).

## Yang dibutuhkan dari pemilik untuk go-live PJAP

1. **Pilih PJAP** yang melayani e-Faktur Coretax lewat API/H2H, misalnya Mekari
   Klikpajak, OnlinePajak, atau Pajakku. Pastikan fitur H2H-nya **disetujui
   DJP**. Sejak PER-5/PJ/2025, H2H hanya layanan pendukung "sepanjang telah
   disetujui DJP".
2. **Kontrak dan dokumentasi API** dari PJAP itu: autentikasi, unggah, status,
   pembatalan, dan PDF. Dokumentasi ini tidak publik.
3. **Akun sandbox** beserta client id/secret untuk satu PT uji, dan sertifikat
   elektronik/kuasa yang diminta PJAP.
4. Sesudah itu pengembang mengisi `internal/efaktur/pjap.go`: URL sandbox dan
   produksi sebagai konstanta, pemetaan status ke `contract.EfakturStatus*`,
   dan tes `httptest`. Lalu uji ujung-ke-ujung di sandbox.
5. Di produksi, setel `SETTINGS_ENCRYPTION_KEY` untuk `svc-integrator`
   (sudah tercantum di compose).

## Belum dibangun

- **PDF faktur yang disetujui.** `Provider.DownloadPDF` sudah ada di antarmuka
  dan di mock, tapi belum disambungkan ke antrean. Sementara itu, unduh PDF dari
  Coretax.
- **Retur, faktur pengganti, Dokumen Lain Keluaran.** Semuanya masih lewat
  Coretax.
- **Faktur Masukan.** Di Coretax datanya *prepopulated* untuk pembeli, jadi
  tidak ada yang perlu diimpor.

## Riset (23 Okt 2026) dan TODO-verify

Sumber:

- Format XML resmi: https://www.pajak.go.id/en/node/112031 (Sample Faktur PK
  Template v1.4 XML; Converter v1.6, 22 Jul 2025; templat Excel v1.6.1 dengan
  lembar REF dan Keterangan).
- Kode 04 untuk DPP 11/12:
  https://news.ddtc.co.id/berita/nasional/1807950/ppn-dihitung-dengan-dpp-1112-dari-harga-jual-djp-kode-fakturnya-04
- Kode 02/03 untuk pemungut tetap memakai DPP nilai lain:
  https://ortax.org/djp-meski-pakai-nilai-lain-transaksi-dengan-pemungut-tetap-pakai-kode-02-03
- PEB sebagai dokumen yang dipersamakan dengan faktur pajak (PER-11/PJ/2025
  Ps. 62): https://news.ddtc.co.id/berita/nasional/1811038/simak-kini-ada-27-dokumen-yang-dipersamakan-dengan-faktur-pajak
- Prepopulated PEB:
  https://ortax.org/begini-langkah-penarikan-data-pib-atau-peb-via-modul-e-faktur-coretax
- NSFP otomatis:
  https://news.ddtc.co.id/berita/nasional/1806400/coretax-djp-nsfp-bakal-diberikan-otomatis-setelah-pkp-submit-faktur
- Kanal H2H lewat PJAP (KT-06/2025):
  https://pajak.go.id/sites/default/files/2025-02/KT-06%20tentang%20Penerbitan%20Faktur%20Pajak_0.pdf
- PER-5/PJ/2025 tentang layanan PJAP:
  https://ortax.org/pasca-implementasi-coretax-djp-sesuaikan-layanan-yang-wajib-disediakan-pjap
- Batas 1.000 faktur per berkas:
  https://news.ddtc.co.id/review/konsultasi-coretax/1808895/faktur-xml-cuma-15-baris-tapi-erornya-100-baris-lebih-apa-yang-salah

**TODO-verify.** Semua butir di bawah belum terbukti:

- **XSD.** `TaxInvoice.xsd` tidak diterbitkan DJP. Panjang maksimum kolom,
  pemisah desimal `.`, dan perlakuan elemen kosong (`<X/>` versus
  `xsi:nil="true"`, yang juga muncul di string konverter) disimpulkan dari
  sampel. **Uji unggah satu berkas ke Coretax sebelum dipakai massal.**
- **Negara pembeli.** Sampel XML DJP menulis `BuyerCountry` = `IND` (India),
  sedangkan lembar REF memakai `IDN` (Indonesia). Berkas ini menulis `IDN`.
- **Kode untuk 08.** Kode AddInfo/FacilityStamp untuk transaksi 08 belum
  diketahui. Tidak dibangun.
- **Perubahan 2026.** Belum diketahui apakah ada perubahan format sesudah
  v1.6.1.
- **API PJAP.** Bentuk API PJAP mana pun (OAuth2 atau API key, endpoint, status)
  belum diketahui. Tidak ada dokumentasi publik.
