import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import {
  AlreadyRevaluedError,
  openForeignCurrencies,
  previewRevaluation,
  runRevaluation,
} from "@/lib/fx-revaluation-service";
import { InvalidClosingRateError } from "@/lib/fx-revaluation";
import { ClosedPeriodError, periodBounds } from "@/lib/period";
import { fxRevaluationSchema, periodQuerySchema } from "@/lib/validations/period";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

/**
 * REVALUASI VALAS (issue #554) — pratinjau dan posting.
 *
 * ══ IZINNYA `period.manage`, DAN ITU BUKAN JALAN PINTAS ════════════════════
 * Revaluasi adalah langkah tutup buku: ia menerbitkan jurnal penyesuaian
 * bertanggal akhir periode dan mengubah angka yang akan dilaporkan bulan itu.
 * Kewenangannya karena itu identik dengan menutup periode, bukan kewenangan
 * mencatat transaksi — orang yang boleh membuat faktur tidak dengan sendirinya
 * boleh menggeser nilai seluruh piutang perusahaan.
 *
 * ══ GET MEMBACA, POST MENULIS — dan GET tidak pernah memposting ════════════
 * Pratinjau menghitung rencana yang SAMA dengan yang akan diposting, tanpa
 * menulis satu baris pun. Itu yang membuat "lihat dampaknya sebelum memposting"
 * di kriteria #554 benar-benar berarti sesuatu.
 */

/** GET /api/periods/fx-revaluation?year=&month=[&currency=&closingRate=] */
export async function GET(request: Request) {
  const result = await requireApiPermission("period.manage");
  if (!result.authorized) return result.response;

  const { searchParams } = new URL(request.url);
  const currency = searchParams.get("currency");
  const closingRate = searchParams.get("closingRate");

  /*
   * Tanpa mata uang & kurs, jawabannya DAFTAR mata uang yang punya saldo
   * terbuka — pertanyaan pertama layar itu ("ada apa saja di bulan ini?"),
   * yang tidak menuntut satu kurs pun sudah dimasukkan orang.
   */
  if (!currency || !closingRate) {
    const parsed = periodQuerySchema.safeParse({
      year: searchParams.get("year"),
      month: searchParams.get("month"),
    });
    if (!parsed.success) return badRequest(parsed.error);

    const { end } = periodBounds(parsed.data.year, parsed.data.month);
    return NextResponse.json({ currencies: await openForeignCurrencies(end) });
  }

  const parsed = fxRevaluationSchema.safeParse({
    year: searchParams.get("year"),
    month: searchParams.get("month"),
    currency,
    closingRate,
  });
  if (!parsed.success) return badRequest(parsed.error);

  try {
    return NextResponse.json(
      await previewRevaluation(
        parsed.data.year,
        parsed.data.month,
        parsed.data.currency,
        parsed.data.closingRate
      )
    );
  } catch (e) {
    return await knownError(e);
  }
}

/** POST /api/periods/fx-revaluation — catat, posting, dan posting pembaliknya. */
export async function POST(request: Request) {
  const result = await requireApiPermission("period.manage");
  if (!result.authorized) return result.response;

  const parsed = fxRevaluationSchema.safeParse(await request.json());
  if (!parsed.success) return badRequest(parsed.error);

  const { year, month, currency, closingRate } = parsed.data;

  try {
    const run = await runRevaluation({ year, month, currency, closingRate });

    /*
     * Jejaknya menyebut KURS dan SELISIHNYA, bukan sekadar "revaluasi
     * dijalankan". Inilah satu-satunya tindakan di halaman ini yang menggeser
     * nilai setiap saldo valas sekaligus, dan orang yang membacanya setahun
     * kemudian butuh angkanya — bukan hanya faktanya.
     */
    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: "fx_revaluation.run",
      entity: "fx_revaluation",
      entityId: run.id,
      details: {
        year,
        month,
        currency,
        closingRate,
        difference: run.plan.totalDifference,
        accounts: run.plan.lines.length,
        journalId: run.journalId,
        reversalJournalId: run.reversalJournalId,
      },
    });

    return NextResponse.json(run, { status: 201 });
  } catch (e) {
    return await knownError(e);
  }
}

function badRequest(error: Parameters<typeof translateFieldErrors>[0]) {
  return (async () => {
    const { dictionary, t } = await getRequestI18n();
    return NextResponse.json(
      { error: t("validation.invalidInput"), details: translateFieldErrors(error, dictionary) },
      { status: 400 }
    );
  })();
}

/**
 * Tiga kegagalan yang punya arti bagi pemakainya, diterjemahkan menjadi status
 * yang tepat. Sisanya dibiarkan naik — kegagalan yang tidak dikenali lebih baik
 * menjadi 500 yang berisik daripada 400 yang menyesatkan.
 */
async function knownError(e: unknown) {
  const { t } = await getRequestI18n();

  /* Sudah pernah dijalankan: 409, bukan 400. Permintaannya sah sepenuhnya —
     keadaan servernya yang membuatnya tidak bisa dipenuhi lagi. */
  if (e instanceof AlreadyRevaluedError) {
    return NextResponse.json(
      { error: t("periodClose.fxAlreadyRevalued", { currency: e.currency }) },
      { status: 409 }
    );
  }
  if (e instanceof InvalidClosingRateError) {
    return NextResponse.json({ error: t("validation.closingRateInvalid") }, { status: 400 });
  }
  /* Periode terkunci: dilempar `assertPeriodOpen` di dalam `postJournal`, dan
     karena seluruhnya satu transaksi, tidak ada satu baris pun yang tertulis. */
  if (e instanceof ClosedPeriodError) {
    return NextResponse.json(
      { error: t("periodClose.fxPeriodClosed", { period: `${e.month}/${e.year}` }) },
      { status: 409 }
    );
  }
  throw e;
}
