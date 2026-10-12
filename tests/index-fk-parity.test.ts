/**
 * SETIAP KOLOM FK HARUS PUNYA @@index — DIDEKLARASIKAN, BUKAN DIWARISI
 * (audit skema §S1 — docs/arsitektur/13-AUDIT-SKEMA.md)
 *
 * ══ CACAT YANG DIJAGA TES INI, DAN KENAPA IA BISA MENUMPUK 18 KALI ═════════
 * MySQL/MariaDB MEWAJIBKAN indeks pada kolom `FOREIGN KEY` dan MEMBUATNYA
 * SENDIRI bila tidak dideklarasikan — namanya berakhiran `_fkey`. Jadi sebuah
 * relasi baru yang ditambahkan tanpa `@@index` tetap cepat, tetap lolos review,
 * dan tidak pernah memberi satu pun tanda bahwa ada yang kurang.
 *
 * PostgreSQL tidak membuat apa pun: di sana `FOREIGN KEY` tidak membawa indeks.
 * Diukur 12 Okt 2026 — **18 kolom** sudah menumpuk begitu, yang di 17 buku PT
 * berarti **242 indeks** yang akan lenyap saat pindah mesin. Tanpa galat; yang
 * terlihat hanya kueri yang perlahan melambat.
 *
 * ══ KENAPA TES, BUKAN SKRIP PEMERIKSA ═════════════════════════════════════
 * Skrip harus diingat seseorang. Tes berjalan di CI pada setiap PR, jadi relasi
 * ke-19 akan ditolak pada hari ia ditulis — bukan ditemukan dua tahun kemudian
 * oleh audit berikutnya.
 *
 * Murni pembacaan berkas: nol basis data, jadi ia bisa hidup di CI.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SKEMA = [
  ["perusahaan", "prisma/schema.prisma"],
  ["kendali", "prisma/control/schema.prisma"],
  ["platform", "prisma/platform/schema.prisma"],
] as const;

interface Model {
  nama: string;
  /** Kolom FK: isi `fields: [...]` pada setiap `@relation`. */
  fk: string[][];
  /** Yang sudah terindeks: @@index, @@unique, @@id, dan @unique/@id sebaris. */
  terindeks: string[][];
}

/** `@relation(...)` bisa MULTI-BARIS — dan itu yang membuat sapuan naif salah. */
function bacaModel(isi: string): Model[] {
  const out: Model[] = [];
  const re = /^model (\w+) \{\n([\s\S]*?)^\}/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(isi)) !== null) {
    const nama = m[1]!;
    const body = m[2]!;

    const fk: string[][] = [];
    for (const r of body.matchAll(/@relation\(([\s\S]*?)\)/g)) {
      const f = /fields:\s*\[([^\]]+)\]/.exec(r[1]!);
      if (f) fk.push(f[1]!.split(",").map((x) => x.trim()));
    }

    const terindeks: string[][] = [];
    for (const g of body.matchAll(/@@(?:index|unique|id)\(\[([^\]]+)\]/g)) {
      terindeks.push(g[1]!.split(",").map((x) => x.trim().replace(/\(.*$/, "")));
    }
    for (const line of body.split("\n")) {
      const fm = /^\s*(\w+)\s+\S+(.*)$/.exec(line);
      if (fm && (/@unique\b/.test(fm[2]!) || /@id\b/.test(fm[2]!))) {
        terindeks.push([fm[1]!]);
      }
    }
    out.push({ nama, fk, terindeks });
  }
  return out;
}

/**
 * Sebuah indeks menutupi kolom FK bila kolom itu PREFIKS indeksnya.
 *
 * Prefiks, bukan "ada di dalam": indeks `[a, b]` tidak bisa dipakai untuk kueri
 * yang hanya menyaring `b`. Memperlakukannya sebagai tertutup akan meloloskan
 * persis kelas cacat yang dijaga berkas ini.
 */
function tertutup(kolom: string[], indeks: string[][]): boolean {
  return indeks.some((i) => kolom.every((k, n) => i[n] === k));
}

describe("paritas indeks FK: MySQL memaafkan, PostgreSQL tidak", () => {
  for (const [label, path] of SKEMA) {
    it(`${label}: setiap kolom FK punya @@index yang DIDEKLARASIKAN`, () => {
      const isi = readFileSync(join(process.cwd(), path), "utf8");
      const kurang: string[] = [];
      for (const m of bacaModel(isi)) {
        for (const kolom of m.fk) {
          if (!tertutup(kolom, m.terindeks)) {
            kurang.push(`${m.nama}.[${kolom.join(", ")}]`);
          }
        }
      }
      expect(
        kurang,
        `Relasi tanpa @@index. Di MariaDB ini tetap cepat — indeksnya dibuat ` +
          `diam-diam oleh MySQL — tapi di PostgreSQL indeksnya TIDAK ADA. ` +
          `Tambahkan @@index([...]) di modelnya. Lihat docs/arsitektur/13-AUDIT-SKEMA.md §S1.`
      ).toEqual([]);
    });
  }

  it("pembaca modelnya menangkap @relation MULTI-BARIS", () => {
    /*
     * Penjaga atas tes ini sendiri. Sapuan pertama saat audit memakai
     * `@relation\([^)]*fields:` yang berhenti di baris pertama, dan karenanya
     * melaporkan `fixed_assets.asset_account_id` sebagai "bukan relasi" padahal
     * ia FK. Kalau pembaca di atas kembali ke bentuk itu, seluruh tes di berkas
     * ini akan HIJAU karena tidak melihat apa pun — kegagalan paling berbahaya
     * yang bisa dimiliki sebuah tes.
     */
    const contoh = `model Uji {
  id Int @id
  aId Int
  a A @relation(
    "dinamai",
    fields: [aId],
    references: [id]
  )
  @@map("uji")
}`;
    const [m] = bacaModel(contoh);
    expect(m!.fk, "deklarasi @relation multi-baris tidak terbaca").toEqual([["aId"]]);
  });

  it("indeks komposit hanya menutupi kolom yang menjadi PREFIKSnya", () => {
    expect(tertutup(["a"], [["a", "b"]])).toBe(true);
    expect(tertutup(["b"], [["a", "b"]])).toBe(false);
    expect(tertutup(["a", "b"], [["a", "b"]])).toBe(true);
    expect(tertutup(["a", "b"], [["a"]])).toBe(false);
  });
});
