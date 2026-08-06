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
 *
 * ── Setelah AntD (issue #240, fase C9) ────────────────────────────────────
 * Kelas Tailwind diganti token; yang TIDAK diganti adalah `<input
 * type="radio">`-nya. Menjadikannya `Radio.Group` AntD terlihat lebih rapi dan
 * menukar satu keputusan yang sudah diambil: kartu kategori adalah LABEL
 * selebar kartu dengan tiga baris penjelas di dalamnya, dan `Radio` AntD
 * menggambar labelnya sendiri sebagai satu baris di samping bulatannya. MASTER
 * menyebut radio native sebagai sah secara eksplisit; ia tinggal.
 */

import { theme } from "antd";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  const { token } = theme.useToken();
  const activeCount = BUSINESS_MODULES.filter((m) => isCoreModule(m) || modules.has(m)).length;

  /** Kisi kartu kategori — pengganti `sm:grid-cols-2`, tanpa titik patah. */
  const categoryGrid: React.CSSProperties = {
    display: "grid",
    gap: token.marginXS,
    gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))",
  };

  const moduleRow: React.CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: token.marginSM,
    padding: token.paddingSM,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: token.marginLG }}>
      <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
        <legend style={{ fontWeight: 500, color: token.colorText }}>
          {t("modules.categoryLabel")}
        </legend>
        <p
          style={{
            margin: 0,
            marginBottom: token.marginXS,
            fontSize: token.fontSizeSM,
            color: token.colorTextSecondary,
          }}
        >
          {t("modules.categoryHint")}
        </p>
        <div style={categoryGrid}>
          {BUSINESS_CATEGORIES.map((value) => (
            <label
              key={value}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: token.marginSM,
                padding: token.paddingSM,
                borderRadius: token.borderRadiusLG,
                border: `${token.lineWidth}px solid ${
                  category === value ? token.colorPrimary : token.colorBorderSecondary
                }`,
                background: category === value ? token.colorPrimaryBg : undefined,
                cursor: disabled ? "not-allowed" : "pointer",
                opacity: disabled ? 0.6 : undefined,
              }}
            >
              <input
                type="radio"
                name="business-category"
                style={{
                  marginTop: 2,
                  width: 16,
                  height: 16,
                  cursor: disabled ? "not-allowed" : "pointer",
                }}
                checked={category === value}
                disabled={disabled}
                onChange={() => onCategoryChange(value)}
              />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 500, color: token.colorText }}>
                  {t(CATEGORY_META[value].labelKey)}
                </span>
                <span
                  style={{
                    display: "block",
                    fontSize: token.fontSizeSM,
                    color: token.colorTextSecondary,
                  }}
                >
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
                    <span
                      key={side}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: token.marginXXS,
                        marginTop: token.marginXXS,
                        fontSize: token.fontSizeSM,
                      }}
                    >
                      {/* Nyala/mati dibawa IKON + KATA ("Menyalakan:" /
                          "Mematikan:"), jadi warnanya bukan penanda tunggal. */}
                      {side === "on" ? (
                        <Check
                          size={12}
                          style={{ marginTop: 2, flexShrink: 0, color: token.colorSuccessActive }}
                          aria-hidden="true"
                        />
                      ) : (
                        <X
                          size={12}
                          style={{ marginTop: 2, flexShrink: 0, color: token.colorTextSecondary }}
                          aria-hidden="true"
                        />
                      )}
                      <span style={{ minWidth: 0, color: token.colorTextSecondary }}>
                        <span style={{ fontWeight: 500, color: token.colorText }}>
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
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: token.marginXS,
            marginBottom: token.marginXS,
          }}
        >
          <h3 style={{ margin: 0, fontWeight: 500, color: token.colorText }}>
            {t("modules.modulesLabel")}
          </h3>
          <Badge>
            {t("modules.activeCount", { count: activeCount, total: BUSINESS_MODULES.length })}
          </Badge>
        </div>

        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            borderRadius: token.borderRadiusLG,
            border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
          }}
        >
          {BUSINESS_MODULES.map((module, index) => {
            const core = isCoreModule(module);
            const checked = core || modules.has(module);
            return (
              <li
                key={module}
                style={{
                  ...moduleRow,
                  listStyle: "none",
                  /* Pemisah antar-baris digambar di ATAS baris kedua dan
                     seterusnya: `:last-child` tidak punya padanan gaya sebaris,
                     dan menghitungnya dari indeks membuat aturannya terbaca di
                     tempat yang sama dengan barisnya. */
                  borderTop:
                    index === 0
                      ? undefined
                      : `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
                }}
              >
                <Checkbox
                  id={`module-${module}`}
                  style={{ marginTop: 2 }}
                  checked={checked}
                  disabled={disabled || core}
                  onCheckedChange={(state) => onToggleModule(module, state === true)}
                  aria-label={t(MODULE_META[module].labelKey)}
                />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <label
                    htmlFor={`module-${module}`}
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      alignItems: "center",
                      gap: token.marginXS,
                      fontWeight: 500,
                      color: token.colorText,
                      cursor: !core && !disabled ? "pointer" : undefined,
                    }}
                  >
                    {t(MODULE_META[module].labelKey)}
                    {core && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: token.marginXXS,
                          fontSize: token.fontSizeSM,
                          fontWeight: "normal",
                          color: token.colorTextSecondary,
                        }}
                      >
                        <Lock size={12} aria-hidden="true" />
                        {t("modules.coreLocked")}
                      </span>
                    )}
                  </label>
                  <p
                    style={{
                      margin: 0,
                      fontSize: token.fontSizeSM,
                      color: token.colorTextSecondary,
                    }}
                  >
                    {t(MODULE_META[module].descriptionKey)}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <p
        style={{
          margin: 0,
          display: "flex",
          alignItems: "flex-start",
          gap: token.marginXS,
          borderRadius: token.borderRadius,
          border: `${token.lineWidth}px solid ${token.colorBorderSecondary}`,
          background: token.colorFillQuaternary,
          paddingInline: token.paddingSM,
          paddingBlock: token.paddingXS,
          fontSize: token.fontSizeSM,
          color: token.colorTextSecondary,
        }}
      >
        <Info size={16} style={{ marginTop: 2, flexShrink: 0 }} aria-hidden="true" />
        <span>{t("modules.ledgerNote")}</span>
      </p>
    </div>
  );
}
