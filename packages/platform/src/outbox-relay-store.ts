/**
 * BACAAN JEJAK RELAY OUTBOX — satu pembaca untuk tiga permukaan (09 §4).
 *
 * `/api/health` (satu kata), `watch:health` (surel operator), dan konsol
 * `/scheduler` (angka per buku) membaca tabel kendali `outbox_relay_books`
 * lewat fungsi ini, dan putusannya dari `@sai/core/outbox-health` — tiga
 * permukaan, satu jawaban.
 *
 * Klien kendali DISERAHKAN pemanggil, bukan diimpor: `watch:health` berjalan
 * dengan klien kendalinya sendiri di luar Next (tanpa `--conditions=react-server`),
 * jadi berkas ini juga tanpa `server-only` dan tanpa singleton.
 *
 * Jejak buku yang sudah tidak ada di registry DIBUANG dari putusan: buku yang
 * dihapus meninggalkan jejak yang basi selamanya, dan jejak itu bukan relay
 * yang mati.
 */
import type { PrismaClient } from "@sai/db/client/control";
import { outboxHealth, type OutboxHealth, type OutboxRelayBookRow } from "@sai/core/outbox-health";

export interface OutboxRelayBookView extends OutboxRelayBookRow {
  slug: string;
  publishedLastPass: number;
  /** Umur baris tertua yang belum terbit terhadap `now`, detik; `null` = tidak ada. */
  ageSeconds: number | null;
}

export interface OutboxRelaySnapshot {
  health: OutboxHealth;
  books: OutboxRelayBookView[];
}

export async function readOutboxRelay(
  client: Pick<PrismaClient, "outboxRelayBook" | "company">,
  now: Date = new Date()
): Promise<OutboxRelaySnapshot> {
  const [rows, companies] = await Promise.all([
    client.outboxRelayBook.findMany({
      orderBy: { companyId: "asc" },
      select: {
        companyId: true,
        lastPassAt: true,
        oldestUnpublishedAt: true,
        unpublishedCount: true,
        publishedLastPass: true,
        lastError: true,
      },
    }),
    client.company.findMany({ select: { id: true, slug: true } }),
  ]);
  const slugOf = new Map(companies.map((c) => [c.id, c.slug]));
  const books = rows
    .filter((r) => slugOf.has(r.companyId))
    .map((r) => ({
      ...r,
      slug: slugOf.get(r.companyId)!,
      ageSeconds:
        r.oldestUnpublishedAt === null
          ? null
          : Math.max(0, Math.floor((now.getTime() - r.oldestUnpublishedAt.getTime()) / 1000)),
    }));
  return { health: outboxHealth(books, now), books };
}
