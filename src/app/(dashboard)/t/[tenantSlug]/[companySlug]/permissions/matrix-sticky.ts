/**
 * Header lengket untuk kedua matriks izin (issue #199).
 *
 * Dipakai `/permissions` (peran × izin) dan panel "Izin Khusus" per pengguna.
 * Keduanya daftar panjang dengan kendali di setiap baris, dan pada keduanya
 * judul kolomlah yang memberi arti pada kendali itu: sebuah kotak centang tanpa
 * nama peran di atasnya, atau sebuah pemilih tri-state tanpa "Untuk pengguna
 * ini", adalah kendali yang tidak bisa dibaca. Begitu matriksnya digulir,
 * judul itu hilang — dan itu yang diperbaiki di sini.
 *
 * ── Kenapa ini butuh DUA bagian, bukan sekadar `position: sticky` ──────────
 * Ini bagian yang paling mudah salah, jadi ditulis eksplisit.
 *
 * `position: sticky` dihitung terhadap **ancestor scroll container TERDEKAT**,
 * bukan terhadap viewport. Primitif `Table` (`components/ui/table.tsx`)
 * membungkus tabelnya dengan `<div class="… overflow-x-auto">`, dan menurut CSS
 * `overflow-y: visible` ikut berubah menjadi `auto` begitu sumbu lain bukan
 * `visible` — jadi div itu SELALU sebuah scroll container. Tinggi bawaannya
 * mengikuti isi, sehingga ia tidak pernah benar-benar menggulung vertikal:
 * `top: 0` menempel di puncak tabel, tabelnya ikut naik bersama halaman, dan
 * headernya tetap hilang. Sticky yang terlihat benar di kode dan tidak
 * melakukan apa pun di layar.
 *
 * Yang membuatnya bekerja adalah `matrixScrollBox`: sebuah pembungkus
 * `display: flex; flex-direction: column` dengan `max-height`. Pembungkus geser
 * milik primitif menjadi FLEX ITEM di dalamnya, dan karena `overflow`-nya bukan
 * `visible`, ukuran minimum otomatisnya (`min-height: auto`) bernilai 0 —
 * sehingga ia menyusut mengikuti `max-height` induknya dan mulai menggulung
 * vertikal sendiri. Barulah `top: 0` punya sesuatu untuk ditempeli.
 *
 * Karena itu KEDUANYA harus dipakai bersama; salah satu saja tidak menghasilkan
 * apa-apa. `tests/permission-matrix-sticky.test.tsx` mengunci keempat syaratnya
 * sekaligus — jsdom tidak menghitung tata letak, jadi yang bisa dibuktikan
 * tanpa peramban adalah syaratnya, bukan piksel akhirnya.
 *
 * Alternatif yang TIDAK dipilih: menambah prop `sticky`/`maxHeight` di
 * `StaticTable`/`DataTable`. Itu jelas lebih rapi, tetapi `src/components/ui`
 * di luar lingkup issue ini; usulannya ditulis di laporan.
 */

import type { GlobalToken } from "antd";

/**
 * Tinggi maksimum kotak matriks. `vh` dan bukan piksel: yang menentukan berapa
 * banyak baris yang muat adalah tinggi LAYAR, dan angka piksel tetap akan
 * memotong matriks di layar 1440px sekaligus melewati batas layar laptop kecil.
 * 70% menyisakan ruang untuk kepala halaman, legenda, dan tombol simpan.
 */
export const MATRIX_MAX_HEIGHT = "70vh";

/**
 * Kotak bertinggi terbatas yang MENGGULUNG — separuh pertama dari mekanisme di
 * kepala berkas. Pemanggil menambahkan `maxHeight: MATRIX_MAX_HEIGHT`.
 */
export function matrixScrollBox(token: GlobalToken): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    // Tepi & sudut kotak matriks — bekas `rounded-lg border border-border`.
    border: `1px solid ${token.colorBorderSecondary}`,
    borderRadius: token.borderRadiusLG,
    background: token.colorBgContainer,
    // Sudut membulat hanya terlihat kalau isinya dipotong; pemotongan ini tidak
    // mengganggu sticky, karena scroll container terdekat milik `<th>` tetap
    // pembungkus geser primitif yang berada DI DALAM kotak ini.
    overflow: "hidden",
  };
}

/**
 * Sel judul yang menempel — separuh kedua. Latarnya WAJIB pekat: tanpa itu
 * baris yang lewat di belakangnya terbaca menembus judul kolom.
 */
export function stickyHead(token: GlobalToken): React.CSSProperties {
  return {
    position: "sticky",
    top: 0,
    zIndex: 1,
    background: token.colorBgContainer,
    // Garis bawah ikut menempel; tanpa ini batas judul–isi menghilang saat
    // digulir, karena `border-b` milik baris judul menggulung bersama tabelnya.
    boxShadow: `inset 0 -1px 0 ${token.colorBorderSecondary}`,
  };
}
