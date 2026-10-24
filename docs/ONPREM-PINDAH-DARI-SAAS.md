# Pindah dari SaaS ke On-Premise

Runbook memindahkan **satu tenant SaaS** (customer berlangganan) ke pemasangan
**on-premise Enterprise** di server milik customer. Keputusan pemilik 22 Okt
2026. Templat serah terima pemasangannya sendiri:
[`ONPREM-SERAH-TERIMA.md`](./ONPREM-SERAH-TERIMA.md) — runbook ini dipakai
**bersama** templat itu, bukan sebagai gantinya.

Tiga perintah, satu berkas:

| Di mana | Perintah | Apa |
|---|---|---|
| SaaS | `tenant:export-onprem` | bekukan tenant + ambil **satu** bundel bersandi |
| On-premise | `tenant:import-onprem` | periksa semuanya, lalu pasang bundel |
| SaaS | `tenant:mark-migrated-out` | sesudah customer menyatakan berjalan: hentikan penagihan, tutup akses SaaS |

Ketiganya punya `--dry-run`/pratinjau. Jalan balik: `tenant:unfreeze`.

## Daftar periksa

Penanggung jawab: **O** = operator SaaS · **P** = pemilik SAI (mesin luring) ·
**C** = customer (didampingi SAI).

1. **O — lihat dulu, tanpa menulis apa pun.**
   ```sh
   docker compose run --rm job-backup bun run tenant:export-onprem -- --tenant <slug> --dry-run
   ```
   Catat versi SAI (`Versi : SAI X.Y.Z`) dan perintah `licence:issue` yang
   dicetak. Bila ada **DITOLAK**, selesaikan dulu. Sepakati jendela
   serah-terima dengan customer: sejak langkah 3 buku SaaS **hanya-baca**.

2. **P — terbitkan lisensi** di mesin luring dengan perintah dari langkah 1
   (batas = maks(pemakaian, kuota paket); isi `--dukungan-sampai` dan, bila
   perlu, `--versi-maks`). Lihat `ONPREM-SERAH-TERIMA.md` §1.

3. **O — bekukan + ekspor.**
   ```sh
   docker compose run --rm job-backup bun run tenant:export-onprem -- --tenant <slug>
   ```
   Tenant dibekukan, perintah menunggu ±90 detik dan antrean pekerjaan PT-nya
   kosong, lalu menulis `data/cadangan/<slug>-onprem-<tanggal>.saibundle`
   (volume `cadangan`). Ia mencetak **sha256** dan **sandi bundel — sekali
   saja**. Salin sandinya sekarang; ia tidak disimpan di mana pun.

4. **O — kirim, lewat DUA saluran berbeda.** Bundel lewat transfer berkas
   (SFTP / tautan unduh berbatas waktu / media fisik), **sha256 + sandi** lewat
   saluran lain langsung ke penanggung jawab customer yang tercatat (telepon,
   pesan). **Jangan pernah** sandi di surel, folder, tiket, atau pesan yang
   sama dengan bundelnya: bundel + sandi = seluruh pembukuan + hash kata sandi
   setiap pengguna.

5. **C — pasang SAI versi yang SAMA, kosong.** Ikuti `ONPREM-SERAH-TERIMA.md`
   §0–§4 dengan `SAI_TAG=<versi dari langkah 1>`; `.env` baru dengan
   `AUTH_SECRET`, `SETTINGS_ENCRYPTION_KEY` (`openssl rand -hex 32`), dan
   `BACKUP_ENCRYPTION_KEY` **milik customer** — bukan salinan SaaS. `up -d`
   menjalankan `migrate`. **JANGAN jalankan `bootstrap`**: impor menolak
   pemasangan yang sudah berisi tenant/pengguna. Pasang `licence.sai`.

6. **C — impor.** Taruh bundel di `./serah-terima/`, lalu (nama volume
   dokumen: `docker volume ls | grep documents`):
   ```sh
   docker compose -f docker-compose.yml -f docker-compose.onprem.yml run --rm \
     -v "$PWD/serah-terima:/serah-terima:ro" -v <proyek>_documents:/app/data/documents \
     job-backup bun run tenant:import-onprem -- --bundle /serah-terima/<berkas> --dry-run
   ```
   Sandi ditanyakan tersembunyi. Bila lulus, ulangi tanpa `--dry-run`. Impor
   memeriksa **sebelum** menulis: sidik jari setiap berkas, versi
   (selisih → "pasang `SAI_TAG=<versi bundel>`"), pemasangan kosong, kunci
   enkripsi; lalu membuktikan **jumlah baris setiap tabel + neraca saldo
   ringkas** tiap buku sama dengan SaaS. Gagal di tengah = semuanya dibatalkan.
   Butuh ruang kosong ±2× ukuran bundel di direktori kerja (bawaan `/tmp`
   container; ganti dengan `--work-dir <dir>` bila sempit).

7. **C — buktikan.** `up -d`; pengguna masuk dengan surel & kata sandi
   **lama**; buka Neraca Saldo tiap perusahaan dan cocokkan dengan SaaS (yang
   masih bisa dibaca); setel ulang & **uji kirim** SMTP; buat ulang token API
   bila ada integrasi; jalankan uji pulih cadangan (`ONPREM-SERAH-TERIMA.md`
   §2). Hapus bundel dari server customer sesudahnya.

8. **O — nyatakan pindah**, hanya sesudah customer menyatakan (tertulis)
   on-premise-nya berjalan:
   ```sh
   docker compose run --rm job-backup bun run tenant:mark-migrated-out -- --tenant <slug>            # pratinjau
   docker compose run --rm job-backup bun run tenant:mark-migrated-out -- --tenant <slug> --apply --reason "<tiket/berita acara>"
   ```
   Mode penagihan → `none`, langganan → `cancelled`, PT SaaS dinonaktifkan,
   sesi dicabut, login SaaS menampilkan "sudah dipindahkan ke server
   perusahaan Anda". Tagihan yang masih terbuka **dilaporkan, tidak
   disentuh** — putuskan sendiri (batalkan atau tagih). Hapus bundel dari
   volume `cadangan`.

## Yang ikut & yang tidak

### Buku perusahaan (basis data per PT)

**Seluruhnya**, sebagai `pg_dump -Fc` per basis data, dipulihkan dengan nama
basis data yang **sama** di instans bawaan pemasangan customer
(`companies.db_instance_key = NULL`). Termasuk `role_permission_overrides`,
`audit_logs`, `company_logos`, pengaturan perusahaan. **Server key Midtrans**
(`company_settings.payment_server_key_*`, tersegel `SETTINGS_ENCRYPTION_KEY`)
dibuka saat ekspor dan **disegel ulang dengan kunci customer** saat impor.
PT nonaktif dan PT contoh ikut, dengan tandanya.

### Dokumen

`data/documents/<companyId>/` setiap PT — hanya berkas berbentuk kunci
penyimpanan sah (`<uuid>.<ext>`); yang lain dilewati dan dihitung. Id
perusahaan dipertahankan, jadi `documents.filepath` tetap benar tanpa diubah.

### Basis data kendali — setiap model diputuskan

Daftar ini juga hidup di `CONTROL_MODEL_DECISIONS`
(`src/lib/onprem-migration.ts`); `tests/onprem-migration.test.ts` merah bila
ada model kendali yang tidak diputuskan atau tidak disebut di sini.

| Model | Ikut? | Catatan |
|---|---|---|
| `Tenant` | ya | id & slug dipertahankan. Di on-premise: `status = active`, `plan_key = internal`, kuota = saran lisensi, tidak beku |
| `Company` | ya | id & nama basis data dipertahankan; instans bawaan |
| `User` | ya | id, surel, **hash bcrypt**, `must_change_password`, `session_version` apa adanya → masuk dengan kata sandi lama. Tamu dari tenant SaaS lain: **identitasnya saja**, berumah di tenant on-premise |
| `Membership` | ya | hanya keanggotaan di PT tenant ini |
| `TenantMembership` | ya | hanya baris tenant ini |
| `TenantMailSetting` | ya | sandi SMTP dibuka & **disegel ulang** dengan kunci customer; hasil uji kirim terakhir dikosongkan (diuji dari server SaaS, tidak membuktikan jaringan customer) |
| `TenantAuditLog` | ya | jejak tenant ini; id baru, isi sama |
| `ApiToken` | **tidak** | hash token terikat alamat & integrasi SaaS; buat ulang di on-premise (jumlahnya dicetak) |
| `Invitation` | **tidak** | tautan undangan menunjuk alamat SaaS; kirim ulang |
| `PasswordResetToken` | **tidak** | rahasia sekali-pakai berumur pendek |
| `Notification` | **tidak** | kotak masuk dalam aplikasi, sementara |
| `TenantDeletionRequest` | **tidak** | permintaan penghapusan berlaku pada data SaaS, bukan on-premise |
| `TenantSlugHistory` | **tidak** | alamat lama di host SaaS tidak berarti apa pun di host customer |
| `Registration` | **tidak** | pendaftaran mandiri SaaS, belum menjadi tenant |
| `RateLimitCounter` | **tidak** | keadaan sementara |
| `DbInstance` | **tidak** | topologi server SaaS; on-premise satu instans |
| `OperatorAccount` | **tidak** | akun operator SAI — tidak pernah ke customer |
| `SchedulerRun` / `ConformanceRun` / `BackupRun` / `SchemaMigrationRun` | **tidak** | jejak operasi server SaaS |
| `Job` | **tidak** | antrean SaaS; ekspor menunggu antrean PT-nya kosong lebih dulu |
| `RuntimeSample` | **tidak** | metrik proses SaaS |
| `OutboxRelayBook` | **tidak** | jejak relay outbox server SaaS; tabel `outbox` di buku PT ikut dump buku, baris yang belum terbit direlay di on-premise |

Model `SchedulerRun`, `ConformanceRun`, dan `BackupRun` diputuskan satu per
satu di kode; tabel ini mengelompokkannya.

### Platform / penagihan (`sai_platform`)

**Tidak ikut sama sekali** — langganan, tagihan, pembayaran, paket. Yang
dibawa hanya ringkasannya: `plan_key` dan kuota di manifes, dan saran
`licence:issue` = maks(pemakaian, kuota paket), modul `all`. Daftar lisensi
yang diterbitkan dicatat di register lisensi konsol operator (`/licences`,
migration platform 0006); customer register punya `sourceTenantId` yang bisa
menunjuk tenant SaaS asal.

## Keamanan

- **Bundel** = `openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt` atas
  sebuah tar — format yang sama dengan arsip cadangan, jadi dalam keadaan
  darurat bisa dibuka tangan:
  `openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -salt -in X.saibundle | tar -x`.
  Isinya `manifest.json` (versi, kepala migration, jumlah, sha256 setiap
  berkas), `control.json`, `secrets.json`, `companies/*.pgdump`,
  `documents/…`. Impor menolak berkas yang tidak diumumkan manifes, jalur di
  luar bentuk yang dikenal, dan tautan simbolik.
- **Sandi** dibangkitkan (6×5 simbol, ±148 bit), dicetak sekali, tidak pernah
  ditulis ke berkas dan tidak pernah lewat argv (`openssl -pass env:`). Untuk
  otomasi boleh diberikan lewat env `SAI_BUNDLE_PASSPHRASE` (minimal 20
  karakter).
- **`SETTINGS_ENCRYPTION_KEY` SaaS tidak pernah ikut.** Rahasia dibuka di
  SaaS dan disegel ulang dengan kunci customer; ciphertext SaaS dikosongkan
  dari baris kendali.
- `pg_dump`/`pg_restore` **langsung ke PostgreSQL**, tidak lewat PgBouncer
  (dump lewat pooler bisa pulang sebagian dan tetap tampak berhasil). Skrip
  menolak bila tidak ada jalan langsung — karena itu dijalankan di image
  `backup`.
- Jejak di `tenant_audit_logs`: `tenant.onprem.freeze`, `.export` (dengan
  sha256 bundel), `.unfreeze`, `.migrated_out`, dan `.import` di sisi
  customer.

## Pembekuan — apa yang sebenarnya terjadi

`tenants.frozen_at` (migration kendali `0010_tenant_pindah_onprem`). Kolom
sendiri, **bukan** nilai `status`: `status` adalah salinan status langganan
yang ditulis ulang penjadwal/webhook/konsol, dan pembekuan yang dicairkan
diam-diam di tengah dump berarti tulisan yang hilang.

Selama beku: penjaga halaman & API menolak setiap izin **tulis** dengan kalimat
"sedang dipindahkan … hanya-baca"; **baca dan ekspor tetap jalan**; penerbit
dokumen berulang melewati PT-nya. Ekspor menunggu 90 detik (TTL cache status
60 detik + permintaan yang sedang berjalan) dan antrean `jobs` PT-nya kosong
sebelum dump.

## Jalan balik

| Keadaan | Jalan balik |
|---|---|
| Sesudah langkah 1 | tidak ada yang berubah |
| Sesudah langkah 3, sebelum langkah 8 | `docker compose run --rm job-backup bun run tenant:unfreeze -- --tenant <slug> --reason "…"` — buku SaaS kembali bisa ditulis dalam ≤ 60 detik. Bundel yang sudah diambil **basi** sejak tulisan pertama sesudahnya: bila serah-terima diulang, ambil bundel baru (langkah 3). Hapus bundel lama di mana pun ia sudah sampai |
| Impor gagal di tengah | otomatis: buku yang dibuat di-DROP, dokumen yang disalin dihapus, kendali tidak tertulis (satu transaksi). Perbaiki penyebabnya, ulangi langkah 6 |
| Sesudah langkah 8 | **tidak ada tombol.** `unfreeze` menolak. Buku SaaS masih utuh (hanya nonaktif), tetapi langganan `cancelled` adalah keadaan akhir mesin langganan: menghidupkan kembali = aktifkan PT, `status` tenant, dan paket baru (`change-plan`) dengan tangan dan alasan tertulis. Karena itu langkah 8 hanya sesudah pernyataan tertulis customer |

## Sesudah pindah

- Data SaaS **tidak dihapus** oleh langkah 8. Retensi dan penghapusan lewat
  alur yang sudah ada (#142, `scripts/execute-tenant-deletion.ts`), yang
  menuntut permintaan eksplisit pemilik dan masa tenggang.
- Akun pengguna tamu (dari tenant SaaS lain) tetap hidup di SaaS untuk
  tenant asalnya; PT yang pindah hanya hilang dari daftarnya (dinonaktifkan).
- `tenants.status = migrated_out` dikecualikan dari pemeriksaan "status tak
  serasi" rekonsiliasi platform selama langganannya `cancelled`.

## Bukti

`bun run tenant:prove-onprem -- --source <url> --target <url>` menjalankan
ketiga skrip sungguhan atas dua server PostgreSQL **sekali-pakai** (wajib
loopback dan kosong — skrip menolak selainnya) dan membandingkan jumlah baris
setiap tabel, neraca saldo ringkas, id & hash pengguna, penyegelan ulang
rahasia, dokumen, sequence, serta perilaku mark-migrated-out / unfreeze.
Contoh server uji:

```sh
docker run -d --rm --name uji-src -e POSTGRES_USER=u -e POSTGRES_PASSWORD=p -p 127.0.0.1:55431:5432 postgres:17-alpine
docker run -d --rm --name uji-dst -e POSTGRES_USER=u -e POSTGRES_PASSWORD=p -p 127.0.0.1:55432:5432 postgres:17-alpine
```

Butuh `pg_dump`/`pg_restore` 17 di PATH.

## Keputusan yang masih terbuka

- **Tombol konsol** untuk bekukan / cairkan / nyatakan pindah belum dibuat;
  hari ini lewat skrip saja (fungsinya sudah di
  `apps/operator/src/lib/operator/onprem-cutover.ts`, siap dipasang ke aksi
  konsol).
- **Tagihan terbuka** saat langkah 8: dilaporkan, tidak di-void otomatis.
- **`change-plan` atas tenant `migrated_out`** akan melahirkan langganan baru;
  belum dipagari — jangan lakukan tanpa niat menghidupkan kembali.
- **Penghapusan data SaaS** sesudah pindah menuntut permintaan pemilik lewat
  aplikasi, padahal penggunanya tidak bisa masuk lagi. Perlu keputusan:
  operator mencatat permintaan atas surat customer, atau masa simpan tetap.
