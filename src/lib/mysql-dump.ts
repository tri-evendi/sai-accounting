/**
 * Pembaca baris `INSERT INTO` dari dump MySQL/MariaDB (`mysqldump`) — MURNI.
 *
 * Ada untuk satu pemakai: perbaikan data warisan (`scripts/fix-legacy-contracts.ts`)
 * yang harus membaca nilai ASLI aplikasi lama dari dump-nya, bukan menebak dari
 * hasil impor. Basis data lamanya sudah tidak ada (MariaDB dicabut #636), jadi
 * dump itulah satu-satunya sumber, dan ia dibaca sebagai TEKS — tanpa memasang
 * server MySQL hanya untuk satu kali baca.
 *
 * Yang dipahami cukup untuk keluaran `mysqldump`/phpMyAdmin:
 *   • `INSERT INTO \`tabel\` (\`k1\`, \`k2\`) VALUES (…),(…);` — boleh berulang;
 *   • string berkutip tunggal dengan escape `\'`, `\\`, `\n`, `\r`, `\t`, `\0`,
 *     dan kutip ganda `''`;
 *   • `NULL` → `null`; angka telanjang → teks apa adanya.
 *
 * Nilai SELALU dipulangkan sebagai teks (atau `null`). Menafsirkan angka adalah
 * urusan pemanggil — kolom warisan menyimpan angka sebagai `varchar` dengan
 * spasi di ujungnya (`'14109.00 '`), dan menebaknya di sini berarti menyembunyikan
 * keputusan itu dari orang yang membaca perbaikannya.
 *
 * Nama tabel dicocokkan PERSIS di antara backtick: `tb_trans_contract` tidak
 * ikut membaca `tb_trans_contract_0103` atau `tb_trans_contract_tes`, dua salinan
 * cadangan yang ada di dump yang sama dan isinya berbeda.
 */

export type DumpRow = Record<string, string | null>;

/** Galat penguraian — selalu menyebut tabel dan posisinya. */
export class DumpParseError extends Error {
  constructor(table: string, offset: number, detail: string) {
    super(`Dump tidak bisa diurai (tabel \`${table}\`, posisi ${offset}): ${detail}`);
    this.name = "DumpParseError";
  }
}

function isSpace(ch: string): boolean {
  return ch === " " || ch === "\n" || ch === "\r" || ch === "\t";
}

const ESCAPES: Record<string, string> = {
  "0": "\0",
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  Z: "\x1a",
};

/**
 * Seluruh baris sebuah tabel, dalam urutan kemunculannya di dump.
 * Tabel yang tidak ada → larik kosong (pemanggil yang memutuskan apakah itu galat).
 */
export function parseInsertRows(sql: string, table: string): DumpRow[] {
  const rows: DumpRow[] = [];
  const head = `INSERT INTO \`${table}\``;
  let from = 0;

  for (;;) {
    const start = sql.indexOf(head, from);
    if (start < 0) break;
    let i = start + head.length;

    // Daftar kolom `(\`a\`, \`b\`)` — wajib ada; dump tanpa daftar kolom
    // memaksa kita menebak urutan kolom, dan itu tidak dilakukan.
    while (isSpace(sql[i])) i++;
    if (sql[i] !== "(") throw new DumpParseError(table, i, "daftar kolom tidak ditemukan");
    const close = sql.indexOf(")", i);
    const columns = sql
      .slice(i + 1, close)
      .split(",")
      .map((c) => c.trim().replace(/^`|`$/g, ""));
    i = close + 1;
    while (isSpace(sql[i])) i++;
    if (sql.slice(i, i + 6).toUpperCase() !== "VALUES") {
      throw new DumpParseError(table, i, "kata VALUES tidak ditemukan");
    }
    i += 6;

    // Tuple demi tuple sampai `;`.
    for (;;) {
      while (isSpace(sql[i])) i++;
      if (sql[i] !== "(") throw new DumpParseError(table, i, "tuple tidak diawali '('");
      i++;
      const values: (string | null)[] = [];
      for (;;) {
        while (isSpace(sql[i])) i++;
        if (sql[i] === "'") {
          i++;
          let s = "";
          for (;;) {
            if (i >= sql.length) throw new DumpParseError(table, i, "string tidak ditutup");
            const ch = sql[i];
            if (ch === "\\") {
              const nx = sql[i + 1];
              s += ESCAPES[nx] ?? nx;
              i += 2;
            } else if (ch === "'") {
              if (sql[i + 1] === "'") {
                s += "'";
                i += 2;
              } else {
                i++;
                break;
              }
            } else {
              s += ch;
              i++;
            }
          }
          values.push(s);
        } else {
          let j = i;
          while (j < sql.length && sql[j] !== "," && sql[j] !== ")") j++;
          const raw = sql.slice(i, j).trim();
          values.push(raw.toUpperCase() === "NULL" ? null : raw);
          i = j;
        }
        while (isSpace(sql[i])) i++;
        if (sql[i] === ",") {
          i++;
          continue;
        }
        if (sql[i] === ")") {
          i++;
          break;
        }
        throw new DumpParseError(table, i, `pemisah tak terduga ${JSON.stringify(sql[i])}`);
      }
      if (values.length !== columns.length) {
        throw new DumpParseError(
          table,
          i,
          `tuple berisi ${values.length} nilai untuk ${columns.length} kolom`
        );
      }
      const row: DumpRow = {};
      columns.forEach((c, k) => (row[c] = values[k]));
      rows.push(row);

      while (isSpace(sql[i])) i++;
      if (sql[i] === ",") {
        i++;
        continue;
      }
      if (sql[i] === ";") {
        i++;
        break;
      }
      throw new DumpParseError(table, i, `akhir tuple tak terduga ${JSON.stringify(sql[i])}`);
    }
    from = i;
  }
  return rows;
}
