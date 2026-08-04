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
  trustedProxyHops,
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

/**
 * `clientIpFrom` — dihitung dari KANAN (issue #162).
 *
 * Yang diuji di sini bukan "fungsinya mengambil entri yang mana", melainkan
 * ASUMSI TENTANG PROXY yang selama ini hanya hidup sebagai komentar: entri
 * yang dipilih harus yang benar-benar DITULIS mesin milik kita, dan tidak
 * boleh ada teks kiriman klien yang bisa menggesernya.
 *
 * Sebelum #162 fungsi ini mengambil entri pertama. Itu aman hanya selama
 * Traefik menimpa `x-forwarded-for` — yaitu selama `trustedIPs` kosong.
 * Mengisi `trustedIPs` (yang dilakukan orang saat menaruh CDN di depan)
 * membuat Traefik mempertahankan header kiriman klien, dan sejak detik itu
 * entri pertama adalah teks pilihan penyerang. Perubahannya terjadi di berkas
 * infrastruktur, jadi tidak ada tes lama yang akan berubah warna — itulah
 * kenapa asumsinya ditulis ulang sebagai tes di bawah ini.
 */
describe("clientIpFrom", () => {
  const headersOf = (map: Record<string, string>) => ({
    get: (name: string) => map[name.toLowerCase()] ?? null,
  });
  /** Tanpa CDN: satu Traefik di depan aplikasi. */
  const oneProxy = {};
  /** Dengan CDN/load-balancer kedua di depan Traefik. */
  const twoProxies = { OPERATOR_TRUSTED_PROXY_HOPS: "2" };

  it("mengambil entri yang DITULIS proxy — yang paling kanan, bukan yang pertama", () => {
    // Traefik dengan `trustedIPs` terisi mempertahankan kiriman klien dan
    // menambahkan alamat yang IA lihat di ujung kanan.
    expect(clientIpFrom(headersOf({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }), oneProxy)).toBe(
      "10.0.0.1"
    );
  });

  it("pemalsuan tidak menggeser pilihan, sebanyak apa pun entri yang disisipkan", () => {
    // Inilah serangan yang dijelaskan #162: klien mengetik IP yang diizinkan
    // di depan, berharap dibaca sebagai miliknya.
    const spoofed = headersOf({
      "x-forwarded-for": "203.0.113.9, 203.0.113.9, 203.0.113.9, 198.51.100.7",
    });
    expect(clientIpFrom(spoofed, oneProxy)).toBe("198.51.100.7");
  });

  it("satu entri (Traefik menimpa, keadaan hari ini) tetap terbaca apa adanya", () => {
    // Tanpa `trustedIPs`, Traefik MENIMPA header: tepat satu entri, dan
    // perilakunya identik dengan sebelum #162 — perbaikan ini tidak menggeser
    // apa pun di pemasangan yang sedang berjalan.
    expect(clientIpFrom(headersOf({ "x-forwarded-for": "1.2.3.4" }), oneProxy)).toBe("1.2.3.4");
  });

  it("dua proxy: yang dipilih adalah alamat klien, bukan alamat CDN", () => {
    // client → CDN → Traefik → app. Traefik menambahkan alamat CDN; alamat
    // klien ditulis CDN satu entri di kirinya.
    const headers = headersOf({ "x-forwarded-for": "198.51.100.7, 192.0.2.50" });
    expect(clientIpFrom(headers, twoProxies)).toBe("198.51.100.7");
    // Salah konfigurasi ke arah sebaliknya akan memberi alamat CDN — dan
    // seluruh dunia yang lewat CDN itu akan tampak sebagai satu IP.
    expect(clientIpFrom(headers, oneProxy)).toBe("192.0.2.50");
  });

  it("rantai lebih pendek dari yang dikonfigurasi → null (gagal-tertutup)", () => {
    // Menembus langsung ke Traefik, melewati CDN yang seharusnya di depan.
    // Yang benar bukan menebak entri yang tersisa, melainkan menolak.
    expect(clientIpFrom(headersOf({ "x-forwarded-for": "198.51.100.7" }), twoProxies)).toBeNull();
  });

  it("x-real-ip hanya saat tidak ada x-forwarded-for DAN hanya satu proxy", () => {
    expect(clientIpFrom(headersOf({ "x-real-ip": "9.9.9.9" }), oneProxy)).toBe("9.9.9.9");
    // Dengan proxy berlapis, `x-real-ip` berisi alamat proxy SEBELUMNYA —
    // membandingkannya dengan daftar IP operator berarti membandingkan IP CDN.
    expect(clientIpFrom(headersOf({ "x-real-ip": "9.9.9.9" }), twoProxies)).toBeNull();
    expect(clientIpFrom(headersOf({}), oneProxy)).toBeNull();
  });

  it("x-forwarded-for menang atas x-real-ip", () => {
    const headers = headersOf({ "x-forwarded-for": "1.2.3.4, 10.0.0.1", "x-real-ip": "9.9.9.9" });
    expect(clientIpFrom(headers, oneProxy)).toBe("10.0.0.1");
  });
});

describe("trustedProxyHops", () => {
  it("bawaan 1 — satu Traefik, keadaan hari ini", () => {
    expect(trustedProxyHops({})).toBe(1);
    expect(trustedProxyHops({ OPERATOR_TRUSTED_PROXY_HOPS: "  " })).toBe(1);
  });

  it("angka yang sah dipakai apa adanya", () => {
    expect(trustedProxyHops({ OPERATOR_TRUSTED_PROXY_HOPS: "2" })).toBe(2);
    expect(trustedProxyHops({ OPERATOR_TRUSTED_PROXY_HOPS: " 3 " })).toBe(3);
  });

  it("nilai tak masuk akal jatuh ke bawaan, BUKAN ke 0", () => {
    // hops 0 berarti membaca entri di kanan yang paling ujung… yang ditulis
    // klien. Salah ketik di .env tidak boleh membuka lubang #162 kembali.
    for (const bad of ["0", "-1", "abc", "1.5", ""]) {
      expect(trustedProxyHops({ OPERATOR_TRUSTED_PROXY_HOPS: bad })).toBe(1);
    }
  });
});

describe("operatorCookieName", () => {
  it("awalan __Host- saat secure — cookie tidak bisa dipasangi Domain", () => {
    expect(operatorCookieName(true)).toBe("__Host-sai_operator");
    expect(operatorCookieName(false)).toBe("sai_operator");
  });
});
