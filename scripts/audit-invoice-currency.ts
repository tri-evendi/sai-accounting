/**
 * Legacy invoice currency review (issue #35).
 *
 * WHY THIS IS A REPORT AND NOT A BACKFILL
 * ---------------------------------------
 * Migration 0005 gives `invoices.currency` a DEFAULT of 'IDR', so every existing
 * row is now explicitly labelled IDR. That is not a new claim about the data — it
 * is exactly how those rows have been posted all along, because the posting engine
 * hardcoded `const currency = "IDR"` before this issue. Defaulting to IDR
 * therefore changes no journal and no reported figure: it writes down the
 * assumption that was already in force.
 *
 * `rate` is deliberately left NULL. Since currency is IDR, resolveRate() returns
 * 1 without ever consulting it, so a NULL rate is not a landmine — but the moment
 * someone corrects an invoice to USD, the NULL forces them to supply a real rate
 * instead of inheriting a fabricated 1.
 *
 * What this script does NOT do is guess which historical invoices were *really*
 * foreign. Nothing in the old schema recorded that, so any automated guess would
 * be a fabrication written into the ledger. Instead it flags the rows where the
 * evidence points elsewhere — an IDR invoice settled by USD/CNY payments — and
 * leaves the decision to a human, who corrects it through the normal edit form
 * (which reposts the journal via repostForSource).
 *
 * Usage (read-only, safe):
 *   npx tsx scripts/audit-invoice-currency.ts
 *
 * Opt-in repost of specific invoices, after their currency/rate has been fixed:
 *   npx tsx scripts/audit-invoice-currency.ts --repost 12,44,91
 *
 * There is no flag that rewrites invoice currency in bulk. That is on purpose.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { repostForSource } from "../src/lib/posting";

function createClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set.");
  const url = new URL(databaseUrl);
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    connectionLimit: 3,
  });
  return new PrismaClient({ adapter });
}

function parseRepostIds(argv: string[]): number[] | null {
  const i = argv.indexOf("--repost");
  if (i === -1) return null;
  const raw = argv[i + 1];
  if (!raw) throw new Error("--repost needs a comma-separated list of invoice ids.");
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) throw new Error(`No valid invoice ids in "${raw}".`);
  return ids;
}

async function report(prisma: PrismaClient) {
  const invoices = await prisma.invoice.findMany({
    include: { items: true, payments: true, customer: true },
    orderBy: { date: "asc" },
  });

  // An IDR invoice whose payments arrived in USD/CNY is the strongest signal the
  // old schema left behind that the document was never really rupiah.
  const suspectCurrency = invoices.filter((inv) => {
    const currency = inv.currency || "IDR";
    if (currency !== "IDR") return false;
    return inv.payments.some((p) => (p.currency || "IDR") !== "IDR");
  });

  // Foreign invoices with no rate cannot be posted at all — resolveRate throws.
  const foreignWithoutRate = invoices.filter(
    (inv) => (inv.currency || "IDR") !== "IDR" && inv.rate == null
  );

  const withoutCustomer = invoices.filter((inv) => inv.customerId == null);

  console.log(`Invoices reviewed: ${invoices.length}\n`);

  console.log(`[1] Marked IDR but settled in foreign currency: ${suspectCurrency.length}`);
  if (suspectCurrency.length > 0) {
    console.log("    These are the rows most likely mislabelled. Review each by hand.");
    for (const inv of suspectCurrency) {
      const currencies = [...new Set(inv.payments.map((p) => p.currency || "IDR"))];
      console.log(
        `    #${inv.id} ${inv.invoiceNo} (${inv.date.toISOString().slice(0, 10)}) ` +
          `— payments in ${currencies.join(", ")}`
      );
    }
  }

  console.log(`\n[2] Foreign currency with no rate — cannot post: ${foreignWithoutRate.length}`);
  for (const inv of foreignWithoutRate) {
    console.log(`    #${inv.id} ${inv.invoiceNo} — ${inv.currency}, rate is NULL`);
  }

  console.log(`\n[3] No customer linked (blocks per-customer aging): ${withoutCustomer.length}`);
  if (withoutCustomer.length > 0 && withoutCustomer.length <= 40) {
    for (const inv of withoutCustomer) {
      console.log(`    #${inv.id} ${inv.invoiceNo}`);
    }
  } else if (withoutCustomer.length > 40) {
    console.log(`    (too many to list — ${withoutCustomer.length} rows)`);
  }

  console.log(
    "\nNext step: fix each flagged invoice through the edit form (/invoices/<id>/edit).\n" +
      "Saving there reposts its journal automatically — the original entry is reversed,\n" +
      "never mutated, so the audit trail stays intact.\n" +
      "To repost without editing: npx tsx scripts/audit-invoice-currency.ts --repost <ids>"
  );
}

async function repost(prisma: PrismaClient, ids: number[]) {
  console.log(`Reposting ${ids.length} invoice journal(s): ${ids.join(", ")}`);
  console.log("Each existing journal is REVERSED and a fresh one posted. Ctrl-C now to abort.\n");

  for (const sourceId of ids) {
    const invoice = await prisma.invoice.findUnique({ where: { id: sourceId } });
    if (!invoice) {
      console.log(`  #${sourceId}: not found — skipped.`);
      continue;
    }
    try {
      const journal = await repostForSource({ sourceType: "invoice", sourceId });
      console.log(
        journal
          ? `  #${sourceId} ${invoice.invoiceNo}: reposted as journal ${journal.number}.`
          : `  #${sourceId} ${invoice.invoiceNo}: nothing to post (cancelled or zero value).`
      );
    } catch (e) {
      // Keep going: one unpostable invoice should not block the rest.
      console.log(`  #${sourceId} ${invoice.invoiceNo}: FAILED — ${(e as Error).message}`);
    }
  }
}

async function main() {
  const ids = parseRepostIds(process.argv.slice(2));
  const prisma = createClient();
  try {
    if (ids) {
      await repost(prisma, ids);
    } else {
      await report(prisma);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
