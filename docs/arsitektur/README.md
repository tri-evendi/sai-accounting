# Arsitektur & Peta Layanan — SAI Accounting

> **01–08 menggambarkan sistem yang sedang berjalan**, disusun dari kode,
> konfigurasi, dan keluaran perintah. **09 adalah satu-satunya dokumen
> rancangan** — isinya belum dibangun, dan setiap bagiannya ditandai demikian.
> Dimutakhirkan 20 Oktober 2026 · produksi `main@ca0cd038`.
>
> ⚠ **"Sedang berjalan" di sini berarti keadaan KODE yang tergabung, dan
> stempel `main@…` di tiap dokumen menyebut kapan ia terakhir diukur terhadap
> produksi.** Keduanya bisa berbeda beberapa hari, dan tahap 1a–1b
> membedakannya sekarang: `svc-ledger` dan `svc-tenant` ada di compose dan
> dijelaskan [02 §5](./02-LAYANAN-INFRA.md), tetapi **belum tergelar** —
> keduanya naik pada rilis berikutnya, dan keduanya wajib ikut `pull` dan `up`
> ([02 §11](./02-LAYANAN-INFRA.md), `PRODUCTION.md`). Dokumen yang menunggu
> penyebaran sebelum mencatat sesuatu adalah dokumen yang selalu tertinggal satu
> rilis, dan orang yang membacanya saat menggelar justru tidak menemukan
> layanan yang harus ia gelar.
>
> Tahap **1a dan 1b** rancangan 09 selesai dan sudah dipindahkan ke 01–08
> sebagai keadaan; 09 memuat sisanya saja — ditambah dua hal yang 1b sengaja
> TIDAK pindahkan, beserta pemicunya (§9).

## Isi

| # | Dokumen | Menjawab |
|---|---|---|
| 01 | [ARSITEKTUR.md](./01-ARSITEKTUR.md) | Produk, dua aplikasi, diagram konteks & container, pola, empat batas keamanan, tiga lapis basis data, konteks perusahaan, otorisasi, mesin posting, struktur kode **& pohon poliglot (batas Go, kontrak bangkitan, tiga gerbang rilis)**, ukuran |
| 02 | [LAYANAN-INFRA.md](./02-LAYANAN-INFRA.md) | Mesin, sepuluh layanan, pekerjaan latar (**jalur `ledger` & `tenant`**), image & build, gate rilis, deploy & rollback, migration (**pemilik skema, fan-out**), env, pemantauan, DR, **tiga bentuk arsitektur infra**, **profil on-premise & profil penyebaran** |
| 03 | [API-INTEGRASI.md](./03-API-INTEGRASI.md) | Permukaan HTTP, tiga rezim autentikasi, header keamanan, dependensi luar, titik gagal tunggal, larangan impor |
| 04 | [ALIRAN-DATA.md](./04-ALIRAN-DATA.md) | ERD ketiga skema, enam alur data, daur hidup status tiap dokumen |
| 05 | [PENILAIAN.md](./05-PENILAIAN.md) | Kekuatan, temuan terbuka berprioritas, portabilitas VM, pemicu, keputusan yang menunggu pemilik |
| 06 | [KEAMANAN.md](./06-KEAMANAN.md) | Aset yang dilindungi, aktor & ancaman, kontrol per ancaman, regresi yang pernah terjadi |
| 07 | [RIWAYAT.md](./07-RIWAYAT.md) | Empat pekerjaan selesai: keputusan yang masih mengikat dan yang masih terbuka |
| 08 | [GLOSARIUM.md](./08-GLOSARIUM.md) | Istilah, strategi pengujian, target non-fungsional, katalog rute |
| 09 | [RANCANGAN-LAYANAN.md](./09-RANCANGAN-LAYANAN.md) | 🔶 **Rancangan:** tiga invarian, bentuk layanan target & inventaris image, jalur yang BELUM pindah & batas Go, kontrak yang belum dibangkitkan, outbox & otorisasi hasil, dokumen di server, fan-out per tenant yang belum (kesesuaian, expand/contract), SaaS vs On-Premise, tahapan & pemicu, nomenklatur, observabilitas yang belum terukur, tata kelola |

## Mulai dari mana

| Anda | Mulai dari |
|---|---|
| Insinyur baru | 08 → 01 → 04 |
| Bertugas jaga / men-deploy | 02 |
| Merencanakan kapasitas atau HA | 02 → 05 |
| Mengambil keputusan teknis | 01 → 05 → 09 |
| Merancang untuk skala pasar atau pemasangan dedicated | 05 → 09 |
| Menyentuh basis data atau skema | 04 → [`DATABASE.md`](../DATABASE.md) → 07 |
| Menambah halaman / rute | 06 (daftar periksa) → 08 |
| Meninjau keamanan | 06 → 03 |
| Menelusuri kenapa sesuatu dibuat begini | 07 |

## Tiga tingkat keyakinan

| Tanda | Arti |
|---|---|
| *(tanpa tanda)* | Terbukti — dibaca dari kode, konfigurasi, atau keluaran perintah |
| 🔶 | Tersimpulkan — kesimpulan wajar dari bukti, tidak diamati langsung |
| ❓ | Belum dipastikan — butuh pemilik, akses, atau pengukuran |

Angka runtime selalu disertai tanggal pengambilannya.

## Dokumen lain yang tidak digantikan dokumen ini

| Dokumen | Bidang |
|---|---|
| [`MULTI-COMPANY.md`](../MULTI-COMPANY.md) · [`MULTI-TENANT.md`](../MULTI-TENANT.md) | Satu basis data per PT (#104) · lapis tenant/SaaS (#133) |
| [`RBAC.md`](../RBAC.md) · [`MODUL-USAHA.md`](../MODUL-USAHA.md) | Matriks izin, penegakan, kunci buku · modul per jenis usaha (#99) |
| [`DATABASE.md`](../DATABASE.md) | Standar skema, tipe data, workflow migration |
| [`COMPLIANCE.md`](../COMPLIANCE.md) | Retensi, UU PDP, persetujuan ber-versi |
| [`KOMERSIALISASI.md`](../KOMERSIALISASI.md) · [`PRICING.md`](../PRICING.md) | Strategi komersial & katalog harga |
| [`AGENTS.md`](../../AGENTS.md) · [`PRODUCTION.md`](../../PRODUCTION.md) | Aturan kerja · runbook deploy |
| [`MASTER.md`](../../design-system/sai-accounting/MASTER.md) | Sistem desain & token |

## Cara memelihara

| Yang berubah | Perbarui |
|---|---|
| Layanan baru di `docker-compose.yml` | 02 |
| Variabel lingkungan baru | 02 **dan** `.env.docker.example` — nama di satu tempat saja adalah variabel yang tidak akan pernah disetel orang |
| Tabel, relasi, atau basis data baru | 04 (ERD), dan 01 bila lapisnya bertambah |
| Status dokumen baru | 04 (daur hidup) dan 08 (glosarium) |
| Integrasi luar atau rezim autentikasi baru | 03 |
| Halaman / rute baru | 08 (angka), dan 06 bila menyentuh kontrol keamanan |
| Temuan di 05 ditutup | Hapus temuannya; bila ia meninggalkan aturan atau guard baru, pindahkan aturannya ke bab yang bersangkutan |
| Sebagian rancangan di 09 dibangun | Pindahkan bagiannya ke 01–08 sebagai keadaan, lalu hapus dari 09. **09 tidak boleh memuat apa pun yang sudah jadi** |
