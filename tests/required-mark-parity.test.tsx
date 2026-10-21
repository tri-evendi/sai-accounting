/**
 * Tanda wajib harus SAMA di setiap kontrol berlabel.
 *
 * Sapuan visual 21 Okt 2026, layar login konsol operator: "Nama akun *" dan
 * "Kata sandi" tanpa tanda — keduanya `required`. `Input` membaca atribut
 * `required` untuk menggambar `RequiredMark`, `PasswordInput` tidak. Pembaca
 * layar pun hanya mendengar "(wajib)" pada salah satunya.
 */
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Input } from "@sai/ui/input";
import { PasswordInput } from "@sai/ui/password-input";
import { RequiredMark } from "@sai/ui/label";

const mark = renderToStaticMarkup(<RequiredMark />);

describe("tanda wajib: Input dan PasswordInput sepadan", () => {
  it("Input required menggambar RequiredMark (pembanding)", () => {
    expect(renderToStaticMarkup(<Input label="Nama akun" name="u" required />)).toContain(mark);
  });

  it("PasswordInput required menggambar RequiredMark yang sama", () => {
    expect(renderToStaticMarkup(<PasswordInput label="Kata sandi" name="p" required />)).toContain(mark);
  });

  it("PasswordInput tanpa required tidak menggambarnya", () => {
    expect(renderToStaticMarkup(<PasswordInput label="Kata sandi" name="p" />)).not.toContain(mark);
  });
});
