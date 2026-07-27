"use client";

/**
 * Pemilih modul usaha (issue #99) — dipakai DUA tempat dengan bentuk yang sama:
 * langkah "Modul Usaha" di wizard penyiapan dan kartu "Modul Usaha" di halaman
 * Pengaturan. Satu komponen, supaya kalimat & perilakunya tidak bisa menyimpang
 * antara "saat menyiapkan" dan "saat mengubah pikiran".
 *
 * Murni tampilan: keadaan dipegang pemanggil (`category` + `modules`), dan
 * penyimpanannya urusan pemanggil juga. Preset kategori hanya MENGISI daftar
 * centang — sesudah itu tiap modul berdiri sendiri, dan itu terlihat langsung
 * karena centangnya memang berubah di depan mata.
 *
 * Desain (MASTER.md): kategori sebagai kartu radio native (bukan tombol rakitan
 * — `<input type="radio">` memang di luar aturan primitif tombol), modul lewat
 * primitif `Checkbox`, modul inti dikunci dengan lencana BERTEKS "Selalu aktif"
 * (bukan sekadar abu-abu), dan satu kalimat tetap yang menegaskan mematikan
 * modul TIDAK menghapus data apa pun.
 */

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import {
  BUSINESS_CATEGORIES,
  BUSINESS_MODULES,
  CATEGORY_META,
  MODULE_META,
  isCoreModule,
  modulesForCategory,
  type BusinessCategory,
  type BusinessModule,
} from "@/lib/business-modules";
import { useT } from "@/lib/i18n/client";
import { Check, Info, Lock, X } from "lucide-react";

/** Modul non-inti yang DINYALAKAN sebuah preset (inti tak pernah disebut). */
const presetOn = (category: BusinessCategory): BusinessModule[] =>
  modulesForCategory(category).filter((module) => !isCoreModule(module));

/** Kebalikannya: modul yang preset itu MATIKAN. */
const presetOff = (category: BusinessCategory): BusinessModule[] => {
  const on = new Set(presetOn(category));
  return BUSINESS_MODULES.filter((module) => !isCoreModule(module) && !on.has(module));
};

export function ModulePicker({
  category,
  modules,
  onCategoryChange,
  onToggleModule,
  disabled = false,
}: {
  /** Kategori terpilih, atau "" bila belum memilih (dan tak ingin menebak). */
  category: BusinessCategory | "";
  modules: ReadonlySet<BusinessModule>;
  onCategoryChange: (category: BusinessCategory) => void;
  onToggleModule: (module: BusinessModule, next: boolean) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const activeCount = BUSINESS_MODULES.filter((m) => isCoreModule(m) || modules.has(m)).length;

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-sm font-medium text-foreground">
          {t("modules.categoryLabel")}
        </legend>
        <p className="mb-2 text-xs text-muted-foreground">{t("modules.categoryHint")}</p>
        <div className="grid gap-2 sm:grid-cols-2">
          {BUSINESS_CATEGORIES.map((value) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
                "transition-colors duration-150 hover:bg-muted motion-reduce:transition-none",
                category === value ? "border-primary bg-primary/10" : "border-border",
                disabled && "cursor-not-allowed opacity-60"
              )}
            >
              <input
                type="radio"
                name="business-category"
                className="mt-0.5 h-4 w-4 cursor-pointer"
                checked={category === value}
                disabled={disabled}
                onChange={() => onCategoryChange(value)}
              />
              <span className="min-w-0">
                <span className="block font-medium text-foreground">
                  {t(CATEGORY_META[value].labelKey)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t(CATEGORY_META[value].descriptionKey)}
                </span>
                {/*
                 * Akibat pilihan ini, SEBELUM dipilih (issue #103).
                 *
                 * Dulu kartu preset hanya menjanjikan; yang hilang baru ketahuan
                 * sesudahnya lewat ketiadaan — orang memilih "Jasa", lalu suatu
                 * hari mencari Surat Jalan dan menyimpulkan aplikasinya tidak
                 * bisa.
                 *
                 * Isinya DITURUNKAN dari `CATEGORY_MODULES`, bukan diketik:
                 * daftar tulisan tangan pasti menyimpang begitu satu modul
                 * berpindah kategori — dan itu sudah terjadi sekali (uang muka,
                 * `trading` → `purchasing`). Yang ditulis tangan hanya frasa
                 * TUGAS per modul (`taskKey`): "kontrak berjangka, surat jalan"
                 * alih-alih "Perdagangan Barang", sesuai prinsip bahasa-tugas
                 * MASTER.md. Modul inti tak pernah disebut — ia tidak bisa mati,
                 * jadi menyebutnya menambah bacaan tanpa menambah keputusan.
                 */}
                {(["on", "off"] as const).map((side) => {
                  const list = side === "on" ? presetOn(value) : presetOff(value);
                  if (list.length === 0) return null;
                  return (
                    <span key={side} className="mt-1 flex items-start gap-1.5 text-xs">
                      {side === "on" ? (
                        <Check className="mt-0.5 size-3 shrink-0 text-success" aria-hidden="true" />
                      ) : (
                        <X
                          className="mt-0.5 size-3 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                      )}
                      <span className="min-w-0 text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {t(
                            side === "on"
                              ? "modules.categoryTurnsOn"
                              : "modules.categoryTurnsOff"
                          )}
                          :
                        </span>{" "}
                        {list.map((module) => t(MODULE_META[module].taskKey)).join("; ")}
                      </span>
                    </span>
                  );
                })}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-foreground">{t("modules.modulesLabel")}</h3>
          <Badge>
            {t("modules.activeCount", { count: activeCount, total: BUSINESS_MODULES.length })}
          </Badge>
        </div>

        <ul className="divide-y divide-border rounded-lg border border-border">
          {BUSINESS_MODULES.map((module) => {
            const core = isCoreModule(module);
            const checked = core || modules.has(module);
            return (
              <li key={module} className="flex items-start gap-3 p-3">
                <Checkbox
                  id={`module-${module}`}
                  className="mt-0.5"
                  checked={checked}
                  disabled={disabled || core}
                  onCheckedChange={(state) => onToggleModule(module, state === true)}
                  aria-label={t(MODULE_META[module].labelKey)}
                />
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor={`module-${module}`}
                    className={cn(
                      "flex flex-wrap items-center gap-2 text-sm font-medium text-foreground",
                      !core && !disabled && "cursor-pointer"
                    )}
                  >
                    {t(MODULE_META[module].labelKey)}
                    {core && (
                      <span className="inline-flex items-center gap-1 text-xs font-normal text-muted-foreground">
                        <Lock className="size-3" aria-hidden="true" />
                        {t("modules.coreLocked")}
                      </span>
                    )}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {t(MODULE_META[module].descriptionKey)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="flex items-start gap-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t("modules.ledgerNote")}</span>
      </p>
    </div>
  );
}
