/**
 * PENJAGA tahap 1a — jalur `ledger` sebagai layanan, dan penjadwal yang
 * berhenti memposting (02 §5).
 *
 * ⚠ Yang dijaga di sini adalah DUA PELAKSANA UNTUK SATU PEKERJAAN, dan itu
 * bukan kekhawatiran teoretis: `recurring:run` sudah berjalan sebagai langkah
 * di `job-scheduler` sebelum commit ini, dan `workers/ledger.ts` mengerjakan
 * hal yang sama. Menambahkan layanannya tanpa mencabut langkahnya berarti dua
 * proses memanggil `runRecurringForCompany` untuk buku yang sama — dan yang
 * menahannya hanya kunci unik `(template_id, occurrence_date)` di lapis
 * paling dalam. Bertahan pada constraint bukan rancangan; itu kecelakaan yang
 * belum terjadi.
 *
 * Yang kedua: penerbit dan pelaksana harus SEPAKAT. Payload yang berbeda
 * bentuk membuat setiap pekerjaan melempar, dan daftar perusahaan yang berbeda
 * membuat pekerjaan terbit lalu selalu ditolak pelaksananya — dua kegagalan
 * yang hanya muncul di produksi, sebab keduanya lulus `tsc`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const akar = process.cwd();
const baca = (...p: string[]) => readFileSync(join(akar, ...p), "utf8");

const kode = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

const COMPOSE = baca("docker-compose.yml");
/** Compose tanpa komentarnya — kata di komentar bukan kata di konfigurasi. */
const COMPOSE_KODE = COMPOSE.split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");
const ONPREM = baca("docker-compose.onprem.yml")
  .split("\n")
  .filter((l) => !/^\s*#/.test(l))
  .join("\n");
const PENERBIT = kode(baca("scripts", "publish-recurring.ts"));
const PELAKSANA = kode(baca("workers", "ledger.ts"));
const LANGSUNG = kode(baca("scripts", "run-recurring.ts"));
const PKG = JSON.parse(baca("package.json")) as {
  scripts: Record<string, string>;
};

/** Blok satu layanan compose, berbasis indentasi. */
const blokLayanan = (berkas: string, layanan: string): string => {
  const baris = berkas.split("\n");
  const i = baris.findIndex((l) => l === `  ${layanan}:`);
  expect(i, `layanan \`${layanan}\` tidak ada`).toBeGreaterThan(-1);
  const akhir = baris.findIndex((l, j) => j > i && /^  \S/.test(l));
  return baris.slice(i, akhir < 0 ? undefined : akhir).join("\n");
};

describe("satu pelaksana, bukan dua", () => {
  const scheduler = blokLayanan(COMPOSE_KODE, "job-scheduler");

  it("penjadwal MENERBITKAN", () => {
    expect(scheduler).toContain("bun run recurring:publish");
  });

  it("penjadwal tidak lagi MELAKSANAKAN", () => {
    expect(scheduler).not.toContain("bun run recurring:run");
  });

  it("tidak ada layanan lain yang menjalankan pelaksana langsung", () => {
    expect(COMPOSE_KODE).not.toContain("recurring:run");
    expect(ONPREM).not.toContain("recurring:run");
  });

  it("`recurring:run` tetap ada sebagai alat tangan, bukan dihapus", () => {
    // Mesinnya SATU; yang berbeda hanya pemicunya. Menghapus jalur tangan
    // berarti mencabut `--dry` dan jalan keluar ketika antreannya macet.
    expect(PKG.scripts["recurring:run"]).toBe("tsx scripts/run-recurring.ts");
    expect(PKG.scripts._recurring_run_note).toContain("alat TANGAN");
  });
});

describe("penerbit tidak menyentuh satu pun buku", () => {
  it("tanpa konteks perusahaan, tanpa mesin berulang, tanpa klien buku", () => {
    for (const terlarang of [
      "runWithCompany",
      "recurring-run",
      "lib/prisma",
      "postForSource",
    ]) {
      expect(PENERBIT, `penerbit mengimpor \`${terlarang}\``).not.toContain(terlarang);
    }
  });

  it("satu-satunya tulisannya adalah baris antrean", () => {
    expect(PENERBIT).toContain("publishJob({");
    expect(PENERBIT).toContain('kind: "ledger.recurring"');
  });

  it("hanya membaca registry di basis data KENDALI", () => {
    expect(PENERBIT).toContain("controlDb.company.findMany");
  });
});

describe("penerbit & pelaksana sepakat", () => {
  it("payload-nya bentuk yang sama", () => {
    expect(PENERBIT).toContain("payload: { companyId: company.id, today }");
    expect(PELAKSANA).toContain("companyId?: number; today?: string");
  });

  it("daftar perusahaannya saringan yang sama dengan jalur tangan", () => {
    // Dua daftar yang berbeda berarti pekerjaan yang terbit lalu selalu
    // dilempar pelaksananya — gagal berulang sampai `dead`, tiap jam.
    for (const sumber of [PENERBIT, LANGSUNG]) {
      expect(sumber).toContain("isActive: true, isDemo: false");
    }
  });

  it("pelaksana membaca `slug`/`databaseName` dari kendali, bukan dari payload", () => {
    // Payload datang dari penerbit dan bisa basi (#104).
    expect(PELAKSANA).toContain("controlDb.company.findUnique");
    expect(PENERBIT).not.toContain("databaseName");
  });
});

describe("kunci idempotensi: berbutir JAM, di UTC", () => {
  it("butirnya jam, bukan hari", () => {
    // Butir HARI membuat putaran pertama hari itu satu-satunya yang pernah
    // menerbitkan — templat yang diaktifkan tengah hari menunggu sampai besok.
    expect(PENERBIT).toContain("toISOString().slice(0, 13)");
  });

  it("kuncinya memuat kind, perusahaan, dan butir waktunya", () => {
    expect(PENERBIT).toContain("dedupeKey: `ledger.recurring:${company.id}:${butir}`");
  });

  it("UTC, sama seperti mesin berulangnya sendiri", () => {
    // `src/lib/recurring.ts` menghitung batas hari di UTC; kunci berbutir waktu
    // lokal akan menyimpang tepat di batas hari.
    expect(baca("src", "lib", "recurring.ts")).toContain("Date.UTC(");
    expect(PENERBIT).toContain("jamUtc");
  });

  it("satu stempel waktu untuk seluruh putaran", () => {
    // Putaran yang melewati tengah malam di tengah daftar akan memberi separuh
    // daftar tanggal berikutnya.
    expect(PENERBIT).toContain("const saat = new Date();");
    expect(PENERBIT).toContain("const today = saat.toISOString();");
  });
});

describe("layanan `svc-ledger`", () => {
  const svc = blokLayanan(COMPOSE_KODE, "svc-ledger");

  it("`svc-`, bukan `job-`: ia berjalan terus, tidak sekali-jalan", () => {
    expect(COMPOSE).toContain("  svc-ledger:");
    expect(COMPOSE).not.toContain("  job-ledger:");
  });

  it("menjalankan pelari jalur, bukan skrip langsung", () => {
    expect(svc).toContain('command: ["bun", "run", "jobs:run:ledger"]');
    expect(PKG.scripts["jobs:run:ledger"]).toBe("bun workers/ledger.ts");
  });

  it("image `migrator` — ia butuh sumber TS, bukan keluaran `next build`", () => {
    expect(svc).toContain("target: migrator");
    expect(svc).toContain("-migrator:${SAI_TAG");
  });

  it("menunggu migration selesai sebelum menyentuh antrean", () => {
    expect(svc).toContain("migrate:");
    expect(svc).toContain("condition: service_completed_successfully");
  });

  it("dihidupkan ulang sendiri, dan diberi waktu berhenti dengan sopan", () => {
    expect(svc).toContain("restart: unless-stopped");
    expect(svc).toContain("stop_grace_period:");
  });

  it("TIDAK diberi replika — jalurnya tunggal-instans", () => {
    // Instans kedua keluar sendiri (pagar `pg_try_advisory_lock`), jadi
    // menaikkan replika hanya menghasilkan satu container yang keluar.
    expect(svc).not.toContain("replicas");
    expect(baca("contract", "kinds.yaml")).toMatch(/ledger:[\s\S]{0,200}single_instance:\s*true/);
  });

  it("ikut dipasang di on-premise", () => {
    // Tanpa layanan ini, penjadwal yang hanya menerbitkan berarti dokumen
    // berulang tidak pernah terbit — dan tidak ada halaman yang rusak untuk
    // mengabarkannya.
    expect(ONPREM).toContain("  svc-ledger:");
    expect(blokLayanan(ONPREM, "svc-ledger")).toContain("pull_policy: always");
  });
});
