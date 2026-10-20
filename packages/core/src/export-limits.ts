/**
 * BATAS EKSPOR & PERIODE LAPORAN (03 §4).
 *
 * MURNI: tanpa Prisma, tanpa IO, tanpa `next/*`. Angkanya di `core` karena
 * tahap 1c memindahkan pembuatan dokumen ke proses Node terpisah (§5), dan
 * pekerja di `workers/` tidak bisa mengimpor `@/…` — batas yang hanya hidup di
 * `src/lib` akan ditinggalkan oleh pemakainya sendiri begitu jalur itu pindah.
 *
 * ── Yang membatasi apa, dan yang TIDAK ───────────────────────────────────────
 *
 * Dua batas di sini bekerja pada dua hal yang berbeda, dan menyamakannya
 * membuat salah satunya terbaca lebih kuat dari yang sebenarnya:
 *
 * `EXPORT_MAX_ROWS` dan `EXPORT_MAX_BODY_BYTES` adalah batas KAPASITAS. Mereka
 * memikul kebenaran: tanpa keduanya satu permintaan POST bisa menyuruh mesin
 * 3,6 GB merakit lembar sebar sebesar apa pun, dan permintaan itu datang dari
 * peramban — artinya dari luar.
 *
 * `REPORT_MAX_PERIOD_DAYS` adalah batas KEWARASAN, bukan kapasitas, dan itu
 * harus dikatakan apa adanya: periode TIDAK menentukan ongkos. Laporan lima
 * tahun di tenant yang baru berumur setahun membaca baris yang sama banyak
 * dengan laporan setahun — "seluruh data saya" selalu muat di jendela mana pun
 * yang masuk akal. Jadi batas hari hanya menolak yang mustahil
 * (`?from=1900-01-01`, rentang terbalik, galat ketik di penanda buku). Yang
 * sungguh memikul kapasitas adalah batas baris di atas, dan sejak tahap 1c,
 * antrean (§4) — laporan periode panjang berhenti menjadi permintaan HTTP dan
 * menjadi pekerjaan.
 */

/**
 * Baris maksimum satu lembar sebar.
 *
 * Dihitung pada MODEL LEMBAR yang sudah dipetakan, bukan pada muatan JSON yang
 * masuk — lihat `src/app/api/reports/export/route.ts`. Bedanya menentukan:
 * penghitung per-jenis-laporan yang ditulis tangan akan melewatkan laporan
 * ke-dua-belas yang ditambahkan orang lain enam bulan dari sekarang, sementara
 * `SheetModel.rows` adalah satu-satunya bentuk yang dilewati SEMUA laporan.
 *
 * 50.000 dipilih di atas laporan jujur mana pun (neraca saldo satu baris per
 * akun — ratusan; umur piutang satu baris per dokumen terbuka — ribuan) dan
 * jauh di bawah batas Excel sendiri (1.048.576 baris), karena yang habis lebih
 * dulu bukan format berkasnya melainkan memori: ExcelJS menahan seluruh model
 * baris sebagai objek JS sebelum satu byte pun ditulis.
 *
 * ⚠ SENGAJA berbeda dari `MAX_IMPORT_ROWS` (10.000, `src/lib/import/spec.ts`),
 * dan perbedaannya bukan kelalaian: angka impor disamakan dengan Accurate agar
 * berkas yang diterima aplikasi lain juga diterima di sini, sementara ekspor
 * tidak punya pihak kedua untuk disamakan. Keduanya juga membatasi ongkos yang
 * berbeda — satu baris impor divalidasi lalu DITULIS, satu baris ekspor hanya
 * diformat. Menyamakannya demi kerapian akan memotong laporan yang sah dengan
 * angka yang dipinjam dari masalah orang lain.
 */
export const EXPORT_MAX_ROWS = 50_000;

/**
 * Badan permintaan maksimum untuk muatan ekspor.
 *
 * ⚠ Nilainya WAJIB konsisten dengan `EXPORT_MAX_ROWS`: batas byte yang lebih
 * ketat daripada yang dibutuhkan batas baris membuat batas baris tak pernah
 * tercapai, dan pengguna menerima galat yang menyebut sebab yang salah. Baris
 * terlebar di muatan laporan (umur piutang: sepuluh field berikut nama
 * kuncinya) sekitar 220 byte JSON, jadi 50.000 baris ≈ 11 MB — 16 MiB memberi
 * ruang tanpa membalik urutan kedua batas.
 *
 * Arah sebaliknya juga nyata, dan itu sebabnya KEDUANYA ada: baris JSON
 * termurah (`{"code":"1","name":"x","amount":1}`) hanya ~40 byte, jadi 16 MiB
 * sendiri masih mengizinkan ~400.000 baris — sepuluh kali batas baris. Batas
 * byte membatasi BYTE; batas baris membatasi SEL.
 */
export const EXPORT_MAX_BODY_BYTES = 16 * 1024 * 1024;

/**
 * Rentang periode laporan maksimum, dalam hari kalender inklusif.
 *
 * Sepuluh tahun, dan angkanya BUKAN tebakan kapasitas: ia retensi wajib
 * pembukuan (UU KUP, yang sudah mengikat di repo ini — lihat
 * `src/app/api/tenant/export/route.ts`). Batas di bawah angka itu akan menolak
 * laporan yang justru wajib bisa dijawab oleh buku yang hukumnya menyuruh
 * disimpan — dan laporan yang ditolak demi "melindungi" mesin dari periode yang
 * sah adalah batas yang salah tempat.
 *
 * 3.653 = sepuluh tahun kalender dengan hari kabisatnya.
 */
export const REPORT_MAX_PERIOD_DAYS = 3_653;

/**
 * Rentang hari kalender INKLUSIF antara dua tanggal ISO (`YYYY-MM-DD`).
 *
 * Dihitung di UTC dari string tanggalnya, bukan dari `Date` lokal: aritmetika
 * pada tengah malam lokal bukan kelipatan 86.400.000 ms di zona yang menerapkan
 * DST, dan server yang berpindah waktu akan membuat laporan yang sama terhitung
 * sehari lebih pendek. Tanggal kalender tidak punya zona waktu, jadi
 * perhitungannya juga tidak boleh punya.
 */
export function periodSpanDays(fromISO: string, toISO: string): number {
  const dari = Date.parse(`${fromISO}T00:00:00Z`);
  const sampai = Date.parse(`${toISO}T00:00:00Z`);
  if (Number.isNaN(dari) || Number.isNaN(sampai)) return Number.NaN;
  return Math.round((sampai - dari) / 86_400_000) + 1;
}

/**
 * Awal periode yang sudah dipendekkan supaya rentangnya muat di
 * `REPORT_MAX_PERIOD_DAYS`. Mengembalikan `fromISO` apa adanya bila sudah muat.
 *
 * Yang dipendekkan AWALNYA, bukan akhirnya: ujung yang diminati orang adalah
 * yang baru, dan memotong `to` akan memberi laporan yang berhenti sebelum data
 * terakhir — salah tanpa kelihatan salah. Memotong `from` menghasilkan periode
 * yang lebih pendek, dan periode itu TERCETAK di label laporan serta terbaca di
 * kotak tanggal penyaringnya, jadi pemotongannya mengumumkan dirinya sendiri.
 */
export function clampPeriodStart(fromISO: string, toISO: string): string {
  const rentang = periodSpanDays(fromISO, toISO);
  if (Number.isNaN(rentang) || rentang <= REPORT_MAX_PERIOD_DAYS) return fromISO;
  const awal = Date.parse(`${toISO}T00:00:00Z`) - (REPORT_MAX_PERIOD_DAYS - 1) * 86_400_000;
  return new Date(awal).toISOString().slice(0, 10);
}

/**
 * Kolom maksimum yang boleh diminta satu laporan.
 *
 * Pilihan kolom datang dari dialog parameter, jadi isinya SELALU bagian dari
 * daftar kolom laporan itu — daftar terpanjang hari ini dua belas. 64 bukan
 * perkiraan kebutuhan, melainkan pagar: tanpanya array itu tak berbatas di
 * batas kepercayaan, dan satu juta id kolom karangan akan disaring dengan rapi
 * sesudah satu juta elemen diurai lebih dulu.
 */
export const EXPORT_MAX_COLUMNS = 64;
