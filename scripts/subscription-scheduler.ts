/**
 * PENJADWAL LANGGANAN (issue #140) — trial berakhir, penerbitan tagihan,
 * dunning, suspensi, pengingat, sinkronisasi pemakaian, rekonsiliasi, dan
 * deteksi penyediaan yatim. Satu putaran per pemanggilan; tidak ada daemon.
 *
 *   bun run scheduler:subscriptions
 *
 * ══ CARA MENJADWALKANNYA ════════════════════════════════════════════════════
 * Aplikasi ini tidak punya (dan belum butuh) antrean kerja. Skrip ini
 * dirancang untuk cron — sekali per jam sudah lebih dari cukup untuk siklus
 * harian penagihan:
 *
 *   • Host (crontab -e), pemasangan compose:
 *       17 * * * *  cd /opt/applications/sai-accounting && \
 *         docker compose run --rm migrate bun run scheduler:subscriptions
 *     (service `migrate` = image & env yang sama dengan `web`, dan satu-satunya
 *      cara menjangkau service `db` yang tidak memublikasikan port — alasannya
 *      sama dengan migration, lihat docs/MULTI-COMPANY.md §3.)
 *   • Pemasangan tanpa Docker: `17 * * * * cd <app> && bun run scheduler:subscriptions`
 *
 * ══ IDEMPOTEN — DIJALANKAN DUA KALI TIDAK MENAGIH DUA KALI ══════════════════
 * Tiga mekanisme, semuanya di basis data, bukan di memori skrip:
 *   1. Perpindahan status lewat mesin murni (`transition`) — event yang sudah
 *      lewat menghasilkan `null` (bukan-perpindahan), bukan efek kedua.
 *   2. Nomor tagihan DETERMINISTIK (`invoiceNumberFor`) + UNIQUE di
 *      `platform_invoices.number` — putaran kedua menabrak constraint dan
 *      melewatinya, bukan menagih dua kali.
 *   3. Pengingat dicatat di `reminder_logs` dengan UNIQUE
 *      (subscription, kind, due_key) — surel yang sama tidak terkirim dua kali.
 *
 * ══ URUTAN TULIS (doktrin #137) ═════════════════════════════════════════════
 * Setiap perpindahan: `sai_platform` DULU, salinan `tenants.status` di kendali
 * BELAKANGAN. Crash di tengah = selisih "status-tak-serasi" yang ditemukan
 * rekonsiliasi (langkah terakhir putaran ini juga) dan sembuh pada putaran
 * berikutnya — bukan tenant yang naik kelas tanpa catatan.
 *
 * ══ TIDAK ADA PENGHAPUSAN DATA ══════════════════════════════════════════════
 * Tidak satu pun langkah menghapus baris — suspensi mengubah STATUS (buku
 * menjadi hanya-baca lewat penjaga), pembatalan mengubah STATUS. Deteksi
 * basis data yatim hanya MELAPOR; drop adalah keputusan orang.
 */

import "dotenv/config";
import { PrismaClient as PlatformClient } from "../src/generated/platform/client.js";
import { PrismaClient as ControlClient } from "../src/generated/control/client.js";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

import {
  GRACE_PERIOD_DAYS,
  invoiceNumberFor,
  platformInvoiceAmounts,
  nextPeriod,
  pendingReminder,
  planDunning,
  planGraceExpiries,
  planOrphanSubscriptionAdoptions,
  planTrialExpiries,
  tenantStatusForSubscription,
  transition,
  type SubscriptionEvent,
} from "../src/lib/subscription-lifecycle";
import { writeTenantAuditLog } from "../src/lib/tenant-audit";
import type { SubscriptionStatus } from "../src/lib/platform-constants";
import { sendMail } from "../src/lib/mailer-core";
import { resolvePaymentGateway } from "../src/lib/payment-gateway";
import { runReconciliation } from "./reconcile-platform";

function clientFor<T>(Ctor: new (args: { adapter: PrismaMariaDb }) => T, rawUrl: string): T {
  const url = new URL(rawUrl);
  return new Ctor({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      connectionLimit: 1,
    }),
  });
}

type Platform = InstanceType<typeof PlatformClient>;
type Control = InstanceType<typeof ControlClient>;

/** Baris instruksi bayar untuk surel pengingat — kosong bila tidak ada
 *  instruksi yang menunggu (jalur manual: /tenant yang menjelaskan). */
function paymentInstructionText(
  payment: { bank: string | null; vaNumber: string | null; qrString: string | null } | undefined
): string {
  if (!payment) return "Cara bayar & rincian tagihan: buka menu Langganan (/tenant) di aplikasi.\n";
  if (payment.vaNumber) {
    return `Bayar lewat Virtual Account ${(payment.bank ?? "").toUpperCase()}: ${payment.vaNumber}\n`;
  }
  if (payment.qrString) {
    return "Bayar lewat QRIS: buka menu Langganan (/tenant) untuk memindai kodenya.\n";
  }
  return "Cara bayar & rincian tagihan: buka menu Langganan (/tenant) di aplikasi.\n";
}

/** Email para OWNER sebuah tenant — penerima surel penagihan. */
async function ownerEmails(control: Control, tenantId: number): Promise<string[]> {
  const owners = await control.tenantMembership.findMany({
    where: { tenantId, role: "owner" },
    select: { user: { select: { email: true } } },
  });
  return owners.map((o) => o.user.email).filter((e): e is string => Boolean(e));
}

/**
 * Terapkan SATU event ke satu langganan: platform dulu (status + stempel
 * waktu), kendali belakangan (salinan status tenant). Mesin murni yang
 * memutuskan; `null` = tidak ada yang berubah (idempoten).
 */
async function applyEvent(
  platform: Platform,
  control: Control,
  subscription: { id: number; tenantId: number; status: string },
  event: SubscriptionEvent,
  now: Date
): Promise<SubscriptionStatus | null> {
  const next = transition(subscription.status as SubscriptionStatus, event);
  if (next === null || next === subscription.status) return null;

  /* 1 — PLATFORM dulu. */
  await platform.subscription.update({
    where: { id: subscription.id },
    data: {
      status: next,
      ...(next === "past_due" ? { pastDueSince: now } : {}),
      ...(event === "payment_received" ? { pastDueSince: null } : {}),
      ...(next === "cancelled" ? { cancelledAt: now } : {}),
    },
  });

  /* 2 — KENDALI belakangan: salinan status untuk penjaga hanya-baca. */
  const tenant = await control.tenant.update({
    where: { id: subscription.tenantId },
    data: { status: tenantStatusForSubscription(next) },
    select: { id: true, slug: true },
  });

  /* Transisi status adalah peristiwa TENANT — dicatat di jejak tenant (issue
   * #142); penulisnya "system": tidak ada manusia di kursi penjadwal. */
  await writeTenantAuditLog({
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    action: "tenant.status.change",
    details: { from: subscription.status, to: next, event },
  });

  return next;
}

async function main() {
  const platformUrl = process.env.PLATFORM_DATABASE_URL?.trim();
  const controlUrl = process.env.CONTROL_DATABASE_URL?.trim();
  if (!platformUrl) {
    console.warn(
      "⚠ PLATFORM_DATABASE_URL belum diset — pemasangan tanpa penagihan, tidak ada yang dijadwalkan."
    );
    process.exit(0);
  }
  if (!controlUrl) {
    console.error("✗ CONTROL_DATABASE_URL belum diset.");
    process.exit(1);
  }

  const platform = clientFor(PlatformClient, platformUrl);
  const control = clientFor(ControlClient, controlUrl);
  const now = new Date();
  const errors: string[] = [];

  /* Ringkasan putaran untuk `scheduler_runs` (issue #154): baris-baris yang
   * selama ini hanya tercetak di stdout dikumpulkan juga di sini, supaya
   * "apa yang terbit, apa yang diingatkan, apa yang gagal pada putaran
   * terakhir?" terjawab dari konsol operator tanpa SSH. */
  const summary = {
    issued: [] as string[],
    reminders: [] as string[],
    transitions: [] as string[],
    adoptions: [] as string[],
  };

  /* ── 0. Adopsi langganan YATIM (issue #152): tenant berbayar di kendali
   * TANPA satu pun langganan di platform tidak pernah masuk siklus tagih —
   * trial tak berujung, tagihan tak pernah terbit, tanpa galat. Sumbernya:
   * pendaftaran saat `sai_platform` mati/belum di-seed, pemasangan pra-#152
   * (pt-sai lewat adopt-tenant), atau crash di antara dua tulisan. Putaran ini
   * melahirkan langganannya dari `tenants.plan_key`, dengan `trial_ends_at`
   * KENDALI apa adanya — adopsi tidak pernah memperpanjang trial diam-diam.
   * Idempoten: putaran kedua melihat langganan hasil putaran pertama; putaran
   * KEMBAR ditahan UNIQUE `subscriptions.initial_for_tenant_id` (P2002 =
   * mundur dengan tenang), bukan periksa-lalu-tulis.
   * `pending_verification` TIDAK diadopsi — keadaan pra-langganan yang sah. */
  try {
    const tenants = await control.tenant.findMany({
      select: { id: true, slug: true, status: true, planKey: true, trialEndsAt: true },
    });
    const covered = await platform.subscription.findMany({ select: { tenantId: true } });
    const plans = await platform.plan.findMany({ where: { isActive: true } });
    const planByKey = new Map(plans.map((p) => [p.key, p]));
    const slugById = new Map(tenants.map((t) => [t.id, t.slug]));
    for (const orphan of planOrphanSubscriptionAdoptions(tenants, covered, now)) {
      const plan = planByKey.get(orphan.planKey);
      if (!plan) {
        errors.push(
          `adopsi-yatim tenant #${orphan.tenantId}: paket "${orphan.planKey}" tidak ada/` +
            "nonaktif di plans — jalankan bun run db:seed:plans, atau pindahkan paketnya " +
            "lewat bun run change-plan"
        );
        continue;
      }
      try {
        const period = nextPeriod("monthly", now);
        const created = await platform.subscription.create({
          data: {
            tenantId: orphan.tenantId,
            planId: plan.id,
            status: orphan.status,
            billingCycle: "monthly",
            /* SNAPSHOT harga (§5) — bukan rujukan ke `plans`. */
            price: plan.priceMonthly,
            currency: plan.currency,
            currentPeriodStart: period.start,
            currentPeriodEnd: period.end,
            trialEndsAt: orphan.trialEndsAt,
            pastDueSince: orphan.pastDueSince,
            initialForTenantId: orphan.tenantId,
          },
          select: { id: true },
        });
        console.log(
          `+ adopsi yatim: tenant #${orphan.tenantId} → subscription #${created.id} ` +
            `(${orphan.status}, paket "${plan.key}")`
        );
        summary.adoptions.push(
          `tenant #${orphan.tenantId} → subscription #${created.id} (${orphan.status}, paket "${plan.key}")`
        );
        await writeTenantAuditLog({
          tenantId: orphan.tenantId,
          tenantSlug: slugById.get(orphan.tenantId) ?? String(orphan.tenantId),
          action: "tenant.subscription.adopt",
          details: { subscriptionId: created.id, planKey: plan.key, status: orphan.status },
        });
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") {
          console.log(
            `= adopsi yatim tenant #${orphan.tenantId}: langganannya sudah lahir di tangan lain`
          );
        } else {
          errors.push(`adopsi-yatim tenant #${orphan.tenantId}: ${e}`);
        }
      }
    }
  } catch (e) {
    errors.push(`adopsi-yatim: ${e}`);
  }

  const subscriptions = await platform.subscription.findMany({
    where: { status: { not: "cancelled" } },
    select: {
      id: true,
      tenantId: true,
      status: true,
      billingCycle: true,
      price: true,
      currency: true,
      trialEndsAt: true,
      pastDueSince: true,
      currentPeriodEnd: true,
    },
  });

  /* ── 1. Trial habis → siklus tagih dimulai + tagihan pertama terbit ────── */
  for (const id of planTrialExpiries(subscriptions, now)) {
    const sub = subscriptions.find((s) => s.id === id)!;
    try {
      const period = nextPeriod(sub.billingCycle === "yearly" ? "yearly" : "monthly", now);
      const applied = await applyEvent(platform, control, sub, "trial_expired", now);
      if (applied === null) continue;
      summary.transitions.push(`sub #${sub.id}: trialing → ${applied} (trial habis)`);
      await platform.subscription.update({
        where: { id: sub.id },
        data: { currentPeriodStart: period.start, currentPeriodEnd: period.end },
      });

      /* Tagihan pertama — nomor deterministik = kunci idempotensinya.
       * PPN dihitung lewat lib/tax.ts (issue #141) — tarifnya tidak pernah
       * diketik ulang; sakelar PLATFORM_PPN_DISABLED = mekanisme untuk
       * jawaban penasihat pajak, bukan kebijakan yang kami tetapkan. */
      const number = invoiceNumberFor(sub.id, period.start);
      const amounts = platformInvoiceAmounts(
        sub.price.toString(),
        process.env.PLATFORM_PPN_DISABLED !== "true"
      );
      try {
        const invoice = await platform.platformInvoice.create({
          data: {
            tenantId: sub.tenantId,
            subscriptionId: sub.id,
            number,
            status: "issued",
            issueDate: now,
            dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
            amount: amounts.amount,
            taxAmount: amounts.taxAmount,
            total: amounts.total,
            currency: sub.currency,
          },
        });
        console.log(
          `+ trial habis: sub #${sub.id} → active, tagihan ${number} terbit ` +
            `(DPP ${amounts.amount} + PPN ${amounts.taxAmount} = ${amounts.total})`
        );
        summary.issued.push(`${number} (sub #${sub.id}, total ${amounts.total})`);

        /* Tagih-lalu-ingatkan (bukan auto-debit): instruksi bayar (VA) dibuat
         * BERSAMA tagihannya bila gerbang terpasang — surel pengingat H-x
         * tinggal menyebut nomornya. Jalur `manual` tidak membuat charge;
         * pelanggan melihat instruksi transfer di /tenant. */
        const gateway = resolvePaymentGateway();
        if (gateway.name !== "manual") {
          try {
            const charge = await gateway.createCharge({
              invoiceNumber: number,
              grossAmount: amounts.total,
              method: "virtual_account",
              bank: process.env.PAYMENT_DEFAULT_VA_BANK ?? "bca",
            });
            await platform.payment.create({
              data: {
                tenantId: sub.tenantId,
                platformInvoiceId: invoice.id,
                status: "pending",
                method: charge.method,
                gateway: charge.gateway,
                gatewayRef: charge.gatewayRef,
                amount: amounts.total,
                currency: sub.currency,
                bank: charge.bank ?? null,
                vaNumber: charge.vaNumber ?? null,
                qrString: charge.qrString ?? null,
                expiresAt: charge.expiresAt ?? null,
              },
            });
            console.log(`  ↳ VA ${charge.bank ?? "?"} ${charge.vaNumber ?? "?"} disiapkan (${charge.gatewayRef})`);
          } catch (chargeError) {
            if ((chargeError as { code?: string }).code === "P2002") {
              console.log("  = instruksi bayar sudah ada — tidak dibuat dua kali");
            } else {
              /* Gerbang mati ≠ tagihan batal: tagihannya SUDAH terbit; VA bisa
               * dibuat pelanggan dari /tenant atau putaran berikutnya. */
              errors.push(`charge tagihan ${number}: ${chargeError}`);
            }
          }
        }
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") {
          console.log(`= tagihan ${number} sudah ada — tidak ditagih dua kali`);
        } else throw e;
      }
    } catch (e) {
      errors.push(`trial-expiry sub #${id}: ${e}`);
    }
  }

  /* ── 2. Dunning: tagihan lewat jatuh tempo pada langganan aktif ────────── */
  try {
    const issued = await platform.platformInvoice.findMany({
      where: { status: "issued" },
      select: { id: true, subscriptionId: true, status: true, dueDate: true },
    });
    const statusById = new Map(subscriptions.map((s) => [s.id, s.status]));
    for (const subId of new Set(planDunning(issued, statusById, now))) {
      const sub = subscriptions.find((s) => s.id === subId);
      if (!sub) continue;
      const applied = await applyEvent(platform, control, sub, "payment_failed", now);
      if (applied) {
        sub.status = applied;
        console.log(`~ dunning: sub #${subId} → past_due (tenggang ${GRACE_PERIOD_DAYS} hari)`);
        summary.transitions.push(`sub #${subId}: → ${applied} (lewat jatuh tempo)`);
      }
    }
  } catch (e) {
    errors.push(`dunning: ${e}`);
  }

  /* ── 3. Masa tenggang habis → suspended (HANYA-BACA — bukan terhapus) ──── */
  for (const id of planGraceExpiries(subscriptions, now)) {
    const sub = subscriptions.find((s) => s.id === id)!;
    try {
      const applied = await applyEvent(platform, control, sub, "grace_expired", now);
      if (applied) {
        sub.status = applied;
        console.log(`~ tenggang habis: sub #${id} → suspended (buku jadi hanya-baca)`);
        summary.transitions.push(`sub #${id}: → ${applied} (masa tenggang habis)`);
      }
    } catch (e) {
      errors.push(`grace-expiry sub #${id}: ${e}`);
    }
  }

  /* ── 4. Pengingat H-7/H-3/H-1 (trial & jatuh tempo tagihan) ────────────── */
  try {
    const logs = await platform.reminderLog.findMany({
      select: { subscriptionId: true, kind: true, dueKey: true },
    });
    const sentBySub = new Map<string, Set<string>>();
    for (const log of logs) {
      const key = `${log.subscriptionId}:${log.kind}`;
      if (!sentBySub.has(key)) sentBySub.set(key, new Set());
      sentBySub.get(key)!.add(log.dueKey);
    }

    const targets: { sub: (typeof subscriptions)[number]; kind: "trial_ending" | "invoice_due"; target: Date }[] = [];
    for (const sub of subscriptions) {
      if (sub.status === "trialing" && sub.trialEndsAt) {
        targets.push({ sub, kind: "trial_ending", target: sub.trialEndsAt });
      }
    }
    const issuedInvoices = await platform.platformInvoice.findMany({
      where: { status: "issued" },
      select: { id: true, subscriptionId: true, dueDate: true, number: true },
    });
    /* Instruksi bayar yang masih menunggu (issue #141) — pengingat jatuh tempo
     * menyebut nomor VA-nya, bukan sekadar "bayarlah". */
    const pendingPayments = await platform.payment.findMany({
      where: { status: "pending", platformInvoiceId: { in: issuedInvoices.map((i) => i.id) } },
      select: { platformInvoiceId: true, bank: true, vaNumber: true, qrString: true },
      orderBy: { id: "desc" },
    });
    const paymentByInvoice = new Map<number, (typeof pendingPayments)[number]>();
    for (const p of pendingPayments) {
      if (!paymentByInvoice.has(p.platformInvoiceId)) paymentByInvoice.set(p.platformInvoiceId, p);
    }
    const invoiceBySub = new Map<number, (typeof issuedInvoices)[number]>();
    for (const inv of issuedInvoices) {
      const sub = subscriptions.find((s) => s.id === inv.subscriptionId);
      if (sub) {
        targets.push({ sub, kind: "invoice_due", target: inv.dueDate });
        invoiceBySub.set(sub.id, inv);
      }
    }

    for (const { sub, kind, target } of targets) {
      const sent = sentBySub.get(`${sub.id}:${kind}`) ?? new Set<string>();
      const due = pendingReminder(target, now, sent);
      if (!due) continue;

      /* Catat DULU (unique = idempoten), kirim SESUDAHNYA: putaran kembar
       * yang berlomba menabrak constraint, bukan mengirim dua kali. */
      try {
        await platform.reminderLog.createMany({
          data: due.markKeys.map((dueKey) => ({ subscriptionId: sub.id, kind, dueKey })),
        });
      } catch (e) {
        if ((e as { code?: string }).code === "P2002") continue;
        throw e;
      }

      const recipients = await ownerEmails(control, sub.tenantId);
      const dayLabel = due.sendKey.split(":")[0]; // "H-7" | "H-3" | "H-1"
      for (const to of recipients) {
        await sendMail({
          to,
          subject:
            kind === "trial_ending"
              ? `Masa uji coba berakhir ${dayLabel} — SAI Accounting`
              : `Tagihan langganan jatuh tempo ${dayLabel} — SAI Accounting`,
          text:
            kind === "trial_ending"
              ? `Halo,\n\nMasa uji coba langganan Anda berakhir pada ${target.toISOString().slice(0, 10)}.\n` +
                "Setelah itu siklus tagih dimulai dan tagihan pertama terbit otomatis.\n\n— SAI Accounting"
              : `Halo,\n\nTagihan langganan Anda jatuh tempo pada ${target.toISOString().slice(0, 10)}.\n` +
                paymentInstructionText(invoiceBySub.get(sub.id) && paymentByInvoice.get(invoiceBySub.get(sub.id)!.id)) +
                "Bila terlewat, langganan menunggak dan setelah masa tenggang buku besar\n" +
                "menjadi HANYA-BACA (data Anda tidak dihapus).\n\n— SAI Accounting",
        });
      }
      console.log(`✉ pengingat ${kind} ${due.sendKey} → sub #${sub.id} (${recipients.length} owner)`);
      summary.reminders.push(`${kind} ${due.sendKey} → sub #${sub.id} (${recipients.length} owner)`);
    }
  } catch (e) {
    errors.push(`pengingat: ${e}`);
  }

  /* ── 5. Sinkronisasi usage_counters dari jumlah SESUNGGUHNYA di kendali ──
   * Data turunan (kendali = sumber kebenarannya), jadi urutan tulis #137
   * tidak bermain di sini; yang penting stempel `synced_at`. */
  try {
    const tenants = await control.tenant.findMany({ select: { id: true } });
    for (const tenant of tenants) {
      const [companies, users] = await Promise.all([
        control.company.count({ where: { tenantId: tenant.id, isActive: true } }),
        control.user.count({ where: { tenantId: tenant.id } }),
      ]);
      for (const [key, value] of [
        ["companies", companies],
        ["users", users],
      ] as const) {
        await platform.usageCounter.upsert({
          where: { tenantId_key: { tenantId: tenant.id, key } },
          create: { tenantId: tenant.id, key, value, syncedAt: now },
          update: { value, syncedAt: now },
        });
      }
    }
    console.log(`↻ usage_counters disinkronkan untuk ${tenants.length} tenant`);
  } catch (e) {
    errors.push(`usage-sync: ${e}`);
  }

  /* ── 6. Deteksi penyediaan YATIM (crash di tengah provisionCompany):
   * basis data `sai_*` yang tidak dikenal registry. LAPOR SAJA — percobaan
   * ulang/pembersihan adalah keputusan orang; skrip tidak menghapus apa pun. */
  try {
    const rows = await control.$queryRaw<Array<{ name: string }>>`
      SELECT SCHEMA_NAME AS name FROM information_schema.SCHEMATA
      WHERE SCHEMA_NAME LIKE 'sai\\_%'`;
    const registered = new Set(
      (await control.company.findMany({ select: { databaseName: true } })).map(
        (c) => c.databaseName
      )
    );
    const infra = new Set(
      [platformUrl, controlUrl].map((u) => new URL(u).pathname.slice(1))
    );
    const orphans = rows
      .map((r) => r.name)
      .filter((name) => !registered.has(name) && !infra.has(name));
    if (orphans.length > 0) {
      errors.push(
        `basis data yatim (dibuat tapi tak terdaftar — penyediaan gagal di tengah?): ${orphans.join(", ")} ` +
          "— daftarkan lewat bun run adopt-company, atau hapus MANUAL setelah diperiksa orang"
      );
    }
  } catch {
    console.log("⏭ deteksi basis data yatim dilewati (tak berhak SHOW DATABASES)");
  }

  /* ── 7. Rekonsiliasi platform ↔ kendali (inti #137, kini terjadwal) ────── */
  try {
    const report = await runReconciliation(platform, control);
    for (const item of report.skipped) console.log(`  ⏭ rekonsiliasi: ${item}`);
    if (report.findings.length > 0) {
      for (const f of report.findings) errors.push(`rekonsiliasi [${f.check}] ${f.detail}`);
    } else {
      console.log("✓ rekonsiliasi: tidak ada selisih");
    }
  } catch (e) {
    errors.push(`rekonsiliasi: ${e}`);
  }

  /* ── 8. Catat ringkasan putaran (issue #154, tabel `scheduler_runs`) ─────
   * Gagal MENCATAT tidak menggagalkan putarannya: ringkasan adalah laporan,
   * bukan gerbang — dan pemasangan yang belum memigrasikan 0005 tidak boleh
   * kehilangan penagihannya hanya karena riwayatnya belum punya tabel. */
  try {
    await platform.schedulerRun.create({
      data: {
        startedAt: now,
        finishedAt: new Date(),
        status: errors.length > 0 ? "error" : "ok",
        invoicesIssued: summary.issued.length,
        remindersSent: summary.reminders.length,
        statusChanges: summary.transitions.length,
        adoptions: summary.adoptions.length,
        errorCount: errors.length,
        details: JSON.stringify({ ...summary, errors }),
      },
    });
  } catch (e) {
    console.error("⚠ ringkasan putaran gagal dicatat ke scheduler_runs (migration 0005 sudah diterapkan?):", e);
  }

  await platform.$disconnect();
  await control.$disconnect();

  if (errors.length > 0) {
    console.error(`✗ ${errors.length} masalah pada putaran ini:`);
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }
  console.log("✓ Putaran penjadwal selesai tanpa masalah.");
}

main().catch((error) => {
  console.error("Penjadwal gagal berjalan:", error);
  process.exit(1);
});
