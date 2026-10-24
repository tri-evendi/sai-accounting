/**
 * PENJAGA atas gerbang rilis nomor DUA — `.github/workflows/go.yml`.
 *
 * ══ KENAPA GERBANGNYA SENDIRI BUTUH PENJAGA ═══════════════════════════════
 * Berkas workflow itu membuat empat klaim di dalam komentarnya, dan tidak satu
 * pun ditegakkan apa pun sampai berkas ini ada. Klaim yang tidak ditegakkan
 * akan luntur dengan cara yang paling sunyi: seseorang menambahkan `paths:`
 * untuk mempercepat CI, dan gerbangnya berhenti berjalan pada hari ia
 * dibutuhkan — tanpa satu baris merah di mana pun.
 *
 * Tiga di antaranya khas gerbang: ia harus BERJALAN, ia harus berjalan pada
 * versi yang sama dengan yang dipakai orang di mesinnya, dan ia tidak boleh
 * bergantung pada hal-hal di luar kendali kita.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO } from "./akar-sumber";

const wf = readFileSync(join(AKAR_REPO, ".github/workflows/go.yml"), "utf8");
const pkg = readFileSync(join(AKAR_REPO, "package.json"), "utf8");

/** Baris workflow tanpa komentar — setiap klaim di bawah MENGHITUNG atau menyangkal. */
const yaml = wf
  .split("\n")
  .filter((b) => !b.trim().startsWith("#"))
  .join("\n");

describe("gerbang Go harus BERJALAN", () => {
  it("tanpa `paths:` filter — dan itu klaim yang ditulis workflow-nya sendiri", () => {
    /*
     * Filter jalur akan membuat gerbang ini DILEWATI pada PR yang mengubah
     * `contract/kinds.yaml` tanpa menyentuh `services/` — padahal itu PERSIS
     * perubahan yang bisa membuat berkas bangkitan Go basi. Jalannya murah;
     * yang mahal adalah gerbang yang tidak berjalan pada hari ia dibutuhkan.
     */
    expect(yaml).not.toMatch(/^\s*paths(-ignore)?:/m);
  });

  it("berjalan pada PR promosi ke `main`", () => {
    /* Keputusan pemilik 24 Okt 2026: merge ke `develop` tidak menunggu CI;
       gerbang ini berjalan pada PR ke `main`. Hasil GABUNGAN tetap teruji —
       `pull_request` menjalankan commit gabungan `develop` ke `main`, dan
       satu-satunya build yang pernah gagal di repo ini gagal di hasil gabungan
       sementara setiap cabangnya hijau sendiri-sendiri. */
    expect(yaml).toMatch(/pull_request:\s*\n\s*branches: \[main\]/);
  });

  it("empat langkah gerbangnya ada, bukan tiga", () => {
    /* `go test` tanpa `go vet` dan tanpa `golangci-lint` adalah satu per tiga
       dari gerbang yang AGENTS.md janjikan; `go mod tidy` menjaga `go.sum`
       yang di-commit cocok dengan impor yang sungguh ada. */
    for (const langkah of ["go mod tidy", "go vet ./...", "go test ./...", "golangci-lint"]) {
      expect(yaml, langkah).toContain(langkah);
    }
  });
});

describe("versinya satu, dan dibaca dari satu tempat", () => {
  it("versi Go DIBACA dari `go.mod`, tidak diketik di workflow", () => {
    /* Dua tempat yang menyebut versi Go adalah dua tempat yang bisa
       menyimpang — dan yang menyimpang akan menguji kode ini di versi yang
       bukan versi image. */
    expect(yaml).toContain("go-version-file: services/integrator/go.mod");
    expect(yaml).not.toMatch(/go-version:\s*['"]?\d/);
  });

  it("versi `golangci-lint` di CI = versi yang disuruh dipasang di mesin sendiri", () => {
    /*
     * Keduanya memang ditulis dua kali — versi action tidak bisa dibaca dari
     * berkas lain — jadi yang menjaganya penjaga ini. Linter versi berbeda
     * menemukan temuan berbeda: gerbang yang hijau di mesin lalu merah di CI
     * (atau sebaliknya) adalah gerbang yang orang berhenti percayai.
     */
    const diCI = yaml.match(/version:\s*(v[\d.]+)/)?.[1];
    const diPkg = pkg.match(/golangci-lint@(v[\d.]+)/)?.[1];
    expect(diCI, "versi di workflow").toBeTruthy();
    expect(diPkg, "versi di `_go_note` package.json").toBeTruthy();
    expect(diCI).toBe(diPkg);
  });

  it("versinya DIPATOK, bukan `latest`", () => {
    /* `latest` berarti gerbang yang bisa merah besok tanpa satu baris kode
       berubah — dan kemerahan yang tidak disebabkan siapa pun adalah kemerahan
       yang akhirnya diabaikan. */
    expect(yaml).not.toMatch(/version:\s*latest/);
  });
});

describe("gerbangnya tidak boleh bergantung pada jaringan ke luar GitHub", () => {
  it("`verify: false` — validasi skema yang MENGUNDUH skema dimatikan", () => {
    /*
     * Bawaan action menjalankan `golangci-lint config verify`, yang mengunduh
     * skema JSON dari `golangci-lint.run` SEBELUM satu linter pun berjalan.
     * Pada 20 Okt 2026 unduhan itu timeout DUA KALI dalam tiga jalan, pada PR
     * yang tidak menyentuh satu baris Go — dan keduanya hijau pada percobaan
     * ulang tanpa satu baris diubah.
     *
     * Itu bentuk kegagalan yang paling mahal di repo ini: ia terbaca seperti
     * kode rusak padahal bukan. Gerbang yang merah karena situs pihak ketiga
     * lambat adalah gerbang yang orang belajar mengulang tanpa membaca — lalu
     * suatu hari mengulang kemerahan yang sungguhan.
     */
    expect(yaml).toMatch(/verify:\s*false/);
  });

  it("kesembilan linter TETAP berjalan — yang dimatikan hanya validasi skemanya", () => {
    /*
     * Pembuktian bahwa `verify: false` tidak melemahkan gerbangnya: daftar
     * linternya ada di `.golangci.yml`, dan ia tidak disentuh. `gofmt`
     * termasuk, dan itu yang paling penting di antaranya — `gofmt -l` keluar
     * dengan kode 0 meski menyebut berkas yang belum di-format, jadi ia HARUS
     * hidup di dalam `golangci-lint` dan tidak sebagai perintah terpisah.
     */
    const cfg = readFileSync(join(AKAR_REPO, "services/integrator/.golangci.yml"), "utf8");
    for (const linter of [
      "errcheck",
      "govet",
      "staticcheck",
      "ineffassign",
      "unused",
      "errorlint",
      "gosec",
      "bodyclose",
      "gofmt",
    ]) {
      expect(cfg, linter).toContain(linter);
    }
  });
});
