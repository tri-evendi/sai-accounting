/**
 * STEMPEL BUILD — pembacaan, identitas pekerja, dan putusan "tertinggal".
 *
 * Penjaga statisnya (Dockerfile · publish · tata letak lintas bahasa) di
 * `tests/build-stamp.test.ts`; berkas ini menguji perilakunya.
 */
import { describe, expect, it } from "vitest";

import {
  IDENTITY_MAX_LENGTH,
  SUPERSEDED_GAP_MS,
  UNKNOWN_SERVICE,
  buildBanner,
  buildDetails,
  buildInfo,
  buildLabel,
  compareBuild,
  healthBuildFields,
  parseBuildLabel,
  parseIdentity,
  serviceBuildRows,
  sightingFromIdentity,
  sightingFromRunDetails,
  stampIdentity,
  type BuildSighting,
} from "@sai/core/build-info";
import { WORKER_SERVICE, workerId } from "../workers/runner";

const STEMPEL = {
  APP_VERSION: "0.12.1",
  GIT_SHA: "abc1234def5678901234567890abcdef12345678",
  BUILD_TIME: "2026-10-22T03:04:05Z",
};

describe("buildInfo — bawaan & penguraian", () => {
  it("membaca ketiga variabel yang ditanam image", () => {
    expect(buildInfo(STEMPEL, undefined)).toEqual({
      version: "0.12.1",
      sha: STEMPEL.GIT_SHA,
      shortSha: "abc1234",
      builtAt: "2026-10-22T03:04:05Z",
    });
  });

  it("tanpa stempel: versi package.json, sha `dev`, waktu null", () => {
    expect(buildInfo({}, "0.12.1")).toEqual({
      version: "0.12.1",
      sha: "dev",
      shortSha: "dev",
      builtAt: null,
    });
    // `bun run` menyetel npm_package_version; Next menyuntik NEXT_PUBLIC_APP_VERSION.
    expect(buildInfo({ npm_package_version: "0.12.0" }, undefined).version).toBe("0.12.0");
    expect(buildInfo({}, undefined).version).toBe("0.0.0");
  });

  it("APP_VERSION kosong (ARG bawaan Dockerfile) jatuh ke cadangan, bukan string kosong", () => {
    expect(buildInfo({ APP_VERSION: "", GIT_SHA: "  ", BUILD_TIME: "" }, "0.12.1")).toEqual({
      version: "0.12.1",
      sha: "dev",
      shortSha: "dev",
      builtAt: null,
    });
  });

  it("awalan `v` dibuang; waktu yang tak terurai menjadi null", () => {
    const b = buildInfo({ APP_VERSION: "v0.12.1", BUILD_TIME: "kemarin" }, undefined);
    expect(b.version).toBe("0.12.1");
    expect(b.builtAt).toBeNull();
  });

  it("label, baris log, medan health, dan details putaran", () => {
    const b = buildInfo(STEMPEL, undefined);
    expect(buildLabel(b)).toBe("v0.12.1+abc1234");
    expect(buildBanner("svc-worker", b)).toBe("svc-worker v0.12.1 (abc1234, built 2026-10-22T03:04:05Z)");
    expect(buildBanner("svc-worker", buildInfo({}, "0.12.1"))).toBe(
      "svc-worker v0.12.1 (dev, built unknown)"
    );
    expect(healthBuildFields(b)).toEqual({
      version: "0.12.1",
      build: { version: "0.12.1", sha: STEMPEL.GIT_SHA, builtAt: "2026-10-22T03:04:05Z" },
    });
    expect(buildDetails(b)).toEqual({ build: "v0.12.1+abc1234" });
    expect(parseBuildLabel("v0.12.1+abc1234")).toEqual({ version: "0.12.1", shortSha: "abc1234" });
    expect(parseBuildLabel(undefined)).toBeNull();
    expect(parseBuildLabel("0.12.1")).toBeNull();
  });
});

describe("identitas pekerja berstempel (jobs.claimed_by, runtime_samples.instance)", () => {
  const b = { version: "0.12.1", shortSha: "abc1234" };

  it("bentuk `<kepala> <layanan> v<versi>+<sha>` dan terurai kembali", () => {
    const id = stampIdentity("interactive@3f2a9c1b0d4e:7", "svc-worker", b);
    expect(id).toBe("interactive@3f2a9c1b0d4e:7 svc-worker v0.12.1+abc1234");
    expect(parseIdentity(id)).toEqual({
      head: "interactive@3f2a9c1b0d4e:7",
      service: "svc-worker",
      build: b,
    });
  });

  it("muat di VARCHAR(100): yang dipangkas KEPALA, stempelnya utuh", () => {
    const id = stampIdentity(`ledger@${"h".repeat(200)}:123`, "svc-worker", b);
    expect(id.length).toBe(IDENTITY_MAX_LENGTH);
    expect(id.endsWith(" svc-worker v0.12.1+abc1234")).toBe(true);
    expect(parseIdentity(id).build).toEqual(b);
  });

  it("identitas lama (sebelum stempel) terurai tanpa build — bukan galat", () => {
    expect(parseIdentity("ledger@3f2a9c1b0d4e:7")).toEqual({
      head: "ledger@3f2a9c1b0d4e:7",
      service: null,
      build: null,
    });
  });

  it("pelari Node menulis identitas berstempel `svc-worker`", () => {
    const id = workerId("ledger", "3f2a9c1b0d4e", 42, b);
    expect(id).toBe("ledger@3f2a9c1b0d4e:42 svc-worker v0.12.1+abc1234");
    expect(WORKER_SERVICE).toBe("svc-worker");
    // Stabil antar-panggilan: perpanjangan lease mencocokkan `claimed_by = ${me}`.
    expect(workerId("ledger", "3f2a9c1b0d4e", 42, b)).toBe(id);
  });

  it("pengamatan: peran dari kepala, layanan dari stempel", () => {
    const t = new Date("2026-10-22T05:00:00Z");
    expect(sightingFromIdentity("tenant@abc:9 svc-integrator v0.12.1+abc1234", t)).toEqual({
      service: "svc-integrator",
      role: "tenant",
      build: b,
      lastSeen: t,
    });
    expect(sightingFromIdentity("abc:9", t, { role: "web", fallbackService: "app-customer" })).toEqual({
      service: "app-customer",
      role: "web",
      build: null,
      lastSeen: t,
    });
    expect(sightingFromIdentity("ledger@abc:9", t).service).toBe(UNKNOWN_SERVICE);
  });

  it("pengamatan dari details putaran — putaran lama tanpa medan `build` → null", () => {
    const t = new Date("2026-10-22T05:00:00Z");
    const baru = JSON.stringify({ issued: [], ...buildDetails(buildInfo(STEMPEL, undefined)) });
    expect(sightingFromRunDetails(baru, t, "svc-worker", "scheduler").build).toEqual(b);
    expect(sightingFromRunDetails(JSON.stringify({ issued: [] }), t, "svc-worker", "scheduler").build).toBeNull();
    expect(sightingFromRunDetails("{rusak", t, "svc-worker", "scheduler").build).toBeNull();
    expect(sightingFromRunDetails(null, t, "svc-worker", "scheduler").build).toBeNull();
  });
});

describe("putusan terhadap build konsol — `tertinggal`", () => {
  const acuan = { version: "0.12.1", shortSha: "abc1234" };

  it("sama hanya bila versi DAN sha sama", () => {
    expect(compareBuild(acuan, { version: "0.12.1", shortSha: "abc1234" })).toBe("same");
    expect(compareBuild(acuan, { version: "0.12.1", shortSha: "fff0000" })).toBe("differs");
    expect(compareBuild(acuan, { version: "0.12.0", shortSha: "abc1234" })).toBe("differs");
  });

  it("sha penuh vs pendek dibandingkan pada 7 karakter", () => {
    expect(compareBuild(acuan, { version: "0.12.1", shortSha: "abc1234def" })).toBe("same");
  });

  it("tak berstempel atau acuan `dev` → tidak diketahui, bukan tertinggal", () => {
    expect(compareBuild(acuan, null)).toBe("unknown");
    expect(compareBuild({ version: "0.12.1", shortSha: "dev" }, acuan)).toBe("unknown");
    expect(compareBuild({ version: "0.12.1", shortSha: "dev" }, { version: "0.12.1", shortSha: "dev" })).toBe(
      "same"
    );
  });

  const kini = new Date("2026-10-22T12:00:00Z").getTime();
  const at = (menitLalu: number) => new Date(kini - menitLalu * 60_000);
  const lama = { version: "0.12.0", shortSha: "0000000" };

  it("replika yang tertinggal TETAP tampil di samping yang baru", () => {
    const s: BuildSighting[] = [
      { service: "app-customer", role: "web", build: acuan, lastSeen: at(1) },
      { service: "app-customer", role: "web", build: lama, lastSeen: at(4) },
    ];
    const { rows } = serviceBuildRows(acuan, s);
    expect(rows.map((r) => r.verdict)).toEqual(["same", "differs"]);
  });

  it("container yang sudah DITUKAR tidak lagi dilaporkan tertinggal", () => {
    const s: BuildSighting[] = [
      { service: "svc-worker", role: "ledger", build: acuan, lastSeen: at(1) },
      { service: "svc-worker", role: "ledger", build: lama, lastSeen: at(1 + SUPERSEDED_GAP_MS / 60_000 + 1) },
    ];
    const { rows } = serviceBuildRows(acuan, s);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.verdict).toBe("same");
  });

  it("layanan yang BELUM ditukar tetap tertinggal, berapa pun umurnya", () => {
    const s: BuildSighting[] = [{ service: "svc-integrator", role: "tenant", build: lama, lastSeen: at(600) }];
    expect(serviceBuildRows(acuan, s).rows[0]!.verdict).toBe("differs");
  });

  it("identitas lama tanpa layanan digantikan stempel baru untuk peran yang sama", () => {
    const s: BuildSighting[] = [
      { service: "svc-worker", role: "interactive", build: acuan, lastSeen: at(1) },
      { service: UNKNOWN_SERVICE, role: "interactive", build: null, lastSeen: at(120) },
    ];
    expect(serviceBuildRows(acuan, s).rows.map((r) => r.service)).toEqual(["svc-worker"]);
  });

  it("satu baris per layanan+peran+build — pengamatan berulang digabung ke yang terbaru", () => {
    const s: BuildSighting[] = [
      { service: "svc-worker", role: "ledger", build: acuan, lastSeen: at(30) },
      { service: "svc-worker", role: "ledger", build: acuan, lastSeen: at(2) },
    ];
    const { rows } = serviceBuildRows(acuan, s);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.lastSeen).toEqual(at(2));
  });

  it("yang diharapkan tapi tidak terlihat disebut, bukan dihilangkan", () => {
    const { unseen } = serviceBuildRows(
      acuan,
      [{ service: "svc-worker", role: "ledger", build: acuan, lastSeen: at(1) }],
      [
        { service: "svc-worker", role: "ledger" },
        { service: "svc-integrator", role: "tenant" },
      ]
    );
    expect(unseen).toEqual([{ service: "svc-integrator", role: "tenant" }]);
  });
});
