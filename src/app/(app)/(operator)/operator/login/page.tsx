/**
 * Masuk KONSOL OPERATOR (issue #154) — halaman publik SATU-SATUNYA di bidang
 * operator, dan hanya "publik" di dalam temboknya: proxy sudah menolak host
 * yang salah dan IP di luar daftar, dan halaman ini memeriksanya SEKALI LAGI
 * (`operatorPlaneViolation` → 404) supaya keputusan keamanan tidak pernah
 * bergantung pada konfigurasi matcher proxy.
 *
 * SENGAJA tanpa `requireOperatorPage()` — orang yang sedang login jelas belum
 * bersesi; inilah pengecualian yang harus terdaftar di aturan cakupan
 * `(operator)` di tests/authz-coverage.test.ts (pola halaman `(auth)`).
 *
 * Kredensial BUKAN dari tabel `users` pelanggan: nama akun + kata sandi +
 * kode TOTP diverifikasi terhadap `OPERATOR_USERS` (env) di server action.
 */

import { notFound, redirect } from "next/navigation";

import { operatorPlaneViolation, optionalOperatorSession } from "@/lib/operator/guard";
import { operatorMfaOff } from "@/lib/operator/credentials";
import { OperatorLoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function OperatorLoginPage() {
  if ((await operatorPlaneViolation()) !== null) notFound();

  /* Sudah bersesi → tidak sedang login; pulangkan ke daftar tenant. */
  if (await optionalOperatorSession()) redirect("/operator");

  return (
    <div style={{ width: "100%", maxWidth: 384, margin: "0 auto", padding: "40px 0" }}>
      {/* Sakelar dibaca DI SERVER: `OPERATOR_MFA` tidak ber-prefix
          NEXT_PUBLIC, jadi ia memang tak terbaca dari komponen client — dan
          itu benar. Yang menyeberang cuma satu boolean. */}
      <OperatorLoginForm mfaOff={operatorMfaOff()} />
    </div>
  );
}
