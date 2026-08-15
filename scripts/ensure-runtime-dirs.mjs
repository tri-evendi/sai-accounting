import { mkdir } from "fs/promises";
import path from "path";

/*
 * `data/documents` menggantikan `public/uploads` sejak issue #367 — berkas
 * dokumen keluar dari `public/` supaya ia tidak lagi bisa disajikan sebagai
 * berkas statis tanpa melewati penjaga. `public/uploads` TETAP dibuat: baris
 * yang belum dipindahkan `bun run migrate:documents` masih menunjuk ke sana,
 * dan direktori yang tidak ada membuat pembacaannya gagal dengan galat yang
 * membingungkan alih-alih 404 yang jujur.
 */
const dirs = [
  path.join(process.cwd(), "data", "audit"),
  path.join(process.cwd(), "data", "documents"),
  path.join(process.cwd(), "public", "uploads"),
];

for (const dir of dirs) {
  await mkdir(dir, { recursive: true });
}
