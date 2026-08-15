/**
 * LOG TERSTRUKTUR (issue #374) — satu baris JSON per peristiwa.
 *
 * ══ KENAPA INI ADA ══════════════════════════════════════════════════════════
 * Beberapa jalur di aplikasi ini SENGAJA menelan galatnya, dan setiap
 * alasannya benar:
 *
 *   • `api/auth/register` mengerjakan pengiriman surel di luar respons supaya
 *     lamanya jawaban tidak membocorkan keberadaan akun (#138);
 *   • `writeAuditLog` menelan galatnya supaya jejak yang gagal tidak
 *     membatalkan transaksi yang sah (#370);
 *   • `createInitialSubscription` menelan galatnya supaya penagihan yang mati
 *     tidak mematikan pendaftaran (#152).
 *
 * Ketiganya keputusan yang tepat. Dan ketiganya MENUNTUT ada tempat galatnya
 * mendarat — tanpa itu, "ditelan ke log" berarti "hilang". Surel verifikasi
 * yang gagal terkirim tidak terlihat oleh siapa pun sampai ada yang mengeluh
 * tidak bisa masuk, dan orang yang tidak bisa masuk biasanya tidak mengeluh:
 * ia pergi.
 *
 * ══ KENAPA JSON, BUKAN KALIMAT ══════════════════════════════════════════════
 * Keputusan pemilik: log terstruktur + peringatan surel, bukan vendor
 * pelacak galat — kotak ini tidak punya ruang untuk satu layanan lagi.
 * Konsekuensinya harus ditanggung dengan jujur: TANPA dasbor, tidak ada
 * pengelompokan galat dan tidak ada riwayat. Yang menggantikannya cuma satu
 * hal, dan hanya berguna kalau benar-benar dikerjakan: bentuk yang bisa
 * di-`grep`, di-`jq`, dan diagregasi mesin.
 *
 *     docker compose logs web | grep '"level":"error"' | jq -r .event | sort | uniq -c
 *
 * Kalimat bebas tidak bisa menjawab itu. Satu baris JSON bisa.
 *
 * ══ REDAKSI BUKAN PILIHAN ═══════════════════════════════════════════════════
 * `context` diisi pemanggil, dan pemanggil akan salah suatu saat — meneruskan
 * seluruh badan permintaan, atau objek pengguna beserta hash kata sandinya.
 * Log dikirim ke tempat yang retensinya berbeda dari basis data dan yang
 * dibaca lebih banyak orang, jadi kunci bernuansa rahasia DIBUANG di sini,
 * bukan diserahkan pada kedisiplinan setiap pemanggil.
 *
 * ══ MURNI DI BAGIAN YANG PENTING ════════════════════════════════════════════
 * `formatLogLine` murni dan teruji; hanya `emit` yang menyentuh dunia. Tanpa
 * `server-only`: skrip di luar Next (penjadwal, cadangan, pembuktian) berhak
 * memakai bentuk log yang sama.
 */

export type LogLevel = "info" | "warn" | "error";

/** Nilai yang aman ditulis ke log — bukan `unknown` bebas. */
export type LogValue = string | number | boolean | null | undefined;
export type LogContext = Record<string, LogValue>;

/**
 * Kunci yang isinya TIDAK PERNAH ditulis. Dicocokkan sebagai POTONGAN nama,
 * jadi satu entri menangkap seluruh keluarganya: `password`, `passwordHash`,
 * dan `newPassword` cukup oleh `password`.
 */
const REDACTED_KEYS = [
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "apikey",
  "credential",
  "passphrase",
  "encryptionkey",
  "privatekey",
];

export const REDACTED = "[disunting]";

/**
 * Nama kunci → bentuk banding: huruf kecil, TANPA pemisah apa pun.
 *
 * Penyeragaman ini bukan kerapian. Satu rahasia yang sama ditulis dengan tiga
 * gaya di repo ini — `apiKey`, `api_key`, `BACKUP_ENCRYPTION_KEY` — dan daftar
 * yang mencocokkan apa adanya harus memuat ketiga ejaannya, untuk setiap
 * rahasia, selamanya. Yang terjadi berikutnya sudah pasti: ejaan keempat lahir,
 * tidak ada di daftar, dan rahasianya tertulis ke log. Membuang pemisahnya
 * lebih dulu membuat satu entri menangkap semua ejaannya.
 */
function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isSensitive(key: string): boolean {
  const normalized = normalizeKey(key);
  return REDACTED_KEYS.some((needle) => normalized.includes(needle));
}

/** Galat apa pun → bentuk yang bisa dibaca mesin, tanpa kehilangan jejaknya. */
function describeError(error: unknown): Record<string, LogValue> {
  if (error instanceof Error) {
    return {
      errorName: error.name,
      errorMessage: error.message,
      /* Jejak tumpukan dipangkas: yang menjawab "di mana" hampir selalu ada di
         beberapa bingkai teratas, sementara jejak penuh membuat satu baris log
         mendorong seluruh baris lain keluar dari layar orang yang membacanya. */
      errorStack: error.stack?.split("\n").slice(0, 6).join(" | "),
    };
  }
  return { errorMessage: String(error) };
}

export interface LogLine {
  ts: string;
  level: LogLevel;
  /** Nama peristiwa yang STABIL — inilah yang di-`uniq -c` orang. */
  event: string;
  message?: string;
  [key: string]: LogValue;
}

/**
 * Susun satu baris log. MURNI — tanggal disuntikkan supaya bisa diuji.
 *
 * Kunci yang bertabrakan dengan bidang bakunya (`ts`, `level`, `event`) tidak
 * bisa ditimpa dari `context`: sebuah peristiwa yang bisa menulis ulang
 * levelnya sendiri membuat penyaringan `grep '"level":"error"'` berbohong.
 */
export function formatLogLine(
  level: LogLevel,
  event: string,
  context: LogContext = {},
  error?: unknown,
  now: Date = new Date()
): LogLine {
  const line: LogLine = { ts: now.toISOString(), level, event };

  for (const [key, value] of Object.entries(context)) {
    if (key === "ts" || key === "level" || key === "event") continue;
    line[key] = isSensitive(key) ? REDACTED : value;
  }

  if (error !== undefined) {
    for (const [key, value] of Object.entries(describeError(error))) {
      line[key] = value;
    }
  }

  return line;
}

function emit(line: LogLine): void {
  const serialized = JSON.stringify(line);
  if (line.level === "error") console.error(serialized);
  else if (line.level === "warn") console.warn(serialized);
  else console.log(serialized);
}

export function logInfo(event: string, context?: LogContext): void {
  emit(formatLogLine("info", event, context));
}

export function logWarn(event: string, context?: LogContext, error?: unknown): void {
  emit(formatLogLine("warn", event, context, error));
}

export function logError(event: string, error: unknown, context?: LogContext): void {
  emit(formatLogLine("error", event, context, error));
}
