/**
 * Asal (origin) aplikasi CUSTOMER, dari `AUTH_URL` container konsol.
 *
 * Konsol hidup di host sendiri; tautan yang harus dibuka di host customer
 * (surel atur-ulang sandi, pratinjau halaman depan) dirakit dari sini. `null`
 * bila `AUTH_URL` kosong atau bukan URL: pemanggil mengatakannya sebagai
 * kalimat, tidak menebak host.
 */
export function customerOrigin(): string | null {
  const raw = process.env.AUTH_URL?.trim().replace(/\/$/, "");
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}
