/**
 * SAMBUNGAN PJAP MILIK PT — nilai kolom `company_settings.efaktur_*`
 * (docs/EFAKTUR.md). Pola yang SAMA dengan gerbang pembayaran (#466,
 * `company-payment-settings.ts`), dengan aturan yang sama:
 *
 *   • tidak ada penyedia → fitur kirim MATI; berkas XML untuk unggah manual
 *     tetap ada. Tidak pernah jatuh ke kredensial milik siapa pun selain PT ini;
 *   • rahasia disegel AES-256-GCM (`SETTINGS_ENCRYPTION_KEY`) dan TIDAK pernah
 *     dikirim balik ke layar — yang dikirim hanya "tersimpan / belum";
 *   • `secret: undefined` = biarkan yang tersimpan; `""` = kosongkan.
 *
 * MURNI (tanpa Prisma, tanpa `server-only`) supaya penyegelannya diuji tanpa
 * basis data.
 */
import { sealSecret } from "@sai/core/settings-crypto";
import type { EfakturProvider } from "@sai/core/efaktur-submission";

export interface EfakturConnectionRow {
  efakturProvider: string | null;
  efakturClientId: string | null;
  efakturSecretCiphertext: string | null;
  efakturSecretIv: string | null;
  efakturSecretTag: string | null;
  efakturIsProduction: boolean;
}

/** Yang boleh dilihat layar: tanpa rahasia. */
export interface EfakturConnectionView {
  provider: EfakturProvider | null;
  clientId: string | null;
  hasSecret: boolean;
  isProduction: boolean;
}

export function efakturConnectionView(row: Partial<EfakturConnectionRow> | null | undefined): EfakturConnectionView {
  const p = row?.efakturProvider;
  return {
    provider: p === "mock" || p === "pjap" ? p : null,
    clientId: row?.efakturClientId ?? null,
    hasSecret: !!(row?.efakturSecretCiphertext && row.efakturSecretIv && row.efakturSecretTag),
    isProduction: row?.efakturIsProduction ?? false,
  };
}

export interface SaveEfakturConnectionInput {
  /** `null` mematikan fitur dan MENGHAPUS kredensial tersimpan. */
  provider: EfakturProvider | null;
  clientId?: string | null;
  /** `undefined` = jangan ubah rahasia yang tersimpan. */
  secret?: string;
  isProduction?: boolean;
}

/** Rakit nilai kolom untuk disimpan. Menyegel dengan kunci env — tanpa kunci MELEMPAR. */
export function efakturConnectionUpdate(input: SaveEfakturConnectionInput): Partial<EfakturConnectionRow> {
  if (input.provider === null) {
    return {
      efakturProvider: null,
      efakturClientId: null,
      efakturSecretCiphertext: null,
      efakturSecretIv: null,
      efakturSecretTag: null,
      efakturIsProduction: false,
    };
  }
  const update: Partial<EfakturConnectionRow> = {
    efakturProvider: input.provider,
    efakturClientId: input.clientId?.trim() || null,
  };
  if (input.isProduction !== undefined) update.efakturIsProduction = input.isProduction;
  if (input.secret !== undefined) {
    const trimmed = input.secret.trim();
    if (trimmed === "") {
      update.efakturSecretCiphertext = null;
      update.efakturSecretIv = null;
      update.efakturSecretTag = null;
    } else {
      const sealed = sealSecret(trimmed);
      update.efakturSecretCiphertext = sealed.ciphertext;
      update.efakturSecretIv = sealed.iv;
      update.efakturSecretTag = sealed.tag;
    }
  }
  return update;
}
