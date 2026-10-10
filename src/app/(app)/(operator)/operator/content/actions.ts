"use server";

/**
 * Server action ISI HALAMAN PENDARATAN — SENGAJA server action, bukan route
 * API: `tests/authz-coverage.test.ts` menolak `route.ts` mana pun di bawah grup
 * `(operator)`, karena permukaan `src/app/api` adalah permukaan PELANGGAN dan
 * konsol ini bukan.
 *
 * Lapisannya tipis — lima kewajiban, nol logika isi:
 *   1. penjaga bidang (`requireOperatorActionSession`: host + IP + cookie +
 *      MFA), sama seperti aksi tulis tenant #155 dan pengaturan surel #169;
 *   2. validasi ulang dengan SKEMA YANG SAMA yang dipakai editor client
 *      (`lib/validations/operator.ts` → `siteContentSchema`);
 *   3. saring kunci terhadap KAMUS — bukan terhadap daftar tulisan tangan.
 *      Inilah pemeriksaan yang menahan `entries` kiriman sendiri dari menulis
 *      penimpa atas kunci di luar `landing.*` (mis. `errors.*`): kalimat sistem
 *      bukan pemasaran, dan operator tidak boleh bisa mengosongkannya;
 *   4. panggil inti `lib/site-content-store.ts` (upsert/hapus + revalidasi tag);
 *   5. catat jejak audit operator — kunci mana saja yang berubah, bukan isinya.
 *
 * ⚠ Yang TIDAK dicatat ke jejak adalah NILAI barunya. Bukan karena ia rahasia
 * (ia akan terbit di halaman publik beberapa detik kemudian), melainkan karena
 * jejak audit yang memuat setiap kalimat pemasaran yang pernah diketik berhenti
 * bisa dibaca sebagai jejak. Yang dicatat: bahasa, bagian, daftar kunci yang
 * ditulis, daftar kunci yang dikembalikan ke bawaan, dan panjang nilainya.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getDictionary, getT } from "@/lib/i18n/server";
import { writeOperatorAuditLog } from "@/lib/operator/audit";
import { requireOperatorActionSession } from "@/lib/operator/guard";
import { clientIpFrom } from "@/lib/operator/plane";
import {
  SITE_CONTENT_PREFIX,
  isEditableContentKey,
  isSiteContentLocale,
} from "@/lib/site-content";
import { saveSiteContent } from "@/lib/site-content-store";
import { siteContentSchema } from "@/lib/validations/operator";

export interface OperatorContentActionResult {
  ok: boolean;
  /** Kalimat sukses/galat dalam bahasa pengguna — untuk `root` form. */
  message: string;
}

export async function operatorSaveSiteContent(
  input: unknown
): Promise<OperatorContentActionResult> {
  const t = await getT();

  const session = await requireOperatorActionSession();
  if (!session) {
    /* Jawaban seragam — tidak membedakan "host salah" dari "sesi habis". */
    return { ok: false, message: t("operator.actions.denied") };
  }

  const parsed = siteContentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };
  const { locale, section, entries } = parsed.data;

  if (!isSiteContentLocale(locale)) {
    return { ok: false, message: t("validation.invalidInput") };
  }

  /*
   * Kunci disaring terhadap kamus BAHASA ITU SENDIRI. Kamus mana tidak
   * menentukan hasilnya — `tests/i18n.test.ts` menuntut ketiga bahasa punya
   * kunci yang sama persis — tetapi memakai kamus bahasa yang sedang disunting
   * membuat pemeriksaan ini tetap benar bila suatu hari jaminan itu melemah.
   */
  const dictionary = await getDictionary(locale);
  const diterima: Record<string, string> = {};
  let ditolak = 0;
  for (const [name, value] of Object.entries(entries)) {
    const key = `${SITE_CONTENT_PREFIX}${name}`;
    if (!isEditableContentKey(dictionary, key)) {
      ditolak += 1;
      continue;
    }
    diterima[key] = value;
  }

  if (ditolak > 0) {
    /* Satu kunci asing berarti kiriman ini tidak datang dari layar yang
       dirender server — dan di permukaan seperti ini jawabannya penolakan
       UTUH, bukan penyimpanan separuh. Jejaknya ditulis: percobaan menulis
       kunci di luar `landing.*` adalah hal yang ingin dilihat seseorang. */
    await writeOperatorAuditLog({
      operator: session.operator.name,
      action: "operator.content.rejected",
      ipAddress: clientIpFrom(await headers()),
      details: { locale, section, rejectedKeys: ditolak },
    });
    return { ok: false, message: t("validation.invalidInput") };
  }

  let result;
  try {
    result = await saveSiteContent({
      locale,
      entries: diterima,
      actor: session.operator.name,
    });
  } catch (error) {
    /* Platform mati: tidak ada yang tersimpan, TETAPI halaman pendaratan tetap
     * tampil utuh dengan kalimat bawaan — itu yang dikatakan kalimatnya, bukan
     * "500". */
    console.error("[operator-content] penimpa gagal disimpan:", error);
    return { ok: false, message: t("operator.content.errSave") };
  }

  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.content.update",
    ipAddress: clientIpFrom(await headers()),
    details: {
      locale,
      section,
      updated: result.updated,
      reset: result.reset,
      /* PANJANGNYA, bukan nilainya — lihat kepala berkas. */
      lengths: Object.fromEntries(
        result.updated.map((key) => [key, diterima[key]?.trim().length ?? 0])
      ),
    },
  });

  revalidatePath("/operator/content");
  /* Halaman publiknya ikut: `revalidateTag` di dalam `saveSiteContent` sudah
     membuang query penimpanya, tapi `/` dan `/pricing` punya cache render
     sendiri. Keduanya `force-dynamic` hari ini — baris ini yang menjaga
     kebenaran kalau salah satunya kelak berhenti begitu. */
  revalidatePath("/");
  revalidatePath("/pricing");

  const nothing = result.updated.length === 0 && result.reset.length === 0;
  return {
    ok: true,
    message: nothing
      ? t("operator.content.savedNothing")
      : t("operator.content.saved", {
          updated: result.updated.length,
          reset: result.reset.length,
        }),
  };
}
