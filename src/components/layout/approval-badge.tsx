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
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { BellRing } from "lucide-react";

interface Counts {
  pending: number;
  unread: number;
}

export function ApprovalBadge() {
  const [counts, setCounts] = useState<Counts>({ pending: 0, unread: 0 });

  useEffect(() => {
    // State is only ever set from the fetch's own callback — the "subscribe to
    // an external system" shape React asks for, never synchronously inside the
    // effect body. `active` drops a response that lands after unmount.
    let active = true;

    const load = () => {
      fetch("/api/approvals/summary")
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
  }, []);

  const total = counts.pending + counts.unread;
  if (total === 0) return null;

  const urgent = counts.pending > 0;
  const label = urgent
    ? `${counts.pending} dokumen menunggu persetujuan Anda`
    : `${counts.unread} kabar baru atas pengajuan Anda`;

  return (
    <Link
      href="/approvals"
      aria-label={label}
      title={label}
      className="relative inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-2 text-sm text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
    >
      <BellRing className="h-5 w-5" aria-hidden="true" />
      {/* Angka + teks, bukan sekadar titik berwarna (MASTER.md §2). */}
      <span
        className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
          urgent ? "bg-warning-soft text-warning-strong" : "bg-primary/10 text-primary"
        }`}
      >
        {total}
      </span>
      <span className="sr-only">{label}</span>
    </Link>
  );
}
