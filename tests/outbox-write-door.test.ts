/**
 * PINTU TULIS OUTBOX — baris `outbox` lahir HANYA di dalam transaksi domainnya.
 *
 * ══ YANG DIJAGA ═══════════════════════════════════════════════════════════
 * Outbox (09 §4) hanya bernilai bila peristiwanya commit BERSAMA tulisan
 * domainnya. Satu tulisan ke `outbox` di luar pintu `src/lib/outbox.ts`
 * (yang menolak klien non-transaksi) adalah *dual-write* yang dipindah satu
 * langkah: peristiwa commit sendiri, tulisan domain gagal sesudahnya, dan
 * surel berangkat untuk faktur yang tidak pernah ada.
 *
 * Tiga lapis:
 *   1. STATIS — tulisan ke model/tabel `outbox` (Prisma maupun SQL mentah) di
 *      luar daftar-izin ditolak. Daftar-izinnya dua berkas, dan masing-masing
 *      menyebut apa yang boleh ia tulis.
 *   2. PERILAKU — `emitOutboxEvent` MELEMPAR untuk klien yang punya
 *      `$transaction` (klien biasa), dan menulis lewat `createMany` +
 *      `skipDuplicates` (tabrakan dedupe tidak membatalkan transaksi domain).
 *   3. PINTU POSTING — `invoice.posted` ditulis di pintu posting
 *      (`postForSource`/`repostForSource`), SESUDAH `postJournal`, dengan
 *      klien yang sama.
 *
 * Atomisitas sungguhan (rollback membuang peristiwa) dibuktikan terhadap
 * PostgreSQL di `tests/outbox.integration.test.ts`.
 */
import { describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { AKAR_REPO, akarSumber } from "./akar-sumber";
import {
  OutboxOutsideTransactionError,
  emitOutboxEvent,
  invoicePostedDedupeKey,
  isTransactionClient,
} from "@/lib/outbox";

/** Berkas yang BOLEH menulis `outbox`, dan apa yang boleh ditulisnya. */
const DAFTAR_IZIN: Readonly<Record<string, string>> = {
  "src/lib/outbox.ts": "pintu tulis — satu-satunya INSERT, di dalam transaksi pemanggil",
  "src/lib/outbox-relay.ts": "relay — menandai terbit / menunda (UPDATE) dan retensi (DELETE baris terbit)",
};

function berkas(dir: string): string[] {
  const hasil: string[] = [];
  for (const nama of readdirSync(dir)) {
    if (nama === "node_modules" || nama === "generated" || nama.startsWith(".")) continue;
    const penuh = join(dir, nama);
    if (statSync(penuh).isDirectory()) hasil.push(...berkas(penuh));
    else if (/\.(ts|tsx)$/.test(nama)) hasil.push(penuh);
  }
  return hasil;
}

/* `akarSumber()` = src/ + packages/*\/src — WAJIB (AGENTS.md §Struktur
   monorepo); ditambah workers/, scripts/, dan konsol operator. */
const AKAR = [
  ...akarSumber(),
  join(AKAR_REPO, "workers"),
  join(AKAR_REPO, "scripts"),
  join(AKAR_REPO, "apps"),
];
const SEMUA = [...new Set(AKAR.flatMap((a) => berkas(a)))].map((p) => ({
  rel: relative(AKAR_REPO, p).split(sep).join("/"),
  isi: readFileSync(p, "utf8"),
}));

const TULIS_PRISMA = /\.outbox\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\s*\(/;
const TULIS_SQL = /\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?outbox"?(\s|\()/i;

describe("pintu tulis outbox — penjaganya melihat sesuatu", () => {
  it("menyapu berkas di src, packages, workers, scripts, dan apps", () => {
    expect(SEMUA.length).toBeGreaterThan(300);
    expect(SEMUA.some((b) => b.rel.startsWith("packages/"))).toBe(true);
    expect(SEMUA.some((b) => b.rel.startsWith("workers/"))).toBe(true);
  });

  it("menemukan tulisan di KEDUA berkas daftar-izin (penjaga yang tidak menemukan apa pun lulus diam-diam)", () => {
    const pintu = SEMUA.find((b) => b.rel === "src/lib/outbox.ts")!;
    const relay = SEMUA.find((b) => b.rel === "src/lib/outbox-relay.ts")!;
    expect(TULIS_PRISMA.test(pintu.isi)).toBe(true);
    expect(TULIS_SQL.test(relay.isi)).toBe(true);
  });
});

describe("pintu tulis outbox — tidak ada penulis lain", () => {
  it("tulisan ke `outbox` hanya di daftar-izin", () => {
    const pelanggar = SEMUA.filter(
      (b) =>
        !DAFTAR_IZIN[b.rel] &&
        !b.rel.startsWith("tests/") &&
        (TULIS_PRISMA.test(b.isi) || TULIS_SQL.test(b.isi))
    ).map((b) => b.rel);
    expect(
      pelanggar,
      "tulisan ke `outbox` di luar pintunya — peristiwa wajib lewat emitOutboxEvent(tx, …) " +
        "di DALAM transaksi tulisan domainnya (09 §4)"
    ).toEqual([]);
  });

  it("satu-satunya INSERT ada di pintu tulis, dan relay tidak pernah INSERT", () => {
    const relay = SEMUA.find((b) => b.rel === "src/lib/outbox-relay.ts")!;
    expect(/INSERT\s+INTO\s+"?outbox/i.test(relay.isi)).toBe(false);
    expect(/\.outbox\.create/.test(relay.isi)).toBe(false);
  });

  it("emitOutboxEvent tidak pernah dipanggil dengan proksi `prisma` atau klien kendali", () => {
    /* Pintunya sendiri dikecualikan: kepalanya MENYEBUT bentuk yang salah
       (`emitOutboxEvent(prisma, …)`) untuk menjelaskan kenapa ia ditolak. */
    const panggilan = SEMUA.filter((b) => b.rel !== "src/lib/outbox.ts").flatMap((b) =>
      [...b.isi.matchAll(/emitOutboxEvent\(\s*([A-Za-z_$][\w$.]*)/g)].map((m) => ({
        rel: b.rel,
        arg: m[1]!,
      }))
    );
    expect(panggilan.length).toBeGreaterThan(0);
    const salah = panggilan.filter((p) => /^(prisma|controlDb|platformDb)$/.test(p.arg));
    expect(salah.map((p) => `${p.rel}: ${p.arg}`)).toEqual([]);
  });

  it("retensi relay hanya membuang baris yang SUDAH terbit", () => {
    const relay = SEMUA.find((b) => b.rel === "src/lib/outbox-relay.ts")!;
    const hapus = relay.isi.match(/DELETE\s+FROM\s+outbox[\s\S]*?`/i)?.[0] ?? "";
    expect(hapus).toMatch(/published_at IS NOT NULL/);
  });
});

describe("emitOutboxEvent — perilaku", () => {
  it("MELEMPAR untuk klien yang punya $transaction (klien biasa, termasuk proksi per perusahaan)", async () => {
    const createMany = vi.fn();
    const klienBiasa = { $transaction: vi.fn(), outbox: { createMany } };
    await expect(
      emitOutboxEvent(klienBiasa as never, {
        type: "invoice.posted",
        aggregateId: 1,
        payload: { invoiceId: 1 },
        dedupeKey: invoicePostedDedupeKey(1),
      })
    ).rejects.toBeInstanceOf(OutboxOutsideTransactionError);
    expect(createMany).not.toHaveBeenCalled();
  });

  it("menulis lewat createMany + skipDuplicates di klien transaksi", async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 1 });
    const tx = { outbox: { createMany } };
    expect(isTransactionClient(tx)).toBe(true);
    const lahir = await emitOutboxEvent(tx as never, {
      type: "invoice.posted",
      aggregateId: 7,
      payload: { invoiceId: 7, journalId: 70 },
      dedupeKey: invoicePostedDedupeKey(7),
    });
    expect(lahir).toBe(true);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          eventType: "invoice.posted",
          aggregateType: "invoice",
          aggregateId: 7,
          payload: { invoiceId: 7, journalId: 70 },
          dedupeKey: "invoice.posted:7",
        },
      ],
      skipDuplicates: true,
    });
  });

  it("dedupe yang sudah ada menjawab `false`, bukan melempar", async () => {
    const tx = { outbox: { createMany: vi.fn().mockResolvedValue({ count: 0 }) } };
    expect(
      await emitOutboxEvent(tx as never, {
        type: "invoice.posted",
        aggregateId: 7,
        payload: {},
        dedupeKey: invoicePostedDedupeKey(7),
      })
    ).toBe(false);
  });

  it("menolak tipe peristiwa di luar kontrak", async () => {
    const tx = { outbox: { createMany: vi.fn() } };
    await expect(
      emitOutboxEvent(tx as never, {
        type: "invoice.deleted" as never,
        aggregateId: 1,
        payload: {},
        dedupeKey: "x",
      })
    ).rejects.toThrow();
    expect(tx.outbox.createMany).not.toHaveBeenCalled();
  });
});

describe("pintu posting menulis `invoice.posted` di transaksinya", () => {
  const posting = readFileSync(join(AKAR_REPO, "src/lib/posting/index.ts"), "utf8");

  it("postForSource DAN repostForSource memanggil emitPostingEvents sesudah postJournal, dengan klien yang sama", () => {
    const pola =
      /const journal = await postJournal\(entry, client\);\s*await emitPostingEvents\(client, ctx, journal\);/g;
    expect([...posting.matchAll(pola)].length).toBe(2);
  });

  it("peristiwa hanya untuk jurnal PERTAMA faktur (edit tidak mengirim ulang)", () => {
    const fn = posting.slice(posting.indexOf("async function emitPostingEvents"));
    expect(fn).toMatch(/if \(ctx\.sourceType !== "invoice"\) return;/);
    expect(fn).toMatch(/if \(jurnalSumber !== 1\) return;/);
    expect(fn).toMatch(/invoicePostedDedupeKey\(ctx\.sourceId\)/);
  });
});
