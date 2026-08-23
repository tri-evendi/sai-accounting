/**
 * Templat transaksi berulang (issue #469, tahap 3).
 *
 * GET  → daftar templat + kejadian berikutnya
 * POST → buat templat baru
 *
 * ══ KENAPA IZINNYA `invoice.*`, BUKAN SUMBER DAYA BARU ══════════════════════
 * Sebuah templat tidak menyimpan angka apa pun; yang ia lakukan adalah
 * MENERBITKAN FAKTUR sendiri setiap bulan. Orang yang boleh membuatnya karena
 * itu adalah orang yang boleh membuat faktur — tidak lebih, dan menambah
 * sumber daya izin ke-34 hanya akan membuat dua daftar yang harus dijaga
 * sinkron tanpa satu pun keputusan baru yang diwakilinya.
 *
 * Kalau kelak templat jurnal ikut didukung (tahap berikutnya), izinnya
 * mengikuti jenisnya — dan barulah pemisahan itu mewakili sesuatu.
 */
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { requireApiPermission } from "@/lib/auth-guard";
import { writeAuditLog } from "@/lib/audit";
import { getRequestI18n } from "@/lib/i18n/server";
import { translateFieldErrors } from "@/lib/i18n/validation";
import { recurringTemplateSchema } from "@/lib/validations/recurring";
import { nextOccurrence, type RecurrenceRule } from "@/lib/recurring";

export const dynamic = "force-dynamic";

export async function GET() {
  const result = await requireApiPermission("invoice.read");
  if (!result.authorized) return result.response;

  const templates = await prisma.recurringTemplate.findMany({
    orderBy: [{ isActive: "desc" }, { id: "desc" }],
  });

  const today = new Date();
  return NextResponse.json(
    templates.map((t) => ({
      ...t,
      /* Dihitung, tidak disimpan: kejadian berikutnya adalah turunan dari
         aturannya, dan kolom yang menyimpannya akan basi diam-diam setiap kali
         aturannya disunting. */
      nextAt: nextOccurrence(ruleOf(t), today),
    }))
  );
}

export async function POST(request: Request) {
  const result = await requireApiPermission("invoice.write");
  if (!result.authorized) return result.response;
  const { t, dictionary } = await getRequestI18n();

  const parsed = recurringTemplateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: t("validation.invalidInput"),
        details: translateFieldErrors(parsed.error, dictionary),
      },
      { status: 400 }
    );
  }

  /* Sumbernya DIBUKTIKAN ada sebelum templatnya lahir. Templat yang menunjuk
     faktur yang tak pernah ada hanya akan menahan dirinya sendiri setiap bulan
     (`held_source`) — kegagalan yang lahir pada saat pembuatan tapi baru
     terlihat sebulan kemudian. */
  if (parsed.data.kind === "invoice") {
    const source = await prisma.invoice.findUnique({
      where: { id: parsed.data.sourceId },
      select: { id: true },
    });
    if (!source) {
      return NextResponse.json({ error: t("errors.invoiceNotFound") }, { status: 404 });
    }
  }

  const created = await prisma.recurringTemplate.create({
    data: {
      name: parsed.data.name,
      kind: parsed.data.kind,
      sourceId: parsed.data.sourceId,
      frequency: parsed.data.frequency,
      startDate: new Date(parsed.data.startDate),
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      maxOccurrences: parsed.data.maxOccurrences ?? null,
      isActive: parsed.data.isActive,
    },
  });

  await writeAuditLog({
    userId: result.session.user.id,
    username: result.session.user.email,
    role: result.session.user.role,
    action: "recurring.template.create",
    entity: "recurring_template",
    entityId: created.id,
    details: { name: created.name, frequency: created.frequency, kind: created.kind },
    request,
  });

  return NextResponse.json(created, { status: 201 });
}

function ruleOf(t: {
  frequency: string;
  startDate: Date;
  endDate: Date | null;
  maxOccurrences: number | null;
}): RecurrenceRule {
  return {
    frequency: t.frequency as RecurrenceRule["frequency"],
    startDate: t.startDate,
    endDate: t.endDate,
    maxOccurrences: t.maxOccurrences,
  };
}
