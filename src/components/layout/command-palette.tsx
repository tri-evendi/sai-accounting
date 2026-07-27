"use client";

/**
 * Palet perintah — cari-dan-lompat ke halaman mana pun dengan mengetik.
 *
 * Kenapa ada: menu samping memuat ~35 item dalam 7 grup, dan grup yang tidak
 * sedang dipakai TERTUTUP secara bawaan (jalan keluar dari "28 item sekaligus
 * terasa penuh"). Bagus untuk menenangkan tampilan, tapi berarti halaman yang
 * jarang dipakai harus DICARI dengan membuka grup satu per satu. Mengetik jauh
 * lebih cepat daripada menebak grup.
 *
 * ── Satu sumber kebenaran dengan menu samping ────────────────────────────────
 * Isinya berasal dari `visibleNavGroups()` — fungsi yang SAMA persis dengan yang
 * merender sidebar, dengan izin efektif yang sama pula. Itu disengaja: palet
 * yang punya daftarnya sendiri suatu saat akan menawarkan halaman yang tak ada
 * di menu (pengguna menemukan pintu yang tak pernah terlihat, lalu dipantulkan
 * penjaga) atau menyembunyikan yang ada. Ketidakcocokan seperti itu jauh lebih
 * membingungkan daripada sekadar tidak punya palet.
 *
 * Sejak modul per kategori usaha (#99), daftar itu juga sudah menyaring modul
 * yang dimatikan — jadi palet ikut benar tanpa kode tambahan.
 *
 * TAMPILAN SAJA: setiap halaman tujuan tetap dijaga `requirePagePermission` di
 * server. Palet hanya menentukan apa yang pantas ditawarkan.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { NAV_HOME, isNavItemVisible, visibleNavGroups } from "@/lib/nav";
import { useEffectivePermissions } from "@/lib/use-effective-permissions";
import { useT } from "@/lib/i18n/client";

interface CommandPaletteProps {
  role: string;
  accountantMode?: boolean | null;
}

export function CommandPalette({ role, accountantMode }: CommandPaletteProps) {
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);

  const allowed = useEffectivePermissions(role);
  const user = useMemo(() => ({ role, accountantMode }), [role, accountantMode]);
  const groups = useMemo(() => visibleNavGroups(user, allowed), [user, allowed]);
  const homeVisible = isNavItemVisible(NAV_HOME, user, allowed);

  /*
   * Ctrl+K / ⌘K. Dipasang di `window` karena palet harus bisa dibuka dari mana
   * saja, bukan hanya saat fokus kebetulan ada di suatu elemen.
   *
   * `preventDefault` penting: di peramban, Ctrl+K memfokuskan kolom pencarian
   * bawaan. Tanpa ini pintasan terasa "kadang jalan, kadang tidak".
   */
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg">
        {/* Judul dibutuhkan Radix untuk pengumuman pembaca layar; disembunyikan
            secara visual karena kolom ketiknya sudah menjelaskan dirinya. */}
        <DialogTitle className="sr-only">{t("commandPalette.title")}</DialogTitle>
        <Command>
          <CommandInput placeholder={t("commandPalette.placeholder")} />
          <CommandList>
            <CommandEmpty>{t("commandPalette.empty")}</CommandEmpty>

            {homeVisible && (
              <CommandGroup heading={t("commandPalette.mainGroup")}>
                <CommandItem
                  value={t(NAV_HOME.labelKey)}
                  onSelect={() => go(NAV_HOME.href)}
                >
                  {t(NAV_HOME.labelKey)}
                </CommandItem>
              </CommandGroup>
            )}

            {groups.map((group) => (
              <CommandGroup key={group.id} heading={t(group.labelKey)}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.href}
                    /*
                     * `value` adalah yang dicocokkan cmdk saat mengetik. Label
                     * grup ikut disertakan supaya mengetik "laporan" juga
                     * memunculkan isi grup Laporan, bukan hanya item yang
                     * kebetulan bernama begitu.
                     */
                    value={`${t(item.labelKey)} ${t(group.labelKey)}`}
                    onSelect={() => go(item.href)}
                  >
                    {t(item.labelKey)}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
