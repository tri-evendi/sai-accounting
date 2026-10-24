# Kepatuhan & siklus hidup akun (issue #142)

Implementasi §10 [`MULTI-TENANT.md`](./MULTI-TENANT.md). Dokumen ini mencatat
kebijakan yang ditegakkan kode, dan memisahkan mana yang sudah berupa mekanisme
dari mana yang masih keputusan tertunda.

> ⚠ **Naskah hukum (S&K, kebijakan privasi) masih draf**: versinya berakhiran
> `-draf` di `src/lib/legal.ts` dan halamannya berspanduk DRAF. Mekanismenya
> berjalan, tetapi janjinya belum boleh dibuat sebelum ditinjau penasihat
> hukum/pajak.

---

## 1. Retensi: berhenti berlangganan tidak menghapus buku

**Kebijakan.** UU KUP mewajibkan buku, catatan, dan dokumen dasar pembukuan,
termasuk yang elektronik, disimpan **10 tahun**. Karena itu:

```
suspended (hanya-baca) → ekspor kapan saja → penghapusan HANYA atas permintaan
eksplisit → tenggang 30 hari → eksekusi: nonaktif + anonimisasi (buku UTUH)
→ penghancuran buku HANYA setelah retention_until (≥10 tahun) lewat
```

**Penegakan di kode:**

| Aturan | Ditegakkan oleh |
|---|---|
| Suspensi = hanya-baca, bukan terkunci | guard #140 (`tenant-state.ts`) |
| Ekspor tetap terbuka saat suspended | `requireTenantPermission` tidak memeriksa status; `api/tenant/export` (GET sinkron & POST pekerjaan), `api/tenant/export/jobs` dan `…/jobs/<id>/result` tanpa branch status; pelari Go `tenant.data_export` membaca tenant apa pun statusnya |
| Tidak ada jalur hapus-buku tanpa permintaan | satu-satunya kode yang men-DROP basis data perusahaan adalah `scripts/execute-tenant-deletion.ts --drop-ledgers`, dan ia menolak tanpa baris permintaan `executed` |
| Eksekusi menunggu tenggang | `executionVerdict` (murni, teruji) |
| Penghancuran menunggu retensi | `ledgerDropVerdict` + `retention_until` = 10 tahun sejak entri jurnal termuda, dihitung SAAT eksekusi (`retentionUntilFrom`) |
| Penghancuran menuntut manusia | skrip operator, konfirmasi ketik-ulang slug — pola adopsi #134; TIDAK ada tombol self-service |

### 1a. Retensi uji coba BEKU (alur demo-first, 24 Okt 2026)

Uji coba yang habis beku hanya-baca (`trial_ended`, ekspor tetap jalan). Sesudah
N hari beku (bawaan **90**, konsol `/settings` → *Retensi uji coba beku*,
env `TRIAL_RETENTION_DAYS`) tenant uji coba **boleh** dihapus — memakai mesin
§2 yang sama persis (`executeTenantDeletion`: `cancelled`, PT nonaktif, data
pribadi dianonimkan, **buku besar utuh** sampai `retention_until`).

| Aturan | Ditegakkan oleh |
|---|---|
| Sakelar hapus otomatis **bawaan MATI**; mati = penjadwal hanya melapor (tanpa surel, tanpa hapus) | `trialAutoDeletionFrom` (gagal-tertutup: hanya `true` di konsol atau `TRIAL_AUTO_DELETION=on`), langkah 4b `scripts/subscription-scheduler.ts` |
| Pemberitahuan **H-14 dan H-3** berisi tautan ekspor (`/platform/privacy`) adalah SYARAT; tenant yang sudah lama beku saat sakelar dinyalakan menerima H-14 dulu | `planTrialRetention` (`packages/billing/src/trial-retention.ts`), `reminder_logs.kind = trial_deletion` |
| Tenant demo & tenant dengan permintaan hapus sendiri tidak pernah menjadi kandidat | langkah 4b penjadwal, `trialRetentionForOperator` |
| Eksekusi tercatat sebagai permintaan penghapusan beratas nama sistem + jejak `tenant.deletion.execute` beraktor `system:retensi-uji-coba` | langkah 4b penjadwal |
| Menyalakan sakelar menuntut owner konsol (`site.settings`) + ketik `HAPUS`; nilai lama/baru di jejak operator | `operatorSaveTrialRetention` |

## 2. UU PDP No. 27/2022 — hak yang dilayani

| Hak | Mekanisme |
|---|---|
| Akses & portabilitas | izin `tenant.export` (owner): ZIP berisi CSV SELURUH tabel di SETIAP PT + berkas dokumennya — format terbuka, tanpa aplikasi ini. Dua pelaksana, satu sakelar (`runner:` kind `tenant.data_export`, `contract/kinds.yaml`): `node` = `GET /api/tenant/export` men-stream seketika; `go` = `POST` menerbitkan pekerjaan jalur `bulk`, layar menunggu, berkas diunduh dari `/api/tenant/export/jobs/<id>/result` selama retensi baris `jobs` (14 hari). Isi arsip kedua pelaksana setara byte demi byte (`bun run parity:tenant-export`) |
| Penghapusan | `POST/DELETE /api/tenant/deletion-request` (izin `tenant.deletion`, owner): tenggang 30 hari, pemberitahuan konsekuensi ke semua owner, batal kapan pun sebelum eksekusi |
| Anonimisasi | eksekusi mengganti email/nama/username menjadi `dihapus-<id>` (`anonymizedUserFields`), mengacak kata sandi, mencabut sesi — baris & id bertahan supaya jejak audit tidak menunjuk kekosongan |
| Dasar pemrosesan & pemberitahuan kebocoran | dinyatakan di `/privacy` (DRAF); pemberitahuan kebocoran = proses operasional, belum ada otomasinya |

## 3. Jejak audit tingkat tenant

Jejaknya tabel `tenant_audit_logs` di basis data control
(`packages/platform/src/tenant-audit.ts`; sejak #484, sebelumnya berkas
`data/audit/tenants/<slug>/audit.jsonl`). Ia terpisah dari jejak per-PT dengan
alasan yang sama seperti #104: pembaca yang lupa menyaring tidak punya data
untuk dibocorkan. Peristiwa yang dicatat: pendaftaran (beserta versi S&K/privasi
yang disetujui), pembuatan PT, undangan, ganti paket, transisi status
(scheduler, aktor `system`), ekspor (`tenant.export` saat diminta — ditulis
penerbit Node, sebab pelari Go tidak menulis jejak ini — dan
`tenant.export.download` saat berkas hasil pekerjaan diunduh), dan siklus
permintaan penghapusan. Eksekusi
penghapusan tidak menghapus jejak ini, karena jejak inilah buktinya.

## 4. Persetujuan dokumen ber-versi

`src/lib/legal.ts` adalah satu-satunya sumber versi. Persetujuan dicatat di
`registrations.terms_version`/`privacy_version` dan di entri audit
`tenant.register`. Setiap perubahan naskah wajib menaikkan versi. Alur
persetujuan-ulang untuk pengguna lama saat versi naik belum ada; ia dibangun
saat naskah final pertama terbit.

## 5. Keputusan terbuka — dijawab sebelum customer umum pertama

1. **Tempat penyimpanan (data residency).** Ketentuan perpajakan menyebut
   penyimpanan di Indonesia. Bila itu berlaku untuk SaaS pembukuan, ia
   menentukan pilihan hosting, dan jauh lebih mahal diubah belakangan. Kode
   tidak menjawabnya; `/privacy` §4 menyebutnya tertunda. Yang memutuskan:
   pemilik produk bersama penasihat hukum.
2. **Tinjauan naskah S&K + privasi** oleh penasihat hukum → terbitkan versi
   tanpa akhiran `-draf`, bangun alur persetujuan-ulang.
3. **Durasi tenggang (30 hari) dan jangkar retensi** (entri jurnal termuda +
   10 tahun, konservatif). Ini angka yang dipakai kode; konfirmasikan ke
   penasihat pajak bila ingin lebih presisi (mis. akhir tahun buku).
4. **Persetujuan S&K penerima undangan (#139).** Yang tercatat ber-versi baru
   persetujuan pendaftar utama; halaman terima-undangan belum memintanya.
   Lengkapi bersama alur persetujuan-ulang saat naskah final terbit.

## 6. Bentuk usaha & PPh Final UMKM (PP 55/2022) — asumsi hukum

Keputusan pemilik 24 Okt 2026. Yang diimplementasikan dan anggapan yang
mendasarinya — ditulis supaya bisa diperiksa ahli pajak/hukum, bukan
dipercaya begitu saja:

- **Perlakuan ekuitas per bentuk usaha** (`packages/core/src/legal-form.ts`):
  PT & PT Perorangan menutup laba ke Laba Ditahan (badan hukum, UU 40/2007 jo.
  UU Cipta Kerja); CV & Firma (KUHD Pasal 16–35) membagi laba ke modal
  masing-masing sekutu menurut porsi akta dan mencatat penarikan sebagai
  prive; usaha perorangan (UD) menutup laba ke Modal Pemilik. CV divalidasi
  memiliki sedikitnya satu sekutu aktif (komplementer) dan satu komanditer.
- **PPh Final UMKM adalah ALAT BANTU LAPORAN** (`src/lib/pph-final-umkm.ts`):
  tidak ada jurnal yang diposting, bawaannya MATI per perusahaan, dan setiap
  angka tampil bersama bunyi aturannya serta catatan "periksa ketentuan
  terbaru". Ringkasan dari PP 55/2022 dan PMK 164/2023 per Okt 2026:
  tarif 0,5% dari peredaran bruto (≤ Rp 4,8 miliar setahun); pembebasan
  peredaran bruto Rp 500 juta setahun hanya untuk wajib pajak ORANG PRIBADI
  (usaha perorangan); batas waktu Pasal 59 ayat (1): 7 tahun pajak (orang
  pribadi), 4 tahun pajak (koperasi, CV, firma, BUMDes/BUMDesma, dan
  **perseroan perorangan** yang didirikan satu orang), 3 tahun pajak (PT).
  Catatan: PT Perorangan masuk kelompok 4 tahun, bukan 3 tahun seperti PT.
  Perpanjangan bagi orang pribadi yang pernah diumumkan pemerintah tidak
  dimodelkan — itu salah satu alasan catatan "periksa ketentuan terbaru".
- **Peredaran bruto** diambil dari mutasi bersih akun bertipe `revenue`
  (penjualan dikurangi retur), tanpa `other_income` dan tanpa jurnal penutup;
  perkiraan dibulatkan ke bawah ke rupiah penuh.

