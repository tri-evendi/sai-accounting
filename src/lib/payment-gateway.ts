/**
 * GERBANG PEMBAYARAN Indonesia (issue #141) — abstraksi kecil dengan SATU
 * implementasi kelas-satu (Midtrans; Xendit/Doku tinggal mengisi antarmuka
 * yang sama), `manual` (transfer bank biasa) sebagai cadangan, dan transport
 * `mock` untuk pengembangan — pola yang sama persis dengan `mailer-core.ts`:
 *
 *   PAYMENT_GATEWAY=manual   (BAWAAN) — tanpa gerbang: instruksi transfer
 *       manual dari MANUAL_PAYMENT_INSTRUCTIONS; pembayaran ditandai lunas
 *       oleh operator (webhook tidak bermain).
 *   PAYMENT_GATEWAY=midtrans — Virtual Account + QRIS lewat Midtrans Core API.
 *       Transportnya:
 *         • mock (BAWAAN di luar produksi, dan bila kredensial kosong):
 *           TIDAK ADA satu pun panggilan jaringan — nomor VA/string QR
 *           deterministik dari nomor tagihan, cukup untuk menguji seluruh
 *           alur (buat tagihan → tampil VA → webhook → lunas) di laptop.
 *         • real: menuntut NODE_ENV=production DAN MIDTRANS_SERVER_KEY —
 *           salah set satu variabel di laptop TIDAK membuat tagihan
 *           sungguhan ke gerbang sungguhan.
 *
 * ══ YANG TIDAK PERNAH ADA DI SINI ═══════════════════════════════════════════
 * Data kartu. Menyimpannya menyeret PCI-DSS tanpa alasan; yang kita simpan
 * hanya REFERENSI gerbang (`gateway_ref`), nomor VA, dan payload QR — semuanya
 * memang dirancang untuk diperlihatkan ke pembayar.
 *
 * ══ TANPA `server-only` ═════════════════════════════════════════════════════
 * Sengaja, alasan yang sama dengan `mailer-core.ts`: penjadwal
 * (`scripts/subscription-scheduler.ts`, tsx di luar Next) membuat tagihan dan
 * WAJIB bisa membuat instruksi bayarnya. Tidak ada komponen client yang
 * mengimpor modul ini; kredensial hanya dibaca dari `process.env` di sisi
 * server/skrip.
 *
 * ══ VERIFIKASI TANDA TANGAN WEBHOOK (MURNI) ═════════════════════════════════
 * `verifyMidtransSignature` — SHA-512(order_id + status_code + gross_amount +
 * serverKey), rumus resmi notifikasi HTTP Midtrans. Murni supaya teruji tanpa
 * jaringan dan tanpa kredensial sungguhan.
 */

import { createHash, timingSafeEqual } from "node:crypto";

export type PaymentMethod = "virtual_account" | "qris" | "manual_transfer";

export interface CreateChargeInput {
  /** Nomor tagihan platform — menjadi `order_id` di gerbang. */
  invoiceNumber: string;
  /** Nominal IDR, string desimal `Decimal(15,2)` apa adanya dari basis data. */
  grossAmount: string;
  method: Exclude<PaymentMethod, "manual_transfer">;
  /** Bank VA (bca | bni | bri | permata). Diabaikan untuk QRIS. */
  bank?: string;
}

export interface ChargeResult {
  /** midtrans | manual — nilai kolom `payments.gateway`. */
  gateway: string;
  /** Id transaksi di sisi gerbang → `payments.gateway_ref` (kunci idempotensi). */
  gatewayRef: string;
  method: PaymentMethod;
  bank?: string;
  vaNumber?: string;
  qrString?: string;
  expiresAt?: Date;
  /** Instruksi teks (jalur manual) — ditampilkan apa adanya. */
  instructions?: string;
}

export interface PaymentGateway {
  readonly name: string;
  createCharge(input: CreateChargeInput): Promise<ChargeResult>;
}

/* ── Midtrans ──────────────────────────────────────────────────────────────── */

/** Notifikasi HTTP Midtrans — kolom yang kita baca (payload aslinya lebih luas). */
export interface MidtransNotification {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  /** settlement | capture | pending | deny | cancel | expire | refund | … */
  transaction_status: string;
  transaction_id: string;
  payment_type?: string;
}

/** SHA-512(order_id + status_code + gross_amount + serverKey) — rumus resmi. */
export function midtransSignature(
  n: Pick<MidtransNotification, "order_id" | "status_code" | "gross_amount">,
  serverKey: string
): string {
  return createHash("sha512")
    .update(n.order_id + n.status_code + n.gross_amount + serverKey)
    .digest("hex");
}

export function verifyMidtransSignature(n: MidtransNotification, serverKey: string): boolean {
  /* Perbandingan waktu-konstan: tanda tangan adalah kredensial, dan `===`
   * berhenti pada byte pertama yang berbeda. */
  const given = Buffer.from(n.signature_key, "utf8");
  const expected = Buffer.from(midtransSignature(n, serverKey), "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * Status transaksi gerbang → status `payments.status` kita. `null` = notifikasi
 * yang tidak mengubah apa pun (mis. `refund` ditangani orang, bukan otomatis).
 * `deny`/`cancel` = failed, `expire` = expired — dua-duanya berujung event
 * `payment_failed` di mesin siklus hidup, yang membawa langganan ke `past_due`
 * — TIDAK PERNAH langsung `suspended` (suspensi hanya lewat masa tenggang).
 */
export function mapTransactionStatus(
  transactionStatus: string
): "paid" | "pending" | "failed" | "expired" | null {
  switch (transactionStatus) {
    case "settlement":
    case "capture":
      return "paid";
    case "pending":
      return "pending";
    case "deny":
    case "cancel":
      return "failed";
    case "expire":
      return "expired";
    default:
      return null;
  }
}

/** Umur instruksi bayar: 24 jam — konvensi VA Midtrans; cukup diingatkan ulang
 *  oleh dunning H-x bila lewat. */
export const CHARGE_TTL_MS = 24 * 60 * 60 * 1000;

/** Transport mock: deterministik dari nomor tagihan, nol jaringan. */
function mockCharge(input: CreateChargeInput, now: Date): ChargeResult {
  const digest = createHash("sha256").update(input.invoiceNumber).digest("hex");
  /* 10 digit deterministik dari hash — tanpa literal BigInt (target TS < ES2020). */
  const digits = String(parseInt(digest.slice(0, 12), 16) % 10_000_000_000).padStart(10, "0");
  const base = {
    gateway: "midtrans",
    gatewayRef: `mock-${digest.slice(0, 16)}`,
    expiresAt: new Date(now.getTime() + CHARGE_TTL_MS),
  };
  if (input.method === "qris") {
    return { ...base, method: "qris", qrString: `MOCK-QRIS|${input.invoiceNumber}|${input.grossAmount}` };
  }
  const bank = (input.bank ?? "bca").toLowerCase();
  return { ...base, method: "virtual_account", bank, vaNumber: `88${digits}` };
}

/**
 * Titik ujung Midtrans.
 *
 * `isProduction` DITERUSKAN, tidak dibaca dari env di dalam sini: sejak #466
 * setiap PT membawa kredensial dan sakelar sandbox/produksinya sendiri
 * (`company-payment-settings.ts`), dan sebuah fungsi yang diam-diam bertanya
 * pada env akan mengirim kunci produksi milik satu PT ke titik ujung sandbox —
 * kegagalan yang tidak berisik: ia menerbitkan VA yang tampak sah dan tidak
 * pernah menerima satu rupiah pun.
 *
 * Bawaannya tetap membaca env supaya alur langganan SaaS yang sudah jalan
 * tidak berubah sedikit pun.
 */
function midtransBaseUrl(
  isProduction: boolean = process.env.MIDTRANS_IS_PRODUCTION === "true"
): string {
  return isProduction ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
}

/** Transport real: Midtrans Core API `/v2/charge`. Hanya hidup di produksi
 *  dengan kredensial — lihat `resolvePaymentGateway`. */
async function midtransCharge(
  input: CreateChargeInput,
  serverKey: string,
  isProduction?: boolean
): Promise<ChargeResult> {
  const payload: Record<string, unknown> = {
    transaction_details: {
      order_id: input.invoiceNumber,
      /* Midtrans menuntut gross_amount ANGKA; IDR tak berpecahan, jadi
       * pembulatannya tidak menyentuh nilai. Kolom kita tetap Decimal(15,2). */
      gross_amount: Math.round(Number(input.grossAmount)),
    },
    ...(input.method === "qris"
      ? { payment_type: "qris" }
      : {
          payment_type: "bank_transfer",
          bank_transfer: { bank: (input.bank ?? "bca").toLowerCase() },
        }),
  };

  const response = await fetch(`${midtransBaseUrl(isProduction)}/v2/charge`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
    },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as {
    status_code?: string;
    status_message?: string;
    transaction_id?: string;
    va_numbers?: Array<{ bank: string; va_number: string }>;
    permata_va_number?: string;
    qr_string?: string;
    expiry_time?: string;
  };
  if (!response.ok || !body.transaction_id) {
    throw new Error(`Midtrans menolak charge: ${body.status_code ?? response.status} ${body.status_message ?? ""}`);
  }

  const va = body.va_numbers?.[0];
  return {
    gateway: "midtrans",
    gatewayRef: body.transaction_id,
    method: input.method,
    bank: va?.bank ?? (body.permata_va_number ? "permata" : input.bank),
    vaNumber: va?.va_number ?? body.permata_va_number,
    qrString: body.qr_string,
    expiresAt: body.expiry_time ? new Date(body.expiry_time) : undefined,
  };
}

/* ── Manual (cadangan tanpa gerbang) ───────────────────────────────────────── */

function manualGateway(): PaymentGateway {
  return {
    name: "manual",
    async createCharge(input) {
      return {
        gateway: "manual",
        gatewayRef: `manual-${input.invoiceNumber}`,
        method: "manual_transfer",
        /* `?? undefined`: tanpa env, biarkan KOSONG — permukaannya sudah punya
         * kalimat cadangan yang diterjemahkan (`billing.manualFallback`), dan
         * itu lebih baik daripada satu kalimat Indonesia yang dipaku di sini
         * dan tetap berbahasa Indonesia bagi pembaca en/zh. */
        instructions: manualPaymentInstructions() ?? undefined,
      };
    },
  };
}

/**
 * Kalimat instruksi transfer manual — SATU sumber, karena sejak #466 ditunda ia
 * dibaca di dua tempat: gerbang `manual` saat seseorang menekan bayar, dan
 * halaman penagihan yang kini menampilkannya LANGSUNG tanpa menyuruh menekan
 * apa pun lebih dulu. Dua salinan berarti dua kalimat yang akan menyimpang.
 */
export function manualPaymentInstructions(): string | null {
  return process.env.MANUAL_PAYMENT_INSTRUCTIONS ?? null;
}

/* ── Resolver — transport dipilih environment, pola mailer ─────────────────── */

/**
 * Gerbang efektif. `midtrans` + transport REAL menuntut produksi DAN
 * MIDTRANS_SERVER_KEY; di luar itu jatuh ke MOCK dengan peringatan — salah set
 * env di laptop tidak boleh membuat tagihan sungguhan (cermin pengaman ganda
 * `mailer-core.resolveTransport`).
 */
export function resolvePaymentGateway(): PaymentGateway {
  const requested = process.env.PAYMENT_GATEWAY ?? "manual";
  if (requested !== "midtrans") return manualGateway();

  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  const real = process.env.NODE_ENV === "production" && Boolean(serverKey);
  if (!real) {
    if (process.env.NODE_ENV === "production" && !serverKey) {
      console.warn("[payment-gateway] PAYMENT_GATEWAY=midtrans tanpa MIDTRANS_SERVER_KEY — transport MOCK dipakai.");
    }
    return {
      name: "midtrans",
      async createCharge(input) {
        return mockCharge(input, new Date());
      },
    };
  }

  return {
    name: "midtrans",
    async createCharge(input) {
      return midtransCharge(input, serverKey!);
    },
  };
}

/**
 * Bangun gerbang Midtrans dari kredensial yang DIBERIKAN — bukan dari env.
 *
 * Dipakai jalur per-PT (#466 butir 5): kredensialnya milik pengguna, dibuka
 * dari basis data PT itu sendiri, dan tidak pernah bersinggungan dengan
 * `MIDTRANS_SERVER_KEY` milik platform.
 *
 * `transport: "mock"` menerbitkan nomor VA deterministik tanpa menyentuh
 * jaringan — itu yang membuat seluruh alurnya bisa dilatih di laptop, dan yang
 * membuat penjaganya tidak butuh Midtrans hidup.
 */
export function midtransGatewayWith(credentials: {
  serverKey: string;
  isProduction: boolean;
  transport?: "real" | "mock";
}): PaymentGateway {
  const mock = credentials.transport === "mock";
  return {
    name: "midtrans",
    async createCharge(input) {
      return mock
        ? mockCharge(input, new Date())
        : midtransCharge(input, credentials.serverKey, credentials.isProduction);
    },
  };
}

/** Gerbang cadangan tanpa gerbang — instruksi transfer manual. */
export function manualPaymentGateway(): PaymentGateway {
  return manualGateway();
}

/**
 * Apakah gerbang efektif bisa menerbitkan VA/QRIS seketika?
 *
 * ══ KENAPA ADA (23 Agu 2026, #466 ditunda) ══════════════════════════════════
 * Halaman penagihan menawarkan dua tombol — "Bayar via VA" dan "Bayar via
 * QRIS" — tanpa pernah bertanya apakah ada gerbang yang bisa menjawabnya.
 * `PAYMENT_GATEWAY` tidak diset di produksi, jadi yang terjadi hari ini: orang
 * menekan tombol yang menjanjikan nomor Virtual Account, menunggu, lalu
 * menerima kalimat "transfer manual". Tombol yang ujungnya bukan yang
 * dijanjikan lebih buruk daripada tidak ada tombol.
 *
 * ══ DITURUNKAN DARI GERBANGNYA, BUKAN DARI ENV ══════════════════════════════
 * Membaca `process.env.PAYMENT_GATEWAY` lagi di sini berarti dua tempat yang
 * memutuskan hal yang sama dan bisa menyimpang — terutama karena resolvernya
 * punya pengaman ganda (produksi + kunci) yang mudah terlupa disalin. Yang
 * ditanya karena itu OBJEK gerbangnya: `manual` adalah satu-satunya yang tidak
 * pernah menghasilkan VA/QRIS. Transport `mock` TETAP dihitung bisa — ia
 * memang menerbitkan nomor VA yang deterministik, dan itulah yang membuat
 * seluruh alurnya bisa dilatih di laptop tanpa jaringan.
 *
 * Gerbangnya boleh disuntikkan supaya sifat ini bisa diuji tanpa env.
 */
export function offersInstantPayment(gateway: PaymentGateway = resolvePaymentGateway()): boolean {
  return gateway.name !== "manual";
}

/** Kunci verifikasi webhook. Di produksi WAJIB MIDTRANS_SERVER_KEY (tanpa itu
 *  webhook ditolak 503 — fail-closed); di pengembangan jatuh ke kunci mock
 *  supaya alur webhook tetap bisa dilatih ujung-ke-ujung. */
export const MOCK_SERVER_KEY = "mock-server-key";
export function webhookServerKey(): string | null {
  const key = process.env.MIDTRANS_SERVER_KEY;
  if (key) return key;
  return process.env.NODE_ENV === "production" ? null : MOCK_SERVER_KEY;
}
