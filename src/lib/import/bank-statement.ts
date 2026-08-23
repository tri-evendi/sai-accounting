/**
 * Rekening koran → baris mutasi (issue #468).
 *
 * ══ MASALAH YANG DIBERESKANNYA ══════════════════════════════════════════════
 * Impor rekening koran sudah ada sejak #24, dan validasinya sudah benar
 * (semua-atau-tidak-sama-sekali, galat bernomor baris, menolak laporan
 * terkunci). Yang salah adalah BERKAS yang ia terima:
 *
 *     date,description,amount        ← judul Inggris, harus persis
 *
 * Tidak ada bank di Indonesia yang mengekspor dengan judul itu. BCA
 * mengeluarkan `Tanggal, Keterangan, Cabang, Jumlah, DB/CR, Saldo` — judul
 * Indonesia, penanda arah di kolom TERPISAH, angka bergrup ribuan, dan dua
 * kolom yang tidak kita butuhkan sama sekali.
 *
 * Akibatnya orang harus membuka rekening korannya di Excel, mengganti judul,
 * mengubah DB/CR jadi tanda minus, membuang pemisah ribuan, lalu membuang
 * kolom saldo — sebelum boleh mengimpor. Itu bukan impor; itu pekerjaan rumah
 * yang lebih sulit daripada mengetik ulang, dan ia menjelaskan kenapa fitur ini
 * ada tapi tidak dipakai.
 *
 * ══ PENYAKIT YANG SAMA SUDAH PERNAH DIOBATI ═════════════════════════════════
 * `import/spec.ts` lahir persis untuk ini pada impor data master: pemetaan
 * menurut JUDUL dengan alias, penolakan sebelum satu baris pun dibaca bila
 * kolom wajib hilang, kolom asing diabaikan. Komentarnya bahkan menyebut
 * akibat terburuknya — bukan penolakan melainkan IMPOR YANG BERHASIL DENGAN
 * NILAI TERTUKAR. Rekening koran adalah kasus paling ekstrem dari kelas itu,
 * karena berkasnya SELALU datang dari aplikasi lain.
 *
 * ══ DUA AMBIGUITAS YANG DIPUTUSKAN DARI BERKASNYA, BUKAN DITEBAK PER SEL ════
 * Sebuah sel tidak selalu cukup untuk memutuskan maknanya, tapi berkasnya
 * hampir selalu cukup. Keduanya karena itu diputuskan sekali untuk seluruh
 * berkas, dari bukti yang dikumpulkan dari semua barisnya:
 *
 *   • **Urutan tanggal.** `31/12/2026` menentukan sendiri (31 bukan bulan);
 *     `05/08/2026` tidak. Satu baris yang menentukan menjelaskan seluruh
 *     berkas. Bila berkasnya BERTENTANGAN — sebagian menuntut HH/BB, sebagian
 *     BB/HH — ia DITOLAK, sebab itu berkas rusak dan menebaknya berarti separuh
 *     mutasi mendarat di bulan yang salah.
 *   • **Pemisah desimal.** `1.500.000` vs `1,500.00` vs `1.500,00`. Bukti
 *     terkuat: sel yang memuat KEDUA tanda — yang terakhir pasti desimal.
 *
 * Salah membaca keduanya tidak pernah menerbitkan galat. Yang terjadi adalah
 * rekonsiliasi yang "cocok" untuk tanggal atau arah yang keliru.
 *
 * ══ MURNI ══════════════════════════════════════════════════════════════════
 * Tanpa Prisma, tanpa I/O, tanpa kamus. Galatnya dipulangkan sebagai KUNCI +
 * parameter, bukan kalimat jadi, jadi modul ini bisa dipakai DUA sisi: layar
 * pratinjau (client, menerjemahkan dengan `useT`) dan route impor (server,
 * `getRequestI18n`) — dan keduanya membaca berkas yang sama dengan aturan yang
 * sama. Pratinjau yang memakai parser berbeda dari yang menulis adalah
 * pratinjau yang berbohong.
 */

import { readImportRows } from "@/lib/import/rows";
import { mapHeaderRow, type ColumnSpec } from "@/lib/import/spec";

/** Satu baris mutasi yang sudah tervalidasi. */
export interface ParsedStatementLine {
  /** ISO `YYYY-MM-DD`. */
  date: string;
  description: string;
  /** Bertanda: positif = masuk ke rekening, negatif = keluar. */
  amount: number;
}

/** Masalah, sebagai KUNCI kamus + parameternya. */
export interface StatementIssue {
  /** Nomor baris seperti di berkas; tanpa nomor = masalah BERKAS, bukan baris. */
  row?: number;
  key: string;
  params?: Record<string, string | number>;
}

/** Bagaimana tanggal berkas ini akhirnya dibaca. */
export type DateOrder = "iso" | "dmy" | "mdy" | "assumed_dmy";

export type StatementParseResult =
  | {
      ok: true;
      rows: ParsedStatementLine[];
      /**
       * `assumed_dmy` = berkasnya tidak memuat satu tanggal pun yang bisa
       * menentukan urutannya sendiri, dan HH/BB dipakai sebagai konvensi
       * Indonesia. Pemanggil WAJIB mengatakannya di layar: itu satu-satunya
       * asumsi di seluruh modul ini yang tidak bisa dibuktikan dari berkasnya.
       */
      dateOrder: DateOrder;
    }
  | { ok: false; issues: StatementIssue[] };

/**
 * Kolom yang dikenali.
 *
 * Aliasnya dicocokkan lewat `normalizeHeader` (huruf kecil, tanpa spasi &
 * tanda baca), jadi "DB/CR", "db cr", dan "DBCR" cukup satu entri. Kolom yang
 * TIDAK ada di daftar ini diabaikan — `Cabang` dan `Saldo` milik BCA tidak
 * boleh membatalkan berkas yang isinya sudah benar.
 */
export const STATEMENT_COLUMNS: readonly ColumnSpec[] = [
  {
    key: "date",
    header: "Tanggal",
    aliases: [
      "date",
      "tgl",
      "tanggal transaksi",
      "trans date",
      "transaction date",
      "posting date",
      "tanggal posting",
      "value date",
    ],
    required: true,
    example: "31/12/2026",
  },
  {
    key: "description",
    header: "Keterangan",
    aliases: [
      "description",
      "uraian",
      "berita",
      "narasi",
      "memo",
      "remark",
      "remarks",
      "keterangan transaksi",
      "transaction description",
      "transaction remarks",
    ],
    required: true,
    example: "Setoran tunai",
  },
  {
    key: "amount",
    header: "Jumlah",
    aliases: ["amount", "mutasi", "nominal", "nilai", "transaction amount", "jumlah transaksi"],
    example: "1.500.000,00",
  },
  {
    key: "debit",
    header: "Debet",
    aliases: ["debit", "keluar", "pengeluaran", "withdrawal", "debit amount", "debet (idr)"],
  },
  {
    key: "credit",
    header: "Kredit",
    aliases: ["credit", "masuk", "pemasukan", "deposit", "credit amount", "kredit (idr)"],
  },
  {
    key: "direction",
    header: "DB/CR",
    aliases: ["cr/db", "d/c", "tipe", "jenis", "type", "jenis mutasi", "arah"],
  },
] as const;

/**
 * Kunci kamus tiap masalah, DITULIS UTUH.
 *
 * Merakitnya dari sebuah prefiks lebih pendek, dan justru itu masalahnya:
 * kunci yang dirakit tidak terlihat penjaga kunci yatim
 * (`tests/i18n-orphan-keys.test.ts`), sehingga kedua belas kalimat ini akan
 * terbaca sebagai kamus mati dan ikut tercabut pada pembersihan berikutnya —
 * meninggalkan layar impor yang menolak berkas tanpa mengatakan kenapa.
 */
export const STATEMENT_ISSUE = {
  emptyFile: "statementImport.issue.emptyFile",
  noRows: "statementImport.issue.noRows",
  missingColumns: "statementImport.issue.missingColumns",
  missingAmountColumns: "statementImport.issue.missingAmountColumns",
  dateConflict: "statementImport.issue.dateConflict",
  badDate: "statementImport.issue.badDate",
  emptyDescription: "statementImport.issue.emptyDescription",
  longDescription: "statementImport.issue.longDescription",
  emptyAmount: "statementImport.issue.emptyAmount",
  badAmount: "statementImport.issue.badAmount",
  badDirection: "statementImport.issue.badDirection",
  badDebitCredit: "statementImport.issue.badDebitCredit",
} as const;

/* ── Pemisah baris/sel ──────────────────────────────────────────────────────── */

/**
 * Pecah satu baris CSV menjadi sel, menghormati kutip ganda.
 *
 * Pemisahnya boleh koma ATAU titik koma: ekspor Excel berbahasa Indonesia
 * memakai `;` karena `,` sudah dipakai sebagai pemisah desimal. Berkas yang
 * dipecah dengan pemisah yang salah menghasilkan SATU kolom raksasa, dan
 * pesannya akan berbunyi "kolom Tanggal tidak ditemukan" — menuduh judulnya,
 * padahal yang salah pemisahnya.
 */
function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out.map((f) => f.trim());
}

/** Pemisah sel: yang paling sering muncul di baris JUDUL menang. */
function detectDelimiter(headerLine: string): string {
  const semicolons = (headerLine.match(/;/g) ?? []).length;
  const commas = (headerLine.match(/,/g) ?? []).length;
  const tabs = (headerLine.match(/\t/g) ?? []).length;
  if (tabs > semicolons && tabs > commas) return "\t";
  return semicolons > commas ? ";" : ",";
}

/* ── Tanggal ────────────────────────────────────────────────────────────────── */

interface DateParts {
  a: number;
  b: number;
  year: number;
}

/** Pisahkan tanggal jadi tiga angka; `null` = bentuknya tidak dikenali. */
function splitDate(raw: string): { iso: true; value: string } | { iso: false; parts: DateParts } | null {
  const s = raw.trim();
  if (!s) return null;

  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const value = buildIso(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3]));
    return value ? { iso: true, value } : null;
  }

  /* `31/12/2026`, `31-12-2026`, `31.12.2026` — ketiganya dipakai bank yang
     berbeda, dan ketiganya membawa ambiguitas yang sama. */
  const parts = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (!parts) return null;
  return { iso: false, parts: { a: Number(parts[1]), b: Number(parts[2]), year: Number(parts[3]) } };
}

/** ISO dari tiga angka, atau `null` bila tanggalnya mustahil (31 Feb dsb.). */
function buildIso(year: number, month: number, day: number): string | null {
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (
    dt.getUTCFullYear() !== year ||
    dt.getUTCMonth() !== month - 1 ||
    dt.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Urutan tanggal berkas ini, dari bukti seluruh barisnya.
 *
 * `conflict` berarti berkasnya menuntut dua urutan sekaligus — itu berkas
 * rusak, bukan berkas ambigu, dan menebaknya berarti separuh mutasinya mendarat
 * di bulan yang salah.
 */
function detectDateOrder(values: readonly string[]): "dmy" | "mdy" | "ambiguous" | "conflict" {
  let dmy = false;
  let mdy = false;
  for (const raw of values) {
    const parsed = splitDate(raw);
    if (!parsed || parsed.iso) continue;
    if (parsed.parts.a > 12) dmy = true;
    if (parsed.parts.b > 12) mdy = true;
  }
  if (dmy && mdy) return "conflict";
  if (dmy) return "dmy";
  if (mdy) return "mdy";
  return "ambiguous";
}

/* ── Nominal ────────────────────────────────────────────────────────────────── */

type DecimalSeparator = "," | ".";

/**
 * Pemisah desimal berkas ini, dari bukti seluruh selnya.
 *
 * Urutan buktinya dari yang paling kuat:
 *   1. sel yang memuat KEDUA tanda — yang muncul TERAKHIR pasti desimal
 *      (`1.500.000,50` → koma; `1,500,000.50` → titik);
 *   2. sel dengan satu tanda diikuti TIGA digit dan tanda itu muncul lebih dari
 *      sekali → ia pemisah ribuan, jadi desimalnya yang satunya;
 *   3. sel dengan satu tanda diikuti SATU atau DUA digit → ia desimal.
 *
 * Tanpa satu pun bukti: tidak ada desimal di berkas ini, dan tiap tanda
 * diperlakukan sebagai pemisah ribuan. Itu jawaban yang benar untuk rupiah,
 * yang memang tak berpecahan — `1,500` menjadi 1500, bukan 1,5.
 */
function detectDecimalSeparator(values: readonly string[]): DecimalSeparator | null {
  for (const raw of values) {
    const s = raw.replace(/[^\d.,]/g, "");
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastDot !== -1 && lastComma !== -1) return lastDot > lastComma ? "." : ",";
  }

  for (const raw of values) {
    const s = raw.replace(/[^\d.,]/g, "");
    for (const sep of [",", "."] as const) {
      const count = s.split(sep).length - 1;
      const tail = s.slice(s.lastIndexOf(sep) + 1);
      if (count > 1 && tail.length === 3) return sep === "," ? "." : ",";
    }
  }

  for (const raw of values) {
    const s = raw.replace(/[^\d.,]/g, "");
    for (const sep of [",", "."] as const) {
      const count = s.split(sep).length - 1;
      const tail = s.slice(s.lastIndexOf(sep) + 1);
      if (count === 1 && (tail.length === 1 || tail.length === 2)) return sep;
    }
  }

  return null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Angka dari sebuah sel, memakai pemisah desimal yang sudah diputuskan.
 *
 * Sel KOSONG memulangkan 0 — pada rekening koran berkolom debet/kredit, sisi
 * yang tidak terpakai memang dibiarkan kosong, dan itu berarti nol, bukan
 * galat. Tanda kurung (`(1.500)`) dibaca sebagai negatif: konvensi akuntansi
 * yang dipakai beberapa ekspor.
 */
function parseAmount(raw: string, decimal: DecimalSeparator | null): number | null {
  let s = raw.trim();
  if (s === "") return 0;

  let sign = 1;
  if (/^\(.*\)$/.test(s)) {
    sign = -1;
    s = s.slice(1, -1).trim();
  }
  if (s.startsWith("-")) {
    sign *= -1;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }

  /* Simbol mata uang & spasi dibuang; huruf TIDAK — "1.500 DB" ditangani di
     pemanggil (penanda arah), dan sisa huruf lain berarti selnya bukan angka. */
  s = s.replace(/(?:rp|idr)\s*/gi, "").replace(/\s/g, "");
  if (s === "") return null;
  if (!/^[\d.,]+$/.test(s)) return null;

  const grouping = decimal === "," ? "." : ",";
  const withoutGrouping = s.split(grouping).join("");
  const normalized = decimal ? withoutGrouping.replace(decimal, ".") : withoutGrouping.replace(/[.,]/g, "");

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? round2(sign * n) : null;
}

/* ── Arah (DB/CR) ───────────────────────────────────────────────────────────── */

const DEBIT_TOKENS = new Set(["db", "d", "dr", "debit", "debet", "keluar", "k?"]);
const CREDIT_TOKENS = new Set(["cr", "c", "k", "credit", "kredit", "masuk"]);

/**
 * `-1` (keluar), `+1` (masuk), atau `null` bila penandanya tak dikenali.
 *
 * ⚠ `k` berarti KREDIT dalam bahasa Indonesia (masuk) — bukan "keluar".
 * Menebaknya terbalik menghasilkan rekonsiliasi yang cocok untuk arah yang
 * keliru, dan itu tidak pernah menerbitkan galat apa pun.
 */
function directionSign(raw: string): number | null {
  const token = raw.trim().toLowerCase().replace(/[^a-z]/g, "");
  if (!token) return null;
  if (CREDIT_TOKENS.has(token)) return 1;
  if (DEBIT_TOKENS.has(token)) return -1;
  return null;
}

/** Penanda arah yang menempel di sel nominal ("1.500.000,00 DB"). */
function splitTrailingDirection(raw: string): { value: string; sign: number | null } {
  const match = raw.trim().match(/^(.*?)[\s]*([A-Za-z]{1,6})$/);
  if (!match) return { value: raw, sign: null };
  const sign = directionSign(match[2]);
  return sign === null ? { value: raw, sign: null } : { value: match[1], sign };
}

/* ── Parser ─────────────────────────────────────────────────────────────────── */

const MAX_DESCRIPTION = 255;

export function parseStatementCsv(text: string): StatementParseResult {
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (rawLines.length === 0) return { ok: false, issues: [{ key: STATEMENT_ISSUE.emptyFile }] };

  const delimiter = detectDelimiter(rawLines[0]);
  const sheet = rawLines.map((line) => splitCsvLine(line, delimiter));

  /* Ketersediaan kolom dibaca dari JUDULNYA, bukan dari isinya. `readImportRows`
     mengisi kunci yang tak terpetakan dengan "" di setiap baris, jadi kolom
     yang TIDAK ADA terlihat sama persis dengan kolom yang ada tapi kosong —
     dan keduanya menuntut perlakuan berbeda: yang pertama berarti berkasnya
     memakai cara lain untuk menyatakan tanda, yang kedua berarti barisnya
     memang nol. */
  const { index, missing } = mapHeaderRow(sheet[0], STATEMENT_COLUMNS);
  if (missing.length > 0) {
    return {
      ok: false,
      issues: [{ key: STATEMENT_ISSUE.missingColumns, params: { columns: missing.join(", ") } }],
    };
  }

  const { rows: mapped } = readImportRows(sheet, STATEMENT_COLUMNS);
  if (mapped.length === 0) return { ok: false, issues: [{ key: STATEMENT_ISSUE.noRows }] };

  const hasAmount = index.amount !== undefined;
  const hasDebit = index.debit !== undefined;
  const hasCredit = index.credit !== undefined;
  const hasDirection = index.direction !== undefined;

  if (!hasAmount && !(hasDebit && hasCredit)) {
    return { ok: false, issues: [{ key: STATEMENT_ISSUE.missingAmountColumns }] };
  }

  /* Kedua ambiguitas diputuskan SEKALI, dari seluruh berkas. */
  const dateOrder = detectDateOrder(mapped.map((r) => r.values.date));
  if (dateOrder === "conflict") {
    return { ok: false, issues: [{ key: STATEMENT_ISSUE.dateConflict }] };
  }

  const amountCells = mapped.flatMap((r) =>
    [r.values.amount, r.values.debit, r.values.credit].filter((v) => v !== "")
  );
  const decimal = detectDecimalSeparator(amountCells);

  const issues: StatementIssue[] = [];
  const rows: ParsedStatementLine[] = [];

  for (const entry of mapped) {
    const { row, values } = entry;

    /* ── tanggal ── */
    const parsed = splitDate(values.date);
    let date: string | null = null;
    if (!parsed) {
      issues.push({ key: STATEMENT_ISSUE.badDate, row, params: { value: values.date } });
    } else if (parsed.iso) {
      date = parsed.value;
    } else {
      const { a, b, year } = parsed.parts;
      const [day, month] = dateOrder === "mdy" ? [b, a] : [a, b];
      date = buildIso(year, month, day);
      if (date === null) {
        issues.push({ key: STATEMENT_ISSUE.badDate, row, params: { value: values.date } });
      }
    }

    /* ── keterangan ── */
    const description = values.description;
    if (description === "") {
      issues.push({ key: STATEMENT_ISSUE.emptyDescription, row });
    } else if (description.length > MAX_DESCRIPTION) {
      issues.push({ key: STATEMENT_ISSUE.longDescription, row, params: { max: MAX_DESCRIPTION } });
    }

    /* ── nominal + tandanya ── */
    let amount: number | null = null;
    if (hasAmount) {
      const cell = values.amount;
      if (cell === "") {
        issues.push({ key: STATEMENT_ISSUE.emptyAmount, row });
      } else {
        const trailing = splitTrailingDirection(cell);
        const magnitude = parseAmount(trailing.value, decimal);
        if (magnitude === null) {
          issues.push({ key: STATEMENT_ISSUE.badAmount, row, params: { value: cell } });
        } else if (hasDirection || trailing.sign !== null) {
          const sign = trailing.sign ?? directionSign(values.direction);
          if (sign === null) {
            issues.push({ key: STATEMENT_ISSUE.badDirection, row, params: { value: values.direction } });
          } else {
            /* Nominal berkolom-arah SELALU ditulis positif; tanda minus yang
               ikut tertulis di situ berarti dua sumber tanda yang bisa
               bertentangan, jadi besarannya yang dipakai. */
            amount = round2(sign * Math.abs(magnitude));
          }
        } else {
          amount = magnitude;
        }
      }
    } else {
      const debit = parseAmount(values.debit, decimal);
      const credit = parseAmount(values.credit, decimal);
      if (debit === null || credit === null) {
        issues.push({
          key: STATEMENT_ISSUE.badDebitCredit,
          row,
          params: { value: `${values.debit || "-"} / ${values.credit || "-"}` },
        });
      } else if (debit === 0 && credit === 0) {
        issues.push({ key: STATEMENT_ISSUE.emptyAmount, row });
      } else {
        /* Konvensi rekening koran: kredit = uang MASUK ke rekening. */
        amount = round2(Math.abs(credit) - Math.abs(debit));
      }
    }

    if (date !== null && description !== "" && description.length <= MAX_DESCRIPTION && amount !== null) {
      rows.push({ date, description, amount });
    }
  }

  if (issues.length > 0) return { ok: false, issues };

  return {
    ok: true,
    rows,
    dateOrder:
      dateOrder === "ambiguous"
        ? mapped.every((r) => splitDate(r.values.date)?.iso)
          ? "iso"
          : "assumed_dmy"
        : dateOrder,
  };
}
