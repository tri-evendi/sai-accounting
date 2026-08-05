"use client";

/**
 * Indikator muat — di atas Ant Design `Spin` dan `Skeleton` (issue #191).
 *
 * Berkas ini sudah lama komponen client: pesan bawaan `PageLoader` mengikuti
 * bahasa aktif, dan itu butuh konteks kamus. Ia tetap boleh dirender dari
 * server component (mis. `app/(dashboard)/loading.tsx`) — hanya jadi batas
 * client kecil tanpa state.
 *
 * ── Kenapa tabel mendapat KERANGKA, bukan pemutar ──────────────────────────
 * Pemutar berputar mengatakan "tunggu"; kerangka mengatakan "yang sedang
 * dimuat adalah sebuah tabel, kira-kira selebar ini". Bedanya bukan selera:
 * batas muat `(dashboard)` menahan ruang supaya isinya tidak melompat saat
 * tiba (CLS), dan ruang hanya bisa ditahan oleh bentuk yang menyerupai isinya.
 *
 * Pembagiannya karena itu: `Spin` untuk menunggu yang bentuknya BELUM
 * diketahui (sesi, submit, satu tombol), `Skeleton` untuk daftar dan tabel.
 * Kerangka yang bentuknya meleset justru menambah lompatan, bukan menghapusnya
 * — itu sebabnya `TableSkeleton` tetap menerima `rows`/`cols` dari pemanggil,
 * bukan menebak.
 */

import { Skeleton, Spin, theme } from "antd";

import { useT } from "@/lib/i18n/client";

export function Spinner({ className }: { className?: string }) {
  return <Spin size="small" className={className} />;
}

export function PageLoader({ message }: { message?: string }) {
  const t = useT();
  const { token } = theme.useToken();

  return (
    // Berpusat vertikal di ruang yang tersedia (bukan menempel di atas). 60vh
    // aman untuk dua konteksnya: layar penuh saat sesi dimuat, dan di dalam area
    // konten pada form/halaman yang menunggu data — tanpa memicu gulir.
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: token.marginSM,
      }}
    >
      <Spin size="large" />
      {/* Kalimatnya berdiri sendiri, bukan `tip` milik `Spin`: `tip` hanya
          tampil pada pola bersarang/layar penuh, jadi di sini ia akan hilang
          diam-diam beserta satu-satunya keterangan tentang apa yang ditunggu. */}
      <p style={{ color: token.colorTextSecondary }}>{message ?? t("common.loading")}</p>
    </div>
  );
}

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  const { token } = theme.useToken();

  const rowStyle: React.CSSProperties = {
    display: "flex",
    gap: token.margin,
    alignItems: "center",
    paddingInline: token.paddingLG,
    borderBottom: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
  };

  /* `block` + pembungkus `flex: 1` — `Skeleton.Input` punya lebar minimum
     bawaan yang, tanpa ini, membuat kolom kerangka jauh lebih lebar daripada
     kolom tabel yang digantikannya. */
  const bar = (height: number) => (
    <Skeleton.Input active block size="small" style={{ height, minWidth: 0 }} />
  );

  return (
    <div>
      {/* Baris judul kolom — sedikit lebih tinggi dari sel isinya, sama seperti
          tabel sungguhan, supaya kerangkanya terbaca sebagai tabel. */}
      <div style={{ ...rowStyle, paddingBlock: token.paddingSM }}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} style={{ flex: 1 }}>
            {bar(token.controlHeightXS)}
          </div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ ...rowStyle, paddingBlock: token.padding }}>
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} style={{ flex: 1 }}>
              {bar(token.fontSizeSM)}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
