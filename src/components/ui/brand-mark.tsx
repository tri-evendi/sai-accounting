/**
 * Lambang produk — satu tempat, tiga pemakai.
 *
 * Sebelum ini kotak "SAI" ditulis ulang di `auth-shell`, `setup-shell`, dan
 * `sidebar`, masing-masing dengan ukuran, radius, dan bobot hurufnya sendiri.
 * Tiga salinan sebuah lambang adalah tiga lambang yang berbeda begitu salah
 * satunya disentuh — dan penggantian merek berikutnya harus menemukan
 * ketiganya.
 *
 * ── Tentang gambarnya ──────────────────────────────────────────────────────
 * Buku besar dilihat dari depan: satu bidang pejal dengan punggung terpotong
 * di kiri. Bentuk PEJAL, bukan garis — dan itu keputusan yang lahir dari
 * pengukuran, bukan selera.
 *
 * Dua rancangan bergaris dicoba lebih dulu dan keduanya gagal pada ukuran
 * sebenarnya (dirender 16/20/24/40/64px lalu dilihat, bukan dinilai dari
 * kode):
 *   • tiga batang mendatar (debit, kredit, jumlah) → terbaca sebagai ikon
 *     "rata teks";
 *   • akun-T dengan entri di kiri & kanan → pada 16–24px entrinya melebur
 *     dengan batang tegaknya menjadi "₮", lambang Tugrik Mongolia.
 * Garis setebal 2,5 unit pada kanvas 24 unit memang tidak punya ruang untuk
 * tiga elemen yang harus tetap terpisah di 16px. Bidang pejal punya.
 *
 * Akun-T tanpa entri sempat lolos keterbacaan, tapi hasilnya huruf "T" —
 * inisial yang salah untuk produk bernama SAI.
 *
 * Sengaja geometri sendiri, bukan ikon dari set ikon: ikon adalah kosakata
 * ANTARMUKA (`FileDoneOutlined`, `WalletOutlined`, dan seterusnya, MASTER.md), dan meminjam
 * satu di antaranya sebagai lambang produk berarti lambang itu akan muncul
 * lagi di tengah layar sebagai tombol.
 *
 * Ini lambang buatan pengembang, bukan karya perancang merek. Bila kelak ada
 * berkas resmi, yang diganti hanya `<path>` di bawah.
 *
 * Semuanya `currentColor`, jadi satu berkas ini melayani panel gelap maupun
 * permukaan terang tanpa varian warna. Bila kelak ada berkas merek resmi,
 * yang perlu diganti hanya `<svg>` di bawah.
 */

/**
 * Ukuran kotaknya. `md` (40px) memenuhi target sentuh minimum MASTER.md untuk
 * saat lambangnya sekaligus menjadi tautan.
 */
type BrandMarkSize = "sm" | "md" | "lg";

const BOX: Record<BrandMarkSize, React.CSSProperties> = {
  sm: { width: 32, height: 32, borderRadius: "var(--ant-border-radius-lg)" },
  md: { width: 40, height: 40, borderRadius: "var(--ant-border-radius-lg)" },
  lg: { width: 48, height: 48, borderRadius: "var(--ant-border-radius-lg)" },
};

/** Ukuran gambarnya di dalam kotak — selalu setengah tinggi kotaknya. */
const GLYPH: Record<BrandMarkSize, number> = { sm: 16, md: 20, lg: 24 };

export function BrandMark({ size = "md" }: { size?: BrandMarkSize }) {
  return (
    <span
      style={{
        ...BOX[size],
        display: "flex",
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
        background: "var(--ant-color-primary)",
        color: "var(--ant-color-text-light-solid)",
      }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        width={GLYPH[size]}
        height={GLYPH[size]}
      >
        {/*
         * Satu path, dua subpath, `evenodd` — bukan dua persegi bertumpuk.
         * Punggung buku adalah LUBANG yang ditembus warna kotak di belakangnya,
         * jadi lambang ini tidak perlu tahu warna latarnya dan tetap benar di
         * atas permukaan apa pun. Cara lain (persegi kedua berwarna latar)
         * akan menuntut hex mentah — ditolak penjaga token ESLint (issue #54).
         */}
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M6.5 3.5H17.5A2.5 2.5 0 0 1 20 6V18A2.5 2.5 0 0 1 17.5 20.5H6.5A2.5 2.5 0 0 1 4 18V6A2.5 2.5 0 0 1 6.5 3.5ZM8.6 3.5H10.4V20.5H8.6Z"
        />
      </svg>
    </span>
  );
}
