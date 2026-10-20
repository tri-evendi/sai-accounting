/**
 * VERSI GO DI IMAGE = VERSI GO DI `go.mod`.
 *
 * ══ KENAPA INI DIJAGA ══════════════════════════════════════════════════════
 * Tiga tempat menyebut versi Go, dan hanya dua di antaranya tidak bisa
 * menyimpang:
 *
 *   • `services/integrator/go.mod` — sumbernya;
 *   • `.github/workflows/go.yml` — membacanya DARI `go.mod`
 *     (`go-version-file`), jadi ia tidak bisa menyimpang;
 *   • `Dockerfile`, tahap `go-build` — DIKETIK, jadi ia bisa.
 *
 * Yang disimpangkan versi Go bukan kompilasi melainkan perilaku, dan justru
 * pada hal yang paling sulit dilihat: urutan iterasi map, tingkah GC, dan
 * `time` monotonik. Gerbang Go yang hijau di CI dengan Go 1.23 tidak
 * membuktikan apa pun tentang biner yang dibangun image dengan versi lain —
 * dan bedanya baru muncul di produksi, pada jalur yang paling tidak sering
 * dijalankan.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO } from "./akar-sumber";

const dockerfile = readFileSync(join(AKAR_REPO, "Dockerfile"), "utf8");
const goMod = readFileSync(join(AKAR_REPO, "services", "integrator", "go.mod"), "utf8");

describe("versi Go: image vs `go.mod`", () => {
  it("`go.mod` menyebut versinya secara eksplisit", () => {
    expect(/^go \d+\.\d+$/m.test(goMod), "`go <mayor>.<minor>` tidak ada di go.mod").toBe(true);
  });

  it("Dockerfile memakai image Go yang DIPATOK, bukan `latest`", () => {
    const m = /FROM golang:([^\s]+) AS go-build/.exec(dockerfile);
    expect(m, "tahap `go-build` tidak ada di Dockerfile").not.toBeNull();
    const tag = m![1]!;
    expect(tag, "`golang:latest` berpindah setiap kali upstream mendorong").not.toBe("latest");
    expect(/^\d+\.\d+/.test(tag), `tag \`${tag}\` tidak menyebut versi`).toBe(true);
  });

  it("keduanya menyebut mayor.minor yang SAMA", () => {
    const diMod = /^go (\d+\.\d+)$/m.exec(goMod)![1]!;
    const diImage = /FROM golang:(\d+\.\d+)/.exec(dockerfile)![1]!;
    expect(
      diImage,
      `Dockerfile membangun dengan Go ${diImage} sementara go.mod menyatakan ` +
        `${diMod}. Gerbang Go di CI membaca versinya dari go.mod, jadi biner ` +
        `produksi akan dibangun oleh versi yang TIDAK pernah menjalankan satu tes pun.`
    ).toBe(diMod);
  });

  it("biner Go dibangun statis", () => {
    /* `CGO_ENABLED=0` adalah seluruh alasan runtime-nya bisa tipis (§3.3):
       biner yang menautkan glibc menuntut image dasar yang glibc-nya cocok,
       dan ketidakcocokannya muncul sebagai "no such file or directory" pada
       biner yang JELAS ada. */
    expect(dockerfile).toMatch(/CGO_ENABLED=0 go build/);
  });
});
