/**
 * Gambar pratinjau sosial untuk `/` — apa yang muncul saat alamat produk ini
 * ditempel ke WhatsApp, LinkedIn, atau Slack.
 *
 * ══ KENAPA DIBANGKITKAN, BUKAN BERKAS PNG ══════════════════════════════════
 * PNG di `public/` berarti sebuah gambar yang harus digambar ulang setiap kali
 * nama produk, warna merek, atau kalimat pembukanya berubah — dan yang tidak
 * akan digambar ulang, sebab tidak ada yang gagal kalau ia tertinggal. Yang
 * dibangkitkan di sini memakai `APP_NAME` dan lambang yang SAMA dengan yang
 * dipakai halamannya, jadi ia tidak bisa menyimpang.
 *
 * ⚠ TANPA FONT UNDUHAN, dan itu keputusan yang sama dengan yang tercatat di
 * `app/layout.tsx` untuk aksara Han: `next/font/google` mengunduh saat BUILD,
 * dan build produksi di mesin ini sudah ~10 menit dengan RAM ~1 GB. Satu
 * unduhan gagal = deploy gagal. `ImageResponse` punya font bawaannya sendiri,
 * dan untuk enam kata di sebuah kartu pratinjau itu cukup.
 *
 * ⚠ WARNANYA DARI `lib/theme/antd-tokens.ts` (`OG_*`), bukan hex di berkas ini.
 * `ImageResponse` merender di Satori, BUKAN di peramban: tidak ada dokumen,
 * tidak ada `:root`, jadi `var(--ant-…)` di sini tidak menghasilkan warna merek
 * melainkan warna KOSONG. Itu sebabnya nilainya harfiah — dan justru karena
 * harfiah, ia tinggal di berkas yang memang rumah setiap nilai warna, lengkap
 * dengan rasio kontras terukurnya, persis seperti `SIDER_BG_DARK`.
 */
import { ImageResponse } from "next/og";

import { APP_NAME } from "@/lib/constants";
import {
  OG_BG as LATAR,
  OG_BORDER as TEPI,
  OG_BRAND as MEREK,
  OG_TEXT as TEKS,
  OG_TEXT_SECONDARY as TEKS_SEKUNDER,
} from "@/lib/theme/antd-tokens";

export const alt = APP_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: LATAR,
        padding: 80,
      }}
    >
      {/* Lambang + nama produk. Bentuknya sengaja sederhana: kartu pratinjau
            dipotong berbeda oleh setiap aplikasi perpesanan, jadi apa pun yang
            bergantung pada tepi akan hilang di salah satunya. */}
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div
          style={{
            width: 72,
            height: 72,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 16,
            background: MEREK,
            color: LATAR,
            fontSize: 40,
            fontWeight: 700,
          }}
        >
          {/* Lambang `BrandMark` adalah `<svg>` ber-`currentColor`; Satori
                mendukung SVG tetapi bukan komponen React app ini (ia server
                component ber-`aria-hidden`, bukan elemen murni). Huruf awal
                produk sudah cukup untuk kartu 1200×630. */}
          {APP_NAME.slice(0, 1)}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 40,
            fontWeight: 700,
            color: TEKS,
          }}
        >
          {APP_NAME}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Kalimat ini SENGAJA tidak diambil dari kamus. `ImageResponse`
              tidak punya cookie `locale` — ia dirender untuk perayap, bukan
              untuk pembaca — jadi memanggil `getT()` di sini hanya akan selalu
              menghasilkan bahasa bawaan sambil berpura-pura mengikuti pembaca.
              Yang jujur: satu kalimat, dalam bahasa bawaan produk. */}
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            color: TEKS,
            lineHeight: 1.2,
          }}
        >
          Pembukuan beberapa PT,
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 64,
            fontWeight: 700,
            color: MEREK,
            lineHeight: 1.2,
          }}
        >
          dalam satu akun
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          borderTop: `2px solid ${TEPI}`,
          paddingTop: 32,
          fontSize: 28,
          color: TEKS_SEKUNDER,
        }}
      >
        Buku besar terpisah per perusahaan · Peran &amp; jejak audit · PPN &amp;
        e-Faktur
      </div>
    </div>,
    size,
  );
}
