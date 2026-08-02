/**
 * Pemisahan bidang operator (issue #154) — tes untuk logika MURNI di
 * `lib/operator/plane.ts`, tembok yang menegakkan "konsol operator di
 * hostname sendiri".
 *
 * Yang dibuktikan di sini adalah dua arah pemisahan yang diminta issue:
 *   • sesi/permintaan PELANGGAN tidak pernah mencapai rute operator
 *     (host pelanggan → /operator = blocked), dan
 *   • sesi OPERATOR tidak pernah mencapai rute pelanggan
 *     (host operator → /dashboard, /login, /api/* = blocked);
 * plus sifat GAGAL-TERTUTUP: tanpa OPERATOR_HOST rute operator tidak ada di
 * mana pun, dan daftar IP kosong menolak SEMUA orang.
 */
import { describe, expect, it } from "vitest";

import {
  clientIpFrom,
  configuredOperatorHost,
  decideOperatorRouting,
  ipAllowed,
  isOperatorPath,
  normalizeHost,
  operatorCookieName,
} from "@/lib/operator/plane";

const OPS = "ops.example.com";
const APP = "app.example.com";

describe("normalizeHost", () => {
  it("menurunkan huruf & membuang port", () => {
    expect(normalizeHost("Ops.Example.COM:443")).toBe("ops.example.com");
    expect(normalizeHost("localhost:3000")).toBe("localhost");
    expect(normalizeHost("[::1]:3000")).toBe("[::1]");
  });

  it("kosong/null → null", () => {
    expect(normalizeHost(null)).toBeNull();
    expect(normalizeHost("  ")).toBeNull();
    expect(normalizeHost(undefined)).toBeNull();
  });
});

describe("configuredOperatorHost — gagal-tertutup", () => {
  it("tidak diset → null (konsol mati)", () => {
    expect(configuredOperatorHost({})).toBeNull();
    expect(configuredOperatorHost({ OPERATOR_HOST: "  " })).toBeNull();
  });

  it("dinormalkan", () => {
    expect(configuredOperatorHost({ OPERATOR_HOST: "Ops.Example.com:8443" })).toBe(
      "ops.example.com"
    );
  });
});

describe("decideOperatorRouting — OPERATOR_HOST tidak diset (gagal-tertutup)", () => {
  it("/operator tidak terjangkau di host mana pun", () => {
    expect(decideOperatorRouting(APP, "/operator", null).kind).toBe("blocked");
    expect(decideOperatorRouting(OPS, "/operator/login", null).kind).toBe("blocked");
    expect(decideOperatorRouting(null, "/operator/tenants/1", null).kind).toBe("blocked");
  });

  it("rute pelanggan berjalan biasa", () => {
    expect(decideOperatorRouting(APP, "/dashboard", null).kind).toBe("customer");
    expect(decideOperatorRouting(APP, "/login", null).kind).toBe("customer");
  });
});

describe("decideOperatorRouting — sesi pelanggan TIDAK BISA mencapai rute operator", () => {
  it("host pelanggan → /operator apa pun = blocked (bukan redirect, bukan login)", () => {
    for (const path of ["/operator", "/operator/login", "/operator/tenants/9", "/operator/scheduler"]) {
      expect(decideOperatorRouting(APP, path, OPS).kind).toBe("blocked");
    }
  });

  it("host tak dikenal / tanpa header host diperlakukan sama", () => {
    expect(decideOperatorRouting(null, "/operator", OPS).kind).toBe("blocked");
    expect(decideOperatorRouting("evil.example.com", "/operator", OPS).kind).toBe("blocked");
  });
});

describe("decideOperatorRouting — sesi operator TIDAK BISA mencapai rute pelanggan", () => {
  it("host operator → dasbor/login/API pelanggan = blocked", () => {
    for (const path of ["/dashboard", "/login", "/api/invoices", "/tenant", "/select-company", "/"]) {
      expect(decideOperatorRouting(OPS, path, OPS).kind).toBe("blocked");
    }
  });

  it("host operator → bidang operator hidup", () => {
    expect(decideOperatorRouting(OPS, "/operator", OPS).kind).toBe("operator");
    expect(decideOperatorRouting(OPS, "/operator/tenants/3", OPS).kind).toBe("operator");
    expect(decideOperatorRouting(OPS, "/operator/login", OPS).kind).toBe("operator-public");
  });

  it("health probe tetap hidup untuk load-balancer", () => {
    expect(decideOperatorRouting(OPS, "/api/health", OPS).kind).toBe("operator-public");
  });

  it("perbandingan host tahan beda huruf & port", () => {
    expect(decideOperatorRouting("OPS.example.com:443", "/operator", OPS).kind).toBe("operator");
  });
});

describe("isOperatorPath", () => {
  it("awalan persis, bukan substring", () => {
    expect(isOperatorPath("/operator")).toBe(true);
    expect(isOperatorPath("/operator/login")).toBe(true);
    expect(isOperatorPath("/operators")).toBe(false);
    expect(isOperatorPath("/x/operator")).toBe(false);
  });
});

describe("ipAllowed — gagal-tertutup", () => {
  it("daftar tidak diset/kosong → SEMUA ditolak", () => {
    expect(ipAllowed("10.0.0.1", undefined)).toBe(false);
    expect(ipAllowed("10.0.0.1", "")).toBe(false);
    expect(ipAllowed("10.0.0.1", "   ")).toBe(false);
  });

  it("IP tidak diketahui → ditolak (kecuali '*')", () => {
    expect(ipAllowed(null, "10.0.0.1")).toBe(false);
    expect(ipAllowed(undefined, "10.0.0.0/8")).toBe(false);
    expect(ipAllowed(null, "*")).toBe(true);
  });

  it("alamat persis & daftar koma", () => {
    expect(ipAllowed("103.10.20.30", "103.10.20.30")).toBe(true);
    expect(ipAllowed("103.10.20.31", "103.10.20.30")).toBe(false);
    expect(ipAllowed("2.2.2.2", "1.1.1.1, 2.2.2.2 ,3.3.3.3")).toBe(true);
  });

  it("CIDR IPv4", () => {
    expect(ipAllowed("10.1.2.3", "10.0.0.0/8")).toBe(true);
    expect(ipAllowed("11.1.2.3", "10.0.0.0/8")).toBe(false);
    expect(ipAllowed("192.168.1.77", "192.168.1.0/24")).toBe(true);
    expect(ipAllowed("192.168.2.77", "192.168.1.0/24")).toBe(false);
    expect(ipAllowed("5.5.5.5", "5.5.5.5/32")).toBe(true);
    expect(ipAllowed("5.5.5.6", "5.5.5.5/32")).toBe(false);
  });

  it("CIDR rusak tidak meloloskan siapa pun", () => {
    expect(ipAllowed("10.0.0.1", "10.0.0.0/40")).toBe(false);
    expect(ipAllowed("10.0.0.1", "banana/8")).toBe(false);
  });

  it("IPv4 terpetakan IPv6 (::ffff:) dikenali", () => {
    expect(ipAllowed("::ffff:10.1.2.3", "10.0.0.0/8")).toBe(true);
    expect(ipAllowed("::ffff:10.1.2.3", "10.1.2.3")).toBe(true);
  });

  it("IPv6 hanya persis", () => {
    expect(ipAllowed("2001:db8::1", "2001:db8::1")).toBe(true);
    expect(ipAllowed("2001:db8::2", "2001:db8::1")).toBe(false);
  });
});

describe("clientIpFrom", () => {
  const headersOf = (map: Record<string, string>) => ({
    get: (name: string) => map[name.toLowerCase()] ?? null,
  });

  it("entri PERTAMA x-forwarded-for", () => {
    expect(clientIpFrom(headersOf({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  });

  it("jatuh ke x-real-ip, lalu null", () => {
    expect(clientIpFrom(headersOf({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(clientIpFrom(headersOf({}))).toBeNull();
  });
});

describe("operatorCookieName", () => {
  it("awalan __Host- saat secure — cookie tidak bisa dipasangi Domain", () => {
    expect(operatorCookieName(true)).toBe("__Host-sai_operator");
    expect(operatorCookieName(false)).toBe("sai_operator");
  });
});
