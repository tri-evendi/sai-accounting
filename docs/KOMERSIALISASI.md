# Komersialisasi — strategi, fase, dan gate-nya

> **Status: usulan, belum diputuskan pemilik.** Dokumen ini menjawab satu
> pertanyaan: *"platform dipakai internal dan proses komersialnya belum jelas;
> apakah fitur langganan dimunculkan sekarang, atau penawaran (quote) dulu?"*
> Dasar strateginya dicatat supaya keputusannya bisa ditinjau ulang.
>
> **Hubungannya dengan `docs/PRICING.md`:** dokumen itu katalog, yaitu angka,
> kuota, dan aturan main yang sudah hidup di kode. Dokumen ini satu lapis di
> atasnya: bagaimana dan kepada siapa katalog itu dijual, dan kapan mesin
> otomatisnya boleh dinyalakan. Bila keduanya berbeda soal angka, `PRICING.md`
> yang benar.
>
> Angka keadaan di §1 diukur dari basis data produksi, 10 Oktober 2026. Setiap
> klaim menunjuk berkas atau tabel yang bisa diperiksa; yang tidak punya sumber
> ditulis sebagai pertanyaan.

---

## 0. Ringkasan keputusan yang diusulkan

Mesin langganan tidak perlu dimunculkan karena ia sudah menyala. Ia sudah
bertindak terhadap akun uji coba: menerbitkan tagihan, mengirim 40 surel
penagihan, lalu menangguhkan lima buku menjadi hanya-baca. Yang belum ada adalah
rel pendapatannya. Tidak ada gate pembayaran terpasang, tidak ada nomor
rekening untuk transfer manual, tidak ada profil pajak customer, dan belum
pernah ada pembayaran tercatat.

Karena itu pilihannya bukan "munculkan" atau "sembunyikan". Yang diusulkan
adalah tiga langkah berurutan:

1. **Hentikan mesinnya bertindak** terhadap akun yang tidak punya perjanjian
   komersial (§5 Fase A). Ini pekerjaan segera, bukan fitur.
2. **Jual dengan penawaran** untuk customer multi-PT (≥3 PT), memakai konsol
   operator dan buku PT sendiri yang keduanya sudah ada (§5 Fase B).
3. **Nyalakan langganan swalayan** hanya untuk Starter/Pro, dan hanya setelah
   gate terukur di §5 Fase C terlewati.

Satu koreksi atas usulan awal: jalur jualnya dibelah menurut jumlah PT. Dasarnya
aritmetika (§4.1).

| | Starter · Pro (1–3 PT) | Business · Enterprise (≥4 PT) |
| --- | --- | --- |
| Jalur jual | **swalayan** — tujuan akhir | **penawaran + jasa** — selamanya |
| Rp/tahun (DPP) | 2,99 jt – 7,19 jt | 14,39 jt – ≥30 jt |
| Boleh ada tenaga penjual? | tidak — marginnya tidak menanggungnya | ya — ditambah jasa migrasi & pelatihan |
| Kapan dinyalakan | Fase C (bergerbang) | Fase B (sekarang, manual) |

---

## 1. Keadaan hari ini — yang terukur

Konteksnya masa uji coba: akun yang terdaftar adalah penguji dan pilot, bukan
customer yang pernah setuju membeli. Konteks ini menjelaskan bentuk angkanya,
tetapi tidak mengurangi temuannya.

| Ukuran | Nilai | Sumber |
| --- | --- | --- |
| Tenant | 11 (2 `internal`, **9 di paket `pro`**) | `sai_control.tenants` |
| Status tenant | 4 aktif · 1 `past_due` · **5 `suspended`** · 1 `trialing` | idem |
| Perusahaan (PT) · pengguna | 17 · 13 | idem |
| Tagihan terbit & belum lunas | **6 × Rp 664.890 = Rp 3.989.340** | `sai_platform.platform_invoices` |
| Tagihan berstatus `paid` | 5 — semuanya **Rp 0**, hasil *comp* operator (nomor `…-K`) | idem |
| **Pembayaran tercatat** | **0 baris** | `sai_platform.payments` |
| Surel penagihan terkirim (SMTP hidup, uji terakhir `ok`) | **18 `invoice_due` + 22 `trial_ending`** | `sai_platform.reminder_logs`, `mail_settings` |
| Profil penagihan customer (NPWP) | **0** | `sai_platform.tenant_billing_profiles` |
| Putaran scheduler | 1.212 `ok` · 5 `error` (terakhir error 16 Agu) | `scheduler_runs` di basis data **kendali** (pindah dari `sai_platform`, migration kendali 0005) |

Yang ditunjukkan angka-angka ini:

- Mesin penagihannya sehat: 1.212 putaran sukses. Ia bukan fitur setengah
  jadi, melainkan mesin yang bekerja dan diarahkan ke sasaran yang salah.
- Tangga harga belum pernah diuji pasar. Sembilan dari 11 tenant ada di `pro`
  karena `SIGNUP_PLAN_KEY = "pro"` (`packages/core/src/registration.ts`), bukan
  karena memilih. Tanpa pembayaran tidak ada data soal kesediaan membayar, jadi
  `PRICING.md` tetap berupa riset pesaing, belum harga tervalidasi.
- "Piutang" Rp 3,98 jt itu fiktif dan mengotori pembukuan platform. Lima tagihan
  `paid` bernilai Rp 0 membuat pendapatan tidak bisa dibaca dari tabel mana pun
  tanpa menyaring comp lebih dulu.
- PPN 11% sudah ikut terbit di enam tagihan itu, padahal status PKP penyedia
  belum diputuskan dan belum ada customer yang punya profil NPWP (§9).

### 1.1 Akar masalahnya: **"boleh ditagih" bukan konsep di model**

> **Ditutup (Fase A).** Kolom `subscriptions.billing_mode` (`none` | `manual` |
> `auto`, bawaan `none`) kini ada di `sai_platform`, dan scheduler
> (`scripts/subscription-scheduler.ts`) hanya menjalankan trial habis, dunning,
> dan tenggang untuk mode otomatis (`billingModeIsAutomatic`); akun lama
> dibereskan lewat `bun run billing:pause`. Uraian di bawah dipertahankan
> sebagai alasan aturan §3.3.

Ini temuan terpenting dokumen ini, dan sifatnya arsitektural.

Scheduler mengambil setiap langganan yang belum `cancelled`. Untuk setiap
langganan yang masa uji cobanya habis, ia menerbitkan tagihan sebesar
`sub.price` + PPN tanpa memeriksa apakah akun itu memang customer
(`scripts/subscription-scheduler.ts`, langkah 1). Tidak ada bendera
non-billable, dan harga nol pun tidak dilewati.

Dua tenant `internal` lolos karena tidak pernah melewati jalur
`trialing → trial habis` (harga 0, `trial_ends_at` NULL), bukan karena
dilindungi. Artinya tenant internal atau penguji berikutnya yang dibuat lewat
pendaftaran normal akan ditagih, ditagih ulang, lalu ditangguhkan. Itulah yang
terjadi pada sembilan akun uji coba tadi.

Preseden perbaikannya sudah ada di berkas yang sama. Dunning sengaja
mengecualikan tagihan perpindahan paket (`targetPlanId: null`), dengan alasan
"tagihan selisih naik-paket adalah tawaran, bukan kewajiban". Sistem ini sudah
membedakan tagihan yang boleh memicu penagihan; yang kurang adalah pembedaan
yang sama untuk akun.

### 1.2 Desain uji coba sekarang tidak bisa menghasilkan pembayaran

Alurnya hari ini: daftar (tanpa kartu, tanpa data pembayaran apa pun) → 14 hari
Pro → tagihan Rp 664.890 terbit → pengingat H-7/H-3/H-1
(`REMINDER_OFFSETS_DAYS`) → `past_due` → 14 hari tenggang
(`GRACE_PERIOD_DAYS`) → hanya-baca.

Tiga hal membuatnya tidak mungkin berhasil:

1. **Tidak ada metode pembayaran yang pernah diambil.** Menagih orang yang
   tidak pernah memberi cara membayar hanya bisa gagal.
2. **Tidak ada rel untuk membayar walau customer mau.** `MIDTRANS_SERVER_KEY`
   tidak diset, jadi gate jatuh ke `manual`. `MANUAL_PAYMENT_INSTRUCTIONS`
   juga tidak diset, jadi tombol "Bayar" menghasilkan referensi `manual-PINV-…`
   tanpa nomor rekening (`packages/billing/src/payment-gateway.ts`).
3. **14 hari lebih pendek daripada waktu mencapai nilai** untuk perangkat
   pembukuan. Nilai pertama produk ini baru terasa setelah satu siklus tutup
   bulan: COA tersusun, saldo awal masuk, transaksi sebulan tercatat, laporan
   keluar. Accurate memberi 30 hari (tabel pesaing `PRICING.md` §2). Uji coba
   yang berakhir sebelum pengguna menutup satu bulan mengukur ketekunan
   pengguna, bukan nilai produk.

Ada dua praktik baku, dan keduanya konsisten. Yang berjalan sekarang adalah
gabungan terburuk dari keduanya:

| Desain | Akhir uji coba | Syarat |
| --- | --- | --- |
| **Kartu di muka** | langsung ditagih otomatis | wajib ada gate pembayaran; cocok untuk swalayan |
| **Tanpa kartu** | akun **turun/beku**, TIDAK ditagih | tagihan hanya lahir setelah orang setuju membeli |
| *Sekarang* | *tanpa kartu, **tetapi ditagih** + ditangguhkan* | *—* |

**Rekomendasi:** pakai desain tanpa kartu yang berakhir dengan beku, dan
panjangkan uji coba menjadi 30 hari (satu siklus tutup bulan). Tagihan pertama
lahir dari persetujuan manusia, yaitu penawaran yang disetujui (Fase B) atau
checkout swalayan (Fase C), dan tidak pernah dari berakhirnya waktu.

> **Dibangun 24 Okt 2026 (keputusan pemilik, alur *demo-first*).** Uji coba
> yang habis kini berpindah ke `trial_ended`: hanya-baca, ekspor tetap jalan,
> TANPA baris `platform_invoices`, tanpa surel `invoice_due`, tanpa tenggang —
> untuk SEMUA mode penagihan (`planTrialFreezes`). Beku hanya terjadi setelah
> pemberitahuan `F-` terbukti terkirim ≥7 hari sebelumnya, jadi uji coba lama
> yang sudah lewat tidak membeku seketika saat rilis. `TRIAL_DAYS = 30`. Uji coba
> dibuat operator dari konsol (`/tenants/new`: paket, kuota, lama, mode `none`,
> mitra); owner menekan "Minta aktivasi" (tercatat di `activation_requests`,
> tampil di konsol) alih-alih "Bayar" yang buntu.

---

## 2. Posisi produk & siapa yang membeli

Dasar seluruh strategi di bawah ini: produk ini adalah pembukuan untuk satu grup
berisi beberapa PT, bukan aplikasi akuntansi untuk satu UMKM.

Buktinya ada di arsitekturnya. Setiap PT punya basis data sendiri
(`docs/MULTI-COMPANY.md`), keanggotaan dan pengguna hidup di basis data control,
dan kuota paket dihitung dalam jumlah PT. Tidak ada vendor di tabel pesaing
`PRICING.md` §2 yang menjual bentuk itu sebagai anak tangga swalayan. Mekari
Jurnal menaruh multi-perusahaan di paket ERP "hubungi penjualan", Kledo hanya di
Champion, dan Xero menuntut satu langganan per organisasi. Celah itulah
produknya, dan pembeli di celah ini memang tidak membeli secara swalayan di
pasar mana pun.

| | Isi |
| --- | --- |
| **Pembeli (yang tanda tangan)** | pemilik / direktur grup 2–10 PT, atau manajer keuangan grup |
| **Pengguna harian** | staf akuntansi per PT, 1–5 orang |
| **Pemicu membeli** | konsolidasi grup yang masih manual di Excel; tutup bulan yang lambat; audit/pajak yang menuntut jejak; migrasi dari Accurate/Zahir yang mahal per basis data |
| **Pembanding yang dia pikirkan** | "beli Accurate 3 lisensi", "suruh akuntan eksternal", "tetap Excel" |
| **Yang sebenarnya dijual** | kuota PT **+ jasa**: migrasi data, penyusunan COA, pelatihan tim, SLA |
| **Aset yang jarang dimiliki vendor** | penyedia memakai produknya sendiri untuk buku grupnya sendiri — 17 PT, transaksi nyata. Itu bukti dan referensi sekaligus |

**Konsekuensi strategis:** ekspansi pendapatan datang dari bertambahnya PT di
dalam grup yang sama, bukan dari fitur tambahan. Karena itu keputusan
`PRICING.md` §1 (*"yang membedakan paket HANYA kuota PT & pengguna"*) cocok
dengan unit nilainya. Harga yang mengikuti jumlah PT naik bersama manfaat yang
diterima customer, dan mudah dijelaskan kepada pemilik grup.

---

## 3. Dasar strategi — lima pilar

### 3.1 Monetisasi mengikuti unit nilai (sudah benar, jangan diubah)

Harga per PT menurun di setiap anak tangga (249rb → 199,7rb → 149,9rb per PT),
sehingga naik paket selalu lebih murah daripada menumpuk paket kecil
(`PRICING.md` §1). Dengan begitu jalur ekspansi alami (tambah PT) juga jalur
termurah bagi customer. Tidak ada insentif memecah grup menjadi beberapa akun,
yang akan merusak konsolidasi yang justru dijual produk ini.

### 3.2 Urutan: manual → terukur → otomatis

Produk ini belum pernah terjual. Dalam keadaan itu, membangun atau menyalakan
otomasi penagihan berarti mengotomatiskan proses yang bentuknya belum diketahui.
Praktik baku untuk sepuluh customer pertama: kerjakan secara manual sampai
polanya berulang, lalu otomatiskan bagian yang paling sering diulang.

Urutan ini aman di sini karena sekitar 90% alur quote-to-cash sudah ada, dan
semuanya dijalankan manusia. Konsol operator sudah bisa memberi paket dan kuota
(`changeTenantPlan`), memberi periode berbayar tanpa gate
(`extendSubscription`), mencatat transfer manual (`recordManualPayment`), dan
menangguhkan/memulihkan (`setTenantSuspension`). Fase B hampir tidak menuntut
fitur baru. Syaratnya, mesin otomatis berhenti bertindak mendahului manusia.

Pilar ini punya batas waktu; §4.1 menyebut angkanya. Tahap manual tanpa gate
keluar membuat bisnis tidak bisa tumbuh.

### 3.3 Entitlement ≠ billing (aturan arsitektur)

Hak pakai (berapa PT dan pengguna yang boleh dibuka) dan penagihan (tagihan,
pengingat, penangguhan) harus bisa hidup terpisah. Satu akun boleh punya hak
pakai penuh tanpa kewajiban bayar: internal, penguji, pilot, demo, atau
customer yang tagihannya ditangani di luar sistem.

Sampai Fase A keduanya menyatu, dan §1.1 menunjukkan akibatnya. Aturannya (kini
ditegakkan `billing_mode`):

- setiap tenant punya mode penagihan yang eksplisit, mis. `internal` (tidak
  pernah ditagih), `manual` (ditagih di luar sistem atau di buku PT sendiri),
  `otomatis` (siklus scheduler);
- penerbitan tagihan, dunning, dan penangguhan hanya menyentuh mode `otomatis`;
- akun baru mendapat mode yang tidak menagih. Akun menjadi `auto` lewat tindakan
  manusia, tidak lewat berakhirnya waktu: satu panel di konsol operator
  (rincian tenant), beralasan dan berjejak. Panel itu menolak `auto` pada
  langganan berharga nol dan memperingatkan bila belum ada rel pembayaran;
- `plans.key = "internal"` tidak menggantikan bendera ini. Paket menjawab
  "kuota berapa", bukan "boleh ditagih atau tidak". Sembilan akun uji coba di
  paket `pro` menunjukkan bedanya.

Perubahannya satu kolom dan satu kondisi di tiga tempat, dan ia menutup kelas
kejadian yang sudah terjadi dua kali (issue #416 dan kejadian di §1).

### 3.4 Satu mesin faktur, bukan dua

Penyedia sudah menjadi tenant di aplikasinya sendiri, dan aplikasi itu punya
kontrak, faktur, PPN, piutang, dan ekspor e-Faktur yang dipakai untuk customer
nyata. Sementara itu `platform_invoices` adalah mesin faktur kedua di repo yang
sama, dengan nomor, PPN, dan status lunasnya sendiri. Bedanya, ia tidak punya
e-Faktur per customer, tidak punya profil NPWP yang terisi, dan belum pernah
mencatat pembayaran.

**Keputusan yang diusulkan:** sampai Fase C, penjualan ditagih di buku PT
penyedia sendiri (kontrak → faktur → pelunasan → e-Faktur). `platform_invoices`
dipakai hanya sebagai catatan hak pakai dan periode untuk akun bermode `manual`.
Hasilnya: tidak ada pekerjaan kepatuhan ganda, dan pendapatan terbaca dari
pembukuan sungguhan, bukan dari tabel yang mencampur comp dengan penjualan.

### 3.5 Kepatuhan Indonesia menentukan rel pembayarannya

Bentuk penagihan ditentukan oleh cara customer korporat Indonesia membayar,
bukan oleh apa yang paling mudah dibangun. Urutan ini sering terbalik, dan
membaliknya mahal.

- Pembeli korporat membayar lewat PO → faktur → transfer, dengan termin. Kartu
  berulang tidak menjawab kebutuhan pembeli ini.
- Bila langganan/jasa ini dipotong PPh 23 oleh customer, uang yang masuk selalu
  lebih kecil dari nominal tagihan, dan customer akan meminta bukti potong.
  Mesin langganan otomatis tidak mengenal pemotongan. Setiap tagihan akan
  terbaca "kurang bayar", dan dunning akan menangguhkan customer yang sudah
  membayar penuh. **Ini perlu dikonfirmasi ke konsultan pajak (§9).** Bila
  jawabannya "ya", alasan ini saja cukup untuk menunda penagihan otomatis bagi
  customer berbadan hukum.
- PPN hanya boleh dipungut bila penyedia PKP. Enam tagihan yang sudah terbit
  memuat PPN 11% dan mendahului keputusan itu. Sakelarnya sudah ada di kode:
  `PLATFORM_PPN_DISABLED`, yang menurut komentarnya adalah *"mekanisme untuk
  jawaban penasihat pajak, bukan kebijakan yang kami tetapkan"*. Sejak
  migration 0017 sakelar itu bisa dibalik dari konsol `/settings` tanpa SSH.
  Scheduler juga membaca keputusan konsol, jadi yang berubah adalah nominal yang
  benar-benar ditagih, tidak hanya yang dipajang.

---

## 4. Di mana strategi ini menyimpang dari praktik umum — dan kenapa

### 4.1 Praktik umum berkata produk seharga ini HARUS swalayan

Patokan yang dipakai luas: di bawah nilai kontrak tahunan ±Rp 15–20 juta, biaya
akuisisi berbasis manusia hampir selalu melebihi margin tahun pertama. Harga di
sini: Starter Rp 2,99 jt/tahun, Pro Rp 7,19 jt/tahun, Business Rp 14,39 jt,
Enterprise ≥Rp 30 jt (lantai internal `PRICING.md` §2).

Artinya jalur penawaran manual untuk Starter dan Pro akan merugi. Satu
kesepakatan yang menuntut demo, pelingkupan migrasi, dan tindak lanjut memakan
6–12 jam kerja. Pada Pro (margin kotor tahun pertama beberapa juta rupiah),
ongkos itu menghabiskan marginnya sebelum customer masuk bulan kedua.

Karena itu rekomendasinya dibelah:

- **Starter · Pro = swalayan**, sebagai tujuan akhir yang tidak boleh ditunda
  tanpa batas. Yang menahannya sekarang adalah rel pembayaran yang belum
  terpasang (§1.2).
- **Business · Enterprise = penawaran + jasa, selamanya.** Nilai kontraknya
  menanggung tenaga manusia, dan jasa migrasi/pelatihan (Rp 1,5–3 juta sekali,
  `PRICING.md` §5) menambah pendapatan yang tidak bisa dipungut lewat swalayan.

Satu penyimpangan dari patokan itu tetap dipilih: untuk sepuluh customer
berbayar pertama, semua jalur dijalankan manual, termasuk Starter/Pro. Tujuan
fase itu adalah mempelajari harga dan keberatan pembeli, bukan efisiensi.
Penyimpangan ini dibatasi waktu dan jumlah (§5).

### 4.2 Menunda penagihan otomatis menunda juga pembelajarannya

Risiko Fase A–B: selama belum ada yang membayar lewat sistem, tidak ada yang
tahu bagian mana dari mesin penagihan yang rusak. Bug seperti harga tahunan yang
tidak dipotret ulang (§11) hanya muncul saat uang sungguhan lewat. Mitigasinya:
customer berbayar pertama sengaja ditagih lewat sistem (satu tenant, mode
`otomatis`, diawasi), tidak semuanya dialihkan ke manual sampai Fase C.

### 4.3 Harga publik yang dipajang sebelum tervalidasi

Tangga harga sudah dipajang di `/pricing` sebelum ada customer berbayar
(#404/#413, sudah di produksi). Praktik umum menerima ini karena harga publik
membangun kepercayaan dan menyaring pembeli. Syaratnya, angka itu tidak
dibekukan sebagai komitmen, dan syarat ini belum dipenuhi. Selama belum ada
pembayaran, angka di `/pricing` adalah hipotesis. `PRICING.md` §4 sudah
menyediakan jalur mengubahnya tanpa menyentuh customer berjalan (snapshot).
Yang perlu ditambahkan adalah kebijakan kenaikan saat perpanjangan (§6.3).
Tanpa kebijakan itu, snapshot yang melindungi customer lama juga membuat
harganya tidak pernah bisa naik.

---

## 5. Tiga fase, dengan gate yang bisa diukur

### Fase A — berhenti bertindak *(mulai sekarang; bukan pekerjaan fitur)*

Sasaran: tidak ada tagihan, surel penagihan, maupun penangguhan terhadap akun
yang tidak punya perjanjian komersial.

| Tindakan | Alat yang sudah ada |
| --- | --- |
| Pulihkan 5 tenant `suspended` + 1 `past_due` | `setTenantSuspension` (konsol) |
| Batalkan/void 6 tagihan fiktif Rp 3,98 jt | tindakan operator (butuh status `void`, §11) |
| Tandai seluruh akun uji coba & internal sebagai **tidak boleh ditagih** | **sudah ada** — `subscriptions.billing_mode` (bawaan `none`) + `bun run billing:pause` |
| Tutup `/register` publik (atau jadikan undangan) sampai rel bayar ada | **konsol `/settings` → Gate → Pendaftaran mandiri** (env `SELF_SERVE_SIGNUP` tetap jadi bawaannya) |
| Matikan PPN di tagihan platform sampai status PKP diputuskan | **konsol `/settings` → Gate → PPN** (env `PLATFORM_PPN_DISABLED=true` tetap jadi bawaannya) |
| Ubah CTA harga dari "Coba gratis" → **"Minta penawaran"** untuk ≥4 PT | kanal kontak sudah ada (`contactChannels()`) |

**Keluar dari Fase A bila:** secara konstruksi tidak ada akun non-komersial yang
bisa menerima tagihan.

### Fase B — jual dengan penawaran *(fase utama; 6–12 bulan)*

Sasaran: 3–5 customer berbayar nyata, dan satu bentuk penawaran yang terbukti
berulang.

- Jalur ≥4 PT: penawaran → kontrak → faktur di buku PT sendiri (§3.4) →
  pelunasan dicatat → konsol memberi paket/kuota dan periode
  (`changeTenantPlan`, `extendSubscription`), mode penagihan `manual`.
- Jalur 1–3 PT: tetap dijual manual, dengan harga yang dipajang apa adanya.
  Diskon hanya dengan alasan tertulis (§6.4), karena di jalur ini data harga
  dikumpulkan.
- Satu customer dijalankan di mode `otomatis` dengan pengawasan (§4.2).
- Yang perlu dibangun sekecil mungkin: satu dokumen penawaran (lingkup, kuota,
  harga, masa kontrak, syarat bayar) dan satu tombol konsol "aktifkan sesuai
  penawaran". Tidak perlu CPQ, gate pembayaran, atau dunning.

**Keluar dari Fase B (= gate Fase C) bila semua terpenuhi:**

1. ≥10 customer berbayar, ≥3 di antaranya datang tanpa demo yang memakan waktu
   penjual;
2. ≥3 siklus perpanjangan berhasil ditagih dan tertagih (bukan comp);
3. status PKP dan perlakuan PPh 23 sudah dijawab konsultan pajak (§9);
4. gate pembayaran hidup (`MIDTRANS_SERVER_KEY`) atau instruksi transfer
   manual terisi, dan keduanya pernah diuji dengan uang sungguhan;
5. kebijakan refund dan pembatalan tertulis dan ditautkan dari `/terms`;
6. ada satu orang yang bertanggung jawab atas tagihan yang menggantung. Otomasi
   memindahkan pekerjaan itu, tidak menghapusnya.

### Fase C — swalayan untuk Starter/Pro *(dipicu volume, bukan kesiapan kode)*

- **Penagihan perpanjangan harus dibangun lebih dulu.** Fitur ini belum ada:
  scheduler hanya menerbitkan tagihan pertama (saat uji coba habis) dan tidak
  pernah menagih periode berikutnya (§11). Tanpa itu, customer swalayan
  membayar sekali lalu memakai produk tanpa bayar seterusnya, dan hal itu baru
  ketahuan saat pendapatan dijumlahkan.
- Checkout swalayan mengambil metode pembayaran di muka; uji coba tanpa kartu
  berakhir dengan beku, tidak dengan tagihan (§1.2).
- Dunning dan auto-suspend dinyalakan hanya untuk mode `auto`.
- Business/Enterprise tetap di jalur penawaran (§4.1).
- Pemicunya: customer kecil baru per bulan melebihi kapasitas kerja manual,
  dalam praktik sekitar 20–30 customer berbayar. Di bawah itu, otomasi
  penagihan lebih banyak menimbulkan insiden daripada menghemat waktu; dokumen
  ini mencatat dua contohnya.

---

## 6. Strategi harga

### 6.1 Yang sudah diputuskan (jangan diubah tanpa alasan baru)

Tangga 249rb / 599rb / 1.199jt, pembeda = kuota PT & pengguna, tahunan = 10
bulan, Enterprise dirundingkan dengan lantai Rp 2,5 jt/bln. Seluruh alasannya di
`PRICING.md` §1–2, dan dijaga `tests/pricing-ladder.test.ts`.

### 6.2 Yang BELUM tervalidasi (dan harus diperlakukan begitu)

Tanpa pembayaran tidak ada bukti. Selama Fase B, per kesepakatan dicatat: harga
yang diminta, harga yang disetujui, keberatan utama, pembanding yang disebut
pembeli, jumlah PT, dan ada/tidaknya jasa migrasi. Sepuluh baris catatan ini
lebih berharga daripada riset pesaing karena isinya harga yang benar-benar
dibayar.

### 6.3 Kebijakan kenaikan saat perpanjangan (**belum ada — perlu diputuskan**)

Snapshot harga (`subscriptions.price`) melindungi customer lama dari perubahan
katalog. Tanpa kebijakan perpanjangan, snapshot itu juga membuat harga customer
pertama tidak pernah bisa naik. Usulan: harga dikunci selama masa kontrak;
perpanjangan memakai katalog berjalan dengan pemberitahuan ≥60 hari; customer
Fase A–B mendapat satu periode perpanjangan di harga lama sebagai imbalan atas
risiko sebagai pengguna awal.

### 6.4 Diskon & comp

Comp (`extendSubscription`) mudah dipakai dan akibatnya hampir tidak terlihat.
Ia sudah dipakai lima kali dan menghasilkan lima tagihan `paid` Rp 0 yang
mengotori setiap angka pendapatan. Usulan: setiap comp/diskon wajib menyebut
alasan dan tanggal berakhir (kolom alasan sudah wajib di aksi operator #155),
dan lantai diskon ditetapkan pemilik, tidak diputuskan per percakapan.

---

## 7. Proses quote-to-cash Fase B

| # | Langkah | Siapa | Alat |
| --- | --- | --- | --- |
| 1 | Prospek masuk (WhatsApp/email dari `/pricing`) | penjualan | `contactChannels()` |
| 2 | Pelingkupan: berapa PT, berapa pengguna, migrasi dari apa | penjualan | — |
| 3 | **Penawaran**: lingkup, kuota, harga, masa kontrak, syarat bayar, jasa | penjualan | dokumen (template) |
| 4 | Persetujuan tertulis (tanda tangan/email) | pembeli | — |
| 5 | Kontrak + faktur **di buku PT penyedia** | keuangan | aplikasi ini (kontrak → faktur → e-Faktur) |
| 6 | Pembayaran masuk, dicocokkan | keuangan | aplikasi ini (piutang) |
| 7 | **Aktifkan hak pakai**: paket + kuota + periode, mode `manual` | operator | konsol (`changeTenantPlan`, `extendSubscription`) |
| 8 | Onboarding: migrasi, COA, pelatihan | implementasi | produk (impor Excel sudah ada) |
| 9 | Pengingat perpanjangan H-60 | keuangan | **manual di Fase B** — daftar kerjanya di beranda konsol ("Perpanjangan 60 hari ke depan", 17 Okt 2026) |

Langkah 7 memakai fungsi yang sudah ada dan sudah berjejak audit. Yang perlu
dibangun hanya template penawaran (3) dan tombol yang menerjemahkan penawaran
yang disetujui menjadi hak pakai (7). Tombol itu hanya merangkai dua fungsi yang
sekarang dipanggil manusia.

**Tombol langkah 7 sudah ada sejak 17 Okt 2026:** "Aktifkan dari penawaran" di
rincian tenant (`activateQuoteEntitlement`: ganti paket → perpanjang → mode
`manual`, berhenti pada langkah pertama yang gagal, nomor penawaran di setiap
jejak). Template penawaran (3) belum ada. **Sejak 24 Okt 2026** aktivasi ini
TIDAK lagi menerbitkan tagihan Rp 0 `-K`: yang dicatat adalah baris
`quote_activations` (nomor penawaran UNIK + referensi bukti transfer,
migration platform 0011), yang tidak pernah dihitung sebagai pendapatan
platform. Perpanjangan KOMPENSASI biasa tetap memakai `-K` berstatus `comped`.

---

## 8. Metrik yang harus mulai diukur

**Status 10 Okt 2026:** empat dari enam metrik sudah ada di konsol (seksi
"Pendapatan" di beranda konsol `/`). Definisinya di
`packages/billing/src/platform-revenue.ts`, dijaga
`tests/platform-revenue.test.ts`. Dua sisanya sengaja tidak dihitung, dan
layarnya menyebut hal itu.

Tiga aturan yang membentuk setiap angkanya:

1. **Uang = baris `payments` berstatus `paid`**, bukan tagihan lunas atau
   langganan aktif. Comp tidak pernah melahirkan baris pembayaran, jadi hadiah
   terpisah dari penjualan secara konstruksi, tanpa bergantung pada saringan.
2. **MRR hanya dari langganan yang boleh ditagih** (`billing_mode ≠ none`).
   Harga di baris akun internal/penguji adalah snapshot katalog, bukan uang yang
   akan masuk. Bila dimasukkan, MRR naik setiap kali ada yang membuat akun demo.
3. **Tahunan dibagi dua belas, bukan sepuluh.** Katalog menjual setahun seharga
   sepuluh bulan, tetapi MRR menjawab "per bulan kalender". Membagi sepuluh
   melaporkan MRR 20% lebih tinggi daripada kas yang masuk.

Dua metrik yang tidak dihitung, beserta sebabnya:

- **Waktu ke nilai pertama** menuntut membuka buku customer, dan
  `apps/operator/src/lib/operator/store.ts` melarangnya ("konsol melihat METADATA
  langganan, bukan pembukuan customer"). Melanggar larangan itu demi angka
  dasbor tidak sepadan; ia butuh keputusan tersendiri.
- **Konversi per kohort** menuntut riwayat peristiwa langganan. Tabelnya ada
  sejak 17 Okt 2026 (`sai_platform.subscription_events`, migration platform
  0003; dicatat oleh semua penulis `subscriptions`, dijaga
  `tests/subscription-events.test.ts`), tetapi riwayatnya baru mulai hari itu.
  Langganan lama hanya punya satu peristiwa `created` beraktor `backfill`, yang
  mencerminkan keadaan saat migration, bukan keadaan awal. Kohort yang sahih baru
  bisa dihitung untuk langganan yang lahir sesudahnya, jadi angkanya belum
  dipajang. Yang dipajang adalah konversi sejak awal, dan diberi nama begitu.

Yang perlu didefinisikan sebelum rupiah pertama:

| Metrik | Definisi yang diusulkan | Kenapa |
| --- | --- | --- |
| Customer berbayar ✅ | tenant dengan ≥1 pembayaran `paid` (comp tak punya baris pembayaran) | memisahkan penjualan dari hadiah |
| MRR/ARR ✅ | jumlah ekuivalen-bulanan langganan bermode `manual`+`auto` yang belum `cancelled` (tahunan ÷ 12) | satu angka yang boleh disebut ke luar |
| Konversi uji coba → berbayar ⚠ | **sejak awal**, bukan per kohort (riwayat peristiwa baru tercatat sejak 17 Okt 2026) | mengukur §1.2, bukan menebaknya |
| Waktu ke nilai pertama ⛔ | **tidak dihitung** — menuntut membuka buku customer | menentukan panjang uji coba |
| Tagihan menggantung ✅ | jumlah + nominal + umur TERTUA sejak jatuh tempo (bukan rata-rata: di bawah sepuluh tagihan, rata-rata disetir satu pencilan) | Fase B dijalankan manusia; ini bebannya |
| Ekspansi per grup ⚠ | jumlah PT & pengguna ADA di ringkasan, tetapi tanpa dimensi waktu; perpindahan PAKET kini tercatat (`subscription_events.kind = 'plan'`) sejak 17 Okt 2026 | jalur pertumbuhan utama (§2) |

---

## 9. Pajak & legal — pertanyaan untuk konsultan

Dokumen ini tidak menjawab pertanyaan pajak. Ia menyiapkan bentuknya supaya
jawabannya bisa langsung diterapkan. Yang harus dijawab sebelum tagihan berbayar
pertama:

1. **Status PKP penyedia**, yang menentukan boleh tidaknya PPN muncul di
   tagihan. Sakelarnya ada di konsol `/settings` → Gate → PPN (bawaannya
   tetap env `PLATFORM_PPN_DISABLED`). Enam tagihan yang sudah terbit memuat
   PPN 11% dan perlu ditinjau.
2. **Tarif dan dasar pengenaan PPN yang berlaku saat penerbitan.**
   `packages/core/src/tax.ts` memegang satu tarif (`DEFAULT_TAX_RATE`). Bila
   dasar pengenaannya tidak lagi 100% dari harga, bentuk perhitungannya yang
   berubah, tidak hanya angkanya.
3. **PPh 23**: apakah langganan dan jasa ini objek pemotongan? Bila ya, siapa
   menerbitkan dan menerima bukti potong, dan bagaimana tagihan yang dibayar
   kurang dari nominalnya diperlakukan (§3.5).
4. **Badan hukum penerbit**: PT mana yang menjual, dan apakah penagihannya lewat
   buku PT itu di aplikasi ini (§3.4).
5. **Dokumen komersial**: syarat berlangganan, SLA (Business menjanjikan
   "dukungan prioritas", `PRICING.md` §2), kebijakan refund dan pembatalan,
   pemrosesan data customer. `/terms` dan `/privacy` sudah ada sebagai halaman;
   isinya perlu ditinjau terhadap janji komersial yang dipajang.
6. **Penangguhan sebagai tindakan komersial**: menjadikan buku customer
   hanya-baca karena tunggakan harus punya dasar di syarat berlangganan, beserta
   masa tenggangnya (kode memakai 14 hari).

---

## 10. Catatan keputusan

| # | Keputusan | Status | Dasar |
| --- | --- | --- | --- |
| K-1 | Jalur jual dibelah menurut jumlah PT (swalayan ≤3 PT, penawaran ≥4 PT) | **usulan** | §4.1 |
| K-2 | Hentikan tindakan otomatis terhadap akun non-komersial | **dibangun (Fase A)** — `billing_mode` menggerbangi scheduler | §1.1 |
| K-3 | Uji coba: tanpa kartu → beku (bukan ditagih), 30 hari | **dibangun (24 Okt 2026, alur demo-first)** — `trial_ended` + `TRIAL_DAYS = 30`; uji coba dibuat operator (`/tenants/new`), "Minta aktivasi" menggantikan "Bayar" | §1.2 |
| K-4 | Penagihan Fase B lewat buku PT sendiri, bukan `platform_invoices` | **usulan** | §3.4 |
| K-5 | PPN platform dimatikan sampai status PKP dijawab | **usulan** | §9.1 |
| K-6 | Fase C bergerbang 6 syarat terukur | **usulan** | §5 |
| K-7 | Harga 249/599/1.199 + pembeda kuota | **sudah diputuskan (#404/#408)** | `PRICING.md` |
| K-8 | Gate pendaftaran mandiri & PPN dipindah dari `.env` ke konsol `/settings` | **sudah diputuskan (pemilik, 11 Okt 2026)** | §9.1 · migration 0017 |

### Pertanyaan yang hanya pemilik bisa jawab

1. Siapa yang menjual, dan berapa waktu yang boleh dipakai per kesepakatan?
2. Lantai diskon dan siapa yang berwenang memberi comp?
3. Masa kontrak & syarat bayar standar (tahunan di muka? termin 14/30 hari?)
4. Status PKP dan badan hukum penerbit tagihan (§9).
5. Enam tagihan Rp 3,98 jt dan lima tenant tertangguhkan: apa yang sudah
   dijanjikan ke penggunanya, dan apa yang dikatakan kepada mereka sekarang?
6. Apakah uji coba swalayan tetap dibuka selama Fase B, atau hanya lewat
   undangan?

---

## 11. Cacat yang harus ditutup sebelum rupiah pertama

| Temuan | Akibat | Tempat |
| --- | --- | --- |
| **TIDAK ADA penagihan PERPANJANGAN sama sekali** | `platformInvoice.create` hanya ada di tiga tempat — trial habis, comp operator, prorata pindah paket — dan tak satu pun dipicu `current_period_end`. Jadi langganan "aktif" tidak pernah menagih bulan/tahun berikutnya; mesin pendapatan BERULANG belum ada. Ditemukan saat membangun panel mode penagihan | `scripts/subscription-scheduler.ts` |
| ~~Tidak ada bendera "boleh ditagih"~~ — **ditutup**: `billing_mode` menggerbangi trial habis, dunning, dan tenggang | (dulu: akun internal/uji coba ditagih lalu ditangguhkan, 2×) | `scripts/subscription-scheduler.ts` |
| ~~`extendSubscription` mengubah `billing_cycle` tanpa memotret ulang harga~~ — **ditutup**: kini memotret harga siklus dari katalog `plans` dan menolak siklus tanpa harga (`cycle_unpriced`); baris tenant 3 yang sudah terlanjur `yearly` Rp 599.000 perlu diperiksa terpisah | kurang tagih 10× saat comp habis 9 Sep 2027 | `apps/operator/src/lib/operator/writes.ts` |
| ~~Comp menghasilkan tagihan `paid` Rp 0~~ — **ditutup**: comp berstatus `comped`; aktivasi penawaran tidak lagi menerbitkan tagihan sama sekali (`quote_activations`) | — | `extendSubscription`, `platform_invoices.status` |
| ~~Tidak ada sakelar menutup pendaftaran publik~~ — **ditutup**: konsol `/settings` → Gate → Pendaftaran mandiri (env `SELF_SERVE_SIGNUP` jadi bawaan) | — | `packages/core/src/registration.ts`, konsol `/settings` |
| ~~`MANUAL_PAYMENT_INSTRUCTIONS` kosong~~ — **ditutup (24 Okt 2026)**: tanpa gerbang DAN tanpa instruksi transfer, tombol "Bayar" diganti "Minta aktivasi" | (dulu: tombol "Bayar" = jalan buntu tanpa nomor rekening) | `billing-actions.tsx`, `api/tenant/billing/activation-request` |
| `tenant_billing_profiles` kosong (0 baris) | ekspor e-Faktur platform akan menandai semua sebagai masalah | `packages/core/src/efaktur.ts` |
| ~~Uji coba 14 hari < waktu ke nilai pertama~~ — **ditutup (24 Okt 2026)**: `TRIAL_DAYS = 30` | — | `TRIAL_DAYS` |

---

## 12. Yang membuat dokumen ini kedaluwarsa

Tinjau ulang bila salah satu terjadi: customer berbayar pertama masuk; jawaban
konsultan pajak turun; gate pembayaran dinyalakan; jumlah customer berbayar
melewati 10, lalu 30; atau harga katalog berubah. Angka di §1 adalah snapshot
10 Oktober 2026 dan akan berubah begitu Fase A dijalankan.
