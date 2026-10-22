# Kurs Transaksi Bank Indonesia — USD & CNY

`kurs-transaksi-bi.csv` adalah data publik **Kurs Transaksi BI** (kurs beli & kurs
jual per 1 unit valas terhadap rupiah), dibaca oleh
`scripts/fix-legacy-contracts.ts` (`bun run legacy:fix-contracts`) untuk mengisi
kurs dokumen valas warisan. Kurs tengah = (beli + jual) / 2.

| | |
|---|---|
| Sumber | Bank Indonesia — layanan web Kurs Transaksi BI, `https://www.bi.go.id/biwebservice/wskursbi.asmx/getSubKursLokal3?mts=<USD\|CNY>&startdate=<YYYY-MM-DD>&enddate=<YYYY-MM-DD>` (data yang sama dengan unduhan Excel di `https://www.bi.go.id/id/statistik/informasi-kurs/transaksi-bi/default.aspx`) |
| Diambil | 23 Oktober 2026 |
| Cakupan | USD & CNY, 2019-04-01 s.d. 2026-10-22, 1.842 hari bursa per mata uang |
| Lubang terpanjang | 12 hari kalender (cuti bersama Lebaran, 27 Mar – 8 Apr 2025) |
| Bentuk | `date,currency,buy,sell` — rupiah per **1** unit (kolom `nil_subkurslokal` BI = 1,00 untuk keduanya; pembagiannya tetap dilakukan saat konversi) |

## Cara mengambil ulang

Satu permintaan per mata uang per tahun (layanannya menolak rentang yang terlalu
panjang), dengan `User-Agent` peramban — tanpa itu sambungan diputus:

```bash
curl -A "Mozilla/5.0" -o ws_USD_2019.xml \
  "https://www.bi.go.id/biwebservice/wskursbi.asmx/getSubKursLokal3?mts=USD&startdate=2019-04-01&enddate=2019-12-31"
```

Setiap `<Table>` di XML-nya memuat `tgl_subkurslokal` (tanggal),
`mts_subkurslokal` (mata uang), `nil_subkurslokal` (unit), `beli_subkurslokal`,
dan `jual_subkurslokal`. Barisnya: `tanggal, mata uang, beli/unit, jual/unit`.

## Jangan disunting tangan

Berkas ini adalah salinan data BI, bukan tabel kurs aplikasi. Angka yang
"diperbaiki" di sini tidak lagi bisa ditelusuri ke sumbernya, dan skrip
perbaikan mencatat sidik `sha256` berkas yang dipakainya di jejak audit — jadi
penyuntingan akan terlihat sebagai berkas yang berbeda, bukan sebagai sumber yang
sama.
