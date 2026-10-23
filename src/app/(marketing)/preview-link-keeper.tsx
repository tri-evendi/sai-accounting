"use client";

/**
 * Membawa `?preview=<token>` ke tautan halaman ber-isi-situs SELAMA pratinjau
 * draf (konsol `/content`). Hanya dipasang layout pemasaran bila permintaan
 * ini memang pratinjau; di kunjungan biasa komponen ini tidak dirender sama
 * sekali.
 *
 * Kenapa pendengar klik di `document`, bukan menulis ulang `href`: tautan
 * pendaratan adalah `<Link>` Next, yang menavigasi dari prop-nya, bukan dari
 * atribut DOM. Pendengar fase-capture berjalan sebelum pendengar React di akar,
 * jadi klik yang dibawa ke pratinjau tidak pernah sampai ke navigasi
 * sisi-klien. Muat penuh disengaja: setiap halaman pratinjau dirender ulang di
 * server dengan drafnya, dan pratinjau tidak butuh navigasi cepat.
 *
 * Aturan tautan mana yang dibawa ada di `previewLinkTarget` (murni, teruji).
 */
import { useEffect } from "react";

import { previewLinkTarget } from "@sai/core/site-content";

export function PreviewLinkKeeper({ token }: { token: string }) {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;

      const next = previewLinkTarget(anchor.getAttribute("href") ?? "", window.location.href, token);
      if (!next) return;
      event.preventDefault();
      event.stopPropagation();

      const nextUrl = new URL(next);
      const here = new URL(window.location.href);
      /* Tautan jangkar di halaman yang sama: gulir saja, tanpa muat ulang. */
      if (nextUrl.pathname === here.pathname && nextUrl.search === here.search) {
        window.location.hash = nextUrl.hash;
        return;
      }
      window.location.assign(next);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [token]);

  return null;
}
