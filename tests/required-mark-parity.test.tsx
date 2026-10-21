/** `PasswordInput` menggambar tanda wajib yang sama dengan `Input` saat `required`. */
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
