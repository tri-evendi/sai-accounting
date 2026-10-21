/**
 * PENJAGA — pemeliharaan & sinyal utama antrean (04 §8.9, 02 §14).
 *
 * Tiga hal dijaga di sini, dan ketiganya pernah ada sebagai kode yang benar
 * TANPA pemanggil — bentuk kegagalan yang paling sulit dilihat, karena setiap
 * berkasnya lulus dibaca sendiri-sendiri:
 *
 *   • `reclaimStaleJobs` yang tidak dipanggil siapa pun berarti pekerjaan dari
 *     pekerja yang mati tidak pernah pulang, dan satu-satunya gejalanya adalah
 *     pekerjaan yang hilang;
 *   • `archiveDoneJobs` yang predikatnya melebar dari `done` akan membuang
 *     justru baris gagal — isi paling berharga di tabel itu;
 *   • umur tertua yang dilaporkan `0` saat antrean kosong terbaca HIJAU tepat
 *     ketika penerbitnya mati.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  QUEUE_AGE_LATE_SECONDS,
  QUEUE_AGE_WARN_SECONDS,
  laneQueueHealth,
  queueHealth,
} from "@sai/core/queue-health";
import { DONE_RETENTION_DAYS, LEASE_STALE_MS } from "@sai/core/job-backoff";
import { UPKEEP_MS } from "../workers/runner";

const akar = process.cwd();
const baca = (...p: string[]) => readFileSync(join(akar, ...p), "utf8");

const kode = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

const QUEUE = kode(baca("packages", "platform", "src", "job-queue.ts"));
const RUNNER = kode(baca("workers", "runner.ts"));
const REPORT = kode(baca("src", "lib", "health-report.ts"));

/** Badan `{ … }` yang dibuka pada indeks `mulai` — pencocok kurung sederhana. */
function blok(sumber: string, pembuka: string): string {
  const i = sumber.indexOf(pembuka);
  expect(i, `tidak menemukan \`${pembuka}\``).toBeGreaterThan(-1);
  let dalam = 0;
  for (let k = i + pembuka.length - 1; k < sumber.length; k += 1) {
    if (sumber[k] === "{") dalam += 1;
    else if (sumber[k] === "}") {
      dalam -= 1;
      if (dalam === 0) return sumber.slice(i, k + 1);
    }
  }
  throw new Error(`kurung tidak tertutup sesudah \`${pembuka}\``);
}

describe("umur tertua: ambang hanya berlaku bila ada yang menunggu", () => {
  const kini = new Date("2026-10-20T10:00:00Z");
  const lalu = (detik: number) => new Date(kini.getTime() - detik * 1000);

  it("antrean kosong → `idle`, dan umurnya `null` BUKAN nol", () => {
    const v = laneQueueHealth("ledger", 0, null, kini);
    expect(v.status).toBe("idle");
    expect(v.ageSeconds).toBeNull();
  });

  it("umur nol yang dilaporkan sebagai angka akan terbaca sebagai antrean sehat", () => {
    // Inilah sebabnya `ageSeconds` boleh `null`: `0` detik adalah jawaban yang
    // SAH untuk antrean yang baru saja terisi, jadi ia tidak bisa sekaligus
    // berarti "tidak ada apa-apa di sini".
    expect(laneQueueHealth("ledger", 1, kini, kini).ageSeconds).toBe(0);
    expect(laneQueueHealth("ledger", 1, kini, kini).status).toBe("ok");
  });

  it("menunggu > 0 tapi tanpa tanggal tertua tetap `idle`, bukan melempar", () => {
    expect(laneQueueHealth("bulk", 3, null, kini).status).toBe("idle");
  });

  it("ambang peringatan & bunyi tepat di tepinya", () => {
    expect(laneQueueHealth("x", 1, lalu(QUEUE_AGE_WARN_SECONDS - 1), kini).status).toBe("ok");
    expect(laneQueueHealth("x", 1, lalu(QUEUE_AGE_WARN_SECONDS), kini).status).toBe("warn");
    expect(laneQueueHealth("x", 1, lalu(QUEUE_AGE_LATE_SECONDS - 1), kini).status).toBe("warn");
    expect(laneQueueHealth("x", 1, lalu(QUEUE_AGE_LATE_SECONDS), kini).status).toBe("late");
  });

  it("peringatan berbunyi SEBELUM alarm", () => {
    expect(QUEUE_AGE_WARN_SECONDS).toBeLessThan(QUEUE_AGE_LATE_SECONDS);
  });

  it("tanggal di masa depan tidak menghasilkan umur negatif", () => {
    const v = laneQueueHealth("x", 1, new Date(kini.getTime() + 60_000), kini);
    expect(v.ageSeconds).toBe(0);
  });
});

describe("ringkasan lintas jalur: TERBURUK, bukan rata-rata", () => {
  const kini = new Date("2026-10-20T10:00:00Z");
  const tua = new Date(kini.getTime() - QUEUE_AGE_LATE_SECONDS * 1000);

  it("enam jalur sehat dan satu macet adalah insiden, bukan 86% sehat", () => {
    const lanes = [
      laneQueueHealth("a", 0, null, kini),
      laneQueueHealth("b", 1, kini, kini),
      laneQueueHealth("c", 1, tua, kini),
    ];
    expect(queueHealth(lanes).status).toBe("late");
  });

  it("tanpa jalur sama sekali → `idle`", () => {
    expect(queueHealth([]).status).toBe("idle");
  });

  it("ambang ikut dilaporkan supaya pembacanya tidak menebak", () => {
    const v = queueHealth([]);
    expect(v.warnAfterSeconds).toBe(QUEUE_AGE_WARN_SECONDS);
    expect(v.lateAfterSeconds).toBe(QUEUE_AGE_LATE_SECONDS);
  });
});

describe("potret antrean: satu kueri, dan hanya yang jatuh tempo", () => {
  const POTRET = blok(QUEUE, "export async function queueSnapshot(");

  it("SATU perjalanan ke basis data, bukan satu per jalur", () => {
    // `control` juga melayani autentikasi (§4), jadi tujuh kueri tiap kali ada
    // yang membuka halaman kesehatan adalah ongkos yang dibayar tabel yang
    // paling tidak boleh melambat.
    expect((POTRET.match(/\$queryRaw/g) ?? []).length).toBe(1);
    expect(POTRET).toContain("GROUP BY kind");
  });

  it("hanya `queued` yang `run_after`-nya sudah lewat", () => {
    expect(POTRET).toContain("status = 'queued'");
    expect(POTRET).toContain("run_after <= now()");
  });

  it("setiap jalur dipulangkan, termasuk yang kosong", () => {
    expect(POTRET).toContain("Object.keys(JOB_LANES)");
  });

  it("`kind` yang tak dikenal tidak dilewatkan diam-diam", () => {
    expect(POTRET).toContain("JALUR_TAK_DIKENAL");
  });
});

describe("pengarsipan: `done` saja, selamanya", () => {
  const ARSIP = blok(QUEUE, "export async function archiveDoneJobs(");

  it("predikatnya `status = 'done'`", () => {
    expect(ARSIP).toContain("status = 'done'");
  });

  it("tidak pernah menyentuh `dead` maupun `failed`", () => {
    expect(ARSIP).not.toContain("dead");
    expect(ARSIP).not.toContain("failed");
    expect(ARSIP).not.toContain("IN (");
  });

  it("dibatasi umur, bukan jumlah — penghapusan tanpa ambang adalah TRUNCATE", () => {
    expect(ARSIP).toContain("finished_at <");
  });

  it("retensinya nyata", () => {
    expect(DONE_RETENTION_DAYS).toBeGreaterThan(0);
  });
});

describe("pemeliharaan sungguh DIPANGGIL, dan oleh setiap pelari", () => {
  it("pelari memanggil keduanya", () => {
    expect(RUNNER).toContain("reclaimStaleJobs()");
    expect(RUNNER).toContain("archiveDoneJobs()");
  });

  it("putaran pertama SEGERA, lalu berkala", () => {
    expect(RUNNER).toContain("await upkeep(lane)");
    expect(RUNNER).toContain("setInterval(() => void upkeep(lane), UPKEEP_MS)");
  });

  it("intervalnya dibersihkan saat pelari berhenti", () => {
    expect(RUNNER).toContain("clearInterval(pemeliharaan)");
  });

  it("TIDAK bersarang di dalam pagar jalur tunggal-instans", () => {
    /*
     * Penyebaran yang kebetulan hanya memuat jalur jamak akan berjalan tanpa
     * pernah memulangkan satu lease pun, dan kegagalan itu tidak punya gejala
     * selain pekerjaan yang hilang.
     */
    const pagar = blok(RUNNER, "if (spec.singleInstance) {");
    expect(pagar).not.toContain("upkeep");
  });

  it("putarannya lebih rapat daripada ambang basi lease", () => {
    expect(UPKEEP_MS).toBeLessThan(LEASE_STALE_MS);
  });

  it("galat pemeliharaan tidak menjatuhkan pelari yang sedang sehat", () => {
    const pass = blok(RUNNER, "async function upkeep(");
    expect(pass).toContain("catch");
    expect(pass).not.toContain("throw");
  });
});

describe("probe publik: satu kata, dan #137 dihormati", () => {
  it("membawa bidang `queue`", () => {
    expect(REPORT).toContain("queue: QueueStatus");
    expect(REPORT).toContain("queue: queueStatus");
  });

  it("TANPA angka — volume pemakaian tidak bocor ke permukaan publik (#317)", () => {
    // Sebab yang sama membuat `outboxCount` surel tinggal di konsol operator.
    expect(REPORT).not.toContain("ageSeconds");
    expect(REPORT).not.toContain("waiting");
    expect(REPORT).not.toContain("lanes");
  });

  it("gagal membacanya → `unknown`, bukan antrean kosong", () => {
    const fn = blok(REPORT, "async function queue(): Promise<QueueStatus> {");
    expect(fn).toContain('status: "unknown"');
  });

  it("kegagalannya TIDAK menjatuhkan probe — jalur pekerja container lain", () => {
    const fn = blok(REPORT, "async function queue(): Promise<QueueStatus> {");
    expect(fn).not.toContain("503");
    expect(fn).not.toContain('status: "error"');
  });
});

describe("kalimat konsol ada di ketiga kamus", () => {
  const kunci = [
    "queueHeading",
    "queueNote",
    "queueColLane",
    "queueColWaiting",
    "queueColAge",
    "queueStatusIdle",
    "queueStatusOk",
    "queueStatusWarn",
    "queueStatusLate",
    "queueUnavailable",
  ];
  for (const lokal of ["id", "en", "zh"]) {
    it(`${lokal} lengkap`, () => {
      const kamus = JSON.parse(
        baca("packages", "core", "src", "i18n", "dictionaries", `${lokal}.json`)
      ) as { operator: { scheduler: Record<string, string> } };
      for (const k of kunci) expect(kamus.operator.scheduler[k]).toBeTypeOf("string");
    });
  }

  it("catatannya menyebut lubang antrean-kosong, bukan hanya ambangnya", () => {
    const kamus = JSON.parse(
      baca("packages", "core", "src", "i18n", "dictionaries", "id.json")
    ) as { operator: { scheduler: Record<string, string> } };
    expect(kamus.operator.scheduler.queueNote).toContain("{warn}");
    expect(kamus.operator.scheduler.queueNote).toContain("{late}");
    expect(kamus.operator.scheduler.queueNote).toMatch(/penerbit/i);
  });
});
