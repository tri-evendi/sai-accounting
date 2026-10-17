/**
 * MESIN BASIS DATA DIPUTUSKAN DARI URL — dan tidak pernah DITEBAK
 * (rencana migrasi — docs/arsitektur/11-RENCANA-POSTGRESQL.md §10 Fase D)
 *
 * == KENAPA "TIDAK MENEBAK" ADALAH SIFAT, BUKAN KEREWELAN ==================
 * Bawaan yang ramah ("kalau tidak dikenali, anggap mariadb") terasa sopan dan
 * berbahaya: satu salah ketik pada URL PostgreSQL akan membuat aplikasi
 * menyambung ke mesin LAMA tanpa satu pun keluhan. Pada hari penukaran, keadaan
 * "sebagian layanan masih di mesin lama" adalah yang terburuk yang mungkin —
 * data tertulis ke dua tempat sekaligus, dan tidak ada galat yang menunjukkannya.
 */
import { describe, expect, it } from "vitest";
import { dbEngineDariUrl, portBawaan, uraikanUrl } from "@sai/db/engine";

describe("mesin dari skema URL", () => {
  it.each([
    ["mysql://u:p@h:3306/d", "mariadb"],
    ["mariadb://u:p@h:3306/d", "mariadb"],
    ["postgres://u:p@h:5432/d", "postgresql"],
    ["postgresql://u:p@h:5432/d", "postgresql"],
  ])("%s → %s", (url, mesin) => {
    expect(dbEngineDariUrl(url)).toBe(mesin);
  });

  it("skema yang TIDAK dikenali MELEMPAR — tidak jatuh ke mariadb", () => {
    expect(() => dbEngineDariUrl("mysq://u:p@h/d")).toThrow(/tidak dikenali/);
    expect(() => dbEngineDariUrl("sqlite:///x.db")).toThrow(/tidak dikenali/);
    /* Pesannya menyebut yang didukung: orang yang salah ketik butuh tahu daftar
       yang benar, bukan hanya bahwa ia salah. */
    expect(() => dbEngineDariUrl("sqlite:///x.db")).toThrow(/mysql:/);
  });

  it("URL yang tidak sah MELEMPAR dengan pesannya sendiri", () => {
    expect(() => dbEngineDariUrl("bukan url")).toThrow(/tidak sah/);
    expect(() => dbEngineDariUrl("")).toThrow(/tidak sah/);
  });

  it("huruf besar pada skema tetap dikenali", () => {
    expect(dbEngineDariUrl("POSTGRES://u:p@h/d")).toBe("postgresql");
  });
});

describe("port bawaan", () => {
  it("berbeda per mesin, dan dipakai saat URL tak menyebut port", () => {
    expect(portBawaan("mariadb")).toBe(3306);
    expect(portBawaan("postgresql")).toBe(5432);
    expect(uraikanUrl("postgres://u:p@h/d").port).toBe(5432);
    expect(uraikanUrl("mysql://u:p@h/d").port).toBe(3306);
  });

  it("port yang DISEBUT menang atas bawaan", () => {
    expect(uraikanUrl("postgres://u:p@h:6543/d").port).toBe(6543);
  });
});

describe("penguraian URL", () => {
  it("kata sandi di-decode — sandi ber-@ atau ber-/ WAJIB ter-encode di URL", () => {
    /*
     * Sandi yang memuat `@` atau `/` harus ter-encode, dan meneruskannya apa
     * adanya ke driver menghasilkan "access denied" yang penyebabnya tidak
     * terlihat dari pesannya sama sekali. Ini satu-satunya bagian penguraian
     * yang kesalahannya menyamar sebagai masalah kredensial.
     */
    const b = uraikanUrl("postgres://sai:p%40ss%2Fword@h:5432/sai_control");
    expect(b.password).toBe("p@ss/word");
    expect(b.user).toBe("sai");
  });

  it("nama basis data tanpa garis miring di depan", () => {
    expect(uraikanUrl("mysql://u:p@h:3306/sai_production").database).toBe("sai_production");
  });

  it("URL tanpa basis data memulangkan string kosong, bukan '/'", () => {
    /* Penyediaan perusahaan memakai URL tanpa basis data untuk pekerjaan tingkat
       server. `"/"` yang lolos akan menjadi nama basis data yang mustahil. */
    expect(uraikanUrl("mysql://u:p@h:3306/").database).toBe("");
    expect(uraikanUrl("mysql://u:p@h:3306").database).toBe("");
  });

  it("mesinnya ikut terbawa di hasil penguraian", () => {
    expect(uraikanUrl("postgres://u:p@h/d").mesin).toBe("postgresql");
  });
});
