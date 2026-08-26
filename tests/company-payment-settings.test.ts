/**
 * PENJAGA #466 (butir 5 & 6) — uang pelanggan sebuah PT tidak boleh mendarat
 * di rekening kita.
 *
 * == Kegagalan yang dijaga ================================================
 * Platform sudah punya kredensial Midtrans yang bekerja, untuk tagihan
 * langganan SaaS kita sendiri. Cara paling wajar menulis fitur ini —
 * "pakai kredensial PT kalau ada, kalau tidak pakai yang platform" — membuat
 * faktur pelanggan PT dibayarkan ke **rekening kita**.
 *
 * Ia tidak melempar, tidak merah di log, dan tidak terlihat sampai seseorang
 * membandingkan mutasi bank dengan buku. Kelas kegagalan yang sama persis
 * dengan konteks perusahaan yang hilang di docs/MULTI-COMPANY.md, dan sama
 * diamnya.
 *
 * Karena itu berkas ini menguji dua hal sekaligus: PERILAKUnya (tanpa
 * kredensial → `manual`) dan SUMBERnya (modulnya tidak pernah menyebut
 * `MIDTRANS_SERVER_KEY` sama sekali). Yang kedua perlu karena yang pertama
 * bisa hijau sementara cadangan env ditambahkan di cabang yang tak terpakai
 * tes ini.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { sealSecret } from "@/lib/settings-crypto";
import {
  companyOffersInstantPayment,
  companyPaymentCredentials,
  companyPaymentGateway,
  companyPaymentUpdate,
  companyPaymentView,
  type CompanyPaymentRow,
} from "@/lib/company-payment-settings";

/** Kunci uji — 64 hex, bentuk yang diterima `encryptionKey()`. */
const KEY = "a".repeat(64);

const KOSONG: CompanyPaymentRow = {
  paymentGateway: null,
  paymentClientKey: null,
  paymentServerKeyCiphertext: null,
  paymentServerKeyIv: null,
  paymentServerKeyTag: null,
  paymentIsProduction: false,
};

function terisi(serverKey = "SB-Mid-server-RAHASIA", isProduction = false): CompanyPaymentRow {
  const sealed = sealSecret(serverKey);
  return {
    paymentGateway: "midtrans",
    paymentClientKey: "SB-Mid-client-abc",
    paymentServerKeyCiphertext: sealed.ciphertext,
    paymentServerKeyIv: sealed.iv,
    paymentServerKeyTag: sealed.tag,
    paymentIsProduction: isProduction,
  };
}

beforeEach(() => {
  vi.stubEnv("SETTINGS_ENCRYPTION_KEY", KEY);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("tanpa kredensial PT, TIDAK PERNAH jatuh ke kredensial platform", () => {
  it("baris kosong → gerbang `manual`", () => {
    expect(companyPaymentGateway(KOSONG).name).toBe("manual");
  });

  it("tetap `manual` meski env platform terisi lengkap", () => {
    /* Inilah asersinya. Semua yang lain di berkas ini menjaga jalan menuju ke
       sini tetap terbuka. */
    vi.stubEnv("PAYMENT_GATEWAY", "midtrans");
    vi.stubEnv("MIDTRANS_SERVER_KEY", "Mid-server-PLATFORM-KITA");
    vi.stubEnv("MIDTRANS_IS_PRODUCTION", "true");
    expect(companyPaymentGateway(KOSONG).name).toBe("manual");
    expect(companyPaymentCredentials(KOSONG)).toBeNull();
  });

  it("modulnya tidak pernah MENYEBUT kredensial platform", () => {
    /*
     * Uji perilaku di atas bisa hijau sementara cadangan env hidup di cabang
     * yang tidak dilewatinya. Yang di bawah menutup jalannya: tidak ada
     * `MIDTRANS_` sama sekali di berkas itu.
     */
    const src = readFileSync(
      join(__dirname, "..", "src", "lib", "company-payment-settings.ts"),
      "utf8"
    );
    const kode = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
    expect(kode, "company-payment-settings.ts menyebut kredensial platform").not.toMatch(
      /MIDTRANS_/
    );
    expect(kode).not.toMatch(/PAYMENT_GATEWAY/);
  });
});

describe("butir 6 — fitur MENGHILANG saat tak bisa dipakai, bukan gagal saat diklik", () => {
  it("kosong → tidak menawarkan", () => {
    expect(companyOffersInstantPayment(KOSONG)).toBe(false);
    expect(companyOffersInstantPayment(null)).toBe(false);
  });

  it("lengkap → menawarkan", () => {
    expect(companyOffersInstantPayment(terisi())).toBe(true);
  });

  it("gerbang selain midtrans diabaikan, bukan dipercaya", () => {
    expect(companyOffersInstantPayment({ ...terisi(), paymentGateway: "xendit" })).toBe(false);
  });
});

describe("baris yang rusak diperlakukan sebagai TIDAK ADA, bukan ditebak", () => {
  it("dua dari tiga kolom GCM → null", () => {
    /* Dua dari tiga bukan "sebagian tersimpan"; menebak sisanya berarti
       menebak kunci. */
    for (const hilang of [
      "paymentServerKeyCiphertext",
      "paymentServerKeyIv",
      "paymentServerKeyTag",
    ] as const) {
      expect(companyPaymentCredentials({ ...terisi(), [hilang]: null })).toBeNull();
    }
  });

  it("kunci enkripsi berganti → null + galat di log, TIDAK melempar", () => {
    const row = terisi();
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "b".repeat(64));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => companyPaymentCredentials(row)).not.toThrow();
    expect(companyPaymentCredentials(row)).toBeNull();
    /* Pengguna tidak boleh melihatnya, operator harus. */
    expect(log).toHaveBeenCalled();
  });

  it("rahasia yang tersegel dengan benar tapi KOSONG bukan kredensial", () => {
    expect(companyPaymentCredentials(terisi("   "))).toBeNull();
  });
});

describe("sandbox vs produksi disimpan, tidak ditebak", () => {
  it("nilainya dibawa apa adanya", () => {
    expect(companyPaymentCredentials(terisi("k", true))!.isProduction).toBe(true);
    expect(companyPaymentCredentials(terisi("k", false))!.isProduction).toBe(false);
  });

  it("bawaannya sandbox", () => {
    /* Kunci sandbox di produksi menerbitkan VA yang tampak sah dan tidak pernah
       menerima satu rupiah — pengguna akan menyimpulkan pelanggannya tidak
       membayar. Bawaan yang salah arah karena itu bukan pilihan netral. */
    expect(companyPaymentView(KOSONG).isProduction).toBe(false);
  });
});

describe("menyimpan", () => {
  it("server key disegel, tidak pernah tersimpan mentah", () => {
    const update = companyPaymentUpdate({ gateway: "midtrans", serverKey: "Mid-server-XYZ" });
    expect(update.paymentServerKeyCiphertext).toBeTruthy();
    expect(JSON.stringify(update)).not.toContain("Mid-server-XYZ");
  });

  it("`serverKey` tak disebut → kunci tersimpan TIDAK disentuh", () => {
    /* Itu yang membuat formulir bisa menampilkan `••••` dan disimpan ulang
       tanpa mengharuskan pengguna mengetik ulang kuncinya. */
    const update = companyPaymentUpdate({ gateway: "midtrans", clientKey: "c" });
    expect(update).not.toHaveProperty("paymentServerKeyCiphertext");
  });

  it("`serverKey: \"\"` mengosongkan — dan itu BUKAN hal yang sama", () => {
    const update = companyPaymentUpdate({ gateway: "midtrans", serverKey: "" });
    expect(update.paymentServerKeyCiphertext).toBeNull();
  });

  it("dimatikan → kuncinya IKUT dihapus, tidak sekadar ditandai mati", () => {
    /* Rahasia yang tertinggal di baris yang "tidak dipakai" tetap rahasia yang
       bocor kalau basis datanya bocor. */
    const update = companyPaymentUpdate({ gateway: null });
    expect(update).toMatchObject({
      paymentGateway: null,
      paymentClientKey: null,
      paymentServerKeyCiphertext: null,
      paymentServerKeyIv: null,
      paymentServerKeyTag: null,
    });
  });
});

describe("yang dikirim ke peramban", () => {
  it("server key tidak pernah ikut — tidak sebagai teks, tidak sebagai cipher", () => {
    const view = companyPaymentView(terisi("Mid-server-RAHASIA"));
    const json = JSON.stringify(view);
    expect(json).not.toContain("Mid-server-RAHASIA");
    expect(json).not.toContain(terisi().paymentServerKeyCiphertext!);
    expect(view.hasServerKey).toBe(true);
  });

  it("kunci yang tak bisa dibuka tetap dilaporkan ADA", () => {
    /*
     * Diukur dari kolom cipher, bukan dari hasil membukanya: formulirnya harus
     * menawarkan MENGGANTI, bukan menyatakan kosong lalu diam-diam menimpa
     * kunci yang sebenarnya masih ada.
     */
    const row = terisi();
    vi.stubEnv("SETTINGS_ENCRYPTION_KEY", "c".repeat(64));
    expect(companyPaymentView(row).hasServerKey).toBe(true);
  });
});
