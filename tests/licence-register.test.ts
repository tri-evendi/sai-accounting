/**
 * REGISTER LISENSI ON-PREMISE (migration platform 0006) — perilaku.
 *
 * Yang paling penting diuji di sini adalah JAHITANNYA: perintah yang dirakit
 * konsol, dijalankan PERSIS seperti operator menjalankannya di laptop luring
 * (`bun run licence:issue` sungguhan, dengan pasangan kunci sekali-pakai),
 * menghasilkan berkas yang diterima pemeriksa unggahan. Kalau keduanya
 * menyimpang — kutipan shell, bentuk tanggal, urutan modul — yang menemukannya
 * adalah operator di depan customer, bukan tes.
 */
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, sign as signBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { licencePayloadBytes, type Licence } from "@sai/core/licence";
import {
  OFFLINE_KEY_PATH_PLACEHOLDER,
  buildIssueCommand,
  compareLicenceToTerms,
  parseModules,
  shellQuote,
  suggestedLicenceFileName,
  type LicenceTerms,
} from "@sai/core/licence-register";
import { attachIssuedLicence, markLicenceRevoked } from "@sai/platform/licence-register-store";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const PUB = publicKey.export({ type: "spki", format: "pem" }).toString();
const PRIV = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const TERMS: LicenceTerms = {
  licenceId: "6f1c2a9e-0000-4000-8000-000000000001",
  customer: "PT Maju 'Jaya' & Sons $(rm -rf ~)",
  maxCompanies: 3,
  maxUsers: 25,
  modules: ["core_accounting", "manufacturing"],
  supportEndsOn: "2027-10-20",
  maxVersion: "1.4",
};

const sign = (l: Licence): string => {
  const p = licencePayloadBytes(l);
  return `${p.toString("base64url")}.${signBytes(null, p, privateKey).toString("base64url")}`;
};

const licenceOf = (t: LicenceTerms, over: Partial<Licence> = {}): Licence => ({
  licenceId: t.licenceId,
  customer: t.customer,
  issuedAt: "2026-10-22T03:00:00.000Z",
  supportEndsAt: t.supportEndsOn ? `${t.supportEndsOn}T00:00:00.000Z` : null,
  maxCompanies: t.maxCompanies,
  maxUsers: t.maxUsers,
  modules: t.modules,
  maxVersion: t.maxVersion,
  ...over,
});

describe("perintah licence:issue", () => {
  it("kutipan shell membuat argumen kembali utuh — termasuk ' $ & dan spasi", () => {
    const nilai = ["PT A", "it's", "$(id)", "a;b", "", "~x", "PT Maju 'Jaya' & Sons"];
    const r = spawnSync("bash", ["-c", `printf '%s\\0' ${nilai.map(shellQuote).join(" ")}`], {
      encoding: "utf8",
    });
    expect(r.stdout.split("\0").slice(0, -1)).toEqual(nilai);
  });

  it("memuat --id, batas, modul, tanggal, versi, dan jalur kunci di LAPTOP (bukan kunci)", () => {
    const cmd = buildIssueCommand(TERMS);
    expect(cmd.startsWith("bun run licence:issue -- --kunci ~/sai-licence-key.pem ")).toBe(true);
    expect(cmd).toContain(`--id ${TERMS.licenceId}`);
    expect(cmd).toContain("--perusahaan 3 --pengguna 25");
    expect(cmd).toContain("--modul core_accounting,manufacturing");
    expect(cmd).toContain("--dukungan-sampai 2027-10-20");
    expect(cmd).toContain("--versi-maks 1.4");
    expect(cmd).not.toMatch(/PRIVATE KEY/);
  });

  it("isian opsional yang kosong tidak menjadi argumen", () => {
    const cmd = buildIssueCommand({ ...TERMS, supportEndsOn: null, maxVersion: null, modules: "all" });
    expect(cmd).not.toContain("--dukungan-sampai");
    expect(cmd).not.toContain("--versi-maks");
    expect(cmd).toContain("--modul all");
  });

  it("modul: all, daftar berkoma (dedup), dan bentuk yang ditolak", () => {
    expect(parseModules("all")).toBe("all");
    expect(parseModules(" a_1 , b ,a_1,")).toEqual(["a_1", "b"]);
    expect(parseModules("")).toBeNull();
    expect(parseModules("Core")).toBeNull();
    expect(parseModules("a;rm")).toBeNull();
  });
});

describe("jahitan ujung-ke-ujung: perintah konsol → skrip luring → pemeriksa unggahan", () => {
  const dir = mkdtempSync(join(tmpdir(), "sai-licence-register-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("berkas dari `bun run licence:issue` yang dijalankan PERSIS seperti perintahnya cocok dengan draf", async () => {
    const kunci = join(dir, "kunci.pem");
    writeFileSync(kunci, PRIV, { mode: 0o600 });
    const keluar = join(dir, suggestedLicenceFileName(TERMS));
    const cmd = buildIssueCommand(TERMS)
      .replace(OFFLINE_KEY_PATH_PLACEHOLDER, shellQuote(kunci))
      .replace(shellQuote(`./${suggestedLicenceFileName(TERMS)}`), shellQuote(keluar));

    const r = spawnSync("bash", ["-c", cmd], { cwd: process.cwd(), encoding: "utf8", timeout: 60_000 });
    expect(r.status, r.stderr).toBe(0);
    const teks = readFileSync(keluar, "utf8");

    const { db, updates } = fakeDb({ id: 7, status: "draft", customerId: 2, terms: TERMS });
    const hasil = await attachIssuedLicence(db, { entryId: 7, fileText: teks, actor: "rina" }, PUB);
    expect(hasil).toMatchObject({ outcome: "ok", licenceId: TERMS.licenceId, superseded: 1 });
    expect(updates[0]).toMatchObject({ status: "issued", fileContent: `${teks.trim()}\n` });
  }, 90_000);
});

describe("pemeriksa unggahan", () => {
  it("kunci publik belum ditanam → ditolak dengan alasan, tidak melempar", async () => {
    const { db } = fakeDb({ id: 1, status: "draft", customerId: 1, terms: TERMS });
    expect(await attachIssuedLicence(db, { entryId: 1, fileText: "x.y", actor: "a" }, "BELUM-DISETEL")).toEqual({
      outcome: "key_not_set",
    });
  });

  it("tanda tangan kunci lain → bad_signature", async () => {
    const lain = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    const { db, updates } = fakeDb({ id: 1, status: "draft", customerId: 1, terms: TERMS });
    const r = await attachIssuedLicence(db, { entryId: 1, fileText: sign(licenceOf(TERMS)), actor: "a" }, lain);
    expect(r.outcome).toBe("bad_signature");
    expect(updates).toEqual([]);
  });

  it("berkas sah tetapi isinya beda → daftar selisih yang terbaca", async () => {
    const { db, updates } = fakeDb({ id: 1, status: "draft", customerId: 1, terms: TERMS });
    const teks = sign(licenceOf(TERMS, { maxUsers: 50, supportEndsAt: null, modules: ["manufacturing", "core_accounting"] }));
    const r = await attachIssuedLicence(db, { entryId: 1, fileText: teks, actor: "a" }, PUB);
    expect(r).toEqual({
      outcome: "mismatch",
      mismatches: [
        { field: "maxUsers", expected: "25", actual: "50" },
        { field: "supportEndsAt", expected: "2027-10-20", actual: "—" },
      ],
    });
    expect(updates).toEqual([]);
  });

  it("berkas untuk draf lain (licenceId beda) ditolak", () => {
    const m = compareLicenceToTerms(licenceOf({ ...TERMS, licenceId: "lain" }), TERMS);
    expect(m.map((x) => x.field)).toEqual(["licenceId"]);
  });

  it("hanya draf yang menerima berkas", async () => {
    const { db } = fakeDb({ id: 1, status: "issued", customerId: 1, terms: TERMS });
    const r = await attachIssuedLicence(db, { entryId: 1, fileText: sign(licenceOf(TERMS)), actor: "a" }, PUB);
    expect(r).toEqual({ outcome: "not_draft" });
  });
});

describe("dicabut = catatan", () => {
  it("hanya yang sudah terbit yang bisa ditandai dicabut", async () => {
    const draf = fakeDb({ id: 1, status: "draft", customerId: 1, terms: TERMS });
    expect(await markLicenceRevoked(draf.db, { entryId: 1, reason: "kontrak putus", actor: "a" })).toEqual({
      outcome: "not_issued",
    });
    const terbit = fakeDb({ id: 1, status: "issued", customerId: 1, terms: TERMS });
    expect(await markLicenceRevoked(terbit.db, { entryId: 1, reason: "kontrak putus", actor: "a" })).toEqual({
      outcome: "ok",
      licenceId: TERMS.licenceId,
    });
    expect(terbit.updates[0]).toMatchObject({ status: "revoked", revokeReason: "kontrak putus" });
  });
});

/** Klien platform tiruan — cukup untuk satu baris register. */
function fakeDb(row: { id: number; status: string; customerId: number; terms: LicenceTerms }) {
  const updates: Record<string, unknown>[] = [];
  const t = row.terms;
  const entry = {
    id: row.id,
    customerId: row.customerId,
    version: 1,
    status: row.status,
    licenceId: t.licenceId,
    licenseeName: t.customer,
    maxCompanies: t.maxCompanies,
    maxUsers: t.maxUsers,
    modules: t.modules === "all" ? "all" : t.modules.join(","),
    supportEndsOn: t.supportEndsOn ? new Date(`${t.supportEndsOn}T00:00:00.000Z`) : null,
    maxVersion: t.maxVersion,
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
  const db = {
    platform: {
      licenceRegisterEntry: {
        findUnique: async ({ where }: { where: { id: number } }) => (where.id === entry.id ? entry : null),
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return entry;
        },
        updateMany: async () => ({ count: 1 }),
      },
      $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
    },
  };
  return { db: db as unknown as Parameters<typeof attachIssuedLicence>[0], updates };
}
