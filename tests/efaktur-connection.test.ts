/**
 * SAMBUNGAN PJAP — penyegelan & tampilan tanpa rahasia (`src/lib/efaktur-connection.ts`).
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { efakturConnectionUpdate, efakturConnectionView } from "@/lib/efaktur-connection";
import { openSecret } from "@sai/core/settings-crypto";

const KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
let lama: string | undefined;
beforeEach(() => {
  lama = process.env.SETTINGS_ENCRYPTION_KEY;
  process.env.SETTINGS_ENCRYPTION_KEY = KEY;
});
afterEach(() => {
  if (lama === undefined) delete process.env.SETTINGS_ENCRYPTION_KEY;
  else process.env.SETTINGS_ENCRYPTION_KEY = lama;
});

describe("sambungan PJAP", () => {
  it("rahasia disegel bertiga dan bisa dibuka kembali; tidak tersimpan mentah", () => {
    const u = efakturConnectionUpdate({ provider: "pjap", clientId: " c-1 ", secret: "s3cr3t" });
    expect(u.efakturProvider).toBe("pjap");
    expect(u.efakturClientId).toBe("c-1");
    expect(JSON.stringify(u)).not.toContain("s3cr3t");
    expect(
      openSecret({ ciphertext: u.efakturSecretCiphertext!, iv: u.efakturSecretIv!, tag: u.efakturSecretTag! })
    ).toBe("s3cr3t");
  });

  it("secret undefined = biarkan; \"\" = kosongkan; provider null = hapus semuanya", () => {
    expect("efakturSecretCiphertext" in efakturConnectionUpdate({ provider: "mock" })).toBe(false);
    expect(efakturConnectionUpdate({ provider: "pjap", secret: "" }).efakturSecretCiphertext).toBeNull();
    expect(efakturConnectionUpdate({ provider: null })).toEqual({
      efakturProvider: null,
      efakturClientId: null,
      efakturSecretCiphertext: null,
      efakturSecretIv: null,
      efakturSecretTag: null,
      efakturIsProduction: false,
    });
  });

  it("tanpa kunci enkripsi: penyimpanan rahasia DITOLAK", () => {
    delete process.env.SETTINGS_ENCRYPTION_KEY;
    expect(() => efakturConnectionUpdate({ provider: "pjap", secret: "x" })).toThrow();
  });

  it("tampilan hanya menyebut ada-tidaknya rahasia; penyedia asing = mati", () => {
    const v = efakturConnectionView({
      efakturProvider: "pjap",
      efakturClientId: "c",
      efakturSecretCiphertext: "a",
      efakturSecretIv: "b",
      efakturSecretTag: "c",
      efakturIsProduction: true,
    });
    expect(v).toEqual({ provider: "pjap", clientId: "c", hasSecret: true, isProduction: true });
    expect(efakturConnectionView({ efakturProvider: "pajakku" }).provider).toBeNull();
    expect(efakturConnectionView(null)).toEqual({ provider: null, clientId: null, hasSecret: false, isProduction: false });
  });
});
