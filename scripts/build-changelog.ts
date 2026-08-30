/**
 * Bangkitkan `CHANGELOG.md` dari `src/lib/changelog.ts`.
 *
 * Arahnya SATU: data bertipe → markdown, tidak pernah sebaliknya. Markdown-nya
 * ada untuk pembaca GitHub dan siapa pun yang belum menjalankan aplikasinya;
 * halaman "Apa yang Baru" di dalam aplikasi membaca sumber yang sama. Dua
 * pembaca, satu kebenaran.
 *
 *   bun run changelog:build
 *
 * `tests/changelog.test.ts` menolak berkas yang tidak sama dengan keluaran
 * skrip ini, jadi menyunting markdown-nya langsung akan merah — dengan pesan
 * yang menyebut perintah di atas.
 */
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { RILIS, type ButirRilis } from "../src/lib/changelog";

const JUDUL_JENIS: Record<ButirRilis["jenis"], string> = {
  baru: "Baru",
  ubah: "Berubah",
  perbaikan: "Perbaikan",
};

const URUT: ButirRilis["jenis"][] = ["baru", "ubah", "perbaikan"];

export function bangunChangelog(): string {
  const bagian = RILIS.map((r) => {
    const baris = [`## ${r.versi} — ${r.tanggal} (${r.sha})`, "", r.ringkas, ""];
    for (const jenis of URUT) {
      const butir = r.butir.filter((b) => b.jenis === jenis);
      if (butir.length === 0) continue;
      baris.push(`### ${JUDUL_JENIS[jenis]}`, "");
      for (const b of butir) baris.push(`- ${b.teks}`);
      baris.push("");
    }
    return baris.join("\n").trimEnd();
  });

  return [
    "# Riwayat Perubahan",
    "",
    "<!-- DIBANGKITKAN dari src/lib/changelog.ts — jangan sunting berkas ini.",
    "     Ubah sumbernya, lalu jalankan: bun run changelog:build -->",
    "",
    "Perubahan yang **terlihat oleh pengguna**, per rilis ke produksi.",
    "",
    "Bukan `git log`. Log mencatat setiap commit; berkas ini mencatat apa yang",
    "berubah bagi orang yang memakai aplikasinya — dan sengaja diam soal refactor,",
    "penjaga, serta pekerjaan dalam yang tidak mengubah apa pun di layar.",
    "",
    "Isi yang sama dibaca pengguna di dalam aplikasi lewat halaman **Apa yang",
    "Baru** (`/docs/apa-yang-baru`), yang dijangkau dari nomor versi di kaki menu",
    "samping.",
    "",
    "**Nomor versinya berarti.** `package.json` memegang nomornya,",
    "`next.config.ts` menyuntikkannya saat build, dan `tests/changelog.test.ts`",
    "menolak nomor yang tidak cocok dengan rilis teratas di bawah — jadi rilis",
    "tanpa catatan tidak bisa lolos gerbang.",
    "",
    "---",
    "",
    bagian.join("\n\n---\n\n"),
    "",
    "---",
    "",
    "## Sebelum penomoran — Maret s.d. 30 Agustus 2026",
    "",
    "125 rilis, tidak tercatat satu per satu, dan **tidak akan direkonstruksi**:",
    "pesan gabungnya sebagian besar berbunyi *\"Merge pull request #N\"*, jadi daftar",
    "per-rilis yang ditulis sekarang akan menjadi karangan yang berpenampilan",
    "catatan. Yang bisa dikatakan jujur adalah temanya. Rinciannya ada di",
    "`git log --first-parent main`.",
    "",
    "Versi `0.1.0` menandai seluruh era ini — satu nomor untuk 125 rilis, dan itulah",
    "sebabnya berkas ini ada.",
    "",
    "| Tema | Ditutup di |",
    "|---|---|",
    "| Fondasi akuntansi — jurnal berpasangan, buku besar, periode terkunci, persetujuan | Maret–Juli |",
    "| Penjualan, pembelian, persediaan rata-rata tertimbang, biaya impor | Juli |",
    "| Izin terpusat (matriks + override per peran & pengguna) | Juli |",
    "| Trilingual id/en/zh lewat cookie | Juli |",
    "| Desain berpindah ke Ant Design v6; Tailwind dicabut | Juli |",
    "| Multi-perusahaan — satu basis data per PT | Awal Agustus |",
    "| SaaS: paket, kuota, penagihan, konsol operator | Awal Agustus |",
    "| Halaman promosi & harga publik | 17–18 Agustus |",
    "| Dokumentasi dalam aplikasi (`/docs`) | Agustus |",
    "| Kontrak → pelanggan tertaut; penjaga pihak pada faktur | 27 Agustus |",
    "| Pemasok pada mutasi stok; pilihan akun kas/bank pada pelunasan | 27 Agustus |",
    "| Modul Manufaktur | 30 Agustus |",
    "",
  ].join("\n");
}

/*
 * `import.meta.main`/`.dir` sengaja TIDAK dipakai: keduanya khas Bun dan
 * ditolak `tsc`, sementara berkas ini diimpor tesnya (jadi ia ikut typecheck).
 * Bentuk di bawah berjalan di Bun maupun Node.
 */
const INI = fileURLToPath(import.meta.url);
if (process.argv[1] && INI === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  const tujuan = join(dirname(INI), "..", "CHANGELOG.md");
  writeFileSync(tujuan, bangunChangelog());
  console.log(`CHANGELOG.md dibangkitkan dari ${RILIS.length} rilis.`);
}
