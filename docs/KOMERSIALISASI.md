# Komersialisasi — strategi, fase, dan gerbangnya

> **Status: USULAN, belum diputuskan pemilik.** Dokumen ini menjawab satu
> pertanyaan — *"platform dipakai internal dan proses komersialnya belum jelas;
> apakah fitur langganan dimunculkan sekarang, atau penawaran (quote) dulu?"* —
> dan mencatat dasar strateginya supaya keputusannya bisa ditinjau ulang, bukan
> diingat-ingat.
>
> **Hubungannya dengan `docs/PRICING.md`:** dokumen itu adalah **katalog** —
> angka, kuota, dan aturan main yang sudah hidup di kode. Dokumen ini satu
> lapis di atasnya: **bagaimana dan kepada siapa katalog itu dijual, dan kapan
> mesin otomatisnya boleh dinyalakan.** Kalau keduanya berbeda soal angka,
> `PRICING.md` yang benar.
>
> Angka keadaan di §1 diukur dari basis data **produksi, 10 Oktober 2026**.
> Setiap klaim di dokumen ini menunjuk berkas atau tabel yang bisa diperiksa;
> yang tidak punya sumber ditulis sebagai pertanyaan, bukan sebagai kesimpulan.

---

## 0. Ringkasan keputusan yang diusulkan

Mesin langganan **tidak perlu dimunculkan — ia sudah menyala**, dan sudah
bertindak terhadap akun-akun uji coba: menerbitkan tagihan, mengirim 40 surel
penagihan, lalu menangguhkan lima buku menjadi hanya-baca. Yang belum ada
justru **rel pendapatannya**: tidak ada gerbang pembayaran terpasang, tidak ada
nomor rekening untuk transfer manual, tidak ada profil pajak pelanggan, dan nol
pembayaran pernah tercatat.

Karena itu keputusan yang diusulkan **bukan** "munculkan" atau "sembunyikan",
melainkan tiga hal berurutan:

1. **Hentikan mesinnya bertindak** terhadap akun yang tidak punya perjanjian
   komersial (§5 Fase A). Ini pekerjaan hari ini, dan ia bukan fitur.
2. **Jual dengan penawaran** untuk pelanggan multi-PT (≥3 PT), memakai konsol
   operator + buku PT sendiri yang keduanya sudah ada (§5 Fase B).
3. **Nyalakan langganan swalayan** hanya untuk Starter/Pro, dan hanya setelah
   gerbang terukur di §5 Fase C terlewati — bukan karena kodenya sudah ada.

**Satu koreksi atas usulan awal:** jangan satu jalur untuk semua. Jalur jualnya
**dibelah menurut jumlah PT**, dan alasannya aritmetika, bukan selera (§4.1).

| | Starter · Pro (1–3 PT) | Business · Enterprise (≥4 PT) |
| --- | --- | --- |
| Jalur jual | **swalayan** — tujuan akhir | **penawaran + jasa** — selamanya |
| Rp/tahun (DPP) | 2,99 jt – 7,19 jt | 14,39 jt – ≥30 jt |
| Boleh ada tenaga penjual? | tidak — marginnya tidak menanggungnya | ya — ditambah jasa migrasi & pelatihan |
| Kapan dinyalakan | Fase C (bergerbang) | Fase B (sekarang, manual) |

---

## 1. Keadaan hari ini — yang terukur

Konteksnya **masa uji coba**: akun-akun yang terdaftar adalah penguji dan
pilot, bukan pelanggan yang pernah setuju membeli. Itu penting, dan ia tidak
mengurangi temuannya — justru menjelaskan kenapa angkanya berbentuk begini.

| Ukuran | Nilai | Sumber |
| --- | --- | --- |
| Tenant | 11 (2 `internal`, **9 di paket `pro`**) | `sai_control.tenants` |
| Status tenant | 4 aktif · 1 `past_due` · **5 `suspended`** · 1 `trialing` | idem |
| Perusahaan (PT) · pengguna | 17 · 13 | idem |
| Tagihan terbit & belum lunas | **6 × Rp 664.890 = Rp 3.989.340** | `sai_platform.platform_invoices` |
| Tagihan berstatus `paid` | 5 — semuanya **Rp 0**, hasil *comp* operator (nomor `…-K`) | idem |
| **Pembayaran tercatat** | **0 baris** | `sai_platform.payments` |
| Surel penagihan terkirim (SMTP hidup, uji terakhir `ok`) | **18 `invoice_due` + 22 `trial_ending`** | `sai_platform.reminder_logs`, `mail_settings` |
| Profil penagihan pelanggan (NPWP) | **0** | `sai_platform.tenant_billing_profiles` |
| Putaran penjadwal | 1.212 `ok` · 5 `error` (terakhir error 16 Agu) | `sai_platform.scheduler_runs` |

Yang dikatakan angka-angka ini, berurutan:

- **Mesin penagihannya sehat dan rajin.** 1.212 putaran sukses; ia bukan fitur
  setengah jadi yang perlu diselesaikan, ia mesin bekerja yang diarahkan ke
  sasaran yang salah.
- **Tangga harga belum pernah diuji pasar.** 9 dari 11 tenant ada di `pro`
  bukan karena memilih, melainkan karena `SIGNUP_PLAN_KEY = "pro"`
  (`lib/registration.ts`). Nol pembayaran berarti nol data soal kesediaan
  membayar — `PRICING.md` tetap riset pesaing, bukan harga tervalidasi.
- **Rp 3,98 jt "piutang" itu fiktif** dan sedang mengotori pembukuan platform;
  5 tagihan `paid` bernilai Rp 0 membuat "pendapatan" tidak bisa dibaca dari
  tabel mana pun tanpa menyaring comp terlebih dahulu.
- **PPN 11% sudah ikut terbit** di 6 tagihan itu, sementara status PKP penyedia
  belum diputuskan dan tidak satu pun pelanggan punya profil NPWP (§9).

### 1.1 Akar masalahnya: **"boleh ditagih" bukan konsep di model**

Ini temuan terpenting dokumen ini, dan ia arsitektural, bukan proses.

Penjadwal mengambil **setiap** langganan yang belum `cancelled`, dan untuk
setiap yang masa uji cobanya habis ia menerbitkan tagihan sebesar `sub.price` +
PPN — tanpa satu pun pemeriksaan "apakah akun ini memang pelanggan"
(`scripts/subscription-scheduler.ts`, langkah 1). Tidak ada bendera
non-billable, dan **harga nol pun tidak dilewati**.

Dua tenant `internal` selamat bukan karena dilindungi, tetapi karena mereka
tidak pernah melewati jalur `trialing → trial habis` (harga 0, `trial_ends_at`
NULL). Itu **kebetulan keadaan, bukan desain** — artinya tenant internal atau
penguji berikutnya yang dibuat lewat pendaftaran normal akan ditagih, ditagih
ulang, lalu ditangguhkan. Persis yang terjadi pada 9 akun uji coba itu.

Preseden untuk perbaikannya sudah ada di berkas yang sama: dunning **sengaja**
mengecualikan tagihan perpindahan paket (`targetPlanId: null`) dengan alasan
yang ditulis panjang — "tagihan selisih naik-paket adalah tawaran, bukan
kewajiban". Sistem ini sudah tahu bahwa sebagian tagihan tidak boleh memicu
penagihan. Yang kurang hanyalah pengetahuan yang sama tentang **akun**.

### 1.2 Desain uji coba sekarang tidak bisa menghasilkan pembayaran

Alurnya hari ini: daftar (tanpa kartu, tanpa data pembayaran apa pun) → 14 hari
Pro → **tagihan Rp 664.890 terbit** → pengingat H-7/H-3/H-1
(`REMINDER_OFFSETS_DAYS`) → `past_due` → 14 hari tenggang
(`GRACE_PERIOD_DAYS`) → **hanya-baca**.

Tiga hal membuatnya mustahil berhasil:

1. **Tidak ada metode pembayaran yang pernah diambil.** Menagih orang yang
   tidak pernah memberi cara membayar adalah penagihan yang hanya bisa gagal.
2. **Tidak ada rel untuk membayar sekalipun ia mau.** `MIDTRANS_SERVER_KEY`
   tidak diset → gerbang jatuh ke `manual`; `MANUAL_PAYMENT_INSTRUCTIONS` juga
   tidak diset → tombol "Bayar" menghasilkan referensi `manual-PINV-…`
   **tanpa nomor rekening** (`lib/payment-gateway.ts`).
3. **14 hari lebih pendek daripada waktu mencapai nilai** untuk perangkat
   pembukuan. Nilai pertama produk ini baru terasa setelah satu siklus tutup
   bulan: COA tersusun, saldo awal masuk, transaksi sebulan tercatat, laporan
   keluar. Accurate memberi 30 hari (tabel pesaing `PRICING.md` §2). Uji coba
   yang berakhir sebelum pengguna pernah menutup satu bulan mengukur
   ketekunan, bukan nilai produk.

Praktik bakunya ada dua, dan keduanya konsisten — yang berjalan sekarang justru
gabungan terburuk dari keduanya:

| Desain | Akhir uji coba | Syarat |
| --- | --- | --- |
| **Kartu di muka** | langsung ditagih otomatis | wajib ada gerbang pembayaran; cocok untuk swalayan |
| **Tanpa kartu** | akun **turun/beku**, TIDAK ditagih | tagihan hanya lahir setelah orang setuju membeli |
| *Sekarang* | *tanpa kartu, **tetapi ditagih** + ditangguhkan* | *—* |

**Rekomendasi:** pakai desain **tanpa kartu → beku, bukan ditagih**, dan
panjangkan uji coba ke **30 hari** (satu siklus tutup bulan). Tagihan pertama
lahir dari persetujuan manusia — penawaran yang disetujui (Fase B) atau
checkout swalayan (Fase C) — tidak pernah dari berakhirnya waktu.

---

## 2. Posisi produk & siapa yang membeli

Dasar seluruh strategi di bawah ini adalah satu kalimat: **produk ini bukan
aplikasi akuntansi untuk satu UMKM, ia pembukuan untuk SATU GRUP berisi
beberapa PT.**

Buktinya ada di arsitekturnya sendiri, bukan di materi pemasaran: setiap PT
punya basis data sendiri (`docs/MULTI-COMPANY.md`), keanggotaan & pengguna
hidup di basis data kendali, dan kuota paket dihitung dalam **jumlah PT**.
Tidak ada vendor di tabel pesaing `PRICING.md` §2 yang menjual bentuk itu
sebagai anak tangga swalayan — Mekari Jurnal menaruh multi-perusahaan di paket
ERP "hubungi penjualan", Kledo hanya di Champion, Xero menuntut satu langganan
per organisasi. **Celah itulah produknya**, dan ia kebetulan juga celah yang
pembelinya tidak swalayan di pasar mana pun.

| | Isi |
| --- | --- |
| **Pembeli (yang tanda tangan)** | pemilik / direktur grup 2–10 PT, atau manajer keuangan grup |
| **Pengguna harian** | staf akuntansi per PT, 1–5 orang |
| **Pemicu membeli** | konsolidasi grup yang masih manual di Excel; tutup bulan yang lambat; audit/pajak yang menuntut jejak; migrasi dari Accurate/Zahir yang mahal per basis data |
| **Pembanding yang dia pikirkan** | "beli Accurate 3 lisensi", "suruh akuntan eksternal", "tetap Excel" |
| **Yang sebenarnya dijual** | kuota PT **+ jasa**: migrasi data, penyusunan COA, pelatihan tim, SLA |
| **Aset yang jarang dimiliki vendor** | penyedia memakai produknya sendiri untuk buku grupnya sendiri — 17 PT, transaksi nyata. Itu bukti dan referensi sekaligus |

**Konsekuensi strategis:** ekspansi pendapatan datang dari **bertambahnya PT di
dalam grup yang sama**, bukan dari menjual fitur tambahan. Itu sebabnya
keputusan `PRICING.md` §1 — *"yang membedakan paket HANYA kuota PT & pengguna"*
— bukan kemalasan model data melainkan kecocokan dengan unit nilainya. Harga
yang mengikuti jumlah PT adalah harga yang naik bersama manfaat yang diterima
pelanggan, dan ia bisa dijelaskan dalam satu kalimat kepada pemilik grup.

---

## 3. Dasar strategi — lima pilar

### 3.1 Monetisasi mengikuti unit nilai (sudah benar, jangan diubah)

Harga per PT menurun di setiap anak tangga (249rb → 199,7rb → 149,9rb per PT),
sehingga naik paket selalu lebih murah daripada menumpuk paket kecil
(`PRICING.md` §1). Ini pagar yang tepat: ia membuat jalur ekspansi alami
(tambah PT) juga jalur termurah bagi pelanggan, jadi tidak ada insentif untuk
memecah grup menjadi beberapa akun — yang akan merusak justru konsolidasi yang
dijual produk ini.

### 3.2 Urutan: manual → terukur → otomatis

Yang dijual belum pernah terjual satu kali pun. Dalam keadaan itu, membangun
(atau menyalakan) otomasi penagihan berarti mengotomatiskan proses yang
bentuknya belum diketahui. Praktik baku untuk sepuluh pelanggan pertama adalah
sebaliknya: **lakukan secara manual sampai bentuknya terlihat berulang**, lalu
otomatiskan bagian yang paling sering diulang.

Yang membuat urutan ini aman di sini: **90% alur quote-to-cash sudah ada**, dan
semuanya di tangan manusia. Konsol operator sudah bisa memberi paket & kuota
(`changeTenantPlan`), memberi periode berbayar tanpa gerbang
(`extendSubscription`), mencatat transfer manual (`recordManualPayment`), dan
menangguhkan/memulihkan (`setTenantSuspension`). Jadi Fase B tidak menuntut
fitur baru yang berarti — ia menuntut **mesin otomatisnya berhenti mendahului
manusia**.

⚠ Pilar ini punya tanggal kedaluwarsa, dan §4.1 menyebut angkanya. "Manual
dulu" yang tidak punya gerbang keluar adalah cara sebuah bisnis memilih untuk
tidak bisa tumbuh.

### 3.3 Entitlement ≠ billing (aturan arsitektur)

**Hak pakai** (boleh membuka berapa PT, berapa pengguna) dan **penagihan**
(tagihan, pengingat, penangguhan) harus bisa hidup terpisah. Satu akun boleh
punya hak pakai penuh dan **nol** kewajiban bayar — internal, penguji, pilot,
demo, pelanggan yang tagihannya ditangani di luar sistem.

Hari ini keduanya menyatu, dan §1.1 menunjukkan harganya. Aturannya ke depan:

- setiap tenant punya **mode penagihan** yang eksplisit — mis. `internal`
  (tidak pernah ditagih), `manual` (ditagih di luar sistem/di buku PT sendiri),
  `otomatis` (siklus penjadwal);
- penerbitan tagihan, dunning, dan penangguhan **hanya** menyentuh mode
  `otomatis`;
- bawaan untuk akun baru adalah mode yang **tidak** menagih. Akun menjadi
  `otomatis` lewat tindakan manusia, bukan lewat berakhirnya waktu;
- `plans.key = "internal"` **bukan** pengganti bendera ini: paket menjawab
  "kuota berapa", bukan "boleh ditagih atau tidak". Sembilan akun uji coba di
  paket `pro` adalah buktinya.

Ini satu kolom + satu kondisi di tiga tempat, dan ia menutup seluruh kelas
kejadian yang sudah terjadi dua kali (issue #416 dan sekarang).

### 3.4 Satu mesin faktur, bukan dua

Penyedia **sudah menjadi tenant di aplikasinya sendiri**, dan aplikasi itu sudah
punya kontrak, faktur, PPN, piutang, dan ekspor e-Faktur yang dipakai untuk
pelanggan nyata. Sementara itu `platform_invoices` adalah mesin faktur **kedua**
di repo yang sama, dengan nomor, PPN, dan status lunasnya sendiri — tetapi tanpa
e-Faktur per pelanggan, tanpa profil NPWP yang terisi, dan tanpa satu pembayaran
pun pernah tercatat.

**Keputusan yang diusulkan:** sampai Fase C, penjualan ditagih **di buku PT
penyedia sendiri** (kontrak → faktur → pelunasan → e-Faktur), dan
`platform_invoices` dipakai hanya sebagai **catatan hak pakai & periode** untuk
akun bermode `manual`. Yang dibeli: nol pekerjaan kepatuhan ganda, dan
pendapatan yang bisa dibaca dari pembukuan sungguhan alih-alih dari tabel yang
comp-nya bercampur dengan penjualan.

### 3.5 Kepatuhan Indonesia menentukan rel pembayarannya

Urutan sebab-akibatnya sering dibalik, dan membalikkannya mahal: **bentuk
penagihan ditentukan cara pelanggan korporat Indonesia membayar**, bukan oleh
apa yang paling mudah dibangun.

- Pembeli korporat membayar lewat **PO → faktur → transfer**, dengan termin.
  Kartu berulang menyelesaikan masalah yang pembeli ini tidak punya.
- Bila langganan/jasa ini **dipotong PPh 23** oleh pelanggan, maka uang yang
  masuk selalu lebih kecil dari nominal tagihan, dan pelanggan akan meminta
  bukti potong. Mesin langganan otomatis tidak punya konsep pemotongan: setiap
  tagihan akan selamanya terbaca "kurang bayar", dan dunning akan menangguhkan
  pelanggan yang justru sudah membayar penuh. **Ini perlu dikonfirmasi ke
  konsultan pajak (§9)** — tetapi bila jawabannya "ya", ia sendirian cukup
  untuk menunda penagihan otomatis bagi pelanggan berbadan hukum.
- **PPN hanya boleh dipungut bila penyedia PKP.** Enam tagihan yang sudah
  terbit memuat PPN 11% dan mendahului keputusan itu. Sakelarnya sudah ada di
  kode dan memang dibuat untuk ini: `PLATFORM_PPN_DISABLED`, yang komentarnya
  menyebut dirinya *"mekanisme untuk jawaban penasihat pajak, bukan kebijakan
  yang kami tetapkan"*.

---

## 4. Di mana strategi ini menyimpang dari praktik umum — dan kenapa

Jujur di bagian ini lebih berguna daripada rapi.

### 4.1 Praktik umum berkata produk seharga ini HARUS swalayan

Patokan yang dipakai luas: di bawah nilai kontrak tahunan ±Rp 15–20 juta, biaya
akuisisi berbasis manusia hampir selalu melebihi margin tahun pertama. Harga di
sini: Starter Rp 2,99 jt/tahun, Pro Rp 7,19 jt/tahun, Business Rp 14,39 jt,
Enterprise ≥Rp 30 jt (lantai internal `PRICING.md` §2).

Artinya **jalur penawaran manual untuk Starter dan Pro akan merugi**, dan itu
bukan pendapat: satu kesepakatan yang menuntut demo + pelingkupan migrasi +
tindak lanjut memakan 6–12 jam manusia. Pada Pro (margin kotor tahun pertama
beberapa juta rupiah), ongkos itu sudah menghabiskan marginnya sebelum
pelanggan membuka bulan kedua.

Karena itu rekomendasinya dibelah, bukan diseragamkan:

- **Starter · Pro = swalayan**, dan itu tujuan akhir yang tidak boleh ditunda
  tanpa batas. Yang menahannya sekarang bukan strategi melainkan **rel
  pembayaran yang belum terpasang** (§1.2).
- **Business · Enterprise = penawaran + jasa, selamanya.** Di situ nilai
  kontraknya menanggung tenaga manusia, dan jasa migrasi/pelatihan (Rp 1,5–3
  juta sekali, `PRICING.md` §5) menambah pendapatan yang swalayan tidak bisa
  memungut sama sekali.

Yang **tetap** menyimpang dari patokan itu: untuk sepuluh pelanggan berbayar
pertama, **semua** jalur dijalankan manual — termasuk Starter/Pro — karena
tujuan fase itu bukan efisiensi melainkan **belajar harga dan keberatan**.
Penyimpangan ini dibatasi waktu dan jumlah, bukan dibiarkan terbuka (§5).

### 4.2 Menunda penagihan otomatis menunda juga pembelajarannya

Risiko nyata dari Fase A–B: selama tidak ada yang pernah membayar lewat sistem,
tidak ada yang tahu bagian mana dari mesin penagihan yang benar-benar rusak —
dan bug seperti harga tahunan yang tidak dipotret ulang (§11) hanya muncul saat
uang sungguhan lewat. Mitigasinya: **pelanggan berbayar pertama ditagih lewat
sistem secara sengaja** (satu tenant, mode `otomatis`, diawasi), bukan semuanya
dialihkan ke manual sampai Fase C.

### 4.3 Harga publik yang dipajang sebelum tervalidasi

Memajang tangga harga di `/pricing` sebelum ada satu pelanggan berbayar adalah
pilihan yang sudah diambil (#404/#413, sudah di produksi). Praktik umumnya
menerima ini — harga publik membangun kepercayaan dan menyaring pembeli — dengan
satu syarat yang belum dipenuhi di sini: **jangan membekukan angkanya sebagai
komitmen.** Selama belum ada pembayaran, angka di `/pricing` adalah hipotesis,
dan `PRICING.md` §4 sudah menyediakan jalur mengubahnya tanpa menyentuh
pelanggan berjalan (snapshot). Yang perlu ditambahkan adalah **kebijakan
kenaikan saat perpanjangan** (§6.3), karena tanpa itu snapshot yang melindungi
pelanggan lama juga memastikan harga tidak pernah bisa naik.

---

## 5. Tiga fase, dengan gerbang yang bisa diukur

### Fase A — berhenti bertindak *(mulai sekarang; bukan pekerjaan fitur)*

Sasaran: nol tagihan, nol surel penagihan, dan nol penangguhan terhadap akun
yang tidak punya perjanjian komersial.

| Tindakan | Alat yang sudah ada |
| --- | --- |
| Pulihkan 5 tenant `suspended` + 1 `past_due` | `setTenantSuspension` (konsol) |
| Batalkan/void 6 tagihan fiktif Rp 3,98 jt | tindakan operator (butuh status `void`, §11) |
| Tandai seluruh akun uji coba & internal sebagai **tidak boleh ditagih** | **belum ada** — §3.3, satu kolom |
| Tutup `/register` publik (atau jadikan undangan) sampai rel bayar ada | **belum ada** sakelarnya — §11 |
| Matikan PPN di tagihan platform sampai status PKP diputuskan | `PLATFORM_PPN_DISABLED=true` |
| Ubah CTA harga dari "Coba gratis" → **"Minta penawaran"** untuk ≥4 PT | kanal kontak sudah ada (`contactChannels()`) |

**Keluar dari Fase A bila:** tidak ada akun non-komersial yang bisa menerima
tagihan *secara konstruksi* (bukan karena kebetulan keadaan).

### Fase B — jual dengan penawaran *(fase utama; 6–12 bulan)*

Sasaran: **3–5 pelanggan berbayar nyata**, dan satu bentuk penawaran yang
terbukti berulang.

- Jalur ≥4 PT: penawaran → kontrak → faktur **di buku PT sendiri** (§3.4) →
  pelunasan dicatat → konsol memberi paket/kuota + periode (`changeTenantPlan`,
  `extendSubscription`), mode penagihan `manual`.
- Jalur 1–3 PT: tetap dijual manual, tetapi **harganya dipajang apa adanya** —
  tidak ada diskon tanpa alasan tertulis (§6.4), karena di sinilah data harga
  dikumpulkan.
- **Satu** pelanggan dijalankan di mode `otomatis` dengan pengawasan (§4.2).
- Yang perlu dibangun: **sekecil mungkin** — satu dokumen penawaran (lingkup,
  kuota, harga, masa kontrak, syarat bayar) + satu tombol konsol "aktifkan
  sesuai penawaran". Bukan CPQ, bukan gerbang pembayaran, bukan dunning.

**Keluar dari Fase B (= gerbang Fase C) bila SEMUA terpenuhi:**

1. ≥10 pelanggan berbayar, ≥3 di antaranya datang **tanpa** demo berbayar waktu;
2. ≥3 siklus perpanjangan berhasil ditagih & tertagih (bukan comp);
3. status PKP & perlakuan PPh 23 **sudah dijawab** konsultan pajak (§9);
4. gerbang pembayaran hidup (`MIDTRANS_SERVER_KEY`) **atau** instruksi transfer
   manual terisi, dan keduanya pernah diuji dengan uang sungguhan;
5. kebijakan refund & pembatalan tertulis dan tertaut dari `/terms`;
6. ada satu orang yang bertanggung jawab atas tagihan yang menggantung —
   otomasi memindahkan pekerjaan, ia tidak menghapusnya.

### Fase C — swalayan untuk Starter/Pro *(dipicu volume, bukan kesiapan kode)*

- Checkout swalayan dengan **metode pembayaran diambil di muka**; uji coba
  tanpa kartu berakhir dengan **beku, bukan tagihan** (§1.2).
- Dunning + auto-suspend dinyalakan **hanya** untuk mode `otomatis`.
- Business/Enterprise **tetap** di jalur penawaran (§4.1).
- Pemicu sebenarnya: pelanggan kecil baru per bulan melebihi kapasitas tangan —
  praktiknya di sekitar **20–30 pelanggan berbayar**. Di bawah itu, otomasi
  penagihan lebih banyak menerbitkan insiden daripada menghemat waktu, dan
  dokumen ini punya dua contohnya.

---

## 6. Strategi harga

### 6.1 Yang sudah diputuskan (jangan diubah tanpa alasan baru)

Tangga 249rb / 599rb / 1.199jt, pembeda = kuota PT & pengguna, tahunan = 10
bulan, Enterprise dirundingkan dengan lantai Rp 2,5 jt/bln. Seluruh alasannya di
`PRICING.md` §1–2, dan dijaga `tests/pricing-ladder.test.ts`.

### 6.2 Yang BELUM tervalidasi (dan harus diperlakukan begitu)

Nol pembayaran = nol bukti. Yang dikumpulkan selama Fase B, per kesepakatan:
harga yang diminta, harga yang disetujui, keberatan utama, pembanding yang
disebut pembeli, jumlah PT, dan ada/tidaknya jasa migrasi. Sepuluh baris catatan
ini lebih berharga daripada riset pesaing mana pun, karena ia harga yang
benar-benar dibayar.

### 6.3 Kebijakan kenaikan saat perpanjangan (**belum ada — perlu diputuskan**)

Snapshot harga (`subscriptions.price`) melindungi pelanggan lama dari perubahan
katalog, dan itu benar. Tanpa kebijakan perpanjangan, ia juga berarti harga
pelanggan pertama **tidak pernah** bisa naik. Usulan: harga dikunci selama masa
kontrak; perpanjangan memakai katalog berjalan dengan pemberitahuan ≥60 hari,
dan pelanggan Fase A–B mendapat satu periode perpanjangan di harga lama sebagai
penghargaan atas risiko yang mereka ambil sebagai pengguna awal.

### 6.4 Diskon & comp

Comp (`extendSubscription`) adalah alat yang sangat mudah dipakai dan hampir
tidak terlihat akibatnya: ia sudah dipakai 5 kali dan menghasilkan 5 tagihan
`paid` Rp 0 yang mengotori setiap angka pendapatan. Usulan: setiap comp/diskon
wajib menyebut **alasan + tanggal berakhir** (kolom alasan sudah wajib di aksi
operator #155), dan lantai diskon ditetapkan pemilik — bukan diputuskan per
percakapan.

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
| 9 | Pengingat perpanjangan H-60 | keuangan | **manual di Fase B** |

Langkah 7 memakai fungsi yang sudah ada dan sudah berjejak audit. Satu-satunya
yang perlu dibangun adalah **template penawaran (3) dan tombol yang
menerjemahkan penawaran yang disetujui menjadi hak pakai (7)** — dan tombol itu
hanya merangkai dua fungsi yang sudah dipanggil manusia hari ini.

---

## 8. Metrik yang harus mulai diukur

Hari ini "pendapatan" tidak bisa dibaca dari tabel mana pun: `payments` kosong,
dan tagihan comp berstatus `paid` bercampur dengan penjualan. Yang perlu
didefinisikan sebelum rupiah pertama:

| Metrik | Definisi yang diusulkan | Kenapa |
| --- | --- | --- |
| Pelanggan berbayar | tenant dengan ≥1 pembayaran **bukan comp** | memisahkan penjualan dari hadiah |
| MRR/ARR | jumlah harga langganan mode `otomatis`+`manual` yang berbayar, tanpa comp | satu angka yang boleh disebut ke luar |
| Konversi uji coba → berbayar | per kohort pendaftaran | mengukur §1.2, bukan menebaknya |
| Waktu ke nilai pertama | hari dari daftar sampai tutup bulan pertama | menentukan panjang uji coba |
| DSO / tagihan menggantung | umur tagihan belum lunas | Fase B dijalankan manusia; ini bebannya |
| Ekspansi per grup | PT per tenant dari waktu ke waktu | jalur pertumbuhan utama (§2) |

---

## 9. Pajak & legal — pertanyaan untuk konsultan

Dokumen ini **tidak** menjawab pertanyaan pajak; ia menyiapkan bentuknya supaya
jawabannya bisa langsung dipasang. Yang harus dijawab sebelum tagihan berbayar
pertama:

1. **Status PKP penyedia** — menentukan boleh/tidaknya PPN muncul di tagihan.
   Sakelarnya: `PLATFORM_PPN_DISABLED`. Enam tagihan yang sudah terbit memuat
   PPN 11% dan perlu ditinjau.
2. **Tarif & dasar pengenaan PPN yang berlaku saat penerbitan** — `lib/tax.ts`
   memegang satu tarif (`DEFAULT_TAX_RATE`); kalau dasar pengenaannya tidak lagi
   100% dari harga, bentuk perhitungannya yang berubah, bukan hanya angkanya.
3. **PPh 23**: apakah langganan + jasa ini objek pemotongan? Bila ya: siapa
   menerbitkan/menerima bukti potong, dan bagaimana tagihan yang dibayar kurang
   dari nominalnya diperlakukan (§3.5).
4. **Badan hukum penerbit** — PT mana yang menjual, dan apakah penagihannya
   lewat buku PT itu di aplikasi ini (§3.4).
5. **Dokumen komersial**: syarat berlangganan, SLA (Business menjanjikan
   "dukungan prioritas" — `PRICING.md` §2), kebijakan refund & pembatalan,
   pemrosesan data pelanggan. `/terms` dan `/privacy` sudah ada sebagai halaman;
   isinya perlu ditinjau terhadap janji komersial yang dipajang.
6. **Penangguhan sebagai tindakan komersial**: menjadikan buku pelanggan
   hanya-baca karena tunggakan harus punya dasar di syarat berlangganan,
   beserta masa tenggangnya (kode memakai 14 hari).

---

## 10. Catatan keputusan

| # | Keputusan | Status | Dasar |
| --- | --- | --- | --- |
| K-1 | Jalur jual dibelah menurut jumlah PT (swalayan ≤3 PT, penawaran ≥4 PT) | **usulan** | §4.1 |
| K-2 | Hentikan tindakan otomatis terhadap akun non-komersial | **usulan, mendesak** | §1.1 |
| K-3 | Uji coba: tanpa kartu → beku (bukan ditagih), 30 hari | **usulan** | §1.2 |
| K-4 | Penagihan Fase B lewat buku PT sendiri, bukan `platform_invoices` | **usulan** | §3.4 |
| K-5 | PPN platform dimatikan sampai status PKP dijawab | **usulan** | §9.1 |
| K-6 | Fase C bergerbang 6 syarat terukur | **usulan** | §5 |
| K-7 | Harga 249/599/1.199 + pembeda kuota | **sudah diputuskan (#404/#408)** | `PRICING.md` |

### Pertanyaan yang hanya pemilik bisa jawab

1. Siapa yang menjual, dan berapa waktu yang boleh dipakai per kesepakatan?
2. Lantai diskon dan siapa yang berwenang memberi comp?
3. Masa kontrak & syarat bayar standar (tahunan di muka? termin 14/30 hari?)
4. Status PKP dan badan hukum penerbit tagihan (§9).
5. Enam tagihan Rp 3,98 jt dan lima tenant tertangguhkan — apa yang sudah
   dijanjikan ke penggunanya, dan apa yang dikatakan kepada mereka sekarang?
6. Apakah uji coba swalayan tetap dibuka selama Fase B, atau hanya lewat
   undangan?

---

## 11. Cacat yang harus ditutup sebelum rupiah pertama

| Temuan | Akibat | Tempat |
| --- | --- | --- |
| **Tidak ada bendera "boleh ditagih"**; harga nol pun tidak dilewati | akun internal/uji coba ditagih lalu ditangguhkan — sudah terjadi 2× | `scripts/subscription-scheduler.ts` langkah 1 |
| `extendSubscription` mengubah `billing_cycle` **tanpa memotret ulang harga** | tenant 3 kini `yearly` berharga Rp 599.000 → saat comp habis 9 Sep 2027 ditagih **Rp 599rb untuk setahun**, kurang tagih 10×, tanpa bersuara | `lib/operator/writes.ts` |
| Comp menghasilkan tagihan `paid` Rp 0 | "pendapatan" tak bisa dibaca tanpa menyaring comp; butuh status/penanda tersendiri | `extendSubscription`, `platform_invoices.status` |
| Tidak ada sakelar menutup pendaftaran publik | orang asing bisa mendaftar → ditagih → ditangguhkan, tanpa rel bayar | `lib/registration.ts`, `proxy.ts` |
| `MANUAL_PAYMENT_INSTRUCTIONS` kosong | tombol "Bayar" = jalan buntu tanpa nomor rekening | `lib/payment-gateway.ts` |
| `tenant_billing_profiles` kosong (0 baris) | ekspor e-Faktur platform akan menandai semua sebagai masalah | `lib/efaktur.ts` |
| Uji coba 14 hari < waktu ke nilai pertama | konversi diukur sebelum nilai pernah terasa | `TRIAL_DAYS` |

---

## 12. Yang membuat dokumen ini kedaluwarsa

Tinjau ulang bila salah satu terjadi: pelanggan berbayar pertama masuk; jawaban
konsultan pajak turun; gerbang pembayaran dinyalakan; jumlah pelanggan berbayar
melewati 10, lalu 30; atau harga katalog berubah. Angka di §1 adalah **potret
10 Oktober 2026** — ia akan salah begitu Fase A dijalankan, dan itu memang
tandanya berhasil.
