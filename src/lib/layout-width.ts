/**
 * LEBAR ISI & KISI YANG BERADAPTASI — satu sumber, dan alasan angkanya.
 *
 * ══ MASALAH YANG DIPECAHKAN ════════════════════════════════════════════════
 * Sampai berkas ini ada, pertanyaan "seberapa lebar isi halaman" punya EMPAT
 * jawaban yang tidak saling tahu:
 *
 *   | permukaan                    | lebar   | ditulis di                    |
 *   |------------------------------|---------|-------------------------------|
 *   | dasbor `(dashboard)`         | penuh   | `layout.tsx` (tanpa maks)     |
 *   | panel akun `/platform`       | 1152    | `platform-shell.tsx`          |
 *   | wisaya penyiapan `/setup`    | 1024    | `setup-shell.tsx`             |
 *   | layar pra-aplikasi `(auth)`  | 448     | `auth-shell.tsx`              |
 *
 * Dua di antaranya memang berbeda dengan sengaja, dan itu tetap dipertahankan:
 * dasbor **tanpa batas** karena isinya tabel laporan yang memang butuh lebar
 * (komentar di `(dashboard)/layout.tsx` menyebutnya "sesuai permintaan"), dan
 * `(auth)` sempit karena isinya satu formulir pendek untuk orang yang belum
 * masuk. Yang TIDAK punya alasan adalah selisih 1152 vs 1024: keduanya panel
 * kerja bagi orang yang sudah masuk, dan seorang pemilik menempuh keduanya
 * berurutan dalam satu alur — `/platform` → `/companies/new` → `/t/…/setup`.
 * Kolomnya menyempit 128px di tengah jalan tanpa satu pun alasan yang bisa
 * disebut, yaitu persis bentuk "tidak konsisten" yang paling terasa: bukan
 * beda yang mencolok, melainkan geseran yang membuat layar berikutnya terasa
 * bukan bagian dari aplikasi yang sama.
 *
 * ══ KENAPA `auto-fit`, BUKAN TITIK PATAH ═══════════════════════════════════
 * Pola kisi yang paling banyak dipakai app ini adalah `<Col xs={24} sm={12}>` —
 * 65 kali. Artinya: satu kolom di ponsel, DUA kolom sejak 576px, lalu berhenti
 * beradaptasi selamanya. Di monitor 2560px itu dua isian selebar ±1200px
 * masing-masing, dan mata harus menempuh jarak itu untuk pulang ke label
 * berikutnya. Kisi yang membeku di dua kolom adalah kisi yang responsif hanya
 * sampai tablet.
 *
 * `FORM_GRID` menggantinya dengan idiom yang SUDAH dipakai dan didokumentasikan
 * di `/platform` ("kisi yang membagi lebarnya sendiri … tanpa titik patah yang
 * harus dijaga tetap sama dengan titik patah lain"): jumlah kolomnya diturunkan
 * dari lebar yang tersedia, bukan dari daftar titik patah. Satu kolom saat
 * sempit, dua saat muat, tiga atau empat di layar lebar — dan tidak ada satu
 * pun angka breakpoint yang harus dijaga tetap sama dengan breakpoint di
 * berkas lain.
 *
 * ⚠ Ia HANYA untuk kolom yang setara. Baris yang kolomnya sengaja tidak sama
 * lebar — nama lebar, nominal sempit, tombol hapus sesempit ikon (`sm={10}` /
 * `sm={4}` / `sm={2}` di wisaya penyiapan) — tetap `Row`/`Col`, sebab
 * perbandingan lebar itu MEMBAWA ARTI dan `auto-fit` tidak bisa menyatakannya.
 */

/**
 * ══ KEPUTUSAN: ISI MEMAKAI LEBAR LAYAR, DI SELURUH PERMUKAAN APLIKASI ══════
 *
 * Dasbor sudah begitu sejak lama — `(dashboard)/layout.tsx` menyebutnya "tanpa
 * batas maks, sesuai permintaan". Panel akun (`/platform`, `/companies/new`)
 * dan wisaya penyiapan tidak, dan itulah yang membuat ketiganya terasa bukan
 * satu aplikasi: pemilik menempuh dasbor selebar 2400px lalu mendarat di panel
 * yang isinya terkurung 1152px di tengah, dengan dua bidang kosong selebar
 * 600px di kiri-kanannya.
 *
 * **Batas itu dicabut.** Yang menggantikannya bukan "tidak ada aturan"
 * melainkan aturan yang bekerja satu lapis lebih dalam: wadahnya selebar
 * layar, dan yang menjaga barisan teks tetap terbaca adalah KISI di dalamnya
 * (`formGrid`) — jumlah kolomnya bertambah saat layar melebar, alih-alih dua
 * kolom yang sama-sama membengkak. Layar lebar karena itu memuat LEBIH BANYAK,
 * bukan hal yang sama dalam ukuran lebih besar.
 *
 * ⚠ Yang TIDAK ikut dicabut adalah `AuthShell` (448px). Ia layar pra-aplikasi
 * untuk orang yang belum masuk, isinya satu formulir pendek, dan lebarnya
 * memang bagian dari bentuknya.
 */

/**
 * Padding tepi isi panel — pengganti batas lebar, dan sengaja SAMA dengan
 * `(dashboard)/layout.tsx` supaya isi tidak menempel ke sisi layar dan supaya
 * jarak tepinya tidak bergeser saat pengguna berpindah antar-permukaan.
 */
export const PADDING_PANEL_LEBAR = 24;
export const PADDING_PANEL_SEMPIT = 16;

/**
 * Lebar MAKSIMUM sebuah kolom isian teks tunggal.
 *
 * Wadahnya boleh selebar layar; sebuah isian nama atau NPWP tidak. Ini bukan
 * pembatalan keputusan di atas melainkan penerapannya di tempat yang benar:
 * yang mengisi lebar adalah KISI-nya, sedangkan tiap sel di dalam kisi berhenti
 * tumbuh di sini supaya nomor NPWP 20 karakter tidak mengambang di sepertiga
 * kiri sebuah kotak selebar layar. Di layar lebar sisa ruangnya dipakai untuk
 * menambah KOLOM, bukan melebarkan kotak.
 */
export const LEBAR_KOLOM_ISIAN = 640;

/**
 * Kisi kolom SETARA yang jumlah kolomnya mengikuti lebar yang tersedia.
 *
 * `min(100%, …)` menjaga kolomnya tidak pernah melebihi wadahnya di layar
 * sempit — tanpa itu, `minmax(280px, …)` memaksa lebar 280px pada wadah 240px
 * dan halamannya menggulung mendatar.
 *
 * ⚠ `auto-fit`, bukan `auto-fill`, dan di sini itu memang yang benar: isinya
 * kolom formulir yang harus MEMBAGI HABIS barisnya. (Kebalikan dari kisi
 * katalog seperti daftar perusahaan `/platform`, tempat `auto-fill` justru yang
 * benar supaya satu kartu tidak melar selebar halaman.)
 */
export function formGrid(min = 280, gap = 16): React.CSSProperties {
  return {
    display: "grid",
    gap,
    gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), 1fr))`,
  };
}

/**
 * Kisi isian yang selnya BERHENTI TUMBUH — pasangan `formGrid` untuk wadah
 * yang kini selebar layar.
 *
 * Bedanya satu kata: trek keduanya `LEBAR_KOLOM_ISIAN` alih-alih `1fr`, jadi
 * kolom yang sudah cukup lebar tidak ikut membengkak saat layar melebar —
 * yang bertambah jumlah kolomnya. Inilah yang membuat "isi selebar layar"
 * tidak berubah menjadi "isian selebar layar".
 */
export function fieldGrid(min = 280, gap = 16): React.CSSProperties {
  return {
    display: "grid",
    gap,
    gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${min}px), ${LEBAR_KOLOM_ISIAN}px))`,
  };
}
