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
 * GEOMETRINYA TIDAK LAGI TINGGAL DI SINI. Ia pindah ke `lib/brand/mark.ts`,
 * dan kepindahan itu memperbaiki cacat yang lebih besar daripada gambarnya:
 * sampai saat itu produk ini punya TIGA lambang — buku besar di dalam aplikasi,
 * diagram batang di ikon tab/layar depan (warna merek LAMA), dan huruf "S" di
 * kartu pratinjau WhatsApp. Alasan lengkap, beserta rancangan yang dicoba dan
 * ditolak, ada di kepala berkas itu.
 *
 * Yang tersisa di sini: KOTAKNYA — ukuran, radius, dan pasangan warnanya.
 */

import { BRAND_MARK_PATH, BRAND_MARK_VIEWBOX } from "@/lib/brand/mark";

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
        /* ⚠ `--ant-color-brand-solid`, BUKAN `--ant-color-primary`. Sejak
           merek menjadi navy, `colorPrimary` di tema GELAP sengaja TERANG
           (perannya teks), dan glif putih di atasnya terukur 2,98:1 — lambang
           yang lenyap di tema gelap. Token ini isian merek yang memang memikul
           teks terang: 11,50:1 terang · 5,06:1 gelap. */
        background: "var(--ant-color-brand-solid)",
        color: "var(--ant-color-text-light-solid)",
      }}
      aria-hidden="true"
    >
      <svg
        viewBox={BRAND_MARK_VIEWBOX}
        fill="currentColor"
        width={GLYPH[size]}
        height={GLYPH[size]}
      >
        {/* Path-nya DIIMPOR — lihat kepala berkas. Menyalinnya kembali ke sini
            mengembalikan keadaan "satu produk, tiga lambang". */}
        <path fillRule="evenodd" clipRule="evenodd" d={BRAND_MARK_PATH} />
      </svg>
    </span>
  );
}
