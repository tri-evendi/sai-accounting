# Accurate Online — Peta Fitur & Alur (Referensi Pengembangan)

Sumber: dashboard live `iris.accurate.id/accurate/` (DB: **PI COMMERCIAL — PT SUBUR ANUGERAH INDONESIA**), diakses read-only via CDP. Versi app `v1.0.1#4563`.

Arsitektur UI: Single-Page App bergaya ExtJS. Routing berbasis hash: `#accurate__<modul>__<fitur>`. Tiap fitur dibuka sebagai **tab** di area kerja; setiap dokumen transaksi punya mode **list** (grid) dan **Data Baru** (form entry). Sidebar kiri = ikon modul.

---

## 1. Modul & Fitur (peta lengkap)

### Perusahaan / Setup (`company`)
Preferensi, Akses Grup (role/permission), Pengguna, Penomoran (auto-number per dokumen), Desain Cetakan (print layout), Penyetuju Transaksi (approval), Accurate Store (add-on/aplikasi), Accurate Capital, Mata Uang (multi-currency), Pajak, Syarat Pembayaran (termin), Pengiriman, FOB, Gaji/Tunjangan, Karyawan, Transaksi Berulang (recurring), Proses Akhir Bulan (period-end), Kontak, Transaksi Favorit (memorize), Kalender, Log Aktifitas (audit), Log Aktifitas Jurnal, SmartLink Virtual Account, SmartLink e-Payment, Komisi Penjual, **e-Faktur CTAS**, e-Faktur Legacy.

### Buku Besar (`general-ledger`)
Akun Perkiraan (Chart of Accounts), Pencatatan Beban (expense accrual), Jurnal Umum (journal voucher), Histori Akun.

### Kas & Bank (`cash-bank`)
Pencatatan Gaji (employee payment), Pembayaran (other-payment), Penerimaan (other-deposit), Transfer Bank, SmartLink e-Banking, Rekening Koran (bank statement), Histori Bank, Rekonsiliasi Bank.

### Anggaran & Target (`budget-target`)
Monitor Anggaran, Transfer Anggaran, Anggaran (account budget), Target Penjualan.

### Penjualan (`customer`)
Penawaran Penjualan (quotation) → Pesanan Penjualan (SO) → Pengiriman Pesanan (delivery order) → Uang Muka Penjualan (DP) → **Faktur Penjualan (invoice)** → Penerimaan Penjualan (receipt) → Retur Penjualan. Plus: Tukar Faktur, Klaim Pelanggan, Pengepakan Barang, Kategori Pelanggan, Kategori Penjualan (price category), Pelanggan (master), SmartLink e-Commerce, Check In (sales visit), Email Faktur Pajak.

### Pembelian (`vendor`)
Permintaan Barang (requisition) → Pesanan Pembelian (PO) → Penerimaan Barang (receive) → Uang Muka Pembelian → **Faktur Pembelian** → Pembayaran Pembelian → Retur Pembelian. Plus: Klaim Pemasok, Kategori Pemasok, Pemasok (master), Perintah Pembayaran (transfer order), Transfer Pemasok.

### Persediaan (`inventory`)
Barang & Jasa (item master), Gudang, Satuan Barang, Kategori Barang, Merek Barang, Penyesuaian Harga/Diskon (selling price), Harga Pemasok, Pemindahan Barang (transfer antar gudang), Penyesuaian Persediaan (stock adjustment), Pekerjaan Pesanan (job order/manufaktur), Penambahan Bahan Baku, Penyelesaian Pesanan (roll-over), Perintah Stok Opname, Hasil Stok Opname, Pemenuhan Pesanan (backorder), Barang per Gudang, Barang Stok Minimum.

### Aset Tetap (`fixed-asset`)
Aset Tetap, Kategori Aset, Kategori Aset Tetap Pajak (fiscal), Perubahan Aset Tetap, Disposisi Aset Tetap, Pindah Aset, Aset per Lokasi.

### Laporan (`report`)
Daftar Laporan (200+ dalam 17 kategori), SPT PPN/PPNBM, SPT PPh Ps.21, Bukti Potong PPh Ps.21. Kategori: Keuangan, Buku Besar, Kas & Bank, Piutang, Penjualan, Tenaga Penjual, Utang, Pembelian, Persediaan, Gudang, Pekerjaan Pesanan, Manufaktur, Aset Tetap, Pajak, Pemeriksaan, Lain-lain. Plus **Analisa AI** (report-insight-analysis).

---

## 2. Master Data (entitas + field kunci)

**Barang & Jasa** (tabs: Umum · Penjualan/Pembelian · Stok · Akun · Gambar · Lain-lain)
- Umum: Nama Barang*, Kategori Barang*, Jenis Barang (Persediaan/Non-Persediaan/Jasa/Grup/dll), Kode Barang* (auto/manual), UPC/Barcode, Satuan* (multi-unit), Merek, toggle No. Seri/Produksi (serial/batch).
- Tab lain: harga jual/beli & termin, setelan stok (min stock, gudang default), pemetaan akun GL (persediaan/penjualan/HPP), gambar.

**Pelanggan** (tabs incl. Info Umum, alamat, dll)
- Nama*, ID Pelanggan, Kategori, No. Telp Bisnis, Handphone, No. WhatsApp, Email, Faksimili, Website, Alamat Penagihan, Mata Uang Utama (default IDR), + termin, limit kredit, pajak, sales default.

**Pemasok** — struktur setara Pelanggan (info kontak, termin, mata uang, pajak).

**Akun Perkiraan (COA)** — Tipe Akun, Sub Akun (hierarki parent), Kode Perkiraan, Nama, Mata Uang.

Master pendukung: Gudang, Satuan, Kategori Barang/Pelanggan/Pemasok, Merek, Mata Uang, Pajak, Syarat Pembayaran, Karyawan, Kontak.

---

## 3. Alur Transaksi Inti (journey)

Pola umum tiap dokumen: **List → "Data Baru" → isi header (partner, tanggal, no. dokumen auto) → tambah baris di grid Rincian Barang (item, qty, satuan, harga, diskon) → total otomatis (Sub Total, Diskon, Pajak, Total) → Simpan**. Dokumen bisa **"Ambil"** (menarik) data dari dokumen hulu (mis. Faktur menarik dari SO/DO).

**Siklus Penjualan (Order-to-Cash):**
`Penawaran → Pesanan Penjualan → Pengiriman Pesanan → Faktur Penjualan → Penerimaan Penjualan`
- Faktur Penjualan: header Pelanggan*, Tanggal*, No Faktur# (toggle auto/manual). Grid: Nama Barang, Kode#, Kuantitas, Satuan, @Harga, Diskon, Total Harga. Footer: Sub Total, Diskon %, Total. Aksi kanan: Simpan, Cetak/Dokumen, Lampiran, Lainnya.
- Penerimaan Penjualan: alokasi pembayaran ke faktur (piutang) → jurnal Kas/Bank vs Piutang.

**Siklus Pembelian (Procure-to-Pay):**
`Permintaan → Pesanan Pembelian → Penerimaan Barang → Faktur Pembelian → Pembayaran Pembelian`
- Faktur Pembelian: header Pemasok, Tanggal, No Form#; grid barang; bisa "Ambil" dari PO/penerimaan.

**Kas & Bank:** Pembayaran (Kas/Bank, Tanggal, No Bukti#, Rincian Pembayaran per akun), Penerimaan, Transfer Bank, Rekonsiliasi (cocokkan dgn rekening koran/e-banking).

**Buku Besar:** Jurnal Umum manual (Tanggal, Tipe Transaksi, Nomor#, Rincian Jurnal = baris debit/kredit per akun). Semua transaksi lain auto-posting ke jurnal.

**Persediaan:** Penyesuaian Persediaan (adjust qty/nilai), Pemindahan antar Gudang, Stok Opname (Perintah → Hasil), Job Order (manufaktur sederhana: bahan baku → barang jadi).

**Aset Tetap:** register aset → penyusutan otomatis per kategori → disposisi/pindah.

---

## 4. Perpajakan (khusus Indonesia)
e-Faktur CTAS & Legacy (PPN keluaran), Email Faktur Pajak, SPT PPN/PPnBM, SPT PPh Ps.21 + Bukti Potong. Setelan pajak per item/partner. Ini pembeda utama vs software asing.

## 5. Integrasi (SmartLink)
e-Banking (tarik mutasi bank), e-Payment, Virtual Account, e-Commerce/Marketplace, Accurate Store (add-on). POS via produk terpisah (Accurate POS) yang sinkron.

## 6. Setup & Governance
Multi-user + Akses Grup (RBAC), Penyetuju Transaksi (approval workflow), Penomoran otomatis per dokumen, Desain Cetakan (template faktur), multi-cabang/gudang, multi-currency, Log Aktifitas (audit trail), Proses Akhir Bulan (closing).

---

## 7. Catatan untuk Pengembangan
- **Model data inti** yang perlu ditiru: Partner (Customer/Vendor), Item (+unit, kategori, warehouse, akun GL), Chart of Accounts (hierarki), Dokumen transaksi (header + lines) dengan status & referensi antar-dokumen ("Ambil"), Jurnal (double-entry auto-posting).
- **Pola dokumen berantai**: tiap dokumen hilir menyalin baris dari hulu + menyimpan link (SO→DO→Invoice→Receipt). Perlu tabel relasi/asal-baris.
- **Auto-numbering** per tipe dokumen (prefix + counter, bisa manual override).
- **Auto-posting akuntansi**: setiap transaksi menghasilkan jurnal ganda; mapping akun diambil dari master item/partner/preferensi.
- **Multi-satuan & multi-gudang** pada item → konversi unit & stok per gudang.
- **Pajak Indonesia** (PPN, e-Faktur) sebagai modul first-class.
- **RBAC + approval + audit** sebagai lapisan lintas modul.

---

# LAMPIRAN — Deep-dive (dari dashboard live, read-only)

> Data spesifik/nilai PT SAI sengaja tidak disimpan; hanya struktur & aturan.

## A. Struktur COA (pola, dari 180 akun riil)
Skema kode berjenjang `1101 → 1101001` (parent → sub-akun). Sub-akun dipisah **per mata uang** (IDR/USD/CNY).
- **1101 Kas & Bank**: KAS KECIL, KAS BESAR, BANK BCA/BRI per mata uang (IDR/USD/CNY)
- **1102 Piutang Usaha**: Piutang Usaha IDR/USD/CNY + **Uang Muka Pembelian** per mata uang
- Pola berlanjut: Persediaan, Aset Tetap (1xxx), **Utang Usaha & Uang Muka Penjualan (2xxx)**, Ekuitas (3xxx), **Penjualan (4xxx)**, **HPP (5xxx)**, Beban (6xxx), **Pendapatan/Beban Lain incl. Laba/Rugi Selisih Kurs (7xxx)**
- Tipe akun (schema): Kas & Bank, Piutang Usaha, Persediaan, Aktiva Lancar/Tetap/Lainnya, Akum. Penyusutan, Utang Usaha, Utang Lancar/Jk Panjang, Ekuitas, Pendapatan, HPP, Beban, Pendapatan/Beban Lain.

## B. Aturan Posting Jurnal — CONTOH NYATA (Faktur Penjualan ekspor CNY, prabayar)
Dokumen: Faktur Penjualan → jurnal otomatis (ditampilkan dalam **IDR base**, seimbang):
| Akun | Debit | Kredit |
|---|---|---|
| 210106 Uang Muka Penjualan CNY | ✔ (kompensasi uang muka pelanggan) | |
| 720103 **Laba/Rugi Terealisasi (Selisih Kurs)** | ✔ | |
| 5100001 Beban Pokok Penjualan (HPP) | ✔ | |
| 110205 Piutang Usaha CNY | (0 karena sudah prabayar) | |
| 4101001 Penjualan Barang Dagang | | ✔ |

**Pelajaran untuk engine auto-posting (#9):**
1. Penjualan → **K: Penjualan Barang Dagang**, **D: Piutang Usaha** (atau **D: Uang Muka Penjualan** bila pelanggan prabayar → kompensasi).
2. **HPP otomatis**: **D: Beban Pokok Penjualan / K: Persediaan** menyertai faktur.
3. **Selisih kurs terealisasi** dibukukan ke **akun Laba/Rugi Terealisasi** saat nilai valas dikonversi ke IDR base.
4. Semua nilai valas disimpan **dalam mata uang asli + IDR base** (pakai Kurs faktur).
5. Nomor jurnal terpisah dari nomor faktur (JV.YYYY.MM.xxxxx vs SI.YYYY.MM.xxxxx) & saling tertaut.

## C. Multi-currency / Kurs (dari faktur)
- Faktur valas menyimpan **Kurs** ("1 CNY = … IDR") + kurs pajak terpisah.
- Total tampil dalam mata uang asli (¥), jurnal dibukukan dalam IDR base.
- Selisih kurs → akun **72xxxx Laba/Rugi (Ter)realisasi** (lihat issue #23).

## D. Mapping Akun pada Master Barang (pola standar Accurate — untuk model Item)
Tiap barang memetakan akun GL (dipakai auto-posting): **Akun Persediaan**, **Akun Penjualan**, **Akun Retur Penjualan**, **Akun Beban Pokok Penjualan (HPP)**, **Akun Barang Terkirim Belum Tertagih**, **Akun Diskon Penjualan**, **Akun Retur Pembelian**. → Simpan sebagai FK akun di model `Item` (atau via kategori barang sebagai default).

## E. Status & Kontrol (dari faktur)
- Stempel status transaksi: **DISETUJUI** (approval, issue #25) & **LUNAS** (pelunasan, issue #12).
- Menu transaksi: Tambah ke Favorit, Transaksi Berulang, Log Aktifitas, **Histori Status**, **Rincian Jurnal** (jurnal auto-posting bisa ditinjau — dasar "Mode Akuntan" #11).
