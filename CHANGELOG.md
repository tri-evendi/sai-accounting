# Riwayat Perubahan

<!-- DIBANGKITKAN dari src/lib/changelog.ts — jangan sunting berkas ini.
     Ubah sumbernya, lalu jalankan: bun run changelog:build -->

Perubahan yang **terlihat oleh pengguna**, per rilis ke produksi.

Bukan `git log`. Log mencatat setiap commit; berkas ini mencatat apa yang
berubah bagi orang yang memakai aplikasinya — dan sengaja diam soal refactor,
penjaga, serta pekerjaan dalam yang tidak mengubah apa pun di layar.

Isi yang sama dibaca pengguna di dalam aplikasi lewat halaman **Apa yang
Baru** (`/docs/apa-yang-baru`), yang dijangkau dari nomor versi di kaki menu
samping.

**Nomor versinya berarti.** `package.json` memegang nomornya,
`next.config.ts` menyuntikkannya saat build, dan `tests/changelog.test.ts`
menolak nomor yang tidak cocok dengan rilis teratas di bawah — jadi rilis
tanpa catatan tidak bisa lolos gerbang.

---

## 0.20.0 — 2026-10-24 — belum digelar

Konsol operator kini menilai antrean tiap jalur dengan ambangnya sendiri; tidak ada perubahan pada tampilan aplikasi.

### Berubah

- Konsol operator: halaman Penjadwal menampilkan ambang peringatan tiap jalur antrean beserta batas durasinya, dan menandai jalur yang melambat.

---

## 0.19.1 — 2026-10-23 (882d801)

Ekspor Rekap Penjualan, Rekap Pembelian, Kas & Bank, dan Realisasi Anggaran kini disiapkan di latar.

### Berubah

- Ekspor Excel Rekap Penjualan per Pelanggan, Rekap Pembelian per Pemasok, Kas & Bank, dan Realisasi Anggaran disiapkan di latar.

---

## 0.19.0 — 2026-10-23 (b7cf615)

Faktur pajak keluaran bisa diekspor sebagai XML Coretax, dan ekspor laporan stok kini disiapkan di latar.

### Baru

- Halaman e-Faktur kini menyiapkan berkas XML untuk diimpor ke Coretax DJP, lengkap dengan daftar faktur yang datanya belum lengkap.
- Data pelanggan kini menyimpan NIK, NITKU, dan jenis pemungut PPN; data perusahaan menyimpan NITKU.

### Berubah

- Ekspor Excel Nilai Persediaan, Riwayat Stok, dan Riwayat Hitung Ulang Stok disiapkan di latar.

---

## 0.18.1 — 2026-10-23 (e17a56c)

Perubahan pengaturan situs, logo, pengumuman, dan teks halaman depan dari konsol kini tampil dalam 5 detik.

### Perbaikan

- Pengaturan pendaftaran, PPN, kontak, logo, pengumuman status, dan teks halaman depan yang diubah dari konsol tampil di situs dalam 5 detik.

---

## 0.18.0 — 2026-10-23 (47f497a)

Teks halaman depan kini disunting sebagai draf, dipratinjau, lalu diterbitkan dengan riwayat yang bisa dikembalikan.

### Berubah

- Perubahan teks halaman depan tampil di situs dalam 30 detik setelah diterbitkan.

---

## 0.17.0 — 2026-10-23 (42c3b1a)

Konsol operator kini mewajibkan aplikasi authenticator saat masuk.

### Baru

- Operator yang belum memasang authenticator dipandu memindai kode QR saat masuk; sesudahnya setiap login memakai kode 6 digit.

---

## 0.16.3 — 2026-10-23 (e7ea52d)

Perusahaan baru yang berhasil dibuat tidak lagi dilaporkan gagal, dan pekerjaan latar yang gagal kini menunggu sebelum dicoba ulang.

### Perbaikan

- Halaman pembuatan perusahaan kini langsung menampilkan perusahaan yang sudah siap, bukan pesan gagal.
- Pekerjaan latar yang gagal dicoba ulang dengan jeda, bukan seketika berulang-ulang.

---

## 0.16.2 — 2026-10-23 (af720db)

Penjadwalan dokumen berulang kini dijalankan layanan latar yang baru; tidak ada perubahan pada tampilan.

### Berubah

- Dokumen berulang dijadwalkan oleh layanan latar yang baru, sama seperti cadangan harian.

---

## 0.16.1 — 2026-10-23 (9bb3d81)

Ekspor Laporan Perubahan Ekuitas kini disiapkan di latar.

### Berubah

- Ekspor Excel Laporan Perubahan Ekuitas disiapkan di latar seperti laporan keuangan lain.

---

## 0.16.0 — 2026-10-23 (b13b14e)

Laporan Perubahan Ekuitas bisa diunduh, dan pencocokan barang kontrak di Umur Piutang kini sama dengan halaman kontrak.

### Baru

- Laporan Perubahan Ekuitas kini bisa diunduh sebagai Excel dan PDF.

### Perbaikan

- Umur Piutang, halaman detail kontrak, dan batas penagihan faktur kini mencocokkan barang kontrak berdasarkan barangnya, bukan hanya namanya — dua barang bernama sama tidak lagi tertukar.

---

## 0.15.2 — 2026-10-23 (ef6b7b7)

Penjadwalan cadangan harian kini dijalankan layanan latar yang baru; tidak ada perubahan pada tampilan.

### Berubah

- Cadangan harian dijadwalkan oleh layanan latar yang baru, dengan pemantauan denyut tersendiri.

---

## 0.15.1 — 2026-10-23 (5c7af90)

Ekspor Excel Arus Kas, Umur Piutang, dan Umur Utang kini disiapkan di latar.

### Berubah

- Ekspor Excel Arus Kas, Umur Piutang, dan Umur Utang disiapkan di latar seperti laporan keuangan lain — halaman tetap bisa dipakai selama berkasnya dibuat.

---

## 0.15.0 — 2026-10-23 (d769335)

Pembaruan basis data tidak lagi menghentikan seluruh layanan, dan pembuatan perusahaan baru lebih terjaga.

### Berubah

- Saat aplikasi diperbarui, buku satu perusahaan yang belum selesai diperbarui ditutup sementara dengan layar penjelasan, sementara perusahaan lain tetap bisa dipakai.

### Perbaikan

- Batas jumlah perusahaan diperiksa ulang tepat sebelum perusahaan baru dibuat, sehingga dua permintaan bersamaan tidak bisa melewatinya.
- Ekspor Excel Umur Piutang dan Umur Utang dari halaman yang disaring "jatuh tempo saja" kini hanya memuat dokumen jatuh tempo.

---

## 0.14.0 — 2026-10-23 (96d110d)

Kontrak bisa ditandai selesai, MFA konsol bisa dipasang dengan aplikasi authenticator, dan tanggal periode tidak lagi bergantung pada zona waktu server.

### Baru

- Kontrak punya status keempat, Selesai, untuk kontrak yang sudah ditandatangani dan pekerjaannya rampung — terpisah dari status pembayarannya.

### Berubah

- Perusahaan baru disiapkan di latar; halaman pembuatan menampilkan kemajuannya sampai selesai.

### Perbaikan

- Batas periode, tahun buku, dan penomoran dokumen selalu mengikuti kalender WIB, apa pun zona waktu servernya.
- Kurs penyelesaian uang muka valas kini diambil dari tanggal yang tepat.

---

## 0.13.1 — 2026-10-22 (827e5a9)

Pengerasan keamanan di sisi server; tidak ada perubahan pada tampilan maupun data.

### Berubah

- Setiap layanan di server kini hanya menerima pengaturan yang memang dibutuhkannya, dan layanan latar berjalan tanpa hak administrator.

---

## 0.13.0 — 2026-10-22 (17462f3)

Ekspor Laba Rugi dan Neraca kini memuat kolom pembanding, tanggal pagi hari tidak lagi mundur sehari, dan pembaruan keamanan.

### Berubah

- Ekspor Excel Laba Rugi dan Neraca disiapkan di latar, seperti Neraca Saldo — halaman tetap bisa dipakai selama berkasnya dibuat.

### Perbaikan

- Ekspor Excel dan PDF Laba Rugi serta Neraca dengan mode pembanding kini benar-benar memuat kolom periode pembanding dan persentase perubahannya.
- Ekspor Laba Rugi yang disaring per pusat biaya tidak lagi gagal saat disiapkan di latar.
- Antara pukul 00.00 dan 07.00 WIB, tanggal bawaan di formulir kas/bank, rekonsiliasi, stok opname, dan dialog laporan kini hari ini, bukan kemarin; pengingat faktur dan transaksi berulang tidak lagi terlambat sehari.
- Faktur yang dibuat dini hari tanggal 1 kini masuk masa pajak e-Faktur bulan itu.
- Pembaruan keamanan pada komponen aplikasi dan login.

---

## 0.12.1 — 2026-10-22 (806ce68)

Ekspor data perusahaan kembali berfungsi, dan mesin basis data lama dipensiunkan.

### Perbaikan

- Ekspor seluruh data perusahaan (hak portabilitas data) kembali menghasilkan berkas; sejak pindah mesin basis data 15 Oktober ia gagal di tabel pertama.
- Ketika server menolak pembuatan buku perusahaan baru karena hak akses, pesannya kini menjelaskan sebabnya, bukan pesan umum.

---

## 0.12.0 — 2026-10-22 (c9b5d9c)

Perusahaan bisa dipindahkan dari langganan ke server sendiri dengan data utuh, dan layanan latar dirampingkan.

### Baru

- Langganan yang pindah ke server sendiri (Enterprise on-premise) kini membawa seluruh buku, pengguna beserta sandinya, hak akses, dan dokumen — tanpa input ulang.
- Selama pemindahan berlangsung, buku tetap bisa dibuka dan diekspor, tetapi perubahan ditolak dengan pesan yang menjelaskan alasannya.

### Berubah

- Akun yang sudah pindah ke server sendiri melihat pesan khusus saat mencoba masuk ke versi langganan, bukan pesan sandi salah.

---

## 0.11.0 — 2026-10-22 (3a6d1d3)

Ekspor Neraca Saldo disiapkan di latar, unduhan ekspor besar kembali bisa dibuka, dan tanggal mengikuti jam Jakarta.

### Berubah

- Ekspor Excel Neraca Saldo kini selalu disiapkan di latar. Setelah menekan tombol ekspor, tunggu beberapa detik sampai tautan unduhannya muncul.
- Batas “per tanggal” dan periode laporan, beserta tanggal yang tertulis di laporan, kini selalu mengikuti jam Jakarta.

### Perbaikan

- Ekspor laporan berukuran besar yang disiapkan di latar sebelumnya gagal diunduh. Kini berkasnya bisa dibuka.
- Tanggal bawaan di formulir penjualan, pembelian, dan perubahan stok kini mengikuti jam Jakarta. Sebelumnya transaksi yang dicatat pukul 00.00–07.00 WIB terisi tanggal kemarin.
- Pencarian cepat (Ctrl+K / ⌘K) tidak lagi membuka halaman yang tidak dicari. Misalnya mengetik “neraca” lalu Enter dulu bisa membuka Ekspor e-Faktur.

---

## 0.10.3 — 2026-10-22 (46d2190)

Laporan kini bisa dicari langsung dari pencarian cepat (Ctrl+K).

### Baru

- Ketik nama laporan di pencarian cepat (Ctrl+K / ⌘K), misalnya “neraca” atau “arus kas”, untuk langsung membukanya. Hanya laporan yang boleh Anda buka yang ditampilkan.

---

## 0.10.2 — 2026-10-22 (b76a90f)

Pencarian cepat (Ctrl+K) langsung bisa diketik, angka di grafik terbaca di tema gelap, dan sumbu grafik Arus Kas memakai format rupiah.

### Perbaikan

- Pencarian cepat halaman (Ctrl+K / ⌘K) kini langsung siap diketik saat dibuka. Sebelumnya ketikan dan tombol panah tidak berbuat apa-apa sampai kolom pencariannya diklik lebih dulu.
- Di tema gelap, nominal pada keterangan grafik Laba/Rugi dan Umur Piutang tertulis hitam di atas latar gelap sehingga tidak terbaca. Kini warnanya mengikuti tema.
- Sumbu grafik di laporan Arus Kas kini memakai format rupiah (“10 jt”) seperti grafik lain, bukan “10.0M”.
- Kolom kata sandi yang wajib diisi kini ikut bertanda bintang, sama seperti kolom wajib lainnya.

---

## 0.10.1 — 2026-10-21 (f79b76c)

Pratinjau Kas & Bank di beranda kembali bekerja, tombol di ponsel tidak lagi terpotong di tepi layar, dan beberapa panel kembali berwarna sebagaimana mestinya.

### Perbaikan

- Tombol “Pratinjau Kas & Bank” di beranda sejak rilis sebelumnya selalu berakhir dengan “Gagal membuat dokumen.” Kini kembali menghasilkan laporannya. Tombol yang sama di halaman Kas & Bank tidak terdampak.
- Di layar ponsel, tombol di kepala beberapa halaman — stok barang, rincian tagihan, aset tetap — berjajar melewati tepi layar, sehingga “Hapus Tagihan” dan “Kembali” tidak terjangkau. Kini tombolnya turun ke baris berikutnya. Isian tanggal di Neraca juga tidak lagi terjepit.
- Panel “Ringkasan Bahasa Sehari-hari” di laporan dan beberapa sorotan lain berlatar abu-abu tua di tema terang; kini kembali biru muda dan teksnya lebih mudah dibaca. Pilihan yang sedang terpilih di daftar pilihan ikut membaik.
- Pesan peringatan berwarna merah — misalnya periode yang sudah ditutup — kini lebih kontras dan lebih mudah dibaca di kedua tema.
- Pengguna papan ketik kini bisa langsung melompat ke isi halaman tanpa menyusuri seluruh menu samping lebih dulu, dan judul pratinjau laporan ikut berganti bahasa.
- Halaman depan, Harga, dan Status tidak lagi bisa digeser ke samping di layar tablet, dan tombol Daftar tidak lagi terpotong.

---

## 0.10.0 — 2026-10-21 (a8d2749)

Logo perusahaan Anda kini tercetak di dokumen, gangguan dan pemeliharaan diumumkan langsung di dalam aplikasi, dan setiap dokumen serta laporan PDF kini dibuat dari data yang tersimpan — bukan dari apa yang kebetulan tampil di layar.

### Baru

- Logo perusahaan bisa diunggah di Pengaturan. Faktur, kontrak, surat jalan, dan nota retur berikutnya dicetak dengan logo itu; dokumen yang sudah dikirim tidak berubah, dan menghapus logo hanya berlaku untuk dokumen sesudahnya.
- Jadwal pemeliharaan dan gangguan layanan kini diumumkan sebagai pita di bagian atas aplikasi dan di halaman Status. Pemeliharaan sudah tampil hingga tiga hari sebelum dimulai, dan gangguan yang sudah pulih masih tercantum sehari penuh sesudahnya.

### Berubah

- Faktur, kontrak, surat jalan, dan nota retur kini dicetak oleh server dari data yang tersimpan di buku, sama persis dengan lampiran yang dikirim lewat surel. Sebelumnya PDF digambar di peramban dari isi halaman yang sedang terbuka, sehingga hasilnya bisa bergantung pada perangkat yang dipakai.
- PDF laporan — laporan keuangan, kas, stok, dan lembar opname — juga dibuat di server. Halaman laporan jadi lebih ringan dibuka, terutama di ponsel, dan isi kertasnya tetap sama.
- Ekspor laporan yang sangat besar tidak lagi ditolak. Ekspor yang melewati batas baris kini dikerjakan di latar dan berkasnya terunduh begitu siap; ekspor berukuran biasa tetap seketika seperti sebelumnya.

### Perbaikan

- Grafik status di halaman kontrak dulu hanya menghitung tiga status, sehingga kontrak berstatus lain — seperti yang sudah selesai — tidak muncul di grafik walau tercantum di tabel di bawahnya. Kini setiap kontrak terhitung, dan warna tiga status utama tidak berpindah.
- Alamat yang salah ketik dan halaman yang gagal dimuat kini menampilkan layar berbahasa Anda dengan jalan kembali, bukan layar polos berbahasa Inggris. Tombol “Coba lagi” kini benar-benar memuat ulang datanya.

---

## 0.9.0 — 2026-10-11 (400698c)

Lambang produk dirapikan dan dipakai di semua tempat — ikon tab, ikon layar depan, dan gambar pratinjau kini gambar yang sama dengan yang ada di dalam aplikasi.

### Berubah

- Ikon aplikasi berganti. Sebelumnya ikon di tab peramban dan di layar depan ponsel menampilkan diagram batang biru — gambar lama yang tidak pernah ikut berubah ketika lambang produk berganti menjadi buku besar. Keduanya kini memakai lambang yang sama dengan yang Anda lihat di pojok kiri atas aplikasi, dalam warna yang sama. Kalau aplikasi ini sudah dipasang ke layar depan, ikonnya ikut berganti setelah ponsel menyegarkannya.
- Gambar yang muncul saat alamat aplikasi ditempel ke WhatsApp atau LinkedIn kini menampilkan lambang produk, bukan huruf awal namanya.

---

## 0.8.0 — 2026-10-10 (45fcb23)

Halaman harga menghitung sendiri apakah lebih murah naik paket atau menumpuk paket kecil, dan halaman depan dibuat lebih tenang — satu warna, perpindahan antar-bagian yang melembut.

### Baru

- Halaman harga menyebutkan hitungannya: untuk jumlah PT yang sama, menumpuk beberapa paket kecil dibandingkan dengan satu paket yang lebih besar, beserta selisihnya per bulan. Angkanya dihitung dari katalog paket yang sedang berlaku — bukan ditulis di kalimatnya — jadi ia ikut berubah sendiri bila harga berubah, dan baris yang kebetulan TIDAK lebih hemat tidak ditampilkan.

### Berubah

- Halaman depan dibuat lebih tenang: seluruh bidang berwarnanya kini satu warna alih-alih empat, dan warnanya melembut di batas antar-bagian alih-alih berhenti di satu garis. Isi, urutan, dan angkanya tidak berubah sedikit pun.
- Halaman yang muncul setelah menekan “Minta penawaran” kini berjudul sama dengan tombolnya dan menyebutkan tiga langkah prosesnya — apa yang Anda kirim, apa yang Anda terima, dan apa yang terjadi setelah disetujui. Sebelumnya ia berjudul “pendaftaran mandiri sedang ditutup”, yang benar tetapi terbaca sebagai penolakan.

---

## 0.7.0 — 2026-10-10 (7198187)

Akun baru dibuka lewat penawaran, bukan pendaftaran mandiri — dan penagihan otomatis berhenti menyentuh akun yang tidak pernah setuju membeli apa pun.

### Berubah

- Pendaftaran mandiri di halaman pendaratan ditutup sementara. Tombolnya kini berbunyi “Minta penawaran”, dan halaman pendaftaran menjelaskan jalannya beserta kanal kontak — kuota PT, migrasi data, dan cara pembayaran disepakati lebih dulu. Harga di halaman harga tetap dipajang sebagai titik mulainya.

### Perbaikan

- Tagihan langganan tidak lagi terbit untuk akun yang tidak punya perjanjian komersial. Akun uji coba dan internal sebelumnya ikut ditagih, ditagih ulang lewat surel pengingat, lalu bukunya ditangguhkan menjadi hanya-baca; buku yang tertutup karena itu sudah dibuka kembali dan tagihannya dibatalkan.
- Tagihan yang digratiskan penyedia berhenti muncul sebagai “Lunas” di riwayat tagihan. Ia kini bertanda “Kompensasi” — nilainya memang nol, dan menampilkannya sebagai lunas membuat riwayat pembayaran terbaca seperti ada uang yang pernah masuk.
- Perpanjangan langganan yang berganti siklus (bulanan ke tahunan, atau sebaliknya) kini mengambil harga dari siklus yang baru. Sebelumnya harganya tertinggal di siklus lama, sehingga langganan tahunan bisa membawa harga bulanan.

---

## 0.6.0 — 2026-10-04 (260f208)

Tahun buku bisa ditutup, saldo mata uang asing dinilai ulang pada kurs penutup, laporan bisa menyandingkan dua periode, dan ada halaman status yang bisa dibuka tanpa masuk.

### Baru

- Laba Rugi dan Neraca bisa menampilkan kolom pembanding: pilih “Periode sebelumnya” atau “Tahun lalu” di penyaring laporan, atau “Tanpa pembanding” seperti sebelumnya. Selisih dan persen perubahannya ikut dihitung per baris. Pembanding yang bernilai nol menampilkan tanda pisah, bukan persentase — dari nol, kenaikan berapa pun tidak punya persen. Kolomnya ikut terbawa ke PDF dan ke lembar sebar.
- Tahun buku kini bisa ditutup dari halaman Tutup Periode. Penutupan memindahkan laba tahun itu ke ekuitas lewat jurnal penutup, dan bisa dibatalkan. Laba Rugi mengecualikan jurnal penutup supaya tahun yang sudah ditutup tidak terbaca nol, dan Neraca memisahkan Laba Tahun Berjalan dari laba tahun lalu yang belum ditutup.
- Ada laporan Perubahan Ekuitas: saldo awal, laba tahun berjalan, penutupan, lalu saldo akhir — beserta rekonsiliasinya terhadap Neraca.
- Saldo piutang, utang, dan kas bermata uang asing bisa dinilai ulang pada kurs akhir bulan, dengan pratinjau sebelum diposting. Tutup Periode menyebutkan bila masih ada saldo valas yang belum dinilai ulang, jadi bulan tidak tertutup di atas kurs yang sudah usang.
- Halaman Status Layanan di alamat /status menyebutkan keadaan pembukuan, langganan & tagihan, serta pengiriman surel pada saat Anda membukanya. Ia sengaja bisa dibuka tanpa masuk — yang paling membutuhkannya adalah orang yang sedang tidak bisa masuk — dan tertaut dari kaki setiap halaman. Pemeliharaan yang dijadwalkan diumumkan di sana sebelum berlangsung, beserta jamnya.

### Berubah

- Halaman bantuan di /docs ditulis ulang dengan kalimat yang lebih pendek. Isinya tidak berubah — angka, contoh, dan aturannya sama persis — hanya lebih enak dibaca.

### Perbaikan

- Tahun buku yang belum berakhir tidak bisa lagi ditutup. Sebelumnya penutupan menerima tahun yang masih berjalan, dan jurnal penutupnya memindahkan laba yang belum lengkap ke ekuitas.

---

## 0.5.0 — 2026-09-05 (f86e86b)

Daftar yang gagal dimuat berhenti tampil sebagai daftar kosong, stok masuk bisa langsung memotong kas, dan kontrak menyebut sendiri apakah ia kena PPN.

### Baru

- Saat menambah stok masuk, Anda bisa memilih kas atau bank yang uangnya keluar untuk barang itu. Nilainya dihitung dari jumlah kali harga pokok dan tampil sebelum disimpan. Bawaannya tetap tidak memotong apa pun — barang yang masuk lewat layar Pembelian sudah punya hutang dan pelunasannya sendiri.
- Kontrak kini menyebut sendiri apakah ia kena PPN, dan faktur yang ditarik darinya mewarisi jawaban itu. Sebelumnya PPN baru muncul di faktur dengan bawaan yang disimpulkan dari mata uang dan pelanggan, sehingga kontrak rupiah tanpa PPN harus dibetulkan dengan tangan pada setiap fakturnya.

### Berubah

- Kontrak lama tidak berubah perilakunya: selama PPN-nya belum dinyatakan, fakturnya tetap memakai bawaan yang sama seperti sebelumnya. Tarifnya tetap mengikuti profil pajak perusahaan pada tanggal faktur — perusahaan non-PKP tetap tidak memungut.

### Perbaikan

- Pemilih pemasok, pelanggan, akun, dan pusat biaya sempat menampilkan “tidak ada pilihan” padahal datanya ada — yang gagal dimuat terbaca sama persis dengan yang memang kosong. Kini kegagalan dikatakan sebagai kegagalan, dan daftar kosong hanya muncul kalau memang tidak ada isinya.
- Jawaban “tidak” pada beberapa isian ya/tidak bisa tersimpan terbalik menjadi “ya” bila dikirim dari luar aplikasi. Menyangkut status PKP serta penonaktifan resep produksi dan stasiun kerja. Nilai yang tidak dikenali kini ditolak, bukan ditebak.
- Beberapa tugas terjadwal di latar bisa macet dan menahan seluruh tugas berikutnya tanpa tanda apa pun. Kini tugas yang macet dihentikan sendiri dan yang berikutnya tetap berjalan.

---

## 0.4.0 — 2026-08-30 (f990c44)

Halaman bantuan baru yang memperlihatkan alur kerja lengkap untuk tiap jenis usaha, lengkap dengan gambarnya.

### Baru

- Halaman bantuan “Alur kerja untuk jenis usaha Anda” — urutan ujung-ke-ujung untuk perdagangan ekspor, distribusi, jasa, dan manufaktur, masing-masing dengan gambar tahapannya dan modul yang mengerjakan tiap tahap.
- Empat gambar alur baru menjelaskan perbedaan tiap jenis usaha secara langsung: mana yang mulai dari kontrak, mana yang tak punya surat jalan sama sekali, dan di mana tahap produksi menyisip.

---

## 0.3.0 — 2026-08-30 (978687f)

Riwayat perubahan kini bisa dibaca dari dalam aplikasi — halaman yang sedang Anda buka ini.

### Baru

- Halaman “Apa yang Baru” — halaman ini sendiri. Sebelumnya catatan perubahan hanya ada di tempat yang dibaca pengembang, jadi menu yang tiba-tiba muncul tidak pernah punya penjelasan yang bisa Anda buka sendiri.

### Berubah

- Nomor versi di kaki menu samping kini bisa diklik dan membawa Anda ke halaman ini. Sebelumnya ia hanya angka yang tidak menuju ke mana-mana.

---

## 0.2.0 — 2026-08-30 (8ac0d9c)

Modul Manufaktur, dan panduan untuk setiap modul — termasuk delapan yang selama ini tidak punya.

### Baru

- Modul Manufaktur: resep produksi, stasiun kerja, dan perintah produksi. Ia tidak menyala sendiri — dinyalakan per perusahaan di halaman Modul Usaha, atau dengan memilih kategori usaha Manufaktur saat setup.
- Perintah produksi menghitung harga pokok barang jadi dari biaya yang sungguhan terpakai: bahan, upah, dan overhead pabrik. Selisih rencana lawan kenyataan ditampilkan sebagai informasi, dan tidak pernah menjadi jurnal.
- Panduan Alur Kerja di Beranda bertambah tujuh: Stok, Kas & Bank, Produksi, Kontrak & Dokumen Ekspor, Aset Tetap, Persetujuan, dan Pajak. Sebelumnya hanya ada tiga, sehingga delapan dari sebelas modul tidak punya panduan urutan sama sekali.
- Halaman bantuan baru tentang manufaktur, dan tur berpandu di layar Perintah Produksi.

### Berubah

- Nomor versi di kaki menu samping kini benar-benar berganti tiap rilis. Sebelumnya ia menampilkan angka yang sama untuk setiap rilis yang pernah ada, sehingga tidak berguna ketika Anda menyebutnya dalam laporan masalah.

### Perbaikan

- Retur Penjualan dan Surat Jalan sebelumnya ikut menghilang ketika modul yang salah dimatikan. Keduanya kini berada di modul yang benar-benar memilikinya.
- Transaksi Berulang tidak lagi menuntut izin faktur; ia memakai izinnya sendiri.

---

## Sebelum penomoran — Maret s.d. 30 Agustus 2026

125 rilis, tidak tercatat satu per satu, dan **tidak akan direkonstruksi**:
pesan gabungnya sebagian besar berbunyi *"Merge pull request #N"*, jadi daftar
per-rilis yang ditulis sekarang akan menjadi karangan yang berpenampilan
catatan. Yang bisa dikatakan jujur adalah temanya. Rinciannya ada di
`git log --first-parent main`.

Versi `0.1.0` menandai seluruh era ini — satu nomor untuk 125 rilis, dan itulah
sebabnya berkas ini ada.

| Tema | Ditutup di |
|---|---|
| Fondasi akuntansi — jurnal berpasangan, buku besar, periode terkunci, persetujuan | Maret–Juli |
| Penjualan, pembelian, persediaan rata-rata tertimbang, biaya impor | Juli |
| Izin terpusat (matriks + override per peran & pengguna) | Juli |
| Trilingual id/en/zh lewat cookie | Juli |
| Desain berpindah ke Ant Design v6; Tailwind dicabut | Juli |
| Multi-perusahaan — satu basis data per PT | Awal Agustus |
| SaaS: paket, kuota, penagihan, konsol operator | Awal Agustus |
| Halaman promosi & harga publik | 17–18 Agustus |
| Dokumentasi dalam aplikasi (`/docs`) | Agustus |
| Kontrak → pelanggan tertaut; penjaga pihak pada faktur | 27 Agustus |
| Pemasok pada mutasi stok; pilihan akun kas/bank pada pelunasan | 27 Agustus |
| Modul Manufaktur | 30 Agustus |
