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
import { cachedBrandMarkContent } from "@sai/platform/brand-assets";
import { platformDb } from "@sai/platform/platform-db";
import { landingImageContent } from "@sai/platform/landing-images";
import { landingMedia } from "@sai/platform/landing-settings";

import { BRAND_MARK_PATH, BRAND_MARK_VIEWBOX } from "@sai/ui/brand/mark";
import { APP_NAME } from "@sai/core/constants";
import {
  OG_BG as LATAR,
  OG_BORDER as TEPI,
  OG_BRAND as MEREK,
  OG_TEXT as TEKS,
  OG_TEXT_SECONDARY as TEKS_SEKUNDER,
} from "@sai/ui/theme/antd-tokens";

export const alt = APP_NAME;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
/* Mengikuti logo produk yang diunggah di konsol (`/brand`): dibangun ulang
   paling lambat 5 menit sesudah logonya berganti. */
export const revalidate = 300;

export default async function Image() {
  /* ══ GAMBAR UNGGAHAN OPERATOR (konsol `/landing/media`, migration 0015) ══
     Metadata berbasis BERKAS menang atas `openGraph.images` di
     `generateMetadata` (dokumen Next), jadi gambar unggahan disajikan DARI
     SINI — untuk `/` dan `/pricing` sekaligus, sebab berkas ini di akar grup.
     Konsol hanya menerima PNG berasio ±1,91:1 (≥600 px lebar), jadi
     `contentType` & `size` di atas tetap jujur tentang berkasnya. Tanpa unggahan / platform tak terjangkau:
     kartu bawaan di bawah, seperti sebelumnya. */
  const og = (await landingMedia()).ogImage;
  if (og) {
    const isi = await landingImageContent({ platform: platformDb }, og.id);
    if (isi) {
      return new Response(Buffer.from(isi.content), {
        headers: {
          "Content-Type": isi.mime,
          "Cache-Control": "public, max-age=300",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }
  }
  const unggahan = await cachedBrandMarkContent({ platform: platformDb });
  const logo = unggahan
    ? `data:${unggahan.meta.mimeType};base64,${Buffer.from(unggahan.content).toString("base64")}`
    : null;
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
            background: logo ? "transparent" : MEREK,
          }}
        >
          {/*
           * LAMBANG SUNGGUHAN, bukan huruf awal produk.
           *
           * Sampai perombakan merek ini, kotak ini memuat "S" — dan itu berarti
           * kartu yang muncul di WhatsApp/LinkedIn adalah satu-satunya
           * permukaan yang memperlihatkan "lambang" yang tidak pernah ada di
           * dalam produk. Alasan lama ("Satori mendukung SVG tetapi bukan
           * komponen React app ini") benar dan sudah tidak mengikat: yang
           * dibutuhkan hanya PATH-nya, dan sejak `lib/brand/mark.ts` ada,
           * path itu bisa dibaca tanpa merender komponennya.
           */}
          {logo ? (
            <img src={logo} width={72} height={72} alt="" style={{ objectFit: "contain" }} />
          ) : (
            <svg width={44} height={44} viewBox={BRAND_MARK_VIEWBOX} fill={LATAR}>
              <path fillRule="evenodd" clipRule="evenodd" d={BRAND_MARK_PATH} />
            </svg>
          )}
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
          Pembukuan beberapa usaha,
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
