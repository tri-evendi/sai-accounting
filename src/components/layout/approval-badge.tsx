"use client";

/**
 * Badge "Perlu Persetujuan" di navbar (issue #25).
 *
 * Satu ikon, dua arti, sesuai peran pemakainya:
 *   • penyetuju → berapa dokumen menunggu keputusannya (amber, mendesak);
 *   • pemohon   → berapa hasil keputusan atas pengajuannya yang belum dibuka —
 *     inilah notifikasi in-app-nya (biru, informatif).
 * Bila keduanya nol, badge tidak ditampilkan sama sekali: notifikasi kosong
 * hanyalah kebisingan.
 *
 * TANPA INFRASTRUKTUR BARU: tak ada websocket, tak ada polling latar; angkanya
 * diambil sekali saat halaman dipasang lewat `/api/approvals/summary` (dua
 * count berindeks), lalu disegarkan saat tab kembali fokus.
 *
 * ── Setelah migrasi AntD (issue #193) ─────────────────────────────────────
 * Pil angka rakitan tangan diganti `Badge` AntD — komponen yang memang untuk
 * ini (angka menempel di pojok ikon, "99+" saat melimpah). Perhatikan
 * namanya: `Badge` di sini adalah `Badge` AntD, BUKAN primitif
 * `@/components/ui/badge` yang justru merender `Tag` (label status berteks).
 * Keduanya sengaja tidak ditukar — yang dibutuhkan di sini memang bulatan
 * berangka, dan KATA-nya dibawa `aria-label`/`title` pada tautannya, jadi
 * warna tetap bukan satu-satunya penanda (MASTER.md §Anti-Patterns).
 *
 * Warnanya dari token uang #186 (`moneyPalette`), bukan `colorWarning`/
 * `colorInfo` bawaan: label putih di atas anak tangga ke-6 AntD tidak lolos
 * 4,5:1, dan angka inilah yang dibaca orang.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Badge, theme } from "antd";
import { BellRing } from "lucide-react";

import { Link } from "@/components/ui/app-link";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";
import { moneyPalette } from "@/lib/theme/antd-tokens";
import { parseTenantPath } from "@/lib/tenant-routes";

interface Counts {
  pending: number;
  unread: number;
}

export function ApprovalBadge() {
  const t = useT();
  const { token } = theme.useToken();
  const [counts, setCounts] = useState<Counts>({ pending: 0, unread: 0 });
  const pathname = usePathname();
  const parsed = pathname ? parseTenantPath(pathname) : null;
  /* Angkanya milik SATU perusahaan, dan navbar-nya bertahan lintas navigasi
   * klien — tanpa `scope` di kebergantungan, jumlah persetujuan PT lama tetap
   * menyala di atas buku PT baru (issue #158). */
  const scope = parsed ? `${parsed.tenantSlug}/${parsed.companySlug}` : "";

  useEffect(() => {
    // State is only ever set from the fetch's own callback — the "subscribe to
    // an external system" shape React asks for, never synchronously inside the
    // effect body. `active` drops a response that lands after unmount.
    let active = true;

    const load = () => {
      apiFetch("/api/approvals/summary")
        .then((res) => (res.ok ? (res.json() as Promise<Counts>) : null))
        .then((data) => {
          if (!active || !data) return;
          setCounts({ pending: data.pending ?? 0, unread: data.unread ?? 0 });
        })
        .catch(() => {
          // A badge is never worth an error surface; it stays as it was.
        });
    };

    load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, [scope]);

  const total = counts.pending + counts.unread;
  if (total === 0) return null;

  const money = moneyPalette(token);
  const urgent = counts.pending > 0;
  const label = urgent
    ? t("approvalBadge.pending", { count: counts.pending })
    : t("approvalBadge.unread", { count: counts.unread });

  return (
    <Link
      href="/approvals"
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        // Target sentuh 40px (MASTER.md) — sebelumnya dirakit dari padding.
        minWidth: token.controlHeight,
        minHeight: token.controlHeight,
        borderRadius: token.borderRadius,
        color: token.colorTextTertiary,
        cursor: "pointer",
      }}
    >
      {/* Angka + teks: angkanya di badge, katanya di `aria-label`/`title`
          tautan ini (MASTER.md §2 — warna tak pernah jadi penanda tunggal). */}
      <Badge
        count={total}
        color={urgent ? money.colorMoneyPending : money.colorMoneyInfo}
      >
        <BellRing
          size={20}
          style={{ display: "block", color: token.colorTextTertiary }}
          aria-hidden="true"
        />
      </Badge>
    </Link>
  );
}
