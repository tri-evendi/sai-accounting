import { NextResponse } from "next/server";

import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import {
  AlreadyClosedError,
  closeYear,
  NothingToCloseError,
  previewYearClose,
  reverseYearClose,
} from "@/lib/year-close-service";
import { MissingMappingError } from "@/lib/posting/mapping";
import { ClosedPeriodError } from "@/lib/period";
import { prisma } from "@/lib/prisma";
import { yearCloseSchema } from "@/lib/validations/period";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";

/**
 * TUTUP BUKU TAHUNAN (issue #555) — pintunya.
 *
 * ══ KENAPA BERKAS INI ADA BELAKANGAN, DAN ITU LAYAK DICATAT ════════════════
 * Layanannya (`closeYear`/`reverseYearClose`) mendarat lebih dulu, lengkap
 * dengan penjaganya, lalu digelar ke produksi TANPA satu pun pemanggil — tidak
 * ada route, tidak ada tombol. Benar, teruji, dan tak terjangkau: kode mati
 * yang terlihat seperti fitur.
 *
 * Ketahuan bukan dari tes (tak satu pun menanyakan "adakah yang memanggil
 * ini") melainkan dari menyapu bundel yang benar-benar digelar. Berkas inilah
 * yang menutup lubang itu.
 *
 * ══ IZINNYA `period.manage`, SAMA DENGAN TUTUP PERIODE BULANAN ═════════════
 * Kewenangannya memang sama: keduanya menutup buku dan menerbitkan akibat yang
 * mengubah angka yang dilaporkan. Yang tahunan bahkan lebih berat — ia
 * memindahkan SELURUH laba tahun itu ke ekuitas.
 */

/** GET /api/periods/year-close?year=2026 — pratinjau, tanpa menulis apa pun. */
export async function GET(request: Request) {
  const result = await requireApiPermission("period.manage");
  if (!result.authorized) return result.response;

  const parsed = yearCloseSchema.safeParse({
    year: new URL(request.url).searchParams.get("year"),
  });
  if (!parsed.success) return badRequest(parsed.error);

  const { year } = parsed.data;
  try {
    const [plan, existing] = await Promise.all([
      previewYearClose(year),
      prisma.yearClose.findUnique({ where: { year } }),
    ]);
    return NextResponse.json({
      year,
      plan,
      /* `reversedAt` yang terisi berarti pernah ditutup lalu dibatalkan —
         keadaan yang BERBEDA dari belum pernah ditutup, dan layarnya harus
         bisa membedakannya. */
      closed: existing !== null && existing.reversedAt === null,
      reversedAt: existing?.reversedAt ?? null,
    });
  } catch (e) {
    return await knownError(e);
  }
}

/** POST /api/periods/year-close — tutup tahun buku. */
export async function POST(request: Request) {
  const result = await requireApiPermission("period.manage");
  if (!result.authorized) return result.response;

  const parsed = yearCloseSchema.safeParse(await request.json());
  if (!parsed.success) return badRequest(parsed.error);

  const { year } = parsed.data;
  try {
    const run = await closeYear(year, Number(result.session.user.id));

    /* Jejaknya menyebut LABA yang dipindahkan dan jurnalnya, bukan sekadar
       "tahun ditutup". Angka itu yang ditanyakan orang setahun kemudian. */
    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: "year_close.run",
      entity: "year_close",
      entityId: run.id,
      details: {
        year,
        netIncome: run.plan.netIncome,
        closedAccounts: run.plan.closedAccounts,
        journalId: run.journalId,
      },
    });

    return NextResponse.json(run, { status: 201 });
  } catch (e) {
    return await knownError(e);
  }
}

/**
 * DELETE /api/periods/year-close?year=2026 — batalkan penutupan.
 *
 * DELETE, bukan POST ke `/reverse`: yang dicabut adalah PENUTUPANNYA, dan
 * sumber daya itu memang ditunjuk oleh tahunnya. Jurnal lawannya tetap terbit
 * dan barisnya tetap ada (`reversed_at` diisi) — yang dihapus statusnya, bukan
 * jejaknya.
 */
export async function DELETE(request: Request) {
  const result = await requireApiPermission("period.manage");
  if (!result.authorized) return result.response;

  const parsed = yearCloseSchema.safeParse({
    year: new URL(request.url).searchParams.get("year"),
  });
  if (!parsed.success) return badRequest(parsed.error);

  const { year } = parsed.data;
  try {
    const undo = await reverseYearClose(year, Number(result.session.user.id));

    await writeAuditLog({
      userId: result.session.user.id,
      username: result.session.user.email,
      action: "year_close.reverse",
      entity: "year_close",
      details: { year, journalId: undo.journalId },
    });

    return NextResponse.json(undo);
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
 * Empat kegagalan yang punya arti bagi pemakainya. Sisanya dibiarkan naik —
 * yang tidak dikenali lebih baik menjadi 500 yang berisik daripada 400 yang
 * menyesatkan.
 */
async function knownError(e: unknown) {
  const { t } = await getRequestI18n();

  if (e instanceof AlreadyClosedError) {
    return NextResponse.json({ error: t("periods.yearAlreadyClosed") }, { status: 409 });
  }
  if (e instanceof NothingToCloseError) {
    return NextResponse.json({ error: t("periods.yearNothingToClose") }, { status: 409 });
  }
  /*
   * Slot `retained_earnings` belum dipetakan. Ini kegagalan yang paling mungkin
   * ditemui buku LAMA — pemetaannya lahir bersama #555, jadi tak satu pun buku
   * yang dibuat sebelumnya memilikinya. Kalimatnya karena itu menyebut apa yang
   * harus DILAKUKAN, bukan hanya apa yang salah.
   */
  if (e instanceof MissingMappingError) {
    return NextResponse.json({ error: t("periods.yearNoRetainedEarnings") }, { status: 409 });
  }
  if (e instanceof ClosedPeriodError) {
    return NextResponse.json(
      { error: t("periodClose.fxPeriodClosed", { period: `${e.month}/${e.year}` }) },
      { status: 409 }
    );
  }
  throw e;
}
