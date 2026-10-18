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
| Suspensi = hanya-baca, bukan terkunci | penjaga #140 (`tenant-state.ts`) |
| Ekspor tetap terbuka saat suspended | `requireTenantPermission` tidak memeriksa status; `api/tenant/export` tanpa cabang status |
| Tidak ada jalur hapus-buku tanpa permintaan | satu-satunya kode yang men-DROP basis data perusahaan adalah `scripts/execute-tenant-deletion.ts --drop-ledgers`, dan ia menolak tanpa baris permintaan `executed` |
| Eksekusi menunggu tenggang | `executionVerdict` (murni, teruji) |
| Penghancuran menunggu retensi | `ledgerDropVerdict` + `retention_until` = 10 tahun sejak entri jurnal termuda, dihitung SAAT eksekusi (`retentionUntilFrom`) |
| Penghancuran menuntut manusia | skrip operator, konfirmasi ketik-ulang slug — pola adopsi #134; TIDAK ada tombol self-service |

## 2. UU PDP No. 27/2022 — hak yang dilayani

| Hak | Mekanisme |
|---|---|
| Akses & portabilitas | `GET /api/tenant/export` (izin `tenant.export`, owner): ZIP berisi CSV SELURUH tabel di SETIAP PT — format terbuka, tanpa aplikasi ini |
| Penghapusan | `POST/DELETE /api/tenant/deletion-request` (izin `tenant.deletion`, owner): tenggang 30 hari, pemberitahuan konsekuensi ke semua owner, batal kapan pun sebelum eksekusi |
| Anonimisasi | eksekusi mengganti email/nama/username menjadi `dihapus-<id>` (`anonymizedUserFields`), mengacak kata sandi, mencabut sesi — baris & id bertahan supaya jejak audit tidak menunjuk kekosongan |
| Dasar pemrosesan & pemberitahuan kebocoran | dinyatakan di `/privacy` (DRAF); pemberitahuan kebocoran = proses operasional, belum ada otomasinya |

## 3. Jejak audit tingkat tenant

Jejaknya tabel `tenant_audit_logs` di basis data kendali
(`packages/platform/src/tenant-audit.ts`; sejak #484, sebelumnya berkas
`data/audit/tenants/<slug>/audit.jsonl`). Ia terpisah dari jejak per-PT dengan
alasan yang sama seperti #104: pembaca yang lupa menyaring tidak punya data
untuk dibocorkan. Peristiwa yang dicatat: pendaftaran (beserta versi S&K/privasi
yang disetujui), pembuatan PT, undangan, ganti paket, transisi status
(penjadwal, aktor `system`), ekspor, dan siklus permintaan penghapusan. Eksekusi
penghapusan tidak menghapus jejak ini, karena jejak inilah buktinya.

## 4. Persetujuan dokumen ber-versi

`src/lib/legal.ts` adalah satu-satunya sumber versi. Persetujuan dicatat di
`registrations.terms_version`/`privacy_version` dan di entri audit
`tenant.register`. Setiap perubahan naskah wajib menaikkan versi. Alur
persetujuan-ulang untuk pengguna lama saat versi naik belum ada; ia dibangun
saat naskah final pertama terbit.

## 5. Keputusan terbuka — dijawab sebelum pelanggan umum pertama

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
