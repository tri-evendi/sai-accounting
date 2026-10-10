# Konsol Operator `/operator` — override MASTER.md

> Berlaku untuk seluruh `src/app/(app)/(operator)/**` + `src/components/operator/**`
> + `src/lib/operator/**`. Untuk halaman lain, MASTER.md tetap berlaku apa adanya.

## Kenapa permukaan ini punya aturan sendiri

Ia bukan halaman pelanggan. Konsol hidup di **hostname sendiri**
(`OPERATOR_HOST`, biasanya `ops.saiaccounting.id`), punya **sesi, cookie, dan
kredensialnya sendiri** (`lib/operator/session.ts` + TOTP wajib), dan tidak
pernah mewarisi konteks perusahaan. Pembacanya satu-dua orang penyedia, bukan
ribuan pelanggan — jadi yang dioptimalkan bukan onboarding melainkan **kecepatan
menjawab "apa yang perlu ditangani hari ini"**.

Dua kelonggaran dunia pemasaran (`/`) dan satu kelengkapan dunia pelanggan
(`/platform`) karena itu TIDAK berlaku di sini: tidak ada hero, tidak ada CTA
berulang, dan tidak ada `UserMenu` (pengalih perusahaan, ganti kata sandi,
pintu ke `/platform` — ketiganya 404 di host ini).

## Aturan (meng-override / menambah MASTER.md)

- **Bentuknya PANEL ADMIN, bukan bilah tab.** Menu samping gelap 256px + kepala
  64px + isi lebar penuh yang menggulung sendiri — angka yang sama dengan chrome
  dasbor dan `PlatformShell`. Kulitnya `components/operator/operator-shell.tsx`;
  daftar butirnya `lib/operator/nav.tsx`, bukan di dalam kulitnya.
- **Isi TANPA batas lebar.** `maxWidth` di wadah isi dilarang: tabel tenant &
  jejak audit punya 5–7 kolom, dan mengurungnya di 1152px membuat keduanya
  menggulung mendatar di monitor 1440px.
- **Bidang gelap permanen = penanda bidang.** Menu samping (dan kepala halaman
  masuk) memakai `SIDER_BG_DARK` di KEDUA tema, dengan `colorTextLightSolid` /
  `NEUTRAL_TEXT_DARK` / `BORDER_TOKENS_DARK` untuk apa pun di atasnya. Satu
  pandangan harus cukup untuk tahu ini bukan aplikasi pelanggan. Lambangnya
  `SafetyCertificateOutlined`, **bukan** `BrandMark`.
- **`PageHeader` wajib,** sama seperti halaman dasbor. Halaman tingkat-1 tanpa
  breadcrumb dan judulnya persis label menunya (boleh membawa jumlah); halaman
  di bawahnya (`/operator/tenants/[id]`) memakai breadcrumb yang dimulai dari
  label menu induknya — breadcrumb ITULAH jalan pulangnya, bukan tombol
  "kembali" tulisan tangan.
- **Lencana "Tindakan tercatat" selalu di kepala, dan selalu pertama dibaca.**
  Ia peringatan, bukan hiasan: setiap tindakan di sini terekam atas nama operator
  yang sedang masuk.
- **Penjaga per HALAMAN, bukan per layout.** Setiap halaman memanggil
  `requireOperatorPage()` dan setiap server action `requireOperatorActionSession()`
  — layout hanya membaca sesi secara opsional untuk chrome. Dijaga
  `tests/authz-coverage.test.ts` (grup `(operator)`), yang juga menolak `route.ts`
  mana pun di bawah grup ini.
- **Dua bidang data, satu yang boleh mati.** Bacaan dari basis data KENDALI
  selalu tampil; bacaan PLATFORM (`sai_platform`) jatuh ke `null` dan dijawab
  satu KALIMAT ("penagihan tidak terjangkau"), tidak pernah 500. Pola
  `billingOverviewForTenant`; lihat `lib/operator/store.ts`.
- **Setiap wilayah isi duduk di atas PERMUKAAN.** Bingkainya dua, dan
  pembedaannya satu kalimat supaya ia tidak menjadi selera
  (`components/operator/console-ui.tsx`):
  - **`ConsolePanel`** — kartu bertepi & berbayang, untuk isi yang tanpa itu
    mengambang di atas latar halaman: tabel, formulir, daftar fakta, prosa.
    `flush` untuk tabel (yang sudah membawa tepi & nada kepalanya sendiri), dan
    `title` BOLEH kosong ketika judulnya hanya akan mengulang `<h1>` halaman.
  - **`ConsoleSection`** — tanpa permukaan, untuk isi yang sudah berkartu
    sendiri (kisi `StatCard`). Kartu di dalam kartu menghasilkan dua tepi
    berjarak 24px yang tidak memisahkan apa pun.

  Permukaan yang disusun tangan di komponen client (`mail-settings-form`,
  `tenant-actions`) memakai resep yang SAMA dengan `ui/card.tsx` — `paddingLG`
  + `boxShadowTertiary`. Satu konsol, satu keluarga permukaan.

- **Kalimat "tak terjangkau" satu bentuk: `ConsoleNotice`.** Ia bukan `Alert`:
  bidang platform memang BOLEH mati, dan menjawab keadaan yang sudah
  diantisipasi dengan warna bahaya membuatnya terbaca seperti kerusakan.

- **Jarak antar-bagian SATU angka** (`--ant-margin-lg`, lewat `CONSOLE_PAGE`),
  dan gaya teks sekunder satu objek (`CONSOLE_MUTED`). Jangan mendefinisikan
  `NOTICE`/`MUTED`/gaya judul seksi di dalam halaman — bentuk itu sudah pernah
  tumbuh menjadi enam salinan dalam empat bentuk berbeda.

- **Ringkasan dibuka oleh "PERLU DITANGANI", bukan oleh ubin.** Daftar itu
  memuat hanya keadaan yang menuntut tindakan, berurut menurut mendesaknya,
  masing-masing bertaut ke tempat tindakannya; penyaringnya murni & teruji
  (`lib/operator/attention.ts`), dan keadaan tenang dikatakan SEKALI sebagai
  satu kalimat — bukan sebagai enam baris nol. Baris penjadwal berdiri paling
  atas karena ia MENJELASKAN baris lain.

  Ubin angka tetap ada di bawahnya dan tetap `StatCard` apa adanya — bukan ubin
  kedua milik konsol (alasan di kepala `(operator)/operator/page.tsx`). Yang
  dilarang adalah menjadikan ubin itu JAWABAN halaman: enam belas angka
  berbobot sama memindahkan penyaringan ke kepala orang yang membukanya.

- **Kepala area kerja memuat dua kelompok, bukan elemen yang mengambang.**
  Kiri: lencana "tindakan tercatat" + HOST yang sedang dibuka — keduanya
  menjawab pertanyaan yang sama (apa akibat klik berikutnya, dan pada siapa).
  Kanan: identitas operator dalam satu isian + tombol keluar. Host-lah yang
  menyusut di layar sempit, bukan target sentuh.
- **Saringan & pilihan lewat form GET,** tidak lewat state client: hasilnya URL
  yang bisa disalin ke tiket dukungan, dan nol byte JS tambahan. Berlaku untuk
  daftar tenant dan pemilih bahasa/bagian di `/operator/content`.

### `/operator/content` — isi halaman pendaratan

- **Yang disimpan hanya PENIMPA.** Kamus (`lib/i18n/dictionaries/*.json`) tetap
  sumber bawaan; `site_contents` hanya memuat kalimat yang sudah diganti. Isian
  kosong = "pakai bawaan" (barisnya dihapus), dan bawaannya berdiri sebagai
  `placeholder` isian itu.
- **Hanya `landing.*`.** Namespace lain tidak boleh bisa disunting dari konsol —
  `errors.*`/`validation.*` adalah PERILAKU, bukan pemasaran. Dijaga dua lapis
  (skema zod lalu `isEditableContentKey`) dan `tests/site-content.test.ts`.
- **Label barisnya NAMA KUNCI** (`heroHeading`), bukan kalimat manusia: ia satu-
  satunya penanda yang sama di konsol, di kamus, dan di jejak audit.
- **Jejak audit mencatat KUNCI, bukan NILAI.** Jejak yang memuat setiap kalimat
  pemasaran yang pernah diketik berhenti bisa dibaca sebagai jejak.

## Jangan

- **Jangan** mengimpor modul bertenant/bercompany, `auth()`, `signOut`, atau
  chrome pelanggan (`UserMenu`, `Sidebar`, `Navbar`) ke dalam bidang ini — satu
  impor seperti itu mengubah "folder yang bisa diekstrak jadi aplikasi kedua"
  menjadi jalinan yang harus diurai.
- **Jangan** memakai `PlatformShell` di sini (dan sebaliknya): keduanya
  BERBENTUK sama dengan sengaja, tetapi yang satu memikul sesi pelanggan.
- **Jangan** menulis `<h1>` sendiri dengan konstanta gaya lokal. Itu bentuk lama
  berkas-berkas ini (empat salinan dari gaya yang sama); gantinya `PageHeader`.
- **Jangan** menulis `<h2>` seksi dengan konstanta gaya lokal pula — penyakit
  yang sama, satu tingkat lebih bawah. Gantinya `ConsolePanel`/`ConsoleSection`.
- **Jangan** menambahkan `forceRender` pada `Drawer` menu samping — ia
  mengembalikan menu tak terlihat ke urutan fokus.
- **Jangan** mengimpor `lib/platform-db.ts` (atau modul yang mengimpornya) dari
  penjaga, proxy, atau jalur panas i18n — doktrin #137. `lib/i18n/server.ts`
  memuat `site-content-store` lewat `await import()` justru karena itu, dan
  `tests/site-content.test.ts` menolak impor statisnya.
