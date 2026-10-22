/**
 * PENJAGA STEMPEL BUILD — setiap image terbitan menyebut build-nya.
 *
 * ══ KENAPA ADA ═════════════════════════════════════════════════════════════
 * Permintaan pemilik 22 Okt 2026: "versi untuk setiap service". Nomor rilis
 * tetap satu; yang dijamin di sini adalah setiap layanan BISA menyebut build
 * yang ia jalankan, supaya satu yang tertinggal di image lama terlihat
 * (konsol `/scheduler` → "Versi layanan", `/api/health` → `build`).
 *
 * Stempel yang hilang dari SATU tahap tidak menggagalkan apa pun: layanan itu
 * melapor `0.0.0`/`dev`, konsol menyebutnya "tidak diketahui" — netral, bukan
 * peringatan — dan layanan yang paling mungkin tertinggal menjadi satu-satunya
 * yang tidak bisa dinilai. Kegagalan diam seperti itu yang dijaga di sini,
 * dalam empat arah:
 *
 *   1. setiap tahap akhir image terbitan (matriks + pendamping) membawa blok
 *      ARG → ENV → LABEL;
 *   2. blok itu SESUDAH `RUN` terakhir tahapnya — `GIT_SHA` berubah tiap build,
 *      dan ARG sebelum `RUN` membatalkan cache lapisan berat setiap dorongan;
 *   3. setiap langkah build di `publish-image.yml` meneruskan ketiga build-arg;
 *   4. tata letak stempel SAMA di TypeScript dan Go — konsol mengurai keduanya
 *      dengan satu pola.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildBanner, buildLabel, IDENTITY_MAX_LENGTH, stampIdentity } from "@sai/core/build-info";
import { AKAR_REPO } from "./akar-sumber";

const dockerfile = readFileSync(join(AKAR_REPO, "Dockerfile"), "utf8");
const publish = readFileSync(join(AKAR_REPO, ".github/workflows/publish-image.yml"), "utf8");
const goBuildinfo = readFileSync(
  join(AKAR_REPO, "services/integrator/internal/buildinfo/buildinfo.go"),
  "utf8"
);
const goBuildinfoTest = readFileSync(
  join(AKAR_REPO, "services/integrator/internal/buildinfo/buildinfo_test.go"),
  "utf8"
);
const tsBuildinfo = readFileSync(join(AKAR_REPO, "packages/core/src/build-info.ts"), "utf8");

const STAMP = ["APP_VERSION", "GIT_SHA", "BUILD_TIME"] as const;

/** Baris tanpa komentar — penjaga tidak boleh lolos karena komentar. */
const tanpaKomentar = (teks: string, tanda = "#") =>
  teks
    .split("\n")
    .filter((b) => !b.trim().startsWith(tanda))
    .join("\n");

/** Isi setiap tahap Dockerfile, dikunci nama `AS`-nya. */
function tahapDockerfile(): Map<string, string> {
  const hasil = new Map<string, string>();
  const bersih = tanpaKomentar(dockerfile);
  const re = /^FROM\s+\S+\s+AS\s+([a-z0-9-]+)\s*$/gim;
  const awal = [...bersih.matchAll(re)];
  awal.forEach((m, i) => {
    const mulai = m.index! + m[0].length;
    const akhir = i + 1 < awal.length ? awal[i + 1]!.index! : bersih.length;
    hasil.set(m[1]!, bersih.slice(mulai, akhir));
  });
  return hasil;
}

/** Target terbitan — `target:` matriks DAN `companion_target:`. */
function targetTerbitan(): string[] {
  const bersih = tanpaKomentar(publish);
  return [
    ...[...bersih.matchAll(/-\s*target:\s*([a-z0-9-]+)/g)].map((m) => m[1]!),
    ...[...bersih.matchAll(/companion_target:\s*([a-z0-9-]+)/g)].map((m) => m[1]!),
  ];
}

describe("Dockerfile: setiap tahap akhir image terbitan membawa stempel", () => {
  const tahap = tahapDockerfile();
  const target = targetTerbitan();

  it("matriks publish terbaca (penjaga yang membaca nol target tidak menjaga apa pun)", () => {
    expect(target).toEqual(
      expect.arrayContaining(["runner", "runner-operator", "migrator", "backup", "integrator"])
    );
  });

  it.each(targetTerbitan())("tahap `%s`: ARG → ENV → LABEL OCI", (nama) => {
    const isi = tahap.get(nama);
    expect(isi, `tahap ${nama} tidak ada di Dockerfile`).toBeDefined();
    for (const v of STAMP) {
      expect(isi, `${nama}: ARG ${v}`).toMatch(new RegExp(`^ARG ${v}=`, "m"));
      expect(isi, `${nama}: ENV ${v}=$${v}`).toMatch(new RegExp(`\\b${v}=\\$${v}\\b`));
    }
    for (const l of ["version", "revision", "created"]) {
      expect(isi, `${nama}: LABEL org.opencontainers.image.${l}`).toContain(
        `org.opencontainers.image.${l}=$`
      );
    }
  });

  it.each(targetTerbitan())("tahap `%s`: stempel SESUDAH `RUN` terakhir (cache tetap utuh)", (nama) => {
    const isi = tahap.get(nama)!;
    const argPertama = isi.search(/^ARG (APP_VERSION|GIT_SHA|BUILD_TIME)=/m);
    const runTerakhir = Math.max(...[...isi.matchAll(/^RUN\s/gm)].map((m) => m.index!), -1);
    expect(argPertama, `${nama}: tidak ada ARG stempel`).toBeGreaterThanOrEqual(0);
    expect(
      argPertama,
      `${nama}: ARG stempel mendahului RUN — setiap dorongan membatalkan cache lapisan itu`
    ).toBeGreaterThan(runTerakhir);
  });

  it("biner Go menanam stempel lewat -ldflags -X ke paket buildinfo", () => {
    const go = tahap.get("go-build")!;
    for (const [v, arg] of [
      ["Version", "APP_VERSION"],
      ["Sha", "GIT_SHA"],
      ["BuiltAt", "BUILD_TIME"],
    ] as const) {
      expect(go).toMatch(
        new RegExp(`-X \\S+/internal/buildinfo\\.${v}=\\$\\{${arg}\\}`),
      );
      expect(go).toMatch(new RegExp(`^ARG ${arg}=`, "m"));
    }
  });
});

describe("publish-image.yml: setiap langkah build meneruskan ketiga build-arg", () => {
  const bersih = tanpaKomentar(publish);
  const langkah = bersih.split(/\n\s*- (?=name:|uses:)/).filter((b) =>
    /uses:\s*docker\/build-push-action@/.test(b)
  );

  it("dua langkah build: target utama + pendamping", () => {
    expect(langkah.length).toBe(2);
    expect(langkah.some((l) => /target:\s*\$\{\{\s*matrix\.companion_target\s*\}\}/.test(l))).toBe(true);
  });

  it.each([0, 1])("langkah build #%i membawa APP_VERSION, GIT_SHA, BUILD_TIME", (i) => {
    const l = langkah[i]!;
    expect(l).toMatch(/build-args:\s*\|/);
    expect(l).toMatch(/APP_VERSION=\$\{\{\s*steps\.meta\.outputs\.version\s*\}\}/);
    expect(l).toMatch(/GIT_SHA=\$\{\{\s*github\.sha\s*\}\}/);
    expect(l).toMatch(/BUILD_TIME=\$\{\{\s*steps\.meta\.outputs\.build_time\s*\}\}/);
  });

  it("langkah meta menghasilkan build_time", () => {
    expect(bersih).toMatch(/echo "build_time=\$\(date -u \+%Y-%m-%dT%H:%M:%SZ\)" >> "\$GITHUB_OUTPUT"/);
  });
});

describe("tata letak stempel sama di TypeScript dan Go", () => {
  const b = { version: "0.12.1", shortSha: "abc1234", sha: "abc1234", builtAt: "2026-10-22T03:04:05Z" };

  it("label `v%s+%s` dan baris log `%s v%s (%s, built %s)`", () => {
    expect(goBuildinfo).toContain('fmt.Sprintf("v%s+%s", i.Version, i.ShortSha)');
    expect(buildLabel(b)).toBe("v0.12.1+abc1234");
    expect(goBuildinfo).toContain('fmt.Sprintf("%s v%s (%s, built %s)", service, i.Version, i.ShortSha, built)');
    expect(goBuildinfo).toContain('built = "unknown"');
    expect(buildBanner("svc-integrator", b)).toBe("svc-integrator v0.12.1 (abc1234, built 2026-10-22T03:04:05Z)");
  });

  it("identitas: `<kepala> <layanan> <label>`, batas yang sama", () => {
    expect(goBuildinfo).toContain('ekor := " " + service + " " + i.Label()');
    expect(goBuildinfo).toMatch(new RegExp(`IdentityMax\\s*=\\s*${IDENTITY_MAX_LENGTH}\\b`));
    expect(stampIdentity("tenant@h:1", "svc-integrator", b)).toBe("tenant@h:1 svc-integrator v0.12.1+abc1234");
  });

  it("pola pengurai konsol = pola yang dibuktikan tes Go", () => {
    const ts = /const POLA_STEMPEL = \/(.+)\/;/.exec(tsBuildinfo)?.[1];
    const go = /var polaStempel = regexp\.MustCompile\(`(.+)`\)/.exec(goBuildinfoTest)?.[1];
    expect(ts).toBeDefined();
    expect(go).toBe(ts);
  });

  it("variabel lingkungan yang dibaca sama", () => {
    for (const v of STAMP) {
      expect(goBuildinfo).toContain(`getenv("${v}")`);
      expect(tsBuildinfo).toContain(`env.${v}`);
    }
  });
});
