/**
 * PENJAGA saluran rilis on-premise (tahap D, rancangan 09 §9).
 *
 * Dua kegagalan yang dijaga, dan keduanya tidak punya permukaan di SaaS:
 *
 *   • tag git `v*` yang tidak menerbitkan apa pun — customer on-premise diberi
 *     tahu "pasang 0.11.0" dan `docker compose pull` menjawab `manifest
 *     unknown`; atau sebaliknya, tag pada commit lama yang ikut menggeser
 *     `:latest` dan diam-diam memundurkan SaaS;
 *   • bundel luring yang kehilangan satu image, ditemukan SESUDAH bundel
 *     menyeberang ke mesin tanpa jaringan — titik termahal untuk menemukannya.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO } from "./akar-sumber";

const wfMentah = readFileSync(join(AKAR_REPO, ".github/workflows/publish-image.yml"), "utf8");
const wf = wfMentah
  .split("\n")
  .filter((b) => !b.trim().startsWith("#"))
  .join("\n");
const skrip = readFileSync(join(AKAR_REPO, "scripts/onprem-offline-bundle.sh"), "utf8");
const skripKode = skrip
  .split("\n")
  .filter((b) => !/^\s*#/.test(b))
  .join("\n");

/** Blok satu job di workflow (berbasis indentasi). */
const job = (nama: string): string => {
  const baris = wf.split("\n");
  const i = baris.findIndex((l) => l === `  ${nama}:`);
  if (i < 0) return "";
  const akhir = baris.findIndex((l, j) => j > i && /^ {2}\S/.test(l));
  return baris.slice(i, akhir < 0 ? undefined : akhir).join("\n");
};

describe("saluran stabil: tag git `v*`", () => {
  it("workflow publish dipicu tag `v*` DAN tetap dipicu `main`", () => {
    expect(wf).toMatch(/push:\s*\n\s*branches: \[main\]\s*\n\s*tags: \["v\*"\]/);
  });

  it("tag yang tidak sama dengan package.json DITOLAK", () => {
    expect(wf).toContain('"${GITHUB_REF_NAME#v}" != "$version"');
    expect(wf).toMatch(/rilis ditolak\."\s*\n\s*exit 1/);
  });

  it("tag git TIDAK menggeser `:latest` — hanya `main` yang boleh", () => {
    expect(wf).toContain('[ "$GITHUB_REF_TYPE" = "tag" ] || echo "${base}:latest"');
    // Versi persis selalu terbit — itulah yang dipatok `SAI_TAG` on-premise.
    expect(wf).toContain('echo "${base}:${version}"');
    expect(wf).toContain("tags: ${{ steps.meta.outputs.tags }}");
  });
});

describe("bundel luring", () => {
  const blok = job("offline-bundle");

  it("ada job-nya, hanya untuk tag, dan MENUNGGU semua image terbit", () => {
    expect(blok, "job offline-bundle tidak ada").not.toBe("");
    expect(blok).toContain("if: github.ref_type == 'tag'");
    expect(blok).toContain("needs: publish");
    expect(blok).toContain("sh scripts/onprem-offline-bundle.sh");
    expect(blok).toMatch(/gh release (create|upload)/);
  });

  it("daftar image dibaca dari compose yang DIKIRIM, bukan ditulis tangan", () => {
    expect(skripKode).toMatch(
      /-f docker-compose\.yml -f docker-compose\.onprem\.yml --profile perkakas[\s\S]{0,40}config --images/,
    );
    expect(skripKode).not.toMatch(/sai-accounting-(migrator|backup|integrator):/);
  });

  it("memuat `docker save`, SHA-256, dan compose on-premise", () => {
    expect(skripKode).toContain('docker save "$img"');
    expect(skripKode).toMatch(/sha256sum -- .*> SHA256SUMS/);
    expect(skripKode).toContain("cp docker-compose.yml docker-compose.onprem.yml");
  });

  it("menolak `latest` dan image SAI yang tidak bertag versi persis", () => {
    expect(skripKode).toMatch(/latest\|stable\|/);
    expect(skripKode).toContain('*sai-accounting*) die "image SAI');
    expect(skripKode).toMatch(/JUMLAH_SAI" -ge 4/);
  });

  it("tidak pernah MEMBANGUN — bundel berisi image yang sama dengan registry", () => {
    expect(skripKode).not.toMatch(/docker (compose )?build/);
  });

  it("berhenti pada galat pertama", () => {
    expect(skrip).toMatch(/^set -eu$/m);
  });
});
