/**
 * PENJAGA — gerbang skema saat boot (02 §12).
 *
 * Gerbang ini menggantikan `service_completed_successfully` pada container
 * `migrate`, dan nilainya seluruhnya ada pada ARAH mana yang memblokir. Salah
 * arah punya dua akibat yang dua-duanya mahal:
 *
 *   • terlalu longgar → image yang lebih baru daripada skemanya menulis kolom
 *     yang belum ada, dan kegagalannya TIDAK seragam: halaman yang tidak
 *     menyentuh kolom baru tetap sempurna, jadi yang terlihat adalah aplikasi
 *     "sebagian rusak" — dan sebagian rusak pada pembukuan berarti ada angka
 *     yang masuk dan ada yang diam-diam tidak;
 *   • terlalu ketat → rollback darurat ikut terblokir, tepat pada saat jalan
 *     keluar dari insiden paling dibutuhkan.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { vonisVersi } from "@sai/core/schema-version";
import { MIGRATION_TERAKHIR } from "@sai/core/migration-manifest";

const akar = process.cwd();
const GATE = readFileSync(join(akar, "packages", "platform", "src", "schema-gate.ts"), "utf8");
const REPORT = readFileSync(join(akar, "src", "lib", "health-report.ts"), "utf8");
const ROUTE = readFileSync(join(akar, "src", "app", "api", "health", "route.ts"), "utf8");

const kode = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");

describe("vonis versi: arah yang menentukan", () => {
  const diharapkan = "0006_jobs";

  it("sepadan → mutakhir", () => {
    expect(vonisVersi({ terapan: 6, menggantung: 0, terakhir: "0006_jobs" }, diharapkan)).toBe(
      "mutakhir"
    );
  });

  it("skema lebih tua dari image → tertinggal", () => {
    expect(vonisVersi({ terapan: 5, menggantung: 0, terakhir: "0005_jejak_putaran" }, diharapkan)).toBe(
      "tertinggal"
    );
  });

  it("skema lebih baru dari image → mendahului (rollback)", () => {
    expect(vonisVersi({ terapan: 7, menggantung: 0, terakhir: "0007_nanti" }, diharapkan)).toBe(
      "mendahului"
    );
  });

  it("migration menggantung mengalahkan perbandingan nama", () => {
    // Keadaan skemanya tidak diketahui; nama terakhir tidak bisa menjawab apa pun.
    expect(vonisVersi({ terapan: 6, menggantung: 1, terakhir: "0006_jobs" }, diharapkan)).toBe(
      "menggantung"
    );
  });

  it("tidak terbaca dibedakan dari tertinggal", () => {
    expect(vonisVersi(null, diharapkan)).toBe("tak_terbaca");
  });
});

describe("gerbang: hanya dua arah yang memblokir", () => {
  const cabang = (status: string): string => {
    const i = GATE.indexOf(`status === "${status}"`);
    expect(i, status).toBeGreaterThan(-1);
    return kode(GATE.slice(i, GATE.indexOf("\n  }", i)));
  };

  it("`tertinggal` MEMBLOKIR", () => {
    expect(cabang("tertinggal")).toContain("serve: false");
  });

  it("`menggantung` MEMBLOKIR", () => {
    expect(cabang("menggantung")).toContain("serve: false");
  });

  it("`mendahului` TIDAK memblokir — rollback harus tetap bisa", () => {
    /* Expand/contract memang dirancang supaya skema baru tetap terbaca kode
       lama. Memblokirnya akan menutup jalan keluar dari insiden. */
    expect(cabang("mendahului")).toContain("serve: true");
  });

  it("`tak_terbaca` TIDAK memblokir — itu perlombaan waktu, bukan keadaan", () => {
    /* Basis data yang belum siap saat container baru naik adalah keadaan normal
       selama beberapa detik. Memblokirnya membuat setiap deploy gagal secara
       acak. Probe kendali yang sudah ada yang menangani "benar-benar tak
       terjangkau". */
    expect(cabang("tak_terbaca")).toContain("serve: true");
  });

  it("alasannya menyebut TINDAKAN, bukan hanya keadaan", () => {
    // Probe yang dibaca saat insiden harus menyebutkan perintah yang menutupnya.
    expect(GATE).toContain("db:migrate:all");
  });
});

describe("gerbang: tersambung ke tempat yang membuatnya berarti", () => {
  it("diperiksa SETELAH kendali terbukti terjangkau", () => {
    const iKendali = REPORT.indexOf('return { status: "error", database: "unreachable" }');
    const iGate = REPORT.indexOf("schemaGateVerdict()");
    expect(iKendali).toBeGreaterThan(-1);
    expect(iGate).toBeGreaterThan(iKendali);
  });

  it("vonis yang memblokir menghasilkan bentuk laporan TERPISAH", () => {
    /* Bukan bidang bernilai buruk: membedakannya di tipe membuat pemanggil
       mustahil lupa menanganinya. */
    expect(REPORT).toMatch(/\{ status: "error"; schema: SchemaGateVerdict \}/);
    expect(REPORT).toMatch(/if \(!gate\.serve\) return \{ status: "error", schema: gate \}/);
  });

  it("probe menjawab 503, dan menyebut sebab yang mana", () => {
    /* 503 berarti "jangan kirim lalu lintas ke sini" — itulah arti "menolak
       melayani" di orkestrator mana pun. Sebabnya tetap dibedakan: "DB tak
       terjangkau" dan "skema tidak sepadan" menuntut tindakan yang berbeda. */
    expect(ROUTE).toMatch(/"schema" in report/);
    expect(ROUTE.match(/status: 503/g) ?? []).toHaveLength(2);
  });
});

describe("manifes: satu sumber untuk 'apa yang dibawa image ini'", () => {
  it("gerbang membaca manifes, tidak menanam nama migration", () => {
    expect(GATE).toContain("MIGRATION_TERAKHIR.control");
    expect(kode(GATE)).not.toMatch(/"0\d{3}_/);
  });

  it("manifes kendali menunjuk migration terakhir yang benar-benar ada", () => {
    // Dijaga lebih luas oleh `tests/migration-manifest.test.ts`; di sini hanya
    // memastikan gerbang ini tidak dibangun di atas nilai yang kosong.
    expect(MIGRATION_TERAKHIR.control).toMatch(/^\d{4}_/);
  });
});
