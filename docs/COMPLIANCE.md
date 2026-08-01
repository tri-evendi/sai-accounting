# Kepatuhan & siklus hidup akun (issue #142)

Implementasi §10 [`MULTI-TENANT.md`](./MULTI-TENANT.md). Dokumen ini mencatat
KEBIJAKAN yang kodenya tegakkan — dan memisahkan dengan jujur mana yang sudah
mekanisme, mana yang masih keputusan tertunda.

> ⚠️ **Naskah hukum (S&K, kebijakan privasi) masih DRAF** — versi berakhiran
> `-draf` di `src/lib/legal.ts`, berspanduk DRAF di halamannya. Mekanismenya
> berjalan; janjinya belum boleh dibuat sebelum ditinjau penasihat hukum/pajak.

---

## 1. Retensi: berhenti berlangganan TIDAK menghapus buku

**Kebijakan.** UU KUP mewajibkan buku, catatan, dan dokumen dasar pembukuan
disimpan **10 tahun** — termasuk yang elektronik. Maka:

```
suspended (hanya-baca) → ekspor kapan saja → penghapusan HANYA atas permintaan
eksplisit → tenggang 30 hari → eksekusi: nonaktif + anonimisasi (buku UTUH)
→ penghancuran buku HANYA setelah retention_until (≥10 tahun) lewat
```

**Penegakan di kode** (bukan hanya tulisan):

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

`data/audit/tenants/<slug>/audit.jsonl` (`src/lib/tenant-audit.ts`) — terpisah
dari jejak per-PT dengan alasan yang sama (#104): pembaca yang lupa menyaring
tidak punya apa-apa untuk bocor. Peristiwa: pendaftaran (beserta **versi S&K/
privasi yang disetujui**), pembuatan PT, undangan, ganti paket, transisi
status (penjadwal, aktor `system`), ekspor, siklus permintaan penghapusan.
Jejak TIDAK dihapus oleh eksekusi penghapusan — ia buktinya.

## 4. Persetujuan dokumen ber-versi

`src/lib/legal.ts` = satu sumber versi. Persetujuan dicatat di
`registrations.terms_version`/`privacy_version` DAN di entri audit
`tenant.register`. Mengubah naskah WAJIB menaikkan versi. **Belum ada** alur
persetujuan-ulang untuk pengguna lama saat versi naik — dibangun saat naskah
final pertama terbit.

## 5. ❗ KEPUTUSAN TERBUKA — harus dijawab SEBELUM pelanggan umum pertama

1. **Tempat penyimpanan (data residency).** Ketentuan perpajakan menyebut
   penyimpanan **di Indonesia**. Bila benar berlaku untuk SaaS pembukuan, ini
   menentukan pilihan hosting — dan jauh lebih mahal diubah belakangan.
   Kode ini TIDAK menjawabnya; `/privacy` §4 sengaja menyebutnya tertunda.
   **Pemilik produk + penasihat hukum yang memutuskan.**
2. **Tinjauan naskah S&K + privasi** oleh penasihat hukum → terbitkan versi
   tanpa akhiran `-draf`, bangun alur persetujuan-ulang.
3. **Durasi tenggang (30 hari) dan jangkar retensi** (entri jurnal termuda +
   10 tahun, konservatif) — angka yang dipakai kode; konfirmasi ke penasihat
   pajak bila ingin lebih presisi (mis. akhir tahun buku).
