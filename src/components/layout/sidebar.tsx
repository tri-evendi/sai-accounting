"use client";

import { Link } from "@/components/ui/app-link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Receipt,
  Package,
  PackagePlus,
  ClipboardCheck,
  DollarSign,
  Truck,
  Users,
  Upload,
  Settings,
  UserCog,
  BookOpen,
  BookText,
  BookMarked,
  Library,
  BarChart3,
  HandCoins,
  Wallet,
  Coins,
  Lock,
  Scale,
  Ship,
  Undo2,
  Building2,
  Target,
  Wand2,
  FileSpreadsheet,
  PackageCheck,
  KeyRound,
  ShieldCheck,
  ShoppingCart,
  SquarePen,
  Split,
  ChevronRight,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useEffectivePermissions } from "@/lib/use-effective-permissions";
import { APP_NAME, APP_VERSION } from "@/lib/constants";
import { BrandMark } from "@/components/ui/brand-mark";
import { useT, type TranslateFn } from "@/lib/i18n/client";
import {
  NAV_HOME,
  activeNavHref,
  isNavItemVisible,
  visibleNavGroups,
  visibleNavHrefs,
  type NavItem,
} from "@/lib/nav";

interface SidebarProps {
  role: string;
  // ─── issue #11 — raw Mode Akuntan preference (null = follow role default) ───
  accountantMode?: boolean | null;
  /** Jumlah perusahaan yang boleh dibuka — menentukan item "Pilih Perusahaan". */
  companyCount?: number;
  open: boolean;
  onClose: () => void;
}

/**
 * Menu dikelompokkan per AREA TUGAS (issue #2) dengan label bahasa Indonesia
 * (issue #1). Daftar & penyaringannya hidup di `src/lib/nav.ts` yang murni dan
 * teruji; komponen ini hanya menggambar — termasuk memetakan nama ikon ke
 * komponen lucide (pola yang sama dengan Pusat Laporan).
 */
const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard,
  FileText,
  Receipt,
  Package,
  PackagePlus,
  ClipboardCheck,
  DollarSign,
  Truck,
  Users,
  Upload,
  Settings,
  UserCog,
  BookOpen,
  BookText,
  BookMarked,
  Library,
  BarChart3,
  HandCoins,
  Wallet,
  Coins,
  Lock,
  Scale,
  Ship,
  Undo2,
  Building2,
  Target,
  Wand2,
  FileSpreadsheet,
  PackageCheck,
  KeyRound,
  ShieldCheck,
  ShoppingCart,
  SquarePen,
  Split,
};

function NavLink({
  item,
  active,
  onClose,
  t,
}: {
  item: NavItem;
  active: boolean;
  onClose: () => void;
  t: TranslateFn;
}) {
  const Icon = ICONS[item.icon] ?? LayoutDashboard;
  return (
    <Link
      href={item.href}
      onClick={onClose}
      aria-current={active ? "page" : undefined}
      className={cn(
        // `border-l-4 border-transparent` di dasar: penanda aktif hanya
        // mengganti WARNA border, bukan menambah lebarnya — jadi ikon/teks tak
        // bergeser 4px saat berpindah item (anti-pattern "geser layout" MASTER).
        "flex cursor-pointer items-center gap-3 rounded-md border-l-4 border-transparent px-3 py-2 text-sm font-medium transition-colors duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar",
        active
          ? "bg-sidebar-primary text-sidebar-primary-foreground border-sidebar-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
      )}
    >
      <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
      <span className="truncate">{t(item.labelKey)}</span>
    </Link>
  );
}

export function Sidebar({ role, accountantMode, companyCount, open, onClose }: SidebarProps) {
  const pathname = usePathname();
  const t = useT();
  // issue #11 — permukaan akuntansi (Catatan Transaksi, Rincian per Akun, Daftar
  // Akun) hanya muncul bila peran mengizinkan DAN Mode Akuntan efektif ON. Aturan
  // itu hidup di `isNavItemVisible`, satu keputusan dengan penjaga halaman.
  const user = { role, accountantMode, companyCount };
  // issue #73 — menu mengikuti matriks EFEKTIF (override dari /permissions)
  // begitu termuat; sebelumnya memakai matriks bawaan di bundle.
  const allowed = useEffectivePermissions(role);
  const groups = visibleNavGroups(user, allowed);
  const homeVisible = isNavItemVisible(NAV_HOME, user, allowed);
  // Kecocokan terpanjang: /inventory/opname menyorot "Hitung Ulang Stok" saja.
  const activeHref = activeNavHref(pathname, visibleNavHrefs(user, allowed));

  // ── Grup menu bisa dilipat (issue: 28 item sekaligus terasa penuh) ──
  // Default: hanya grup berisi halaman aktif yang terbuka; sisanya tertutup,
  // jadi menu terlihat ~7 baris, bukan tembok panjang. State di memori: karena
  // sidebar tinggal di layout yang persist, pilihan buka/tutup tetap bertahan
  // saat berpindah halaman (reset hanya saat muat ulang penuh).
  const activeGroupId =
    groups.find((g) => g.items.some((i) => i.href === activeHref))?.id ?? null;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  const isGroupOpen = (id: string) => openGroups[id] ?? id === activeGroupId;
  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => ({ ...prev, [id]: !(prev[id] ?? id === activeGroupId) }));

  /*
   * Escape menutup laci — di layar sempit ia menutupi seluruh halaman, dan
   * lapisan menutup-layar yang tidak bisa ditutup dari papan ketik hanya punya
   * satu jalan keluar: menyentuh tirai. Pola yang sama sudah dipegang
   * `user-menu` dan `help-menu`; laci ini satu-satunya lapisan chrome yang
   * belum ikut. Pendengarnya hanya hidup selama laci terbuka.
   */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  return (
    <>
      {/* Backdrop for mobile */}
      {open && (
        <div
          // Scrim overlay memang hitam transparan, bukan permukaan bertema.
          // eslint-disable-next-line no-restricted-syntax
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/*
       * ⚠ LACI TERTUTUP TIDAK BOLEH TETAP BISA DI-TAB.
       *
       * `-translate-x-full` hanya MENGGESER laci ke luar layar; ~30 tautan menu
       * dan setiap pemicu grupnya tetap ada di pohon dan tetap di urutan fokus.
       * Di layar sempit pengguna papan ketik menekan Tab dari bilah atas dan
       * fokusnya lenyap ke dalam menu yang tidak terlihat di mana pun — puluhan
       * tekanan tanpa satu pun ring fokus di layar, lalu ia mendarat di halaman
       * yang tidak pernah ia pilih. Sama persis untuk pembaca layar, yang
       * membacakan seluruh menu itu sebagai isi halaman.
       *
       * `invisible` mencabutnya dari urutan fokus dan dari pohon aksesibilitas;
       * `lg:visible` mengembalikannya di lebar tempat laci memang kolom tetap.
       * Transisinya tetap `transform` saja: saat MEMBUKA, visibilitas menyala
       * lebih dulu lalu geserannya beranimasi seperti sebelumnya.
       */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar text-sidebar-foreground transform transition-transform duration-200 lg:visible lg:translate-x-0 lg:static lg:z-auto",
          open ? "translate-x-0" : "invisible -translate-x-full"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center justify-between px-6 border-b border-sidebar-border">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5 text-lg font-bold">
            <BrandMark size="sm" />
            <span className="truncate">{APP_NAME}</span>
          </Link>
          {/*
           * Tombol ikon lewat primitif — `variant="ghost" size="icon"` = 40px,
           * target sentuh minimum MASTER.md. Versi sebelumnya adalah `<button>`
           * telanjang TANPA padding sama sekali: yang bisa disentuh hanyalah
           * ikon 20×20px, di pojok layar, pada satu-satunya lebar tempat tombol
           * ini muncul — yaitu ponsel. Ia juga tidak punya ring fokus, padahal
           * pemicu grup tepat di bawahnya punya.
           *
           * `sidebar.tsx` memang terdaftar di `RAW_BUTTON_ALLOWLIST`, tapi
           * alasan yang tertulis di sana adalah pemicu collapse + baris menu
           * (bentuknya ditentukan panelnya) — bukan tombol ikon ini.
           */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label={t("sidebar.closeMenu")}
            className="lg:hidden text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </Button>
        </div>

        {/* Navigation — dikelompokkan per area tugas */}
        <nav
          aria-label={t("sidebar.mainMenu")}
          data-tour="menu-tugas"
          className="flex-1 overflow-y-auto px-3 py-4"
        >
          {homeVisible && (
            <NavLink
              item={NAV_HOME}
              active={activeHref === NAV_HOME.href}
              onClose={onClose}
              t={t}
            />
          )}

          {groups.map((group) => {
            const open = isGroupOpen(group.id);
            const hasActive = group.items.some((i) => i.href === activeHref);
            const panelId = `nav-group-${group.id}`;
            return (
              <div key={group.id} className="mt-4 first:mt-2">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={open}
                  aria-controls={panelId}
                  className="flex w-full cursor-pointer items-center justify-between rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/70 transition-colors duration-150 hover:text-sidebar-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
                >
                  <span className="flex items-center gap-1.5">
                    {t(group.labelKey)}
                    {/* Grup ditutup tapi berisi halaman aktif → titik penanda. */}
                    {!open && hasActive && (
                      <span className="h-1.5 w-1.5 rounded-full bg-sidebar-primary" aria-hidden="true" />
                    )}
                  </span>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0 transition-transform duration-150",
                      open && "rotate-90"
                    )}
                    aria-hidden="true"
                  />
                </button>
                {open && (
                  <div id={panelId} className="mt-1 space-y-1">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.href}
                        item={item}
                        active={activeHref === item.href}
                        onClose={onClose}
                        t={t}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Version */}
        <div className="shrink-0 border-t border-sidebar-border px-6 py-3">
          <p className="text-xs text-sidebar-foreground/60">{APP_NAME}</p>
          {/* Dari `package.json` saat build, bukan literal — nomor yang
              diketik tangan tidak pernah ikut naik saat rilis, dan justru
              dibaca orang ketika sedang melaporkan masalah. */}
          <p className="text-xs text-sidebar-foreground/50">v{APP_VERSION}</p>
        </div>
      </aside>
    </>
  );
}
