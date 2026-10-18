/**
 * BANGKITKAN IKON RASTER DARI LAMBANG — `bun run brand:icons`.
 *
 * ══ KENAPA SKRIP, BUKAN PNG YANG DIKOMIT SEKALI ════════════════════════════
 * Karena PNG yang dikomit sekali adalah PNG yang tidak akan pernah digambar
 * ulang. Terukur di repo ini: ikon `public/icons/*`, `apple-icon.png`, dan
 * `favicon.ico` lahir pada #471 sebagai **diagram batang biru**, lalu merek
 * produk berpindah ke buku besar navy — dan tak satu pun dari kelima berkas itu
 * ikut berubah. Tidak ada yang gagal, tidak ada tes yang merah, tidak ada
 * halaman yang rusak: ikon tab dan ikon layar depan hanya diam-diam berhenti
 * menjadi lambang produk ini.
 *
 * Sejak skrip ini ada, kelimanya TURUNAN. Yang diubah `lib/brand/mark.ts`;
 * menjalankan skrip ini membuat sisanya menyusul.
 *
 * ══ YANG DIBANGKITKAN ══════════════════════════════════════════════════════
 *   (`/favicon.ico` dan `/apple-icon.png` kini RUTE dinamis di kedua aplikasi
 *   — `@sai/platform/brand-routes` — supaya mengikuti logo yang diunggah di
 *   konsol; tanpa unggahan keduanya menggambar lambang yang sama dari kode.)
 *   • `public/icons/apple-touch-icon.png` — 180, untuk `<link>` manual
 *   • `public/icons/icon-192.png`, `icon-512.png`        — manifest, `any`
 *   • `public/icons/icon-maskable-512.png`               — manifest, `maskable`
 *
 * ══ TIGA KEPUTUSAN YANG TIDAK TERLIHAT DARI HASILNYA ═══════════════════════
 *
 *  1. **Warnanya NAVY, bukan biru AntD.** Ikon memikul peran "bidang merek di
 *     belakang glif terang" — peran yang sama dengan tombol primer dan
 *     `BrandMark`, yang keduanya `#1E3A5F`. Ikon biru di layar depan sementara
 *     setiap lambang di dalam aplikasi navy adalah dua merek pada satu produk.
 *
 *  2. **`maskable` memakai glif yang jauh lebih kecil dan sudut SIKU.** Android
 *     memotong ikon mengikuti bentuk peluncurnya dan hanya menjamin lingkaran
 *     80% di tengah tetap terlihat; sudut yang sudah dibulatkan di sini akan
 *     dibulatkan DUA KALI, menyisakan tepi putih yang terbaca seperti ikon yang
 *     salah ukuran.
 *
 *  3. **ICO ditulis tangan, dan itu lebih sederhana daripada kedengarannya.**
 *     `sharp` tidak menulis `.ico`, dan satu dependensi baru untuk 22 byte
 *     kepala bukan tukaran yang layak: ICO modern adalah daftar berkas PNG
 *     beserta offsetnya, dan setiap peramban yang masih relevan membacanya.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

import { brandMarkSvg } from "@sai/ui/brand/mark";
import { BRAND_SOLID_LIGHT } from "@sai/ui/theme/antd-tokens";

/* `fileURLToPath(import.meta.url)`, bukan `import.meta.dirname`: `tsx`
   menjalankan skrip ini sebagai CJS dan yang kedua lahir `undefined` di sana —
   pola yang sama dengan `scripts/build-changelog.ts`. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Isian merek — nilai yang SAMA dengan tombol primer & `BrandMark` terang. */
const LATAR = BRAND_SOLID_LIGHT;
/** Glif di atasnya. Putih, bukan `colorTextLightSolid`: PNG tidak punya token. */
const GLIF = "#ffffff";

async function png(size: number, glyphRatio: number, radiusRatio: number): Promise<Buffer> {
  const svg = brandMarkSvg({
    size,
    background: LATAR,
    foreground: GLIF,
    glyphRatio,
    radiusRatio,
  });
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
}

async function tulis(relatif: string, data: Buffer): Promise<void> {
  const tujuan = join(ROOT, relatif);
  await mkdir(dirname(tujuan), { recursive: true });
  await writeFile(tujuan, data);
  console.log(`  ✓ ${relatif} (${(data.length / 1024).toFixed(1)} KB)`);
}

async function main(): Promise<void> {
  console.log(`Lambang → ikon. Isian ${LATAR}, glif ${GLIF}.`);

  /* Ikon berdiri sendiri: glif 0,62 — tanpa tetangga untuk diseimbangkan. */
  const [i180, i192, i512] = await Promise.all([180, 192, 512].map((s) => png(s, 0.62, 0.22)));

  await tulis("public/icons/apple-touch-icon.png", i180);
  await tulis("public/icons/icon-192.png", i192);
  await tulis("public/icons/icon-512.png", i512);

  /* Maskable: sudut SIKU + glif 0,44 supaya seluruh lambang berada di dalam
     lingkaran aman 80% berapa pun bentuk yang dipakai peluncurnya. */
  await tulis("public/icons/icon-maskable-512.png", await png(512, 0.44, 0));

  console.log("Selesai. Komit hasilnya — ia turunan, tapi dilayani sebagai berkas statis.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
