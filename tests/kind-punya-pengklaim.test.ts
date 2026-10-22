/**
 * SETIAP `kind` YANG DITERBITKAN WAJIB PUNYA TEPAT SATU PENGKLAIM.
 *
 * ══ LUBANG YANG DITUTUP PENJAGA INI ════════════════════════════════════════
 * Sejak tahap 1b, pelari mengklaim hanya `kind` yang punya handler padanya —
 * bukan seluruh `kind` jalurnya. Itu perubahan yang perlu: selama transisi
 * 1b–1d sebuah jalur bisa dilayani DUA bahasa untuk `kind` yang berbeda (jalur
 * `tenant` adalah contoh pertamanya, dan alasannya di `cmd/tenant/main.go`).
 *
 * Harganya adalah satu lubang. Sebelumnya, `kind` tanpa handler akan diklaim
 * lalu digagalkan — berisik, tapi terlihat. Sekarang ia tidak diklaim siapa
 * pun, dan baris `queued`-nya menumpuk SELAMANYA: tanpa galat, tanpa pekerja
 * yang mengeluh, dan hanya metrik umur-tertua yang perlahan memerah
 * berbulan-bulan kemudian. `contract/kinds.yaml` sudah menamai bentuk kegagalan
 * ini sejak sebelum ada satu pelari Go pun.
 *
 * ══ YANG DIPERIKSA: `kind` YANG DITERBITKAN — BUKAN SEMUANYA ═══════════════
 * Sebagian besar `kind` di kontrak memang belum punya pengklaim hari ini
 * (`report.export`, `document.generate`, `import.process`, …): jalurnya baru
 * lahir di tahap 1c/1d. `kind` tanpa penerbit DAN tanpa pengklaim tidak
 * berbahaya — ia kosakata yang belum dipakai, dan kontraknya memang ditulis
 * lebih dulu supaya kedua sisi menyebut nama yang sama.
 *
 * Yang berbahaya adalah `kind` yang ADA PENERBITNYA. Itu yang menghasilkan
 * baris sungguhan di tabel `jobs`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { AKAR_REPO, akarGo, berkasGo } from "./akar-sumber";
import { JOB_KINDS, KINDS_BY_LANE, type JobKind, type JobLane } from "@sai/core/generated/job-kinds";

const SEMUA: JobKind[] = Object.keys(JOB_KINDS) as JobKind[];

/** Setiap `.ts` di bawah `dir`, rekursif. */
function berkasTs(dir: string): { rel: string; isi: string }[] {
  if (!existsSync(dir)) return [];
  const hasil: { rel: string; isi: string }[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const penuh = join(dir, d.name);
    if (d.isDirectory()) hasil.push(...berkasTs(penuh));
    else if (d.name.endsWith(".ts")) {
      hasil.push({ rel: penuh.slice(AKAR_REPO.length + 1), isi: readFileSync(penuh, "utf8") });
    }
  }
  return hasil;
}

/** Sumber yang boleh MENERBITKAN atau MENGKLAIM. */
const SUMBER = [
  ...berkasTs(join(AKAR_REPO, "workers")),
  ...berkasTs(join(AKAR_REPO, "scripts")),
  ...berkasTs(join(AKAR_REPO, "src", "lib")),
  ...berkasTs(join(AKAR_REPO, "packages")).filter((b) => !b.rel.includes("/generated/")),
];

/**
 * `kind` yang DITERBITKAN: muncul sebagai `kind: "<nama>"` di sebuah pemanggilan
 * `publishJob`, atau di sisi Go sebagai `Kind: contract.Kind<...>`.
 *
 * Dibaca dari teks, bukan dari daftar yang diketik di sini: daftar yang diketik
 * akan tertinggal pada penerbit berikutnya, dan penjaga yang tertinggal LULUS
 * dengan nol pelanggar.
 */
function kindDiterbitkan(): Set<JobKind> {
  const hasil = new Set<JobKind>();
  for (const b of SUMBER) {
    if (!b.isi.includes("publishJob")) continue;
    for (const kind of SEMUA) {
      if (new RegExp(`kind:\\s*"${kind.replace(".", "\\.")}"`).test(b.isi)) hasil.add(kind);
    }
  }
  for (const b of berkasGo()) {
    if (!b.isi.includes("Publish")) continue;
    for (const kind of SEMUA) {
      if (b.isi.includes(`Kind: contract.Kind`) && b.isi.includes(`"${kind}"`)) hasil.add(kind);
    }
  }
  return hasil;
}

/**
 * `kind` yang DIKLAIM: terdaftar di peta `handlers` sebuah pelari.
 *
 * Sisi Node: `"<kind>": fn` di dalam `handlers: {...}` yang diserahkan ke
 * `runLane`. Sisi Go: `contract.Kind<...>: fn` di dalam `Handlers: map[...]`.
 */
function kindDiklaim(): Map<JobKind, string[]> {
  const hasil = new Map<JobKind, string[]>();
  const catat = (kind: JobKind, oleh: string) => {
    hasil.set(kind, [...(hasil.get(kind) ?? []), oleh]);
  };

  for (const b of SUMBER) {
    if (!b.isi.includes("runLane")) continue;
    const i = b.isi.indexOf("handlers:");
    if (i < 0) continue;
    const blok = b.isi.slice(i, b.isi.indexOf("\n  }", i));
    for (const kind of SEMUA) if (blok.includes(`"${kind}"`)) catat(kind, b.rel);
  }

  for (const b of berkasGo()) {
    const i = b.isi.indexOf("Handlers: map[");
    if (i < 0) continue;
    const blok = b.isi.slice(i, b.isi.indexOf("\n\t\t},", i));
    for (const kind of SEMUA) {
      const pengenal = `contract.Kind${kind
        .split(/[._-]/)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join("")}`;
      /* Batas kata WAJIB: `contract.KindReportExport` adalah awalan
         `contract.KindReportExportGo` (tahap 1d), dan pencocokan substring
         membaca satu pengklaim sebagai pengklaim DUA kind. */
      if (new RegExp(`${pengenal.replace(".", "\\.")}\\b`).test(blok)) catat(kind, b.rel);
    }
  }
  return hasil;
}

describe("pengklaim: penjaganya memang sedang melihat sesuatu", () => {
  it("menemukan sumber di kedua bahasa", () => {
    /* Pemindai yang menyapu direktori yang salah LULUS dengan nol pelanggar —
       kegagalan diam yang sudah terjadi sekali di repo ini (Fase 2). */
    expect(SUMBER.length).toBeGreaterThan(20);
    expect(akarGo().length).toBeGreaterThan(0);
  });

  it("menemukan sedikitnya satu penerbit dan satu pengklaim", () => {
    expect([...kindDiterbitkan()].length).toBeGreaterThan(0);
    expect([...kindDiklaim().keys()].length).toBeGreaterThan(0);
  });
});

describe("setiap `kind` yang DITERBITKAN punya pengklaim", () => {
  it("tidak ada `kind` terbit tanpa satu pengklaim pun", () => {
    const terbit = kindDiterbitkan();
    const klaim = kindDiklaim();
    const yatim = [...terbit].filter((k) => !klaim.has(k));
    expect(
      yatim,
      "kind ini DITERBITKAN tapi tidak diklaim pelari mana pun — barisnya akan " +
        "menumpuk sebagai `queued` selamanya, tanpa galat dan tanpa pekerja yang " +
        "mengeluh. Daftarkan handler-nya, atau cabut penerbitnya."
    ).toEqual([]);
  });

  it("tidak ada `kind` yang diklaim DUA pelari", () => {
    /* Dua pengklaim untuk satu `kind` adalah dua pelaksana untuk satu
       pekerjaan, dan yang memisahkannya hanya `dedupe_key` — yaitu kunci yang
       dirancang untuk idempotensi PENERBITAN, bukan untuk arbitrase
       pelaksanaan. Cacat ini sudah hampir terjadi sekali di tahap 1a, ketika
       `recurring:run` masih berjalan di penjadwal sementara `svc-ledger` lahir. */
    const ganda = [...kindDiklaim()].filter(([, oleh]) => new Set(oleh).size > 1);
    expect(
      ganda.map(([k, oleh]) => `${k}: ${[...new Set(oleh)].join(" + ")}`),
      "kind ini punya DUA pengklaim"
    ).toEqual([]);
  });
});

describe("isolasi jalur tetap jalur", () => {
  it("setiap handler mengklaim `kind` milik jalurnya sendiri", () => {
    /* Pekerja jalur `tenant` yang mengklaim `report.export` membuat satu
       cadangan raksasa menahan unduhan yang ditunggu orang di layar — tepat
       yang isolasi jalur ada untuk mencegah. */
    const lanes = Object.keys(KINDS_BY_LANE) as JobLane[];
    for (const [kind, oleh] of kindDiklaim()) {
      const lane = JOB_KINDS[kind].lane;
      expect(lanes, `jalur ${lane}`).toContain(lane);
      for (const berkas of oleh) {
        /* Nama berkas pelarinya menyebut jalurnya: `workers/ledger.ts`,
           `cmd/tenant/main.go`. Itu konvensi, dan penjaga ini yang
           menegakkannya — pelari yang namanya tidak menyebut jalurnya adalah
           pelari yang jalurnya harus dibaca dari isi berkasnya. */
        expect(
          berkas.includes(lane),
          `${berkas} mengklaim \`${kind}\` (jalur \`${lane}\`) tapi namanya tidak menyebut jalur itu`
        ).toBe(true);
      }
    }
  });

  it("tidak ada pelari Go yang mengklaim `kind` penulis buku besar", () => {
    /* Invarian I-2: pintu posting tunggal, dan ia TypeScript. */
    for (const [kind, oleh] of kindDiklaim()) {
      if (!JOB_KINDS[kind].writesLedger) continue;
      for (const berkas of oleh) {
        expect(berkas.endsWith(".go"), `${berkas} mengklaim \`${kind}\``).toBe(false);
      }
    }
  });
});
