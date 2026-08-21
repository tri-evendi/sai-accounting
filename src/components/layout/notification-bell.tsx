"use client";

/**
 * Kotak masuk pemberitahuan di navbar.
 *
 * ══ IKON SENDIRI, BUKAN MENUMPANG LONCENG PERSETUJUAN ═══════════════════════
 * `ApprovalBadge` di sebelahnya menjawab pertanyaan yang berbeda — "ada dokumen
 * menunggu KEPUTUSAN saya" — dan jawabannya mendesak serta berwarna amber.
 * Pemberitahuan menjawab "ada kabar untuk saya", dan mencampur keduanya di satu
 * angka membuat yang mendesak tenggelam di antara yang informatif.
 *
 * Karena itu ikonnya `InboxOutlined`, bukan lonceng kedua: dua lonceng di satu
 * baris adalah teka-teki, sedangkan lonceng + kotak masuk adalah dua benda yang
 * memang berbeda. Katanya tetap dibawa `aria-label`/`title` — warna dan bentuk
 * tak pernah jadi penanda tunggal (MASTER.md §Anti-Patterns).
 *
 * ══ HILANG SAAT KOSONG ══════════════════════════════════════════════════════
 * Doktrin yang sama dengan tetangganya: kotak masuk kosong hanyalah kebisingan
 * di navbar yang sudah padat.
 *
 * ══ TANPA INFRASTRUKTUR BARU ════════════════════════════════════════════════
 * Tidak ada websocket, tidak ada polling latar. Diambil sekali saat dipasang,
 * lalu disegarkan ketika tab kembali fokus — cukup untuk kabar yang lahir dari
 * penjadwal per jam, dan tidak membebani kotak 3,6 GB yang menjalankan ini.
 */
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Badge, theme } from "antd";
import { InboxOutlined } from "@ant-design/icons";

import { Link } from "@/components/ui/app-link";
import { useT } from "@/lib/i18n/client";
import { apiFetch } from "@/lib/api-fetch";
import { moneyPalette } from "@/lib/theme/antd-tokens";
import { parseTenantPath } from "@/lib/tenant-routes";

export function NotificationBell() {
  const t = useT();
  const { token } = theme.useToken();
  const [unread, setUnread] = useState(0);
  const pathname = usePathname();
  const parsed = pathname ? parseTenantPath(pathname) : null;
  /*
   * Pemberitahuan milik PENGGUNA, bukan perusahaan — jadi angkanya tidak basi
   * saat berpindah PT. `scope` tetap masuk kebergantungan karena berpindah buku
   * adalah momen paling wajar untuk menyegarkannya, dan `usePathname` sudah ada
   * di sini untuk menyusun tautannya.
   */
  const scope = parsed ? `${parsed.tenantSlug}/${parsed.companySlug}` : "";

  useEffect(() => {
    let active = true;

    const load = () => {
      apiFetch("/api/user/notifications")
        .then((res) => (res.ok ? (res.json() as Promise<{ unread?: number }>) : null))
        .then((data) => {
          if (!active || !data) return;
          setUnread(data.unread ?? 0);
        })
        .catch(() => {
          /* Sebuah badge tidak pernah sepadan dengan permukaan galat. */
        });
    };

    load();
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("focus", load);
    };
  }, [scope]);

  if (unread === 0) return null;

  const label = t("notifications.bell", { count: unread });

  return (
    <Link
      href="/notifications"
      aria-label={label}
      title={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: token.controlHeight,
        minHeight: token.controlHeight,
        borderRadius: token.borderRadius,
        color: token.colorTextTertiary,
        cursor: "pointer",
      }}
    >
      <Badge count={unread} color={moneyPalette(token).colorMoneyInfo}>
        <InboxOutlined
          aria-hidden="true"
          style={{ fontSize: 20, display: "block", color: token.colorTextTertiary }}
        />
      </Badge>
    </Link>
  );
}
