# Paket & harga — sumber kebenaran katalog

> Satu lapis di atas dokumen ini ada `docs/KOMERSIALISASI.md`: strategi
> go-to-market, fase, dan gate kapan mesin langganan otomatis boleh
> dinyalakan. Dokumen ini tetap sumber kebenaran katalog (angka, kuota, aturan
> main yang hidup di kode); dokumen itu menjawab kepada siapa dan bagaimana
> katalog ini dijual. Bila keduanya berbeda soal angka, dokumen ini yang benar.
>
> Di sini keputusan komersial dicatat: angka, alasan, dan aturan mainnya. Kode
> tidak boleh menyimpan angka yang tidak ada di sini, dan halaman harga hanya
> memajang angka dari tabel `plans` (`design-system/sai-accounting/pages/landing.md`
> §KLAIM HARUS PUNYA SUMBER). Ditetapkan pemilik di issue #404 (17 Agustus 2026)
> atas usulan dari tinjauan kode dan riset lima pesaing.

## 1. Katalog yang dijual

Semua harga dalam IDR per bulan, **belum termasuk PPN 11%**. PPN tampil sebagai
baris tersendiri di tagihan (`packages/core/src/tax.ts` `DEFAULT_TAX_RATE`,
sakelar `PLATFORM_PPN_DISABLED`). Harga tahunan = 10 bulan (dua bulan gratis) di
semua paket berbayar.

| `plans.key`  | Nama       | Bulanan       | Tahunan        | PT   | Pengguna | Katalog                                   |
| ------------ | ---------- | ------------: | -------------: | ---: | -------: | ----------------------------------------- |
| `starter`    | Starter    |   Rp 249.000  |   Rp 2.490.000 |    1 |        3 | publik, uji coba 14 hari                  |
| `pro`        | Pro        |   Rp 599.000  |   Rp 5.990.000 |    3 |       15 | publik, uji coba 14 hari, **disorot**     |
| `business`   | Business   | Rp 1.199.000  |  Rp 11.990.000 |    8 |       40 | publik, uji coba 14 hari, dukungan prioritas |
| `enterprise` | Enterprise | dirundingkan  | kontrak        |  ≥10 |      ≥50 | **tidak** publik sejak #408 (`contact_only`, aktif); jalur rundingannya menumpang kartu Business; kuota bawaan 10/50 |
| `internal`   | Internal   |          Rp 0 |              — |   10 |       50 | **tidak** publik — pemakaian penyedia     |
| `trial`      | Trial      |          Rp 0 |              — |    1 |        3 | pensiun (`is_public=0`), tetap aktif      |

**Funel publik tiga anak tangga (#408):** Starter → Pro (disorot) → Business.
Rundingan hanya untuk yang melewati kuota Business, ditawarkan sebagai satu
kalimat dan tautan kontak di kaki kartu Business ("Butuh lebih dari 8 PT atau 40
pengguna? Kuota, migrasi data, SLA, dan masa kontrak dirundingkan"), tidak
sebagai kartu keempat. Alasannya: dua kartu teratas bersaing untuk pembeli yang
sama, dan pembeda "kuota vs jasa" harus dijelaskan. Business tetap satu-satunya
anak tangga swalayan di atas Pro, sehingga pembeli 4–8 PT tidak kembali ke
"hubungi kami". `enterprise` tetap paket yang diberikan operator
(`changeTenantPlan`) untuk kontrak; kartu paket dalam aplikasi juga tidak
memajangnya.

**Pembeda paket hanya kuota PT dan pengguna.** Semua paket memuat seluruh
modul (`BUSINESS_MODULES`), tiga bahasa antarmuka, dan semua mata uang, dan
halaman harga menyatakannya sekali untuk semua paket (`pricingAllNote`). Model
datanya hanya punya `max_companies` & `max_users`
(`packages/db/prisma/platform/schema.prisma`). Gate fitur per paket tidak
ditambahkan: ia butuh kolom baru, guard baru di ±35 resource izin, dan
mengingkari kalimat yang sudah dipajang.

**Alamat halaman harga publik: `/pricing`** (kanonik + sitemap). Alamat lama
`/harga` (sejak #399, dan tujuan alias `/pricing` sejak #413) kini di-redirect
permanen (308) ke `/pricing`. Halaman itu memajang harga bulanan dan tahunan
(sakelar tanpa JS). Harga tahunan berasal dari kolom `price_yearly`, dan
hematnya dihitung dari kedua kolom; tidak ada angka diskon yang diketik.

Nama paket adalah nama produk dan tidak diterjemahkan
(`packages/billing/src/plan-copy.ts`, alasan yang sama dengan `APP_NAME`).
Deskripsi dan butir sorotan memakai kunci kamus tiga bahasa
(`plans.description.*`, `plans.highlight.*`).

### Harga satuan yang dihasilkan

| Paket    | Rp / PT / bln | Rp / pengguna / bln |
| -------- | ------------: | ------------------: |
| Starter  |       249.000 |              83.000 |
| Pro      |       199.667 |              39.933 |
| Business |       149.875 |              29.975 |

Harga satuan menurun di setiap anak tangga, jadi naik paket selalu lebih murah
daripada membeli beberapa paket kecil: 3 × Starter = Rp 747.000 > Pro; 8 PT
lewat 3 × Pro = Rp 1.797.000 > Business. Karena itu pula Starter tidak dihargai
Rp 199.000: pada angka itu 3 × Starter (597.000) ≈ Pro (599.000), dan Pro
kehilangan alasan bundelnya.

## 2. Alasan angka (ringkas — riset lengkap di artefak sesi 17 Agu 2026)

Pasar yang diukur 17 Agustus 2026 (harga vendor berubah-ubah; verifikasi ulang
sebelum dipakai di materi penjualan):

| Vendor · paket                | Rp / bln (DPP)      | Entitas · pengguna | Catatan                                              |
| ----------------------------- | ------------------: | ------------------ | ---------------------------------------------------- |
| Kledo Free / Pro / Elite / Champion | 0 / 159.900 / 279.900 / 399.900 | 1 · 1–7 | fitur dipotong per tingkat; +pengguna 69.900; konsolidasi hanya di Champion |
| Zahir Online SB / Pro / Ent   | 150.000 / 878.750 / 1.500.000 (termasuk PPN) | 1 · 1–5 | langganan tahunan                                     |
| Accurate Online Dasar         | 333.000 (termasuk PPN) | 1 basis data · 1  | +pengguna 22.200, +basis data ±100.000, uji coba 30 hari |
| Mekari Jurnal Essentials / Plus | 399.000 / 899.000 | 1 · 3–5           | multi-perusahaan hanya di paket ERP (kontak penjualan) |
| Xero UK Ignite → Ultimate     | £16 → £65           | 1 org · tak terbatas | multi-entitas = langganan per organisasi            |

- **Starter Rp 249.000** — di antara Kledo Pro (159.900, 3 pengguna, fitur
  dipotong) dan Accurate Dasar (333.000 termasuk PPN, 1 pengguna). Ia memberi
  tiga pengguna dan seluruh modul, yang di pesaing baru muncul di paket
  280–900 rb.
- **Pro Rp 599.000** — tidak berubah; alasan aslinya di `scripts/seed-plans.ts`
  (3 basis data + 15 pengguna di Accurate ≈ Rp 813 rb; tiga langganan Kledo
  ≈ Rp 1,2 jt). Tetap disorot sebagai jangkar tengah dari tiga pilihan swalayan.
- **Business Rp 1.199.000** — Rp 150 rb/PT, di bawah Zahir Enterprise (1,5 jt
  untuk satu perusahaan · 5 pengguna) dan Jurnal Plus (899 rb · 1 entitas).
  Berhenti di 8 PT supaya Enterprise (bawaan 10/50) masih punya wilayah.
  Pembedanya dari Pro adalah kuota dan dukungan prioritas (balasan hari kerja
  berikutnya lewat kanal `contactChannels()`). Dukungan prioritas adalah janji
  operasional yang diputuskan pemilik di #404, karena itu boleh menjadi butir di
  kartu (`plans.highlight.prioritySupport`).
- **Enterprise** — dirundingkan, dan sejak #408 tidak dipajang sebagai kartu.
  Lantai internalnya ≈ Rp 2.500.000/bln dengan kontrak tahunan. Angka ini
  pedoman penjualan: tidak dipajang dan tidak ada di katalog (kolom harga tetap
  0 + `contact_only`, guard di `plan-change`). Pembedanya dari Business adalah
  jasa: migrasi data (Accurate/Excel), pelatihan tim, SLA tertulis, kontrak dan
  tagihan tahunan/PO. Kuota per pelanggan ditulis ke `tenants.max_*` saat
  paketnya diberikan (`changeTenantPlan`).

## 3. Kebijakan yang menyertai (sudah berjalan di kode)

| Aturan                     | Nilai                                | Sumber                                       |
| -------------------------- | ------------------------------------ | -------------------------------------------- |
| Uji coba                   | 14 hari, **paket Pro** (`trialing`)  | `packages/core/src/registration.ts` `TRIAL_DAYS`, `SIGNUP_PLAN_KEY` |
| Sesudah uji coba           | tagihan pertama = harga Pro; boleh turun ke Starter bila ≤1 PT & ≤3 pengguna | `plan-change.ts` (turun paket ditolak bila melampaui kuota) |
| Naik paket                 | prorata sisa periode, berpindah setelah LUNAS | `plan-change.ts`, `payment-webhook.ts` |
| Menunggak → ditangguhkan   | tenggang 14 hari; ditangguhkan = hanya-baca, ekspor tetap jalan | `subscription-lifecycle.ts` `GRACE_PERIOD_DAYS` |
| PPN                        | 11% di atas DPP, baris terpisah      | `packages/core/src/tax.ts`; FAQ `faqTaxA`                  |
| Snapshot                   | harga & kuota langganan berjalan disalin (`subscriptions.price`, `tenants.max_*`) — perubahan katalog TIDAK menyentuhnya | `schema.prisma` komentar `Plan` |
| Pembayaran                 | Midtrans VA/QRIS atau transfer manual | `payment-gateway.ts`                        |

## 4. Mengubah harga kelak

1. Ubah tabel di §1 dokumen ini dulu (keputusannya).
2. **Pemasangan baru**: `scripts/seed-plans.ts` (`DEFAULT_PLANS`).
3. **Pemasangan berjalan**: migration DATA di
   `prisma/postgresql/platform/NNNN_<nama>/migration.sql`
   (`UPDATE plans … WHERE key = …`). Seed sengaja tidak menimpa harga dan kuota
   baris yang sudah ada, karena seed yang mengubah harga akan mengejutkan
   penagihan setiap kali dijalankan. Migration diterapkan sekali, dan
   `migrate status` menjawab apakah ia sudah diterapkan. Preseden (arsip
   MariaDB `prisma/platform/migrations/`; baseline PostgreSQL hanya memuat
   skema, baris harganya ikut tersalin saat penukaran 15 Okt 2026):
   `0009_plans_pricing_ladder` (harga), `0010_enterprise_not_public` (bendera).
4. `tests/pricing-ladder.test.ts` menjaga seed, migration, dan dokumen ini
   memuat angka yang sama.
5. Langganan berjalan tidak berubah (snapshot). Kalau memang ingin memindahkan
   pelanggan lama ke harga baru, itu tindakan operator per tenant
   (`changeTenantPlan`), tidak terjadi sebagai efek samping katalog.

Cache katalog publik 300 detik (`plan-catalog.ts`, tag `plan-catalog`).

## 5. Fase 2 — add-on & jasa (issue terpisah, belum ada di kode)

Dikerjakan setelah tangga baru hidup ≥1 siklus tagih dan ada permintaan nyata.

| Item                 | Harga usulan              | Pembanding                              | Yang dibutuhkan                                                |
| -------------------- | ------------------------- | --------------------------------------- | -------------------------------------------------------------- |
| +1 PT                | Rp 150.000/bln            | Accurate ±100 rb/basis data             | kolom `extra_companies` di `subscriptions` (snapshot), penjumlahan di siklus tagih, pemetaan ke `tenants.max_companies` |
| +1 pengguna          | Rp 25.000/bln             | Accurate 22.200; Kledo 69.900           | idem `extra_users`                                             |
| Jasa migrasi data    | Rp 1,5–3 jt sekali        | Zahir menjual pelatihan/jasa terpisah   | tagihan manual (impor Excel sudah ada di produk)               |
| Program akuntan/KAP  | —                         | Xero/Kledo punya program mitra          | satu akun akuntan lintas tenant — belum ada di model           |

Tarif +1 PT disamakan dengan tarif per-PT Business supaya menambah PT satu-satu
tidak pernah lebih murah daripada naik paket.

## 6. Yang sengaja tidak dilakukan

- **Paket gratis** — setiap PT adalah basis data sendiri (`docs/MULTI-COMPANY.md`)
  di mesin yang juga menjalankan produksi lain. Pelanggan gratis punya biaya
  marjinal nyata (basis data, backup, scheduler) dan beban dukungan yang tidak
  dibayar. Penggantinya: uji coba 14 hari + Starter tahunan.
- **Gate fitur per paket** — lihat §1.
- **Harga termasuk PPN** — separuh vendor melakukannya (Accurate, Zahir). Kami
  memilih DPP + PPN terpisah seperti Jurnal & Kledo, dan menuliskannya di kartu
  (`pricingTaxNote`) serta FAQ.
