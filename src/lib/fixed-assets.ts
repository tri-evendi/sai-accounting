/**
 * Aset Tetap — data access + the depreciation/disposal/transfer services (issue #28).
 *
 * The pure arithmetic lives in `@/lib/depreciation`; the journal shapes in
 * `@/lib/posting/rules`. This module is the glue: it reads/writes rows and drives
 * the ONE posting path (`postForSource`), so every depreciation and disposal
 * journal goes through `postJournal` → `assertPeriodOpen` (period lock #13) and
 * `assertBalanced`, exactly like every other source document.
 *
 * ── IDEMPOTENCY OF THE PERIODIC RUN ─────────────────────────────────────────
 * A depreciation run posts a fresh journal each month, so it cannot key off the
 * asset alone. Each (asset, year, month) is a `fixed_asset_depreciations` row —
 * `@@unique([assetId, year, month])` makes a second row for the same period
 * impossible, and `postForSource` makes a second journal for the same row
 * impossible. The asset's `lastDepreciation*`/`accumulatedDepreciation` fields are
 * the fast pre-check; the unique index is the hard guarantee.
 *
 * ── IDR ONLY ────────────────────────────────────────────────────────────────
 * See the model note in prisma/schema.prisma: fixed assets are valued in IDR, so
 * everything here is IDR base with no rate.
 */
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { postForSource } from "@/lib/posting";
import {
  bookValue,
  depreciableBase,
  disposalGainLoss,
  isFullyDepreciated,
  nextPeriodDepreciation,
  round2,
  straightLineMonthly,
  type DepreciationParams,
} from "@/lib/depreciation";
import { assertPeriodOpen, periodBounds } from "@/lib/period";

const num = (v: unknown): number => (v == null ? 0 : Number(v));

export const FIXED_ASSET_STATUSES = ["active", "disposed"] as const;
export type FixedAssetStatus = (typeof FIXED_ASSET_STATUSES)[number];

/* ─────────────────────────── Asset number ─────────────────────────── */

/**
 * `FA.YYYY.NNNNN` by acquisition year. `asset_no` is UNIQUE, so a racing
 * duplicate fails the transaction and is retried rather than silently reused —
 * the same derivation journal/advance numbers use.
 */
export async function nextAssetNo(
  tx: Prisma.TransactionClient,
  acquisitionDate: Date
): Promise<string> {
  const prefix = `FA.${acquisitionDate.getFullYear()}.`;
  const count = await tx.fixedAsset.count({ where: { assetNo: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(5, "0")}`;
}

/* ─────────────────────────── Read side ─────────────────────────── */

export interface FixedAssetRow {
  id: number;
  assetNo: string;
  name: string;
  categoryId: number;
  categoryName: string;
  acquisitionDate: Date;
  acquisitionCost: number;
  residualValue: number;
  usefulLifeMonths: number;
  depreciationMethod: string;
  monthlyDepreciation: number;
  accumulatedDepreciation: number;
  bookValue: number;
  depreciableBase: number;
  isFullyDepreciated: boolean;
  location: string | null;
  status: FixedAssetStatus;
  lastDepreciationYear: number | null;
  lastDepreciationMonth: number | null;
  disposalDate: Date | null;
  disposalProceeds: number | null;
  disposalGainLoss: number | null;
}

function toParams(a: {
  acquisitionCost: unknown;
  residualValue: unknown;
  usefulLifeMonths: number;
  depreciationMethod: string;
}): DepreciationParams {
  return {
    cost: num(a.acquisitionCost),
    residualValue: num(a.residualValue),
    usefulLifeMonths: a.usefulLifeMonths,
    method: a.depreciationMethod,
  };
}

type AssetWithCategory = Prisma.FixedAssetGetPayload<{ include: { category: true } }>;

function mapAssetRow(a: AssetWithCategory): FixedAssetRow {
  const cost = num(a.acquisitionCost);
  const accumulated = num(a.accumulatedDepreciation);
  const params = toParams(a);
  const proceeds = a.disposalProceeds == null ? null : num(a.disposalProceeds);
  return {
    id: a.id,
    assetNo: a.assetNo,
    name: a.name,
    categoryId: a.categoryId,
    categoryName: a.category.name,
    acquisitionDate: a.acquisitionDate,
    acquisitionCost: cost,
    residualValue: num(a.residualValue),
    usefulLifeMonths: a.usefulLifeMonths,
    depreciationMethod: a.depreciationMethod,
    monthlyDepreciation: straightLineMonthly(params),
    accumulatedDepreciation: accumulated,
    bookValue: bookValue(cost, accumulated),
    depreciableBase: depreciableBase(cost, num(a.residualValue)),
    isFullyDepreciated: isFullyDepreciated(params, accumulated),
    location: a.location,
    status: a.status as FixedAssetStatus,
    lastDepreciationYear: a.lastDepreciationYear,
    lastDepreciationMonth: a.lastDepreciationMonth,
    disposalDate: a.disposalDate,
    disposalProceeds: proceeds,
    disposalGainLoss: proceeds == null ? null : disposalGainLoss(cost, accumulated, proceeds),
  };
}

export interface FixedAssetQuery {
  status?: FixedAssetStatus;
  categoryId?: number;
  location?: string;
}

export async function getFixedAssets(
  query: FixedAssetQuery = {},
  client = prisma
): Promise<FixedAssetRow[]> {
  const rows = await client.fixedAsset.findMany({
    where: {
      ...(query.status ? { status: query.status } : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.location ? { location: query.location } : {}),
    },
    include: { category: true },
    orderBy: { acquisitionDate: "desc" },
  });
  return rows.map(mapAssetRow);
}

export async function getFixedAsset(id: number, client = prisma): Promise<FixedAssetRow | null> {
  const a = await client.fixedAsset.findUnique({ where: { id }, include: { category: true } });
  return a ? mapAssetRow(a) : null;
}

/** Register totals (active assets only), IDR base. */
export function summarizeFixedAssets(rows: FixedAssetRow[]) {
  let cost = 0;
  let accumulated = 0;
  let book = 0;
  let activeCount = 0;
  for (const r of rows) {
    if (r.status !== "active") continue;
    activeCount += 1;
    cost = round2(cost + r.acquisitionCost);
    accumulated = round2(accumulated + r.accumulatedDepreciation);
    book = round2(book + r.bookValue);
  }
  return { activeCount, totalCount: rows.length, cost, accumulated, book };
}

export interface LocationGroup {
  location: string | null;
  count: number;
  cost: number;
  accumulated: number;
  book: number;
}

/** Aset per lokasi (active assets), for the by-location report. */
export function groupByLocation(rows: FixedAssetRow[]): LocationGroup[] {
  const map = new Map<string, LocationGroup>();
  for (const r of rows) {
    if (r.status !== "active") continue;
    const key = r.location ?? "";
    const g = map.get(key) ?? { location: r.location, count: 0, cost: 0, accumulated: 0, book: 0 };
    g.count += 1;
    g.cost = round2(g.cost + r.acquisitionCost);
    g.accumulated = round2(g.accumulated + r.accumulatedDepreciation);
    g.book = round2(g.book + r.bookValue);
    map.set(key, g);
  }
  // Named locations first (alphabetical), "Tanpa lokasi" last.
  return [...map.values()].sort((a, b) => {
    if (a.location == null) return 1;
    if (b.location == null) return -1;
    return a.location.localeCompare(b.location);
  });
}

/* ─────────────────────────── Categories ─────────────────────────── */

export async function getCategories(activeOnly = false, client = prisma) {
  return client.fixedAssetCategory.findMany({
    where: activeOnly ? { isActive: true } : {},
    orderBy: { name: "asc" },
  });
}

/* ─────────────────────────── Depreciation run ─────────────────────────── */

export interface DepreciationResult {
  assetId: number;
  assetNo: string;
  posted: boolean;
  amount: number;
  /** Why nothing was posted, when `posted` is false. */
  reason?: "not_active" | "already_posted" | "fully_depreciated" | "not_yet_acquired";
}

/** Did this asset already get a depreciation row for (year, month)? */
async function alreadyDepreciated(
  client: Prisma.TransactionClient | typeof prisma,
  assetId: number,
  year: number,
  month: number
): Promise<boolean> {
  const existing = await client.fixedAssetDepreciation.findUnique({
    where: { assetId_year_month: { assetId, year, month } },
  });
  return existing != null;
}

/**
 * Post one period of depreciation for one asset. Idempotent and safe to call in
 * a batch: returns `posted: false` with a reason rather than throwing for the
 * ordinary "nothing to do" cases (inactive, already posted, fully depreciated,
 * acquired later). A CLOSED period is NOT one of those — `postForSource` throws
 * `ClosedPeriodError`, which propagates so the run is refused, never bypassed.
 */
export async function depreciateAsset(
  assetId: number,
  year: number,
  month: number,
  client = prisma
): Promise<DepreciationResult> {
  const asset = await client.fixedAsset.findUnique({ where: { id: assetId } });
  if (!asset) throw new Error(`Aset #${assetId} tidak ditemukan.`);

  const base = { assetId, assetNo: asset.assetNo };

  if (asset.status !== "active") return { ...base, posted: false, amount: 0, reason: "not_active" };

  const { end } = periodBounds(year, month);
  // Full-month convention, no proration: an asset is eligible from the month it
  // was acquired (period end >= acquisition date), then each month after.
  if (asset.acquisitionDate > end) {
    return { ...base, posted: false, amount: 0, reason: "not_yet_acquired" };
  }

  if (await alreadyDepreciated(client, assetId, year, month)) {
    return { ...base, posted: false, amount: 0, reason: "already_posted" };
  }

  const accumulated = num(asset.accumulatedDepreciation);
  // The amount for the NEXT posting depends on how many periods precede it (the
  // index that carries the final-period true-up), not on the calendar month.
  const elapsed = await client.fixedAssetDepreciation.count({ where: { assetId } });
  const amount = nextPeriodDepreciation(toParams(asset), elapsed, accumulated);
  if (amount <= 0) return { ...base, posted: false, amount: 0, reason: "fully_depreciated" };

  const accumulatedAfter = round2(accumulated + amount);

  await prisma.$transaction(async (tx) => {
    const dep = await tx.fixedAssetDepreciation.create({
      data: { assetId, year, month, date: end, amount, accumulatedAfter },
    });
    await tx.fixedAsset.update({
      where: { id: assetId },
      data: {
        accumulatedDepreciation: accumulatedAfter,
        lastDepreciationYear: year,
        lastDepreciationMonth: month,
      },
    });
    // D: Beban Penyusutan, K: Akumulasi Penyusutan — through the one posting path,
    // so the period lock and IDR-balance invariant both apply.
    await postForSource({ sourceType: "depreciation", sourceId: dep.id, tx });
  });

  return { ...base, posted: true, amount };
}

export interface RunSummary {
  year: number;
  month: number;
  postedCount: number;
  totalAmount: number;
  results: DepreciationResult[];
}

/**
 * Run monthly depreciation across every active asset for one period.
 *
 * The period lock is checked ONCE up front (a closed month refuses the whole run
 * with a single, clear error) and again inside each asset's posting transaction,
 * so it can never be bypassed. Assets acquired later, already depreciated for the
 * period, or fully depreciated are skipped with a reason, not errored.
 */
export async function runDepreciation(
  year: number,
  month: number,
  client = prisma
): Promise<RunSummary> {
  // One clear refusal for a closed period rather than N identical throws.
  const { end } = periodBounds(year, month);
  await assertPeriodOpen(end, client);

  const assets = await client.fixedAsset.findMany({
    where: { status: "active" },
    orderBy: { assetNo: "asc" },
    select: { id: true },
  });

  const results: DepreciationResult[] = [];
  for (const { id } of assets) {
    results.push(await depreciateAsset(id, year, month, client));
  }

  const posted = results.filter((r) => r.posted);
  return {
    year,
    month,
    postedCount: posted.length,
    totalAmount: round2(posted.reduce((s, r) => s + r.amount, 0)),
    results,
  };
}

/* ─────────────────────────── Disposal ─────────────────────────── */

export interface DisposeInput {
  assetId: number;
  date: Date;
  proceeds: number;
}

/**
 * Dispose/sell an asset: flip it to `disposed`, then post the removal + gain/loss
 * journal through the one posting path (so the period lock applies). Returns the
 * updated asset row with the computed laba/rugi pelepasan.
 *
 * NOTE: the gain/loss uses the accumulated depreciation posted SO FAR. Run
 * depreciation up to the disposal month first if the final partial period matters.
 */
export async function disposeAsset(input: DisposeInput, client = prisma): Promise<FixedAssetRow> {
  return client.$transaction(async (tx) => {
    const asset = await tx.fixedAsset.findUnique({ where: { id: input.assetId } });
    if (!asset) throw new Error(`Aset #${input.assetId} tidak ditemukan.`);
    if (asset.status === "disposed") {
      throw new Error(`Aset ${asset.assetNo} sudah dilepas sebelumnya.`);
    }

    await tx.fixedAsset.update({
      where: { id: input.assetId },
      data: {
        status: "disposed",
        disposalDate: input.date,
        disposalProceeds: round2(input.proceeds),
      },
    });

    // Reads the just-updated asset (status disposed, disposalDate set) and builds
    // D: Akum. Penyusutan + D: Kas, K: Aktiva Tetap, +/- Laba/Rugi Pelepasan.
    await postForSource({ sourceType: "fixed_asset_disposal", sourceId: input.assetId, tx });

    const updated = await tx.fixedAsset.findUnique({
      where: { id: input.assetId },
      include: { category: true },
    });
    return mapAssetRow(updated!);
  });
}

/* ─────────────────────────── Location transfer ─────────────────────────── */

export interface TransferInput {
  assetId: number;
  date: Date;
  toLocation: string;
  note?: string;
}

/**
 * Pindah lokasi — records a move and updates the asset's location. No journal: a
 * move changes where an asset sits, not its value.
 */
export async function transferAsset(input: TransferInput, client = prisma) {
  return client.$transaction(async (tx) => {
    const asset = await tx.fixedAsset.findUnique({ where: { id: input.assetId } });
    if (!asset) throw new Error(`Aset #${input.assetId} tidak ditemukan.`);
    if (asset.status === "disposed") {
      throw new Error(`Aset ${asset.assetNo} sudah dilepas — tidak dapat dipindahkan.`);
    }

    await tx.fixedAssetLocationHistory.create({
      data: {
        assetId: input.assetId,
        date: input.date,
        fromLocation: asset.location,
        toLocation: input.toLocation,
        note: input.note ?? null,
      },
    });
    return tx.fixedAsset.update({
      where: { id: input.assetId },
      data: { location: input.toLocation },
    });
  });
}
