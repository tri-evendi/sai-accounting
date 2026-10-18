"use client";

/**
 * Command (issue #51) — daftar perintah/opsi terfilter di atas `cmdk`,
 * pola shadcn/ui dengan palet aplikasi ini.
 *
 * ── Peninjauan issue #188: cmdk TETAP, dan ini alasannya ──────────────────
 * #188 meminta ditinjau apakah berkas ini masih perlu setelah `Select
 * showSearch` AntD tersedia. Jawabannya: dua dari tiga pemakainya memang sudah
 * pindah — `SearchableSelect` dan `ServerSearchableSelect` kini `Select` AntD —
 * tetapi pemakai ketiganya, palet perintah ⌘K
 * (`components/layout/command-palette.tsx`), TIDAK punya padanan di AntD.
 *
 * Yang dibutuhkan palet itu adalah daftar berjudul-grup di dalam modal, yang
 * disaring sambil diketik dan dinavigasi panah — bukan daftar yang menggantung
 * di bawah sebuah isian. `AutoComplete`/`Select showSearch` selalu terpaut pada
 * pemicunya dan tidak punya `CommandGroup` berjudul; membangunnya ulang berarti
 * menulis sendiri penyaringan, roving focus, dan `aria-activedescendant` — tiga
 * hal yang justru menjadi alasan cmdk dipilih di #51. Mengganti komponen yang
 * BEKERJA dengan rakitan tangan yang aksesibilitasnya lebih tipis bukan
 * migrasi, itu kemunduran.
 *
 * ── Kulitnya sejak #203: gaya sebaris + satu blok aturan ───────────────────
 * Kelas Tailwind di berkas ini dicabut bersama Tailwind. Yang TIDAK bisa
 * menjadi gaya sebaris dikumpulkan di `COMMAND_RULES`, dan semuanya keadaan
 * yang memang hanya hidup di CSS:
 *
 *  • **`[cmdk-group-heading]`** — judul grup digambar cmdk SENDIRI, di dalam
 *    `CommandGroup`; komponen ini tidak pernah memegang simpulnya, jadi
 *    satu-satunya cara menggayainya adalah lewat selektor keturunan.
 *  • **`[data-selected]` / `[data-disabled]`** — cmdk menulis atribut itu pada
 *    baris yang sedang disorot papan ketik. Sorotan itu berpindah tanpa render
 *    ulang dari sini.
 *  • **`::placeholder`** kotak ketik.
 *
 * Sasarannya atribut milik cmdk apa adanya, bukan kelas baru: kalau kelak
 * cmdk mengubah nama atributnya, yang berhenti bekerja adalah aturan yang
 * namanya persis menyebutkan atribut itu — bukan sesuatu yang tersembunyi di
 * balik nama kelas kita sendiri.
 */

import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";
import { SearchOutlined } from "@ant-design/icons";

const COMMAND_RULES = `
[data-slot="command-group"] [cmdk-group-heading]{
  padding:var(--ant-padding-sm) var(--ant-padding-xs);
  font-size:var(--ant-font-size-sm);
  font-weight:500;
  color:var(--ant-color-text-secondary);
}
[data-slot="command-item"][data-selected="true"]{background:var(--ant-color-primary-bg)}
[data-slot="command-item"][data-disabled="true"]{pointer-events:none;opacity:.5}
[data-slot="command-input"]::placeholder{color:var(--ant-color-text-placeholder)}
[data-slot="command-input"]:focus{outline:none}
`;

function Command({ style, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <>
      <style href="sai-command" precedence="default">
        {COMMAND_RULES}
      </style>
      <CommandPrimitive
        style={{
          display: "flex",
          width: "100%",
          flexDirection: "column",
          overflow: "hidden",
          borderRadius: "var(--ant-border-radius-lg)",
          background: "var(--ant-color-bg-elevated)",
          color: "var(--ant-color-text)",
          ...style,
        }}
        {...props}
      />
    </>
  );
}

function CommandInput({
  style,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--ant-margin-xs)",
        borderBottom: "1px solid var(--ant-color-border-secondary)",
        paddingInline: "var(--ant-padding-xs)",
        paddingBlock: "var(--ant-padding-xxs)",
      }}
    >
      <SearchOutlined
        aria-hidden="true"
        style={{ flexShrink: 0, fontSize: 16, color: "var(--ant-color-text-secondary)" }}
      />
      <CommandPrimitive.Input
        data-slot="command-input"
        style={{
          width: "100%",
          background: "transparent",
          fontSize: "var(--ant-font-size)",
          color: "var(--ant-color-text)",
          ...style,
        }}
        {...props}
      />
    </div>
  );
}

function CommandList({ style, ...props }: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      style={{
        maxHeight: 240,
        overflowY: "auto",
        overflowX: "hidden",
        paddingBlock: "var(--ant-padding-xxs)",
        ...style,
      }}
      {...props}
    />
  );
}

function CommandEmpty({
  style,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      style={{
        paddingInline: "var(--ant-padding-xs)",
        paddingBlock: "var(--ant-padding-xxs)",
        fontSize: "var(--ant-font-size)",
        color: "var(--ant-color-text-secondary)",
        ...style,
      }}
      {...props}
    />
  );
}

function CommandGroup({
  style,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      style={{ overflow: "hidden", ...style }}
      {...props}
    />
  );
}

function CommandItem({
  style,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      style={{
        display: "flex",
        cursor: "pointer",
        userSelect: "none",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: "var(--ant-margin-xs)",
        paddingInline: "var(--ant-padding-xs)",
        paddingBlock: "var(--ant-padding-xxs)",
        fontSize: "var(--ant-font-size)",
        ...style,
      }}
      {...props}
    />
  );
}

function CommandSeparator({
  style,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      style={{
        marginInline: -4,
        height: 1,
        background: "var(--ant-color-border-secondary)",
        ...style,
      }}
      {...props}
    />
  );
}

export {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
};
