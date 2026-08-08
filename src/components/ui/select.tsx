"use client";

/**
 * Select (issue #50, ditulis ulang di atas AntD pada issue #188).
 *
 * ── Nama ───────────────────────────────────────────────────────────────────
 * Sampai #188 komponen ini benar-benar merender `<select>` native; sejak itu ia
 * `Select` AntD. Namanya sempat bertahan sebagai `NativeSelect` sepanjang fase
 * B–C supaya pemanggil tidak ikut berubah di tengah migrasi, dan janji "native"
 * itu menagih sekali: #259 hidup selama itu karena `focusFormField`
 * mengandaikan `[name=…]` pasti kendali sungguhan. Sejak #264 namanya
 * `SelectField` — pasangan telanjang dari `Select` komposit di bawah, mengikuti
 * `PasswordField`/`PasswordInput`, dan tidak menjanjikan satu pun perilaku
 * native.
 *
 * ── Tiga hal yang `<select>` native berikan gratis, dan cara masing-masing
 *    dipertahankan ──────────────────────────────────────────────────────────
 *
 *  1. **Ikut terkirim saat form disubmit.** `Select` AntD bukan kontrol form: ia
 *     tidak punya `name` dan tidak muncul di `FormData`. Sebelas berkas di repo
 *     ini membaca `new FormData(e.currentTarget)`, dan DUA di antaranya —
 *     `finance/page.tsx` serta `operator/page.tsx` — adalah SERVER COMPONENT
 *     dengan `<form method="get">` tanpa satu baris JavaScript pun. Kalau
 *     nilainya berhenti terkirim, saringan itu diam-diam berhenti menyaring.
 *     Karena itu, saat `name` diberikan, komponen ini ikut merender
 *     `<input type="hidden" name value>`.
 *
 *     Hidden itu dititipkan lewat prop `prefix` AntD (dan `styles.prefix`
 *     `display: none`), BUKAN sebagai elemen bersebelahan lewat Fragment.
 *     Sebabnya: akar komponen ini tetap SATU elemen, sehingga tidak ada
 *     pemanggil yang tata letaknya bisa bergeser karenanya — 39 pemanggil
 *     menaruh isian ini di dalam `grid`, `flex`, dan `space-y-*`, dan primitif
 *     yang diam-diam menambah simpul saudara adalah kelas bug yang hanya
 *     terlihat di layar. `display: none` tidak menghalangi `FormData`, yang
 *     mengecualikan kontrol `disabled` — bukan yang tersembunyi.
 *
 *  2. **`onChange` berbentuk event.** AntD memanggil `onChange(value, option)`,
 *     sedangkan 39 pemanggil menulis `e.target.value`. Event sintetis di bawah
 *     menjembataninya. Ia sengaja MINIMAL (`target`/`currentTarget` berisi
 *     `name` + `value`) — bukan tiruan `Event` lengkap: memalsukan
 *     `preventDefault`/`stopPropagation` hanya akan membuat pemanggil percaya
 *     bahwa memanggilnya berpengaruh. Bentuk ini juga yang dibaca
 *     `react-hook-form` (`getEventValue` melihat `event.target.value`), jadi
 *     `{...field}` tetap bekerja tanpa adaptor.
 *
 *  3. **`required` yang divalidasi peramban.** Ini yang TIDAK bisa
 *     dipertahankan, dan harus dibaca sebagai kehilangan nyata: `<select
 *     required>` kosong membuat peramban menolak submit dan menunjuk isiannya.
 *     `Select` AntD tidak punya kontrol yang bisa divalidasi, dan menaruh
 *     `required` pada hidden di atas justru lebih buruk — kontrol tersembunyi
 *     tidak bisa difokuskan, sehingga peramban memblokir submit TANPA pesan:
 *     tombol Simpan yang tidak melakukan apa-apa. Jadi `required` di sini kini
 *     hanya `aria-required` + tanda `*`.
 *
 *     Penggantinya sudah terpasang (issue #216): ke-15 isian pilihan yang dulu
 *     bersandar pada atribut itu kini hidup di dalam pola `Form`, divalidasi
 *     `zodResolver` dengan skema yang sama seperti route handler-nya — pesannya
 *     inline, di dekat isiannya, dan ikut berpindah bahasa. Isian pilihan wajib
 *     yang BARU karena itu ditulis lewat pola `Form`, bukan lewat prop
 *     `required` di sini: prop itu menggambar tanda dan `aria-required`, tetapi
 *     tidak menahan submit satu pun.
 *
 * ── Pencarian ──────────────────────────────────────────────────────────────
 * `showSearch` menyala sendiri di atas `SEARCH_THRESHOLD` opsi. Daftar pendek
 * (tipe kas, mata uang, status) tidak mendapatnya: memunculkan papan tik ponsel
 * untuk memilih satu dari empat adalah langkah tambahan, bukan bantuan. Daftar
 * panjang (akun, pusat biaya, item) mendapatnya, dan di sanalah AntD benar-benar
 * mengungguli `<select>` native — daftar akun 200 baris tidak bisa dipindai
 * dengan menggulung pemilih sistem.
 */

import { useId, useMemo, useState } from "react";
import { Select as AntdSelect, type SelectProps as AntdSelectProps } from "antd";

import {
  antdSize,
  describedByWith,
  isInvalidField,
  type BareFieldProps,
} from "@/components/ui/input";
import { Label, RequiredMark } from "@/components/ui/label";

/**
 * Di 375px daftar AntD menampilkan ±6 baris sekaligus. Di bawah ambang ini
 * seluruh pilihan masih bisa dilihat dengan satu gulungan pendek; di atasnya
 * tidak, dan mengetik jadi lebih cepat daripada menggulung.
 */
const SEARCH_THRESHOLD = 12;

interface SelectOption {
  value: string;
  label: string;
}

type SelectOwnProps = BareFieldProps & {
  placeholder?: string;
  options: SelectOption[];
  /** Paksa nyala/mati; bawaannya mengikuti `SEARCH_THRESHOLD`. */
  searchable?: boolean;
};

/**
 * `children` ikut dikeluarkan: `<select>` native menerima `<option>` sebagai
 * anak, dan tak satu pun dari 39 pemanggil memakainya (semuanya lewat
 * `options`). Menutupnya di TIPE lebih baik daripada membuangnya diam-diam saat
 * render — `<SelectField><option/></SelectField>` yang tidak muncul di layar
 * dan tidak menghasilkan galat adalah jebakan yang mahal.
 */
type SelectFieldProps = Omit<
  React.ComponentProps<"select">,
  "size" | "multiple" | "ref" | "children"
> &
  SelectOwnProps;

type SelectProps = SelectFieldProps & {
  /** ReactNode agar label boleh membawa `TermTooltip` (issue #6) — lihat `Input`. */
  label?: React.ReactNode;
  error?: string;
};

/**
 * Event `change` sintetis — lihat butir 2 di komentar kepala berkas.
 *
 * `currentTarget` menunjuk objek yang SAMA dengan `target`: pada `<select>`
 * native keduanya memang elemen yang sama, jadi menyalinnya menjaga kedua gaya
 * penulisan pemanggil (`e.target.value` dan `e.currentTarget.value`) tetap
 * benar.
 */
function selectChangeEvent(
  name: string | undefined,
  value: string
): React.ChangeEvent<HTMLSelectElement> {
  const target = { name: name ?? "", value } as unknown as EventTarget &
    HTMLSelectElement;
  return { target, currentTarget: target } as React.ChangeEvent<HTMLSelectElement>;
}

/**
 * Select telanjang — satu akar elemen, tanpa pembungkus label/error. Dipakai di
 * dalam `FormControl` (MASTER.md §Konvensi Form aturan 4).
 */
function SelectField({
  style,
  options,
  placeholder,
  searchable,
  fieldSize,
  invalid,
  value,
  defaultValue,
  onChange,
  onBlur,
  name,
  id,
  disabled,
  required,
  ...props
}: SelectFieldProps) {
  const isInvalid = isInvalidField(invalid, props["aria-invalid"]);
  /*
   * Dibaca dari DUA sumber, persis seperti `invalid` di atas: pemanggil di luar
   * pola `Form` mengoper `required`, sedangkan `FormControl` menyuntikkan
   * `aria-required` (sejak #192). Tanpa baris ini yang kedua justru DITIMPA
   * `undefined` oleh atribut eksplisit di bawah — isian pilihan wajib berhenti
   * mengumumkan dirinya wajib, yaitu tepat kelas kerugian yang dicatat #216.
   */
  const isRequired =
    Boolean(required) ||
    props["aria-required"] === true ||
    props["aria-required"] === "true";

  /**
   * Nilai internal hanya melayani hidden companion. Sumber kebenarannya tetap
   * pemanggil saat `value` diberikan (terkendali); `defaultValue` dipakai hanya
   * sebagai benih untuk pemakaian tak terkendali — mis. saringan `method="get"`
   * yang memang tidak menyimpan state apa pun di React.
   */
  const [uncontrolled, setUncontrolled] = useState(defaultValue);
  const current = value !== undefined ? value : uncontrolled;

  /**
   * `""` diperlakukan sebagai "belum dipilih" KECUALI memang ada opsi bernilai
   * `""` (pola `{ value: "", label: "Semua" }` yang dipakai baris saringan).
   * Tanpa ini, isian kosong akan tampil benar-benar kosong dan placeholder-nya
   * tak pernah muncul — `<select>` native dulu menampilkan `<option>`
   * placeholder-nya sendiri di posisi itu.
   */
  const hasEmptyOption = useMemo(
    () => options.some((opt) => opt.value === ""),
    [options]
  );
  /*
   * Dinormalkan ke string: `<select>` native mengubah `value={5}` menjadi
   * `"5"` sendiri sebelum mencocokkannya ke `<option>`, sedangkan AntD
   * membandingkan nilai apa adanya (`===`) — angka 5 tidak akan pernah cocok
   * dengan opsi `"5"`, dan pemicunya akan menampilkan angka mentah alih-alih
   * labelnya.
   */
  const normalized = current == null ? undefined : String(current);
  const shown = normalized === "" && !hasEmptyOption ? undefined : normalized;

  const showSearch = searchable ?? options.length > SEARCH_THRESHOLD;

  return (
    <AntdSelect<string, SelectOption>
      data-slot="select"
      /*
       * Sisa prop `<select>` diteruskan apa adanya: `aria-*` dipungut rc-select
       * dan dipasang di `<input role="combobox">` di dalamnya (jadi pautan
       * `aria-describedby` dari `FormControl` tetap mendarat di kontrol yang
       * benar), sisanya mendarat di div akar. Cast-nya perlu karena bentuk
       * handler `<select>` dan AntD tidak sama; yang benar-benar dipetakan
       * (`onChange`, `onBlur`) sudah dikeluarkan dari `props` di atas.
       */
      {...(props as AntdSelectProps<string, SelectOption>)}
      id={id}
      // `<select>` lama melebar penuh; AntD tidak melebar sendiri, jadi lebar
      // penuh dipasang di sini dan tetap bisa ditimpa `style` pemanggil.
      style={{ width: "100%", ...style }}
      size={antdSize(fieldSize)}
      status={isInvalid ? "error" : undefined}
      options={options}
      placeholder={placeholder}
      value={shown}
      disabled={disabled}
      onBlur={onBlur as React.FocusEventHandler<HTMLElement> | undefined}
      onChange={(next) => {
        if (value === undefined) setUncontrolled(next);
        onChange?.(selectChangeEvent(name, next ?? ""));
      }}
      showSearch={
        showSearch && {
          // Cocokkan LABEL, bukan value: pengguna mengetik "Kas Kecil", bukan
          // id akunnya. Bentuk objek dipakai karena `filterOption`/`onSearch`
          // di tingkat atas sudah usang di rc-select v6.
          filterOption: (input, option) =>
            (option?.label ?? "").toLowerCase().includes(input.toLowerCase()),
        }
      }
      // Daftar tidak pernah lebih lebar dari pemicunya — syarat "tidak menggeser
      // tata letak di 375px". Popup-nya sendiri diportal ke <body>, jadi ia tak
      // bisa melebarkan halaman.
      popupMatchSelectWidth
      aria-invalid={isInvalid || undefined}
      aria-required={isRequired || undefined}
      prefix={
        name === undefined ? undefined : (
          <input type="hidden" name={name} value={shown ?? ""} readOnly />
        )
      }
      styles={{ prefix: { display: "none" } }}
    />
  );
}

function Select({
  label,
  error,
  id,
  invalid,
  required,
  "aria-describedby": describedBy,
  ...props
}: SelectProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const errorId = `${selectId}-error`;
  const isInvalid = invalid ?? Boolean(error);

  return (
    <div style={{ display: "grid", gap: "var(--ant-margin-xxs)" }}>
      {label && (
        <Label htmlFor={selectId}>
          {label}
          {/* Tanda wajib kini menanggung lebih banyak daripada di `Input`:
              validasi native sudah tidak ada di sini (lihat butir 3 di kepala
              berkas), jadi ini satu-satunya penanda "wajib" sebelum server
              menolak. */}
          {required && <RequiredMark />}
        </Label>
      )}
      <SelectField
        id={selectId}
        invalid={isInvalid}
        required={required}
        aria-describedby={describedByWith(describedBy, error && errorId)}
        {...props}
      />
      {error && (
        <p
          id={errorId}
          role="alert"
          style={{
            fontSize: "var(--ant-font-size)",
            color: "var(--ant-color-money-negative)",
          }}
        >
          {error}
        </p>
      )}
    </div>
  );
}

export { Select, SelectField, SEARCH_THRESHOLD };
export type { SelectProps, SelectFieldProps, SelectOption };
