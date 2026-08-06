/**
 * `sai/warna-token-antd` — warna hanya boleh datang dari token Ant Design.
 *
 * ══ PENGGANTI `RAW_PALETTE`, BUKAN PEMULIHANNYA ════════════════════════════
 * Sampai issue #203 penjaga warna repo ini adalah `RAW_PALETTE`: sebuah regex
 * yang menolak kelas palet Tailwind mentah (`bg-blue-600`, `text-gray-500`)
 * di literal string mana pun. Ia dicabut bersama Tailwind, dan tidak boleh
 * dihidupkan lagi — kelas yang dijaganya sudah tidak dikompilasi siapa pun,
 * jadi ia tidak akan pernah menangkap apa pun.
 *
 * Aturan ini menjaga kosakata yang MENGGANTIKANNYA. Sejak #203 gaya ditulis
 * sebaris, jadi cara warna menyimpang juga berganti bentuk: bukan lagi kelas
 * di luar daftar semantik, melainkan **nilai warna mentah** — `#0EA5E9`,
 * `rgba(0,0,0,.5)`, `white` — yang diketik langsung di sebuah `style`.
 *
 * ══ KENAPA INI BUKAN SOAL SELERA ═══════════════════════════════════════════
 * Nilai warna mentah punya tiga akibat yang semuanya diam:
 *
 *  1. **Ia tidak ikut berganti tema.** Token AntD punya nilai terang DAN
 *     gelap; `#0EA5E9` hanya punya satu. Bidang yang memakainya tetap sama
 *     saat tema gelap menyala, dan itu baru terlihat kalau ada yang membuka
 *     halaman itu dalam gelap.
 *  2. **Kontrasnya tak pernah diukur.** Angka kontras aplikasi ini dihitung
 *     ulang setiap kali suite berjalan (`tests/money-tokens.test.ts`,
 *     `tests/ui-controls-antd.test.tsx`) — tetapi hanya untuk nilai yang
 *     berdiri di `src/lib/theme/antd-tokens.ts`. Hex yang diketik di sebuah
 *     halaman tidak diperiksa siapa pun.
 *  3. **Ia tidak bisa dicari.** Pelajaran termahal dari `RAW_PALETTE`: satu
 *     kelas `border-l-primary` lolos berbulan-bulan karena polanya tidak
 *     mengenal sisi arah. Penjaga yang hanya mengenal SEBAGIAN bentuk sebuah
 *     kosakata membuat orang percaya seluruhnya dijaga.
 *
 * ══ KENAPA AST, BUKAN REGEX ATAS TEKS BERKAS ═══════════════════════════════
 * Repo ini menulis alasan di komentar, dan komentarnya penuh angka hex — tabel
 * kontras di `antd-tokens.ts`, catatan sejarah `#1E40AF`, perbandingan
 * `#52c41a` = 2,27:1. Penjaga berbasis grep akan menyala pada SEMUA itu, lalu
 * dilonggarkan sampai tak berarti. Aturan ini hanya melihat simpul string yang
 * benar-benar sampai ke runtime; komentar tak pernah menjadi simpul.
 *
 * ══ YANG BOLEH ═════════════════════════════════════════════════════════════
 *  • `var(--ant-…)`  — token AntD sebagai variabel CSS (server component pun
 *    boleh, sejak #227);
 *  • `theme.useToken()` — bila NILAInya memang perlu dihitung/diteruskan;
 *  • kata kunci CSS yang bukan warna palet: `transparent`, `currentColor`,
 *    `inherit`, `initial`, `unset`, `revert`, `none`;
 *  • `color-mix()` di atas keduanya.
 *
 * ══ YANG DIKECUALIKAN, DAN DI MANA ═════════════════════════════════════════
 * Pengecualiannya BERKAS, bukan pola, dan didaftar di `eslint.config.mjs`
 * supaya terlihat di satu tempat:
 *  • `src/lib/theme/antd-tokens.ts` — sumber kebenarannya; di sinilah setiap
 *    hex ditulis, beserta rasio kontras terhitungnya;
 *  • `src/lib/pdf/brand.ts` — warna DOKUMEN CETAK. Kertas tidak punya tema
 *    gelap dan tidak melihat satu pun variabel CSS.
 */

/** Hex utuh sebagai NILAI (`"#001529"`), termasuk bentuk 3 & 4 digit. */
const HEX_UTUH = /^\s*#[0-9a-fA-F]{3,8}\s*$/;

/**
 * Hex 6/8 digit di TENGAH string (`"1px solid #8c8c8c"`, blok `<style>`).
 *
 * Sengaja TIDAK mengenali bentuk 3 digit di posisi ini: `#186`, `#203`, `#227`
 * adalah nomor issue, dan repo ini menyebutnya di dalam string yang sampai ke
 * runtime (pesan galat, label). Bentuk 3 digit tetap tertangkap `HEX_UTUH`
 * ketika ia berdiri sebagai nilai utuh — dan sebuah string yang isinya persis
 * `"#186"` memang tidak pernah berarti nomor issue.
 */
const HEX_PANJANG = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/;

/** Fungsi warna CSS. `color-mix()` sengaja TIDAK ikut — ia mencampur token. */
const FUNGSI_WARNA = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/;

/**
 * Nama warna CSS. Hanya diperiksa pada properti yang memang bernilai warna:
 * `"gold"`, `"orange"`, dan `"silver"` juga kata biasa, dan aplikasi ini
 * menulis kata biasa di dalam string sepanjang hari.
 */
const NAMA_WARNA = new Set([
  "aliceblue", "antiquewhite", "aqua", "aquamarine", "azure", "beige", "bisque",
  "black", "blanchedalmond", "blue", "blueviolet", "brown", "burlywood",
  "cadetblue", "chartreuse", "chocolate", "coral", "cornflowerblue", "cornsilk",
  "crimson", "cyan", "darkblue", "darkcyan", "darkgoldenrod", "darkgray",
  "darkgreen", "darkgrey", "darkkhaki", "darkmagenta", "darkolivegreen",
  "darkorange", "darkorchid", "darkred", "darksalmon", "darkseagreen",
  "darkslateblue", "darkslategray", "darkslategrey", "darkturquoise",
  "darkviolet", "deeppink", "deepskyblue", "dimgray", "dimgrey", "dodgerblue",
  "firebrick", "floralwhite", "forestgreen", "fuchsia", "gainsboro",
  "ghostwhite", "gold", "goldenrod", "gray", "green", "greenyellow", "grey",
  "honeydew", "hotpink", "indianred", "indigo", "ivory", "khaki", "lavender",
  "lavenderblush", "lawngreen", "lemonchiffon", "lightblue", "lightcoral",
  "lightcyan", "lightgoldenrodyellow", "lightgray", "lightgreen", "lightgrey",
  "lightpink", "lightsalmon", "lightseagreen", "lightskyblue", "lightslategray",
  "lightslategrey", "lightsteelblue", "lightyellow", "lime", "limegreen",
  "linen", "magenta", "maroon", "mediumaquamarine", "mediumblue",
  "mediumorchid", "mediumpurple", "mediumseagreen", "mediumslateblue",
  "mediumspringgreen", "mediumturquoise", "mediumvioletred", "midnightblue",
  "mintcream", "mistyrose", "moccasin", "navajowhite", "navy", "oldlace",
  "olive", "olivedrab", "orange", "orangered", "orchid", "palegoldenrod",
  "palegreen", "paleturquoise", "palevioletred", "papayawhip", "peachpuff",
  "peru", "pink", "plum", "powderblue", "purple", "rebeccapurple", "red",
  "rosybrown", "royalblue", "saddlebrown", "salmon", "sandybrown", "seagreen",
  "seashell", "sienna", "silver", "skyblue", "slateblue", "slategray",
  "slategrey", "snow", "springgreen", "steelblue", "tan", "teal", "thistle",
  "tomato", "turquoise", "violet", "wheat", "white", "whitesmoke", "yellow",
  "yellowgreen",
]);

/**
 * Properti CSS yang nilainya warna (atau memuat warna sebagai bagian). Ditulis
 * camelCase — bentuk yang dipakai `style={{ … }}` — plus padanan kebab-case,
 * karena kunci objek gaya boleh dikutip (`{ "border-color": … }`).
 */
const PROP_WARNA = new Set([
  "color", "background", "backgroundColor", "backgroundImage", "borderColor",
  "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
  "borderInlineColor", "borderInlineStartColor", "borderInlineEndColor",
  "borderBlockColor", "borderBlockStartColor", "borderBlockEndColor",
  "outlineColor", "textDecorationColor", "textEmphasisColor", "caretColor",
  "columnRuleColor", "accentColor", "fill", "stroke", "floodColor",
  "lightingColor", "stopColor", "boxShadow", "textShadow", "border",
  "borderTop", "borderRight", "borderBottom", "borderLeft", "borderInline",
  "borderInlineStart", "borderInlineEnd", "borderBlock", "borderBlockStart",
  "borderBlockEnd", "outline", "columnRule", "background-color",
  "border-color", "outline-color", "box-shadow", "text-shadow",
]);

/** Kata kunci CSS yang bukan nilai palet — selalu boleh. */
const KATA_KUNCI_AMAN = new Set([
  "transparent", "currentcolor", "inherit", "initial", "unset", "revert",
  "revert-layer", "none", "auto",
]);

const PESAN =
  "Nilai warna mentah `{{nilai}}`. Warna hanya boleh datang dari token Ant " +
  "Design: `var(--ant-…)` (boleh dari server component sejak #227) atau " +
  "`theme.useToken()` bila nilainya memang perlu dihitung. Nilai mentah tidak " +
  "ikut berganti tema, kontrasnya tidak pernah diukur suite ini, dan ia tidak " +
  "bisa dicari kembali. Kalau ini memang nilai baru, tulis di " +
  "`src/lib/theme/antd-tokens.ts` beserta rasio kontrasnya, lalu rujuk dari " +
  "sini. Lihat §Color Palette di design-system/sai-accounting/MASTER.md.";

/** Apakah teks ini memuat nilai warna mentah, di posisi mana pun? */
function warnaMentah(teks) {
  if (HEX_UTUH.test(teks)) return teks.trim();
  const hex = teks.match(HEX_PANJANG);
  if (hex) return hex[0];
  const fn = teks.match(FUNGSI_WARNA);
  if (fn) return `${fn[0]}…)`;
  return null;
}

/** Nama properti sebuah `Property`, apa pun bentuk kuncinya. */
function namaProperti(node) {
  const k = node.key;
  if (!node.computed && k.type === "Identifier") return k.name;
  if (k.type === "Literal" && typeof k.value === "string") return k.value;
  return null;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Warna hanya dari token Ant Design — bukan hex mentah, bukan rgb()/hsl(), " +
        "bukan nama warna CSS di dalam `style`.",
    },
    schema: [],
    messages: { warnaMentah: PESAN },
  },

  create(context) {
    /** Laporkan sekali per simpul, dengan cuplikan nilainya. */
    const lapor = (node, nilai) =>
      context.report({ node, messageId: "warnaMentah", data: { nilai } });

    /** Literal string & potongan template — tempat hex/rgb() bisa mendarat. */
    function periksaTeks(node, teks) {
      const temuan = warnaMentah(teks);
      if (temuan) lapor(node, temuan);
    }

    return {
      Literal(node) {
        if (typeof node.value !== "string") return;
        periksaTeks(node, node.value);
      },

      TemplateElement(node) {
        periksaTeks(node, node.value.raw);
      },

      /*
       * Nama warna CSS (`white`, `gold`, `slategray`) hanya berbahaya di posisi
       * NILAI WARNA — di tempat lain mereka kata biasa. Karena itu bentuk ini
       * diperiksa lewat kunci propertinya, bukan lewat isinya.
       */
      Property(node) {
        const nama = namaProperti(node);
        if (nama === null || !PROP_WARNA.has(nama)) return;
        const v = node.value;
        if (v.type !== "Literal" || typeof v.value !== "string") return;
        for (const kata of v.value.toLowerCase().split(/[\s,()]+/)) {
          if (!kata || KATA_KUNCI_AMAN.has(kata)) continue;
          if (NAMA_WARNA.has(kata)) return lapor(v, kata);
        }
      },
    };
  },
};

export default rule;
