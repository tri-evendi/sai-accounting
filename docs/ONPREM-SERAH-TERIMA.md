# Serah Terima On-Premise — templat

Satu salinan per customer, diisi **sebelum** pemasangan dinyatakan selesai, dan
ditandatangani kedua pihak. Bagian bertanda **[ISI]** wajib diisi; bagian yang
dibiarkan kosong adalah keputusan yang belum dibuat, bukan keputusan "tidak".

Rancangannya: [09 §7](./arsitektur/09-RANCANGAN-LAYANAN.md) (profil
on-premise), [06 §3.7](./arsitektur/06-KEAMANAN.md) (kriptografi lisensi).

| | |
|---|---|
| Customer | **[ISI]** |
| Versi terpasang (`SAI_TAG`) | **[ISI]** — versi persis, bukan `latest` |
| Id lisensi | **[ISI]** — dari `bun run licence:verify -- --berkas <berkas>` |
| Tanggal serah terima | **[ISI]** |
| Penanggung jawab customer | **[ISI]** (nama, peran, kontak) |
| Penanggung jawab SAI | **[ISI]** |

## 0. Langkah pemilik SAI — SEKALI, sebelum customer on-premise pertama

Kode hari ini memuat `LICENCE_PUBLIC_KEY_PEM = "BELUM-DISETEL"`
(`packages/core/src/licence.ts`). Selama itu **tidak ada berkas lisensi yang
bisa sah**: pemasangan tetap berjalan dan buku tetap terbuka, tetapi modul
dibatasi ke inti dan batasnya 1 perusahaan / 3 pengguna. Gejalanya terlihat di
tiga tempat — peringatan `[start]` di log `app-customer`, `licence.status:
"key-not-set"` di `/api/health` (ikut ke bundel diagnostik), dan pita
"Lisensi pemasangan" di halaman `/platform` bagi pengelola.

1. Di mesin **luring**: `bun run licence:keygen`. Kunci **privat** tidak pernah
   masuk repo, secret CI, maupun server produksi (alasannya di 06 §3.7).
   Simpan dua salinannya di dua tempat fisik berbeda; kehilangan keduanya
   berarti tidak ada lisensi yang bisa diterbitkan atau diperpanjang lagi.
2. Tempel kunci **publik** ke `LICENCE_PUBLIC_KEY_PEM`, ganti tes
   `tests/licence-entitlement.test.ts` yang menegaskan placeholder, commit lewat
   PR biasa.
3. Rilis lewat tag `vX.Y.Z` (bagian 3). Image sebelum commit itu tetap tanpa
   kunci — jangan serahkan versi lama ke customer on-premise.

## 1. Lisensi

Dicatat di konsol operator, halaman **Lisensi on-premise** (`/licences`);
ditandatangani **luring**. Kunci privat tidak pernah dibawa ke konsol.

1. Konsol: isi formulir (nama customer, batas, modul, dukungan, versi) →
   **Buat draf & perintah**. Perpanjangan: **Terbitkan versi baru** pada
   customer — formulir terisi dari lisensi sebelumnya.
2. Salin perintah `bun run licence:issue -- …` yang tampil, jalankan di
   **laptop luring** yang memegang kunci privat.
3. Unggah berkas `.sai` hasilnya ke draf yang sama. Konsol memverifikasi tanda
   tangannya dengan kunci publik tertanam dan mencocokkan isinya dengan draf;
   selisih ditampilkan per isian. Lulus → **Terbit**, versi lama → **Digantikan**.
4. **Unduh berkas** dari konsol, kirim ke customer.

Register ini **arsip, bukan penentu**: aplikasi customer hanya memercayai tanda
tangan berkasnya dan tidak pernah membaca register (06 §3.7). "Dicabut" di
register hanya catatan — lisensi luring tidak bisa dicabut dari jauh. Selama
kunci publik belum ditanam (§0), draf bisa dibuat tetapi unggahan mati.

- Dipasang di `./lisensi/licence.sai` (atau `SAI_LICENCE_DIR`), di-mount
  **hanya-baca** ke `app-customer` dan `svc-worker`. Penggantian berkas
  berlaku dalam ±60 detik tanpa restart.
- Lisensi **tidak pernah menutup pembukuan.** Dukungan yang berakhir atau versi
  yang melampaui `maxVersion` hanya dipajang; batas perusahaan/pengguna hanya
  menahan pembuatan yang **baru**.

Isi lisensi (batas, modul, dukungan, versi) tidak lagi disalin ke dokumen ini —
sumbernya register konsol. Yang dicatat di serah terima hanya rujukannya:

| Butir | Nilai |
|---|---|
| Customer & versi di register `/licences` | **[ISI]** (mis. "PT Maju Jaya, versi 2") |
| Id lisensi | **[ISI]** |

## 2. Kunci cadangan — siapa memegang apa

Arsip cadangan dienkripsi dengan `BACKUP_ENCRYPTION_KEY` **sebelum**
meninggalkan mesin. **Arsip tanpa kuncinya tidak bisa dipulihkan oleh siapa
pun, termasuk SAI.** SAI tidak menyimpan salinan kunci customer.

| Rahasia | Gunanya | Disimpan di (minimal dua tempat) | Pemegang |
|---|---|---|---|
| `BACKUP_ENCRYPTION_KEY` | membuka arsip cadangan | **[ISI]** | **[ISI]** |
| `AUTH_SECRET` | sesi pengguna — hilang = semua orang keluar, data aman | **[ISI]** | **[ISI]** |
| `SETTINGS_ENCRYPTION_KEY` | sandi SMTP tersimpan — hilang = isi ulang pengaturan | **[ISI]** | **[ISI]** |
| Kredensial S3 (bila dipakai) | tujuan cadangan kedua | **[ISI]** | **[ISI]** |
| Sandi `postgres` | akses basis data | **[ISI]** | **[ISI]** |

Uji pulih **sebelum** tanda tangan, dengan kunci dari tempat simpannya — bukan
dari `.env` yang sedang berjalan:

```sh
docker compose -f docker-compose.yml -f docker-compose.onprem.yml \
  run --rm job-backup bun run prove-backup-restore
```

Hasil uji pulih (tanggal, arsip, keluaran): **[ISI]**

## 3. Pembaruan

Saluran stabil = tag git `vX.Y.Z`. Setiap tag menerbitkan image bertag versi
persis dan aset GitHub Release berisi bundel luring.

- **Dengan akses registry:** `export SAI_TAG=X.Y.Z`, lalu `docker compose -f
  docker-compose.yml -f docker-compose.onprem.yml pull` dan `up -d`.
- **Tanpa akses registry:** unduh aset rilis, `sha256sum -c SHA256SUMS`,
  `docker load` setiap `.tar.gz`, lalu `up -d --pull never`. Langkah lengkap ada
  di `BACA.txt` di dalam bundel.

Jalur `schema` (migration) berjalan otomatis lewat layanan `migrate` setiap
`up`; aplikasi menolak melayani bila skemanya tertinggal (gerbang skema).

## 4. Reverse proxy & TLS — milik customer

Traefik SAI tidak dikirim. `app-customer` mendengar di port `3000` di jaringan
`sai-onprem-local`, tanpa port terbit ke host. Dua pilihan:

**a. Proksi sebagai container di jaringan yang sama** (disarankan) — contoh
Caddy, TLS otomatis bila domainnya publik:

```yaml
# docker-compose.proxy.yml — dipakai sebagai -f ketiga
services:
  proxy:
    image: caddy:2.8
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy_data:/data
    networks: [traefik]
volumes:
  caddy_data:
```

```
akuntansi.contoh.co.id {
    reverse_proxy app-customer:3000
}
```

**b. Proksi yang sudah ada di host** (nginx, IIS, F5) — terbitkan port hanya ke
loopback lewat berkas override milik customer:
`services: { app-customer: { ports: ["127.0.0.1:3000:3000"] } }`, lalu arahkan
proksinya ke `http://127.0.0.1:3000` dengan header `Host` dan
`X-Forwarded-Proto` diteruskan.

Wajib di kedua pilihan: `AUTH_URL` di `.env` = URL **https** yang dibuka
pengguna, dan `AUTH_TRUST_HOST=true`.

| Butir | Nilai |
|---|---|
| Domain | **[ISI]** |
| Sertifikat (penerbit, perpanjangan oleh) | **[ISI]** |

## 5. "Sudah punya DC/DRC, jadi cadangan tidak perlu" — dibantah

Asumsi ini wajib tertulis dan dibantah di sini (09 §7). **Replikasi menyalin
perintah yang salah dengan patuh**: satu `UPDATE` tanpa `WHERE` sampai di DRC
dalam hitungan detik.

| DC/DRC menjawab | Cadangan menjawab |
|---|---|
| mesin atau situs hilang | kesalahan manusia, migration yang merusak, korupsi data |
| keadaan **sekarang** | keadaan **pada suatu titik waktu** |
| seluruh kluster | **satu perusahaan saja** |
| berkas basis data | basis data **+ dokumen + jejak audit** |

Arsip pembukuan wajib bertahan **sepuluh tahun**, dan replika bukan arsip. Jalur
cadangan SAI hanya boleh dimatikan bila perkakas customer lolos **dua** uji,
dibuktikan di depan kedua pihak:

1. memulihkan pembukuan **satu** perusahaan ke titik waktu pilihan tanpa
   menyentuh perusahaan lain;
2. membuktikan setiap basis data terdaftar **beserta** direktori dokumen dan
   jejak audit ada di dalam artefaknya.

Keputusan: ☐ jalur cadangan SAI tetap aktif ☐ dimatikan — bukti dua uji
terlampir: **[ISI]**

## 6. Dukungan

Masalah dilaporkan dengan bundel diagnostik (`bun run support:bundle`, atau
`sh scripts/support-bundle.sh` di mesin tanpa bun). Bundel tidak memuat isi
pembukuan, nilai env, maupun berkas lisensi; baca `manifes.txt` di dalamnya
sebelum mengirim.

Saluran dukungan & jam layanan: **[ISI]**

---

Tanda tangan — customer: ____________ SAI: ____________
