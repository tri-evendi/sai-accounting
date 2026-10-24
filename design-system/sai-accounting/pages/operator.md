# Konsol Operator (`ops.saiaccounting.id`, aplikasi `apps/operator`) — override MASTER.md

> Berlaku untuk seluruh `apps/operator/src/app/(operator)/**` + `apps/operator/src/components/operator/**`
> + `apps/operator/src/lib/operator/**`. Untuk halaman lain, MASTER.md tetap berlaku apa adanya.

## Kenapa permukaan ini punya aturan sendiri

Konsol hidup di hostname sendiri (`OPERATOR_HOST`, biasanya
`ops.saiaccounting.id`), punya sesi, cookie, dan kredensialnya sendiri (`apps/operator/src/lib/operator/session.ts` + TOTP wajib), dan tidak
pernah mewarisi konteks perusahaan. Pembacanya satu-dua orang penyedia, jadi yang
dioptimalkan adalah kecepatan menjawab "apa yang perlu ditangani hari ini".

Karena itu tidak ada hero, tidak ada CTA berulang (kelonggaran pendaratan `/`),
dan tidak ada `UserMenu`; rute pelanggan tidak ada di aplikasi ini.

## Aturan (meng-override / menambah MASTER.md)

- **Bentuknya panel admin, bukan bilah tab.** Menu samping gelap 256px + kepala
  64px + isi lebar penuh yang menggulung sendiri; angkanya sama dengan chrome
  dasbor dan `PlatformShell`. Kulitnya `apps/operator/src/components/operator/operator-shell.tsx`;
  daftar butirnya `apps/operator/src/lib/operator/nav.tsx`, bukan di dalam kulitnya.
- **Isi tanpa batas lebar.** `maxWidth` di wadah isi dilarang: tabel tenant &
  jejak audit punya 5–7 kolom, dan mengurungnya di 1152px membuat keduanya
  menggulung mendatar di monitor 1440px.
- **Bidang gelap permanen = penanda bidang.** Menu samping (dan kepala halaman
  masuk) memakai `SIDER_BG_DARK` di kedua tema, dengan `colorTextLightSolid` /
  `NEUTRAL_TEXT_DARK` / `BORDER_TOKENS_DARK` untuk apa pun di atasnya. Satu
  pandangan harus cukup untuk tahu ini bukan aplikasi pelanggan. Lambangnya
  `SafetyCertificateOutlined`, bukan `BrandMark`.
- **`PageHeader` wajib,** sama seperti halaman dasbor. Halaman tingkat-1 tanpa
  breadcrumb dan judulnya persis label menunya (boleh membawa jumlah); halaman
  di bawahnya (konsol `/tenants/[id]`) memakai breadcrumb yang dimulai dari
  label menu induknya. Breadcrumb itulah jalan pulangnya; jangan menulis tombol
  "kembali" sendiri.
- **Lencana "Tindakan tercatat" selalu di kepala, dan selalu pertama dibaca.**
  Setiap tindakan di sini terekam atas nama operator
  yang sedang masuk.
- **Guard per halaman, bukan per layout.** Setiap halaman memanggil
  `requireOperatorPage()` dan setiap server action `requireOperatorActionSession()`;
  layout hanya membaca sesi secara opsional untuk chrome. Dijaga
  `tests/authz-coverage.test.ts` (grup `(operator)`). `route.ts` di bawah grup
  ini hanya boleh berupa unduhan berkas (hanya `GET`, wajib
  `requireOperatorRoute("<izin>")`); di luar grup, satu-satunya API aplikasi ini
  adalah probe publik `/api/health`.
- **Dua bidang data, satu yang boleh mati.** Bacaan dari basis data control
  selalu tampil; bacaan platform (`sai_platform`) jatuh ke `null` dan dijawab
  satu kalimat ("penagihan tidak terjangkau"), tidak pernah 500. Pola
  `billingOverviewForTenant`; lihat `apps/operator/src/lib/operator/store.ts`.
- **Setiap wilayah isi berada di atas permukaan.** Bingkainya dua
  (`apps/operator/src/components/operator/console-ui.tsx`):
  - **`ConsolePanel`**: kartu bertepi & berbayang, untuk isi yang berdiri di
    atas latar halaman: tabel, formulir, daftar fakta, prosa.
    `flush` untuk tabel (yang sudah membawa tepi & nada kepalanya sendiri), dan
    `title` boleh kosong ketika judulnya hanya akan mengulang `<h1>` halaman.
  - **`ConsoleSection`**: tanpa permukaan, untuk isi yang sudah berkartu
    sendiri (kisi `StatCard`). Kartu di dalam kartu menghasilkan dua tepi
    berjarak 24px yang tidak memisahkan apa pun.

  Permukaan yang disusun tangan di komponen client (`mail-settings-form`,
  `tenant-actions`) memakai resep yang sama dengan `@sai/ui/card`: `paddingLG`
  + `boxShadowTertiary`.

- **Kalimat "tak terjangkau" satu bentuk: `ConsoleNotice`,** bukan `Alert`.
  Bidang platform memang boleh mati; menjawab keadaan yang sudah diantisipasi
  dengan warna bahaya membuatnya terbaca seperti kerusakan.

- **Jarak antar-bagian satu angka** (`--ant-margin-lg`, lewat `CONSOLE_PAGE`),
  dan gaya teks sekunder satu objek (`CONSOLE_MUTED`). Jangan mendefinisikan
  `NOTICE`/`MUTED`/gaya judul seksi di dalam halaman; bentuk itu pernah
  menjadi enam salinan dalam empat bentuk berbeda.

- **Ringkasan dibuka oleh "Perlu ditangani", bukan oleh ubin.** Daftar itu
  memuat hanya keadaan yang menuntut tindakan, berurut menurut mendesaknya,
  masing-masing bertaut ke tempat tindakannya. Penyaringnya murni & teruji
  (`apps/operator/src/lib/operator/attention.ts`). Keadaan tenang dikatakan
  sekali sebagai satu kalimat, tidak sebagai enam baris nol. Baris scheduler
  berdiri paling atas karena ia menjelaskan baris lain.

  Ubin angka tetap ada di bawahnya sebagai `StatCard` apa adanya, tanpa ubin
  kedua milik konsol (alasan di kepala `(operator)/page.tsx`). Ubin itu tidak
  boleh menjadi jawaban halaman: enam belas angka berbobot sama memindahkan
  penyaringan ke orang yang membukanya.

- **Kepala area kerja memuat dua kelompok.** Kiri: lencana "tindakan tercatat"
  + host yang sedang dibuka; keduanya menjawab apa akibat klik berikutnya, dan
  pada siapa. Kanan: identitas operator dalam satu isian + tombol keluar. Di
  layar sempit host yang menyusut, bukan target sentuh.
- **Saringan & pilihan lewat form GET,** tidak lewat state client: hasilnya URL
  yang bisa disalin ke tiket dukungan, tanpa JS tambahan. Berlaku untuk
  daftar tenant dan pemilih bahasa/bagian di konsol `/content`.
- **Halaman panjang dibagi TAB di URL** — satu komponen, `ConsoleTabs`
  (`components/operator/console-tabs.tsx`, server component; aturan alamat di
  `lib/operator/console-tabs.ts`). Tab aktif = `?tab=<id>` (tab bawaan tanpa
  parameter; nilai tak dikenal → bawaan), jadi tautan, tombol Kembali, muat
  ulang, dan baris "perlu perhatian" menunjuk tab yang tepat. Tautan biasa
  dengan `aria-current="page"`, bukan `Tabs` AntD: server HANYA membaca data
  tab aktif, bukan merender semua panel lalu menyembunyikannya. Lencana angka
  per tab dari data yang sudah ada (mis. permintaan aktivasi terbuka). Di layar
  sempit barisnya bergulir mendatar. Dipakai: `/tenants` (tab status di atas
  `?status=` yang sudah ada; `status=activation` = Minta aktivasi),
  `/tenants/[id]` (Ringkasan · Langganan & tagihan · Perusahaan & pengguna ·
  Jejak audit), `/settings` (Pendaftaran & uji coba · Tagihan & PPN · Harga
  publik · Kontak · Retensi — tiap tab menyimpan medannya sendiri),
  `/scheduler` (Ringkasan · Antrean · Outbox · Metrik · Versi & runtime).

### konsol `/content` — isi halaman depan

- **Yang disimpan hanya penimpa.** Kamus (`packages/core/src/i18n/dictionaries/*.json`) tetap
  sumber bawaan; basis data hanya memuat teks yang sudah diganti. Isian kosong
  = "pakai bawaan", dan bawaannya selalu tampil di bawah isian (bukan hanya
  sebagai `placeholder`).
- **Draf → pratinjau → terbit.** Menyimpan di editor membuat DRAF; halaman
  publik tidak berubah. Tampilan Tinjau memperlihatkan "tayang sekarang →
  sesudah terbit" per kunci+bahasa, membuat tautan pratinjau bertoken
  (30 menit, host customer; tautan ke `/`, `/pricing`, `/status` di dalam
  pratinjau membawa tokennya, tautan lain tidak), dan menerbitkan. Yang
  terbit tampil di halaman depan dalam 5 detik (sinyal `cache_signals`),
  dan kalimat konsol menyebut angka itu. Riwayat menyimpan nilai
  sebelum/sesudah; "batalkan penerbitan" dan "pakai versi ini" membuat draf,
  tidak pernah langsung menayangkan.
- **Tiga tampilan di URL** (`?view=edit|review|history`, `?section=`,
  `?show=`, `?q=`), chip tampilan `secondary`/`ghost`. Satu aksi utama per
  tampilan: "Simpan draf" (Sunting) dan "Terbitkan" (Tinjau).
- **Ketiga bahasa berdampingan.** Status berteks per isian (Bawaan / Diganti /
  Draf), penghitung karakter terhadap batas yang diturunkan dari kamus
  (`contentFieldSpec`), dan peringatan "terjemahan tertinggal" bila sebuah
  kunci diganti di sebagian bahasa saja.
- **Teks biasa.** Tag HTML, karakter kendali, dan penanda `{…}` yang berbeda
  dari bawaan ditolak di editor dan di server dengan aturan yang sama
  (`contentValueProblem`).
- **Izin:** `site.content` (support, owner) menyunting draf, pratinjau,
  membuang draf, dan mengembalikan versi sebagai draf; `site.publish` (owner)
  menerbitkan dan membersihkan kunci yatim.
- **Hanya `landing.*`.** Namespace lain tidak boleh bisa disunting dari konsol:
  `errors.*`/`validation.*` adalah perilaku, bukan pemasaran. Kuncinya harus ada
  di ketiga kamus (`isEditableInAll`). Dijaga `tests/site-content.test.ts`.
- **Label isian nama kunci** (`heroHeading`): hanya nama itu yang sama di
  konsol, di kamus, dan di jejak audit.
- **Jejak audit mencatat kunci, bukan nilai.** Nilainya ada di riwayat
  penerbitan, yang memang riwayat isi.

## Jangan

- Mengimpor modul bertenant/bercompany, `auth()`, `signOut`, atau chrome
  pelanggan (`UserMenu`, `Sidebar`, `Navbar`) ke dalam aplikasi ini. Konsol
  adalah aplikasi & image tersendiri, dan arah impornya dijaga
  `tests/operator-dependency-direction.test.ts`.
- Memakai `PlatformShell` di sini (dan sebaliknya). Bentuk keduanya sengaja
  sama, tetapi yang satu memikul sesi pelanggan.
- Menulis `<h1>` sendiri dengan konstanta gaya lokal; gantinya `PageHeader`.
- Menulis `<h2>` seksi dengan konstanta gaya lokal; gantinya
  `ConsolePanel`/`ConsoleSection`.
- Menambahkan `forceRender` pada `Drawer` menu samping: ia mengembalikan menu
  tak terlihat ke urutan fokus.
- Mengimpor `packages/platform/src/platform-db.ts` (atau modul yang mengimpornya) dari
  guard, proxy, atau jalur panas i18n (doktrin #137). Karena itu
  `packages/platform/src/i18n/server.ts` memuat `site-content-store` lewat
  `await import()`, dan `tests/site-content.test.ts` menolak impor statisnya.
