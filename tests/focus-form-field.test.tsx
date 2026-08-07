/**
 * `focusFormField` mendaratkan fokus pada kendali yang SUNGGUHAN (issue #259).
 *
 * ── Bug yang dijaga ────────────────────────────────────────────────────────
 * `focusFormField` mencari sasarannya lewat `#id` lalu `[name=…]`. Sejak #188
 * isian pilihan bukan lagi `<select>` native: `[name=…]` di sana adalah
 * `<input type="hidden">` yang dititipkan `NativeSelect` supaya
 * `new FormData(form)` dan `<form method="get">` tetap bekerja. Memfokuskan
 * simpul itu TIDAK melempar galat — ia diam-diam membuang fokusnya. Jadi saat
 * validasi menolak sebuah isian pilihan, halaman menggulir ke sana tetapi
 * fokusnya mendarat di kontrol tak terlihat: pembaca layar tidak mengumumkan
 * apa pun, pengguna papan tik harus mencari sendiri isian yang salah.
 *
 * Karena kegagalannya SENYAP, tes yang hanya memanggil `focusFormField` lalu
 * memeriksa ia tidak melempar galat tidak membuktikan apa pun — perilaku yang
 * rusak pun tidak melempar. Yang dinyatakan di bawah karena itu adalah SIMPUL
 * MANA yang menerima fokus, dan sifat-sifat simpul itu (bukan `hidden`, bukan
 * di dalam pembungkus `display:none`, bisa menerima fokus papan tik).
 *
 * ── Kenapa ada mini-DOM di berkas ini ──────────────────────────────────────
 * Suite ini berjalan di lingkungan `node` dan repo ini TIDAK memasang jsdom —
 * seluruh tes UI-nya menyatakan sesuatu tentang markup hasil
 * `renderToStaticMarkup`. Menambah jsdom hanya demi satu berkas adalah
 * dependensi berat untuk masalah kecil; sebagai gantinya markup NYATA hasil
 * render `NativeSelect` diurai menjadi pohon sekecil mungkin yang memenuhi
 * `FocusTargetNode`, lalu `focusFormField` YANG SEBENARNYA dijalankan di
 * atasnya. Yang ditiru hanya pengurai HTML-nya; bentuk DOM yang diuji datang
 * dari komponen sungguhan, jadi perubahan bentuk DOM AntD ikut terlihat di
 * sini.
 *
 * `querySelector` tiruan di bawah sengaja MELEMPAR untuk selektor yang belum
 * dikenalnya: kalau suatu saat `focusFormField` mencari dengan bentuk lain,
 * penjaga ini harus berteriak, bukan diam-diam berhenti menguji.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { useForm } from "react-hook-form";

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { focusFormField, type FocusSearchRoot, type FocusTargetNode } from "@/components/ui/disclosure-section";
import { TextInput } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Dictionary } from "@/lib/i18n/dictionary";
import id from "@/lib/i18n/dictionaries/id.json";

/* ------------------------------------------------------------------ */
/* Mini-DOM: pohon dari markup nyata                                    */
/* ------------------------------------------------------------------ */

const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "param", "source", "track", "wbr",
]);

/** Catatan panggilan — inti pembuktiannya: SIMPUL MANA yang difokuskan. */
interface CallLog {
  focused: TestElement[];
  scrolled: TestElement[];
}

class TestElement implements FocusTargetNode {
  readonly children: TestElement[] = [];
  parentElement: TestElement | null = null;

  constructor(
    readonly tagName: string,
    private readonly attrs: Record<string, string>,
    private readonly log: CallLog
  ) {}

  getAttribute(name: string): string | null {
    return this.attrs[name.toLowerCase()] ?? null;
  }

  hasAttribute(name: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.attrs, name.toLowerCase());
  }

  focus(): void {
    this.log.focused.push(this);
  }

  scrollIntoView(): void {
    this.log.scrolled.push(this);
  }

  /** Deskripsi pendek untuk pesan gagal yang bisa dibaca. */
  describe(): string {
    const shown = ["id", "name", "type", "role", "data-slot", "class"]
      .map((key) => (this.getAttribute(key) === null ? "" : ` ${key}="${this.getAttribute(key)}"`))
      .join("");
    return `<${this.tagName}${shown}>`;
  }
}

/**
 * Pengurai markup React SSR — bukan pengurai HTML umum: ia hanya perlu mengenal
 * tag, atribut berkutip ganda, dan elemen void (React selalu menutup sendiri
 * elemen void dan selalu mengutip nilai atributnya).
 */
function parseMarkup(html: string, log: CallLog): TestElement {
  const root = new TestElement("#fragment", {}, log);
  const stack: TestElement[] = [root];
  let i = 0;

  while (i < html.length) {
    const lt = html.indexOf("<", i);
    if (lt < 0) break;
    i = lt + 1;

    if (html.startsWith("!--", i)) {
      i = html.indexOf("-->", i) + 3;
      continue;
    }
    if (html[i] === "!") {
      i = html.indexOf(">", i) + 1;
      continue;
    }

    const closing = html[i] === "/";
    if (closing) i += 1;

    let cursor = i;
    while (cursor < html.length && !/[\s/>]/.test(html[cursor])) cursor += 1;
    const tag = html.slice(i, cursor).toLowerCase();
    i = cursor;

    if (closing) {
      i = html.indexOf(">", i) + 1;
      if (stack.length > 1) stack.pop();
      continue;
    }

    const attrs: Record<string, string> = {};
    let selfClosing = false;
    while (i < html.length) {
      while (i < html.length && /\s/.test(html[i])) i += 1;
      if (html[i] === ">") {
        i += 1;
        break;
      }
      if (html[i] === "/" && html[i + 1] === ">") {
        selfClosing = true;
        i += 2;
        break;
      }
      const nameStart = i;
      while (i < html.length && !/[\s=/>]/.test(html[i])) i += 1;
      const name = html.slice(nameStart, i).toLowerCase();
      let value = "";
      if (html[i] === "=") {
        i += 1;
        const quote = html[i];
        if (quote === '"' || quote === "'") {
          const end = html.indexOf(quote, i + 1);
          value = html.slice(i + 1, end);
          i = end + 1;
        } else {
          const start = i;
          while (i < html.length && !/[\s>]/.test(html[i])) i += 1;
          value = html.slice(start, i);
        }
      }
      if (name) attrs[name] = value;
    }

    const node = new TestElement(tag, attrs, log);
    const parent = stack[stack.length - 1];
    node.parentElement = parent === root ? null : parent;
    parent.children.push(node);
    if (!selfClosing && !VOID_TAGS.has(tag)) stack.push(node);
  }

  return root;
}

function walk(node: TestElement, visit: (el: TestElement) => void): void {
  for (const child of node.children) {
    visit(child);
    walk(child, visit);
  }
}

function find(node: TestElement, match: (el: TestElement) => boolean): TestElement | null {
  for (const child of node.children) {
    if (match(child)) return child;
    const deeper = find(child, match);
    if (deeper) return deeper;
  }
  return null;
}

/** Akar pencarian: hanya dua bentuk selektor yang dipakai `focusFormField`. */
function searchRoot(root: TestElement): FocusSearchRoot {
  return {
    querySelector(selectors: string): FocusTargetNode | null {
      const byId = /^#(.+)$/.exec(selectors);
      if (byId) return find(root, (el) => el.getAttribute("id") === byId[1]);
      const byName = /^\[name="(.+)"\]$/.exec(selectors);
      if (byName) return find(root, (el) => el.getAttribute("name") === byName[1]);
      throw new Error(
        `Selektor belum dikenal penjaga ini: ${selectors}. Perbarui tesnya, jangan biarkan ia diam.`
      );
    },
  };
}

/* ------------------------------------------------------------------ */
/* Formulir uji — bentuk yang sama dengan tiga formulir pemanggilnya    */
/* ------------------------------------------------------------------ */

/**
 * `note` sengaja ditulis PALING ATAS: ia kendali fokusabel pertama di dalam
 * `<form>`. Perbaikan yang menaiki induk terlalu jauh ("ambil kendali
 * fokusabel pertama di formulir") akan mendarat di sana, dan tes di bawah
 * menangkapnya.
 */
function Probe() {
  const form = useForm({ defaultValues: { note: "", accountId: "" } });
  return (
    <Form {...form}>
      <form>
        <FormField
          control={form.control}
          name="note"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Catatan</FormLabel>
              <FormControl>
                <TextInput {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="accountId"
          render={({ field }) => (
            <FormItem>
              <FormLabel required>Akun lawan</FormLabel>
              <FormControl>
                <NativeSelect
                  {...field}
                  placeholder="Pilih akun"
                  options={[
                    { value: "1", label: "Kas Kecil" },
                    { value: "2", label: "Bank BCA" },
                  ]}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {/* Isian pilihan di LUAR pola `Form` — di sini `id` memang sama dengan
            nama fieldnya (pola saringan `method="get"` dan formulir kontrak/
            faktur yang belum memakai react-hook-form). */}
        <NativeSelect
          id="currency"
          name="currency"
          options={[
            { value: "IDR", label: "Rupiah" },
            { value: "USD", label: "USD" },
          ]}
        />
      </form>
    </Form>
  );
}

function renderProbe(): { root: TestElement; log: CallLog } {
  const html = renderToStaticMarkup(
    <LocaleProvider locale="id" dictionary={id as Dictionary}>
      <Probe />
    </LocaleProvider>
  );
  const log: CallLog = { focused: [], scrolled: [] };
  return { root: parseMarkup(html, log), log };
}

/** Rantai induk sebuah simpul, dari terdekat ke terjauh. */
function ancestors(node: TestElement): TestElement[] {
  const chain: TestElement[] = [];
  let parent = node.parentElement;
  while (parent) {
    chain.push(parent as TestElement);
    parent = parent.parentElement;
  }
  return chain;
}

/**
 * Sifat-sifat yang dituntut issue #259, dinyatakan dari ATRIBUT simpulnya —
 * bukan dengan memanggil ulang penilai fokus milik implementasinya (itu hanya
 * akan menyetujui dirinya sendiri).
 */
function expectKeyboardFocusable(node: TestElement): void {
  const what = node.describe();
  expect(node.tagName, what).not.toBe("#fragment");
  // Bukan simpul tersembunyi — inilah bug-nya.
  if (node.tagName === "input") {
    expect(node.getAttribute("type"), what).not.toBe("hidden");
  }
  expect(node.hasAttribute("hidden"), what).toBe(false);
  expect(node.hasAttribute("disabled"), what).toBe(false);
  expect(node.getAttribute("aria-hidden"), what).not.toBe("true");
  expect(node.getAttribute("tabindex"), what).not.toBe("-1");
  // Bisa menerima fokus papan tik: tag yang memang fokusabel, atau tabindex >= 0.
  const nativelyFocusable = ["input", "select", "textarea", "button"].includes(node.tagName);
  const tabIndex = node.getAttribute("tabindex");
  expect(nativelyFocusable || (tabIndex !== null && Number(tabIndex) >= 0), what).toBe(true);
  // Tidak berada di dalam pembungkus yang disembunyikan CSS — `NativeSelect`
  // menaruh hidden companion-nya di `ant-select-prefix` yang `display:none`.
  for (const parent of ancestors(node)) {
    expect(
      (parent.getAttribute("style") ?? "").replace(/\s/g, ""),
      `${what} berada di dalam ${parent.describe()}`
    ).not.toContain("display:none");
  }
}

/* ------------------------------------------------------------------ */

describe("focusFormField", () => {
  it("jebakan yang diperbaiki memang masih ada: [name] isian pilihan menunjuk input tersembunyi", () => {
    // Penanda bahwa tes ini menguji sesuatu yang nyata. Hidden companion TIDAK
    // boleh dihapus (ia yang membuat FormData & method=get bekerja), jadi
    // pencarian `[name=…]` memang akan selalu berujung di sana.
    const { root } = renderProbe();
    const named = find(root, (el) => el.getAttribute("name") === "accountId");
    expect(named?.tagName).toBe("input");
    expect(named?.getAttribute("type")).toBe("hidden");
  });

  it("isian pilihan: fokus mendarat di pemicu Select, bukan di input tersembunyi", () => {
    const { root, log } = renderProbe();
    focusFormField("accountId", searchRoot(root));

    expect(log.focused).toHaveLength(1);
    const focused = log.focused[0];

    expectKeyboardFocusable(focused);
    // Pemicu `Select` AntD: satu-satunya kendali yang bisa dibuka papan tik.
    expect(focused.getAttribute("role")).toBe("combobox");
    expect(focused.getAttribute("name")).toBeNull();
  });

  it("isian pilihan: yang difokuskan milik isian ITU, bukan isian tetangga", () => {
    const { root, log } = renderProbe();
    focusFormField("accountId", searchRoot(root));

    const focused = log.focused[0];
    const hidden = find(root, (el) => el.getAttribute("name") === "accountId");
    expect(hidden).not.toBeNull();

    // Keduanya harus berbagi akar kendali yang sama (`.ant-select`).
    const selectRoot = ancestors(hidden as TestElement).find((el) =>
      (el.getAttribute("class") ?? "").split(/\s+/).includes("ant-select")
    );
    expect(selectRoot, "akar .ant-select tidak ditemukan").toBeDefined();
    expect(ancestors(focused)).toContain(selectRoot);

    // Dan BUKAN isian pertama di formulir — jebakan pendakian yang terlalu jauh.
    expect(focused.getAttribute("name")).not.toBe("note");
  });

  it("isian teks: tetap simpul bernama itu sendiri", () => {
    const { root, log } = renderProbe();
    focusFormField("note", searchRoot(root));

    expect(log.focused).toHaveLength(1);
    const focused = log.focused[0];
    expectKeyboardFocusable(focused);
    expect(focused.tagName).toBe("input");
    expect(focused.getAttribute("name")).toBe("note");
  });

  it("isian pilihan ber-id: jalur `#id` juga berujung di kendali fokusabel", () => {
    const { root, log } = renderProbe();
    focusFormField("currency", searchRoot(root));

    expect(log.focused).toHaveLength(1);
    expectKeyboardFocusable(log.focused[0]);
    expect(log.focused[0].getAttribute("role")).toBe("combobox");
  });

  it("menggulir ke simpul yang sama dengan yang difokuskan", () => {
    const { root, log } = renderProbe();
    focusFormField("accountId", searchRoot(root));

    expect(log.scrolled).toHaveLength(1);
    expect(log.scrolled[0]).toBe(log.focused[0]);
  });

  it("isian yang tidak ada: tidak ada yang difokuskan dan tidak melempar", () => {
    const { root, log } = renderProbe();
    expect(() => focusFormField("tidakAda", searchRoot(root))).not.toThrow();
    expect(log.focused).toHaveLength(0);
    expect(log.scrolled).toHaveLength(0);
  });

  it("mini-DOM-nya memang mengurai markup nyata, bukan pohon kosong", () => {
    // Penjaga untuk penjaga: kalau penguraiannya rusak, semua tes di atas akan
    // hijau karena tak menemukan apa pun. Ini yang mencegahnya.
    const { root } = renderProbe();
    let elements = 0;
    walk(root, () => {
      elements += 1;
    });
    expect(elements).toBeGreaterThan(20);
    expect(find(root, (el) => el.tagName === "form")).not.toBeNull();
    expect(find(root, (el) => el.getAttribute("role") === "combobox")).not.toBeNull();
  });
});
