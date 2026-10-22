/**
 * PENANDA LISENSI DI KONSOL (migration platform 0007; keputusan pemilik
 * 22 Okt 2026) — perilaku segel dan penandatanganan.
 *
 * Yang dibuktikan di sini adalah janji model keamanannya, bukan bentuk
 * kodenya (bentuk dijaga `tests/licence-register-archive.test.ts`):
 *
 *   • segel bolak-balik dengan frasa yang benar, dan HANYA dengan itu;
 *   • sandi-teks, tag, nonce, atau sidik yang diubah tidak pernah terbuka;
 *   • lisensi yang ditandatangani konsol lulus `verifyLicence` dengan kunci
 *     publik yang dibuat konsol — dan pemeriksa unggahan yang sama;
 *   • kunci kedua ditolak; kunci yang tidak sama dengan kunci tertanam tidak
 *     menandatangani apa pun;
 *   • tidak satu jawaban pun memuat kunci privat, segel, atau frasa sandi.
 *
 * Parameter scrypt diturunkan ke batas bawah (2^14) supaya tes cepat; satu
 * tes memakai bawaan produksi supaya `maxmem` yang dihitung terbukti cukup.
 */
import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyLicence, type Licence } from "@sai/core/licence";
import type { LicenceTerms } from "@sai/core/licence-register";
import {
  DEFAULT_SIGNING_KDF,
  SIGNING_PASSPHRASE_MAX,
  SIGNING_PASSPHRASE_MIN,
  createSealedSigningKey,
  generateLicenceKeyPair,
  openSealedSigningKey,
  passphraseProblem,
  publicKeyFingerprint,
  sealSigningKey,
  signLicenceFile,
  type SealedSigningKey,
  type SigningKdf,
} from "@sai/platform/licence-signing";
import {
  generateConsoleSigningKey,
  issueLicenceWithConsoleKey,
  readSigningKeyStatus,
} from "@sai/platform/licence-signing-key-store";
import {
  LICENCE_PASSPHRASE_MAX,
  LICENCE_PASSPHRASE_MIN,
  licenceKeyCreateSchema,
} from "@op/lib/validations/operator";

const FAST: SigningKdf = { name: "scrypt", cost: 2 ** 14, blockSize: 8, parallelism: 1 };
const FRASA = "kuda laut makan nasi uduk";

const LICENCE: Licence = {
  licenceId: "lic-1",
  customer: "PT Maju Jaya",
  issuedAt: "2026-10-22T03:00:00.000Z",
  supportEndsAt: null,
  maxCompanies: 3,
  maxUsers: 25,
  modules: "all",
  maxVersion: "1.4",
};

/** Ubah satu byte sebuah nilai base64 — bentuk perusakan yang paling kecil. */
function flip(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  buf[0] = buf[0]! ^ 0x01;
  return buf.toString("base64");
}

describe("segel kunci privat", () => {
  it("bolak-balik: frasa benar membuka kunci yang sidiknya sama", async () => {
    const sealed = await createSealedSigningKey(FRASA, FAST);
    expect(sealed.fingerprint).toBe(publicKeyFingerprint(sealed.publicKeyPem));
    expect(sealed.fingerprint).toMatch(/^[0-9a-f]{64}$/);
    const key = await openSealedSigningKey(sealed, FRASA);
    expect(key?.asymmetricKeyType).toBe("ed25519");
  });

  it("parameter bawaan produksi (N=2^17) benar-benar berjalan — `maxmem` cukup", async () => {
    const sealed = await createSealedSigningKey(FRASA);
    expect(sealed.kdf).toMatchObject({ name: "scrypt", cost: DEFAULT_SIGNING_KDF.cost });
    expect(await openSealedSigningKey(sealed, FRASA)).not.toBeNull();
  }, 30_000);

  it("frasa salah → null, bukan galat yang membocorkan alasan", async () => {
    const sealed = await createSealedSigningKey(FRASA, FAST);
    expect(await openSealedSigningKey(sealed, `${FRASA}!`)).toBeNull();
    expect(await openSealedSigningKey(sealed, "pendek")).toBeNull();
    expect(await openSealedSigningKey(sealed, "")).toBeNull();
  });

  it.each([
    ["sandi-teks", (s: SealedSigningKey) => ({ ...s, ciphertext: flip(s.ciphertext) })],
    ["tag", (s: SealedSigningKey) => ({ ...s, tag: flip(s.tag) })],
    ["nonce", (s: SealedSigningKey) => ({ ...s, iv: flip(s.iv) })],
    ["salt", (s: SealedSigningKey) => ({ ...s, kdf: { ...s.kdf, salt: flip(s.kdf.salt) } })],
  ])("%s yang diubah → tidak terbuka", async (_n, rusak) => {
    const sealed = await createSealedSigningKey(FRASA, FAST);
    expect(await openSealedSigningKey(rusak(sealed), FRASA)).toBeNull();
  });

  it("kunci publik/sidik yang ditukar di baris → tidak terbuka (AAD + pemeriksaan ulang)", async () => {
    const sealed = await createSealedSigningKey(FRASA, FAST);
    const lain = generateLicenceKeyPair().publicKeyPem;
    expect(
      await openSealedSigningKey({ ...sealed, publicKeyPem: lain, fingerprint: publicKeyFingerprint(lain) }, FRASA)
    ).toBeNull();
    expect(await openSealedSigningKey({ ...sealed, publicKeyPem: lain }, FRASA)).toBeNull();
  });

  it("parameter KDF yang diturunkan di baris ditolak keras, tidak dipercaya", async () => {
    const sealed = await createSealedSigningKey(FRASA, FAST);
    await expect(openSealedSigningKey({ ...sealed, kdf: { ...sealed.kdf, cost: 1024 } }, FRASA)).rejects.toThrow();
    await expect(
      openSealedSigningKey({ ...sealed, kdf: { ...sealed.kdf, cost: 2 ** 24 } }, FRASA)
    ).rejects.toThrow();
  });

  it("frasa pendek tidak pernah menyegel apa pun", async () => {
    await expect(sealSigningKey(generateLicenceKeyPair().privateKey, "pendek", FAST)).rejects.toThrow();
    expect(passphraseProblem("a".repeat(SIGNING_PASSPHRASE_MIN - 1))).toBe("too_short");
    expect(passphraseProblem("a".repeat(SIGNING_PASSPHRASE_MIN))).toBeNull();
    expect(passphraseProblem("a".repeat(SIGNING_PASSPHRASE_MAX + 1))).toBe("too_long");
  });

  it("segel tidak memuat kunci privat atau frasa dalam bentuk terbaca", async () => {
    const sealed = await createSealedSigningKey(FRASA, FAST);
    const teks = JSON.stringify(sealed);
    expect(teks).not.toMatch(/PRIVATE KEY/);
    expect(teks).not.toContain(FRASA);
  });

  it("batas frasa di skema formulir = batas modul penanda", () => {
    expect(LICENCE_PASSPHRASE_MIN).toBe(SIGNING_PASSPHRASE_MIN);
    expect(LICENCE_PASSPHRASE_MAX).toBe(SIGNING_PASSPHRASE_MAX);
    expect(licenceKeyCreateSchema.safeParse({ passphrase: FRASA, confirm: FRASA }).success).toBe(true);
    expect(licenceKeyCreateSchema.safeParse({ passphrase: FRASA, confirm: `${FRASA} ` }).success).toBe(false);
    expect(licenceKeyCreateSchema.safeParse({ passphrase: "pendek", confirm: "pendek" }).success).toBe(false);
  });
});

describe("tanda tangan", () => {
  it("lisensi dari kunci yang dibuka lulus verifyLicence dengan kunci publik yang dibuat", async () => {
    const sealed = await createSealedSigningKey(FRASA, FAST);
    const key = (await openSealedSigningKey(sealed, FRASA))!;
    const r = signLicenceFile(LICENCE, key, sealed.publicKeyPem);
    expect(r.ok).toBe(true);
    const verdict = verifyLicence(r.ok ? r.file : "", sealed.publicKeyPem);
    expect(verdict).toMatchObject({ ok: true, licence: LICENCE });
  });

  it("verifikasi dengan kunci tertanam yang lain → gagal sebelum dipulangkan", async () => {
    const key = generateLicenceKeyPair().privateKey;
    const lain = generateLicenceKeyPair().publicKeyPem;
    expect(signLicenceFile(LICENCE, key, lain)).toMatchObject({ ok: false, reason: "tanda tangan tidak cocok" });
  });
});

/* ── store: tabel kunci + register, klien tiruan ─────────────────────────── */

const TERMS: LicenceTerms = {
  licenceId: "6f1c2a9e-0000-4000-8000-000000000009",
  customer: "PT Sumber 'Rejeki'",
  maxCompanies: 2,
  maxUsers: 10,
  modules: ["core_accounting", "manufacturing"],
  supportEndsOn: "2027-10-20",
  maxVersion: "1.4",
};

type KeyRow = Record<string, unknown> & { isActive: boolean; fingerprint: string };

function fakePlatform(entryStatus = "draft") {
  const keys: KeyRow[] = [];
  const updates: Record<string, unknown>[] = [];
  const entry = {
    id: 5,
    customerId: 1,
    version: 1,
    status: entryStatus,
    licenceId: TERMS.licenceId,
    licenseeName: TERMS.customer,
    maxCompanies: TERMS.maxCompanies,
    maxUsers: TERMS.maxUsers,
    modules: "core_accounting,manufacturing",
    supportEndsOn: new Date(`${TERMS.supportEndsOn}T00:00:00.000Z`),
    maxVersion: TERMS.maxVersion,
    notes: null,
    fileSha256: null,
    issuedAt: null,
    uploadedBy: null,
    uploadedAt: null,
    revokedBy: null,
    revokedAt: null,
    revokeReason: null,
    createdBy: "rina",
    createdAt: new Date(),
  };
  const platform = {
    licenceSigningKey: {
      count: async () => keys.filter((k) => k.isActive).length,
      findFirst: async () => keys.find((k) => k.isActive) ?? null,
      create: async ({ data }: { data: KeyRow }) => {
        if (data.isActive && keys.some((k) => k.isActive)) throw Object.assign(new Error("unik"), { code: "P2002" });
        keys.push({ ...data, createdAt: new Date() });
        return data;
      },
    },
    licenceRegisterEntry: {
      findUnique: async ({ where }: { where: { id: number } }) => (where.id === entry.id ? entry : null),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        return entry;
      },
      updateMany: async () => ({ count: 0 }),
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { deps: { platform } as unknown as Parameters<typeof readSigningKeyStatus>[0], keys, updates };
}

const BELUM = "BELUM-DISETEL";

describe("store kunci konsol", () => {
  it("membuat kunci sekali; kunci kedua ditolak", async () => {
    const { deps, keys } = fakePlatform();
    const r = await generateConsoleSigningKey(deps, { passphrase: FRASA, actor: "owner" }, BELUM, FAST);
    expect(r).toMatchObject({ outcome: "ok" });
    expect(keys).toHaveLength(1);
    expect(String(keys[0]!.privateKeyCiphertext)).not.toMatch(/PRIVATE KEY/);
    expect(JSON.stringify(r)).not.toMatch(/PRIVATE KEY|ciphertext/i);

    const lagi = await generateConsoleSigningKey(deps, { passphrase: FRASA, actor: "owner" }, BELUM, FAST);
    expect(lagi).toEqual({ outcome: "key_exists" });
    expect(keys).toHaveLength(1);
  });

  it("frasa lemah dan kunci tertanam yang sudah ada → tidak membuat apa pun", async () => {
    const { deps, keys } = fakePlatform();
    expect(await generateConsoleSigningKey(deps, { passphrase: "pendek", actor: "o" }, BELUM, FAST)).toEqual({
      outcome: "weak_passphrase",
    });
    const tertanam = generateLicenceKeyPair().publicKeyPem;
    expect(await generateConsoleSigningKey(deps, { passphrase: FRASA, actor: "o" }, tertanam, FAST)).toEqual({
      outcome: "compiled_key_present",
    });
    expect(keys).toHaveLength(0);
  });

  it("status: belum ditanam → cocok → beda", async () => {
    const { deps } = fakePlatform();
    const r = await generateConsoleSigningKey(deps, { passphrase: FRASA, actor: "owner" }, BELUM, FAST);
    const pem = r.outcome === "ok" ? r.publicKeyPem : "";
    expect((await readSigningKeyStatus(deps, BELUM)).compiled).toBe("not_set");
    /* Spasi/baris PEM yang berbeda tetap kunci yang sama — dibandingkan lewat DER. */
    expect((await readSigningKeyStatus(deps, `\n${pem.trim()}\n\n`)).compiled).toBe("matches");
    expect((await readSigningKeyStatus(deps, generateLicenceKeyPair().publicKeyPem)).compiled).toBe("differs");
  });

  it("menandatangani hanya bila kunci tertanam = kunci konsol", async () => {
    const { deps, updates } = fakePlatform();
    expect(await issueLicenceWithConsoleKey(deps, { entryId: 5, passphrase: FRASA, actor: "o" }, BELUM)).toEqual({
      outcome: "no_key",
    });
    await generateConsoleSigningKey(deps, { passphrase: FRASA, actor: "owner" }, BELUM, FAST);
    expect(
      (await issueLicenceWithConsoleKey(deps, { entryId: 5, passphrase: FRASA, actor: "o" }, BELUM)).outcome
    ).toBe("key_not_installed");
    const lain = generateLicenceKeyPair().publicKeyPem;
    expect(
      (await issueLicenceWithConsoleKey(deps, { entryId: 5, passphrase: FRASA, actor: "o" }, lain)).outcome
    ).toBe("key_mismatch");
    expect(updates).toEqual([]);
  });

  it("frasa salah → wrong_passphrase, draf tidak berubah", async () => {
    const { deps, updates } = fakePlatform();
    const k = await generateConsoleSigningKey(deps, { passphrase: FRASA, actor: "owner" }, BELUM, FAST);
    const pem = k.outcome === "ok" ? k.publicKeyPem : "";
    const r = await issueLicenceWithConsoleKey(deps, { entryId: 5, passphrase: "frasa yang keliru", actor: "o" }, pem);
    expect(r).toEqual({ outcome: "wrong_passphrase", fingerprint: k.outcome === "ok" ? k.fingerprint : "" });
    expect(updates).toEqual([]);
  });

  it("jalur penuh: draf → tanda tangan → lulus verifyLicence & pemeriksa unggahan → terbit", async () => {
    const { deps, updates } = fakePlatform();
    const k = await generateConsoleSigningKey(deps, { passphrase: FRASA, actor: "owner" }, BELUM, FAST);
    const pem = k.outcome === "ok" ? k.publicKeyPem : "";
    const now = new Date("2026-10-23T01:00:00.000Z");

    const r = await issueLicenceWithConsoleKey(deps, { entryId: 5, passphrase: FRASA, actor: "owner" }, pem, now);
    expect(r).toMatchObject({ outcome: "ok", licenceId: TERMS.licenceId, fileName: "licence.sai" });
    if (r.outcome !== "ok") return;

    const verdict = verifyLicence(r.content, pem, now);
    expect(verdict).toMatchObject({
      ok: true,
      licence: {
        licenceId: TERMS.licenceId,
        customer: TERMS.customer,
        supportEndsAt: "2027-10-20T00:00:00.000Z",
        modules: ["core_accounting", "manufacturing"],
        issuedAt: now.toISOString(),
      },
    });
    expect(updates[0]).toMatchObject({ status: "issued", fileContent: r.content, uploadedBy: "owner" });
    expect(JSON.stringify(r)).not.toMatch(/PRIVATE KEY/);
    expect(JSON.stringify(r)).not.toContain(FRASA);
  });

  it("hanya draf yang ditandatangani — frasa tidak diuji untuk baris yang toh ditolak", async () => {
    const { deps } = fakePlatform("issued");
    expect(
      await issueLicenceWithConsoleKey(deps, { entryId: 5, passphrase: FRASA, actor: "o" }, BELUM)
    ).toEqual({ outcome: "not_draft" });
    expect(
      await issueLicenceWithConsoleKey(deps, { entryId: 99, passphrase: FRASA, actor: "o" }, BELUM)
    ).toEqual({ outcome: "not_found" });
  });

  it("kunci dari skrip luring (berkas PEM) dan kunci konsol menghasilkan berkas yang sama-sama sah", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const pem = publicKey.export({ type: "spki", format: "pem" }).toString();
    const r = signLicenceFile(LICENCE, privateKey);
    expect(r.ok && verifyLicence(r.file, pem).ok).toBe(true);
  });
});
