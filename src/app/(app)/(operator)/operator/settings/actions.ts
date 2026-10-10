"use server";

/**
 * Server action PENGATURAN SITUS — tiga nilai yang berhenti menuntut SSH.
 *
 * SENGAJA server action, bukan route API: `tests/authz-coverage.test.ts`
 * menolak `route.ts` mana pun di bawah grup `(operator)`, sebab permukaan
 * `src/app/api` adalah permukaan PELANGGAN dan konsol ini bukan.
 *
 * Lapisannya tipis — empat kewajiban, nol logika setelan:
 *   1. penjaga bidang (`requireOperatorActionSession`: host + IP + cookie +
 *      MFA), sama seperti aksi tulis #155 dan pengaturan surel #169;
 *   2. validasi ulang dengan SKEMA YANG SAMA yang dipakai formulir client;
 *   3. panggil inti `lib/site-settings.ts` (presedensi DB→env + revalidasi
 *      hidup di sana, teruji tanpa basis data);
 *   4. catat jejak audit operator — nilai lamanya ikut, supaya perubahan bisa
 *      ditelusuri DAN dibalik.
 *
 * ⚠ Nomor telepon & alamat surel BUKAN rahasia (keduanya memang dipajang di
 * halaman publik), jadi nilainya boleh masuk jejak. Instruksi transfer memuat
 * nomor rekening — dan itu pun dipajang ke pelanggan, jadi ia bukan rahasia
 * either. Yang TIDAK boleh masuk jejak tetap kredensial (kata sandi SMTP,
 * kunci gerbang bayar), dan aksi ini tidak menyentuh satu pun.
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getT } from "@/lib/i18n/server";
import { writeOperatorAuditLog } from "@/lib/operator/audit";
import { requireOperatorActionSession } from "@/lib/operator/guard";
import { clientIpFrom } from "@/lib/operator/plane";
import {
  saveSiteSettings,
  siteSettingsForOperator,
  resetSiteSettings,
} from "@/lib/site-settings";
import { siteSettingsSchema } from "@/lib/validations/operator";

export interface OperatorSettingsResult {
  ok: boolean;
  /** Kalimat sukses/galat dalam bahasa pengguna — untuk `root` form. */
  message: string;
}

/** Permukaan publik mana yang ikut berubah begitu setelan ini tersimpan. */
function segarkanPermukaan(): void {
  revalidatePath("/operator/settings");
  /* Ketiganya memajang kanal kontak: pendaratan (tombol WhatsApp melayang,
     jawaban FAQ, kaki kartu rundingan), halaman harga, dan layar penawaran. */
  revalidatePath("/");
  revalidatePath("/pricing");
  revalidatePath("/register");
}

export async function operatorSaveSiteSettings(
  input: unknown
): Promise<OperatorSettingsResult> {
  const t = await getT();

  const session = await requireOperatorActionSession();
  if (!session) {
    /* Jawaban seragam — tidak membedakan "host salah" dari "sesi habis". */
    return { ok: false, message: t("operator.actions.denied") };
  }

  const parsed = siteSettingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: t("validation.invalidInput") };
  const data = parsed.data;

  /* Nilai LAMA dibaca lebih dulu supaya jejaknya memuat dari-apa-ke-apa; tanpa
     itu, jejak hanya mengatakan "nomornya diganti" dan membalikkannya menuntut
     menebak. Platform tak terjangkau di sini bukan penghalang menulis — ia
     hanya membuat jejaknya kurang satu sisi, dan itu dinyatakan apa adanya. */
  const sebelum = await siteSettingsForOperator();
  const lama = sebelum === "unreachable" || sebelum === null ? null : sebelum;

  /* `env` → `null` (serahkan ke pengaturan server); `on`/`off` → keputusan
     konsol. Pemetaan ini satu baris dan ia yang menjaga tiga keadaan tetap
     tiga — lihat kepala `siteSettingsSchema`. */
  const triState = (v: "env" | "on" | "off"): boolean | null =>
    v === "env" ? null : v === "on";

  try {
    await saveSiteSettings({
      /* Kosong = CABUT kanalnya, bukan "pakai environment" — kedua maksud itu
         punya jalannya masing-masing; lihat kepala `siteSettingsSchema`. */
      contactWhatsapp: data.contactWhatsapp,
      contactEmail: data.contactEmail,
      manualPaymentInstructions: data.manualPaymentInstructions,
      selfServeSignupOpen: triState(data.selfServeSignup),
      ppnEnabled: triState(data.ppn),
      actor: session.operator.name,
    });
  } catch (error) {
    /* Platform mati: setelan tidak tersimpan, TETAPI halaman publik tetap
       memakai nilai environment — itu yang dikatakan kalimatnya, bukan "500". */
    console.error("[operator-settings] pengaturan gagal disimpan:", error);
    return { ok: false, message: t("operator.settings.errSave") };
  }

  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.settings.update",
    ipAddress: clientIpFrom(await headers()),
    details: {
      whatsappFrom: lama?.contactWhatsapp ?? null,
      whatsappTo: data.contactWhatsapp,
      emailFrom: lama?.contactEmail ?? null,
      emailTo: data.contactEmail,
      /* Instruksi transfer bisa panjang; yang dicatat PANJANGNYA + apakah ia
         kini terisi. Isinya sendiri ada di barisnya dan dipajang ke pelanggan,
         jadi jejak tidak perlu menyalinnya. */
      paymentInstructionsLength: data.manualPaymentInstructions.length,
      paymentInstructionsSet: data.manualPaymentInstructions.length > 0,
      previousRowExisted: lama !== null,
      /* DUA GERBANG — nilai lama DAN baru, sebab keduanya mengubah hal yang
         dilihat/dibayar orang luar: yang pertama membuka corong komersial,
         yang kedua mengubah NOMINAL yang ditagih. */
      signupFrom: lama?.selfServeSignupOpen ?? null,
      signupTo: triState(data.selfServeSignup),
      ppnFrom: lama?.ppnEnabled ?? null,
      ppnTo: triState(data.ppn),
    },
  });

  segarkanPermukaan();
  return { ok: true, message: t("operator.settings.saved") };
}

/**
 * Kembalikan ketiganya ke ENVIRONMENT — barisnya dihapus.
 *
 * Jalan tersendiri, dan itu bukan kemewahan: formulir HTML tidak bisa mengirim
 * `null`, jadi "kosongkan kanalnya" dan "serahkan kembali ke `.env`" tidak bisa
 * dibedakan dari satu kotak teks. Menebaknya berarti satu dari dua maksud
 * dilakukan secara diam-diam — dan yang satu memajang nomor lama yang masih
 * tertinggal di environment.
 */
export async function operatorResetSiteSettings(): Promise<OperatorSettingsResult> {
  const t = await getT();

  const session = await requireOperatorActionSession();
  if (!session) return { ok: false, message: t("operator.actions.denied") };

  try {
    await resetSiteSettings();
  } catch (error) {
    console.error("[operator-settings] pengaturan gagal dikembalikan:", error);
    return { ok: false, message: t("operator.settings.errSave") };
  }

  await writeOperatorAuditLog({
    operator: session.operator.name,
    action: "operator.settings.reset",
    ipAddress: clientIpFrom(await headers()),
  });

  segarkanPermukaan();
  return { ok: true, message: t("operator.settings.resetDone") };
}
