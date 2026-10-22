/**
 * Pemuat KESIAPAN MFA untuk halaman: akun (kendali + env) × konfirmasi (jejak
 * audit di `sai_platform`). Dua bidang data — salah satunya mati → `null`, dan
 * halaman memajang kalimat "belum bisa dibaca", bukan tabel yang menyesatkan
 * (tabel tanpa konfirmasi akan terbaca "belum ada yang siap").
 */
import "server-only";

import { controlDb } from "@sai/core/control-db";
import { readAuthenticatorConfirmations } from "./audit";
import {
  authenticatorReadiness,
  listAuthenticatorAccounts,
  type AuthenticatorReadinessRow,
} from "./authenticator";

export async function loadAuthenticatorReadiness(): Promise<AuthenticatorReadinessRow[] | null> {
  try {
    const [accounts, confirmations] = await Promise.all([
      listAuthenticatorAccounts({ control: controlDb }),
      readAuthenticatorConfirmations(),
    ]);
    return authenticatorReadiness(accounts, confirmations);
  } catch (error) {
    console.error("[operator-authenticator] kesiapan MFA tak terbaca:", error);
    return null;
  }
}
