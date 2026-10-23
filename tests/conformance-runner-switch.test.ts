/**
 * SAKELAR PELAKSANA KESESUAIAN DATA — `runner:` di contract/kinds.yaml (09 §3.3).
 *
 * Sapuan kesesuaian data punya dua pelaksana sejak 23 Okt 2026: Node
 * (`scripts/check-data-conformance.ts`, peran `conformance` di `svc-worker`)
 * dan Go (`internal/conformance`, jalur `tenant` di `svc-integrator`). Yang
 * memilih SATU nilai kontrak, dibaca kedua sisi dari commit yang sama — pola
 * `schedule.publisher` denyut.
 *
 * Bentuk gagal yang dijaga di sini tidak menghasilkan satu galat pun:
 *   • DUA pelaksana: dua jejak per putaran, dua sapuan berebut basis data
 *     yang juga melayani aplikasi — dan konsol menampilkan yang terakhir;
 *   • NOL pelaksana: sisi Node melewati sapuannya tanpa menerbitkan apa pun,
 *     atau menerbitkan `kind` yang tidak diklaim siapa pun — `/api/health`
 *     baru berbunyi `late` sembilan hari kemudian.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

import { KIND_RUNNERS, JOB_KINDS, SCHEDULED_KINDS } from "@sai/core/generated/job-kinds";
import { sightingFromRunDetails } from "@sai/core/build-info";
import { compareConformance } from "@/lib/conformance-parity";
import { AKAR_REPO } from "./akar-sumber";

const baca = (...p: string[]) => readFileSync(join(AKAR_REPO, ...p), "utf8");
const kode = (isi: string) => isi.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("kontrak: satu sakelar, dua pembaca", () => {
  it("`tenant.conformance` ber-`runner:` node|go, dan bukan kind berjadwal", () => {
    const y = load(baca("contract", "kinds.yaml")) as { kinds: Record<string, { runner?: string }> };
    expect(["node", "go"]).toContain(y.kinds["tenant.conformance"]!.runner);
    expect(KIND_RUNNERS["tenant.conformance"]).toBe(y.kinds["tenant.conformance"]!.runner);
    /* Dua sakelar untuk satu kind = dua jawaban atas "siapa memicunya". */
    expect(Object.keys(SCHEDULED_KINDS)).not.toContain("tenant.conformance");
    expect(JOB_KINDS["tenant.conformance"].lane).toBe("tenant");
  });

  it("Go membaca nilai yang SAMA dari bangkitannya", () => {
    const go = baca("services", "integrator", "internal", "contract", "jobs_gen.go");
    const nilai = KIND_RUNNERS["tenant.conformance"] === "go" ? "RunnerGo" : "RunnerNode";
    expect(go).toMatch(new RegExp(`KindTenantConformance:\\s+${nilai},`));
  });

  it("generator menolak nilai asing, `runner` + `schedule:`, dan `runner` pada penulis buku", () => {
    const gen = baca("scripts", "contract-generate.ts");
    expect(gen).toContain('const KIND_RUNNERS = ["node", "go"] as const;');
    expect(gen).toMatch(/runner\\?` dan \\?`schedule:\\?` bersamaan/);
    expect(gen).toMatch(/runner\\?` pada penulis buku/);
  });
});

describe("sisi Node: bertanya pada kontrak SEBELUM menyapu", () => {
  const skrip = kode(baca("scripts", "check-data-conformance.ts"));

  it("baris pertama `main()` adalah gerbang sakelarnya", () => {
    expect(skrip).toMatch(/async function main\(\) \{\n\s*if \(await serahkanKeGo\(\)\) return;/);
    expect(skrip).toMatch(/KIND_RUNNERS\["tenant\.conformance"\] !== "go"\) return false/);
  });

  it("ketika Go: MENERBITKAN satu pekerjaan berkunci jam, lalu keluar 0 — bukan sekadar melewati", () => {
    /* Melewati tanpa menerbitkan = NOL pelaksana. Kunci per jam UTC: container
       yang hidup-ulang berkali-kali dalam sejam tidak menumpuk putaran. */
    const i = skrip.indexOf("async function serahkanKeGo");
    const badan = skrip.slice(i, skrip.indexOf("\n}\n", i));
    expect(badan).toContain('kind: "tenant.conformance"');
    expect(badan).toContain("publishJob(");
    expect(badan).toMatch(/dedupeKey: `tenant\.conformance:\$\{butir\}`/);
    expect(badan).toMatch(/toISOString\(\)\.slice\(0, 13\)/);
    expect(badan).toContain("ambangPenampung: ambangPenampungMentah");
    expect(skrip).toMatch(/main\(\)\n\s*\.then\(\(\) => process\.exit\(0\)\)/);
  });

  it("pemicu mingguan di compose TIDAK berubah — yang berpindah hanya pelaksananya", () => {
    const compose = baca("docker-compose.yml");
    expect(compose).toContain("timeout -k 30 1800 bun run check-data-conformance");
    expect(compose).toContain("sleep 604800");
  });

  it("jejak Node menyebut pelaksananya", () => {
    expect(skrip).toContain('runner: "node"');
    expect(skrip).toContain('service: "svc-worker"');
  });
});

describe("sisi Go: diklaim selalu, dilaksanakan hanya bila sakelarnya `go`", () => {
  const handler = baca("services", "integrator", "internal", "tenantlane", "conformance.go");
  const runner = baca("services", "integrator", "internal", "tenantlane", "runner.go");

  it("jalur `tenant` mendaftarkan handler-nya (kind yang diterbitkan wajib punya pengklaim)", () => {
    expect(runner).toMatch(/contract\.KindTenantConformance:\s+handlerKesesuaian\(kolam\)/);
  });

  it("handler bertanya pada kontrak SEBELUM menyapu, dan menyelesaikan tanpa bekerja bila bukan Go", () => {
    const i = handler.indexOf("func handlerKesesuaian");
    const badan = handler.slice(i, handler.indexOf("\n}\n", i));
    const gerbang = badan.indexOf("if !GoRunsConformance()");
    expect(gerbang).toBeGreaterThan(-1);
    expect(gerbang).toBeLessThan(badan.indexOf("SweepAndRecord("));
    expect(badan.slice(gerbang, badan.indexOf("}", gerbang + 30))).toContain("return nil, nil");
    expect(handler).toMatch(/contract\.KindRunners\[contract\.KindTenantConformance\] == contract\.RunnerGo/);
  });

  it("batas serentak dibaca dari env yang sama dengan Node, dan compose meneruskannya ke svc-integrator", () => {
    expect(handler).toContain('os.Getenv("CONFORMANCE_CONCURRENCY")');
    const compose = baca("docker-compose.yml");
    const i = compose.indexOf("\n  svc-integrator:");
    expect(i).toBeGreaterThan(-1);
    const blok = compose.slice(i, compose.indexOf("\n  # ══", i + 10));
    expect(blok).toContain("CONFORMANCE_CONCURRENCY:");
  });
});

describe("pembanding paritas", () => {
  const a = [
    { key: "status-kontrak", judul: "Status kontrak di luar kosakata aplikasi", labels: ["K-1 → cancelled"] },
    { key: "akun-penampung", judul: "Akun penampung beban berskala material", labels: ["x", "y"] },
  ];

  it("setara bila pemeriksaan, judul, jumlah, dan setiap kalimat sama pada posisinya", () => {
    expect(compareConformance(a, structuredClone(a))).toEqual([]);
  });

  it("menyebut pemeriksaan yang hanya berbunyi di satu sisi", () => {
    expect(compareConformance(a, a.slice(0, 1))[0]).toMatch(/pemeriksaan yang berbunyi/);
  });

  it("URUTAN baris bermakna — bukan himpunan", () => {
    const b = structuredClone(a);
    b[1]!.labels.reverse();
    expect(compareConformance(a, b)).toHaveLength(2);
  });

  it("jumlah baris yang berbeda disebut sebagai jumlah, bukan hanya posisi", () => {
    const b = structuredClone(a);
    b[1]!.labels.push("z");
    expect(compareConformance(a, b)).toContain("akun-penampung: 2 baris di TS, 3 di Go");
  });
});

describe("konsol: versi layanan menurut PENULIS jejaknya", () => {
  it("jejak Go tercatat atas nama `svc-integrator`, jejak lama tetap `svc-worker`", () => {
    const t = new Date();
    const go = JSON.stringify({ build: "v0.18.0+abc1234", runner: "go", service: "svc-integrator" });
    expect(sightingFromRunDetails(go, t, "svc-worker", "conformance").service).toBe("svc-integrator");
    const lama = JSON.stringify({ build: "v0.18.0+abc1234" });
    expect(sightingFromRunDetails(lama, t, "svc-worker", "conformance").service).toBe("svc-worker");
    const aneh = JSON.stringify({ build: "v0.18.0+abc1234", service: "Svc Palsu!" });
    expect(sightingFromRunDetails(aneh, t, "svc-worker", "conformance").service).toBe("svc-worker");
  });
});
