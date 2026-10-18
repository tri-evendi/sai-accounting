/**
 * Pembatas laju DI MEMORI — hanya untuk permukaan yang sudah TERAUTENTIKASI.
 *
 * ══ /login TIDAK LAGI DI SINI (issue #372) ══════════════════════════════════
 * Sampai issue itu, jalur masuk memakai penghitung ini dengan alasan "login
 * permukaan internal". Alasan itu benar sebelum ada `/register`: pintunya hanya
 * untuk orang yang akunnya dibuatkan admin. Sejak pendaftaran mandiri (#138),
 * halaman masuk sama publiknya dengan endpoint lain — dan ketiga kelemahan
 * penghitung memori berlaku penuh baginya: hilang saat restart, tidak terbagi
 * antar-instance, dan (yang khusus miliknya) tanpa pagar per-IP sama sekali.
 * Ia kini memakai `rate-limit-persistent.ts`, dengan DUA kunci.
 *
 * Yang tersisa di sini semuanya menuntut sesi yang sah lebih dulu, jadi
 * penyerangnya bukan orang asing di internet melainkan sesi yang dibajak —
 * permukaan yang jauh lebih sempit, dan penghitung memori memadai untuknya.
 * Untuk produksi multi-instance, tukar penyimpanannya (Redis, atau penghitung
 * persisten yang sama).
 */
const attempts = new Map<string, { count: number; resetAt: number }>();

export type RateLimitOptions = {
  windowMs?: number;
  maxAttempts?: number;
};

const DEFAULT_OPTIONS: Required<RateLimitOptions> = {
  windowMs: 15 * 60 * 1000,
  maxAttempts: 10,
};

/*
 * HANYA untuk permukaan yang menuntut sesi. Endpoint yang TERBUKA KE INTERNET
 * — /login (#372), /register, verifikasi email, atur-ulang kata sandi —
 * memakai penghitung PERSISTEN di `rate-limit-persistent.ts` (#138).
 */
export const RATE_LIMITS = {
  /**
   * Anggaran penebakan SANDI di permukaan yang sudah bersesi — hari ini hanya
   * `/api/company-unlock`. Dulu bernama `login`, dan namanya menjadi salah
   * begitu jalur masuk pindah ke penghitung persisten (#372): sebuah kunci
   * bernama `login` yang tidak dipakai login adalah petunjuk yang menyesatkan
   * pembaca berikutnya. Angkanya tidak berubah.
   */
  passwordGuess: { windowMs: 15 * 60 * 1000, maxAttempts: 10 },
  changePassword: { windowMs: 15 * 60 * 1000, maxAttempts: 5 },
  /*
   * Penerbitan undangan staf (issue #139): per-PENGUNDANG — permukaan
   * TERAUTENTIKASI (akun admin yang dibajak tidak boleh jadi meriam spam),
   * jadi penghitung memori cukup; penerimaan undangan yang PUBLIK memakai
   * penghitung persisten (`rate-limit-persistent.ts`, aturan #138).
   */
  invitation: { windowMs: 15 * 60 * 1000, maxAttempts: 20 },
} as const;

export function checkRateLimit(
  key: string,
  options: RateLimitOptions = {}
): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const { windowMs, maxAttempts } = { ...DEFAULT_OPTIONS, ...options };
  const now = Date.now();
  const record = attempts.get(key);

  if (record && record.resetAt < now) {
    attempts.delete(key);
  }

  const current = attempts.get(key);

  if (!current) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxAttempts - 1 };
  }

  if (current.count >= maxAttempts) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: current.resetAt - now,
    };
  }

  current.count += 1;
  return { allowed: true, remaining: maxAttempts - current.count };
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of attempts) {
      if (record.resetAt < now) {
        attempts.delete(key);
      }
    }
  }, 60_000);
}
