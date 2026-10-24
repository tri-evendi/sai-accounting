/**
 * PENULIS ZIP YANG MENGALIR — satu entri ditulis, lalu dilepas dari memori.
 *
 * ══ KENAPA BUKAN JSZip ═════════════════════════════════════════════════════
 * JSZip (sudah di dependensi, dipakai ekspor tenant TS) menahan SETIAP entri
 * di memori sampai `generate*` dipanggil — untuk paket belasan PDF itu berarti
 * semua PDF hidup bersamaan di heap pelari `interactive`. Di sini setiap entri
 * dikompresi, ditulis ke aliran keluaran, dan buffernya bisa dibuang sebelum
 * entri berikutnya digambar; yang ditahan sampai akhir hanya direktori pusat
 * (nama + 4 angka per entri).
 *
 * Yang ditulis SENGAJA sempit: deflate, UTF-8, tanpa ZIP64 (setiap entri dan
 * arsipnya < 4 GiB — PDF laporan berukuran ratusan KB), tanpa komentar. CRC-32
 * dihitung sendiri: `zlib.crc32` baru ada di Node 22.2 dan pelarinya berjalan
 * di bawah Bun.
 */
import { deflateRawSync } from "node:zlib";
import type { Writable } from "node:stream";

const TABEL_CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i++) c = TABEL_CRC[(c ^ data[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Tanggal & jam DOS dari jam dinding Jakarta (zona tetap +07:00). */
function dosTime(d: Date): { time: number; date: number } {
  const j = new Date(d.getTime() + 7 * 3600 * 1000);
  const year = Math.max(1980, j.getUTCFullYear());
  return {
    time: (j.getUTCHours() << 11) | (j.getUTCMinutes() << 5) | Math.floor(j.getUTCSeconds() / 2),
    date: ((year - 1980) << 9) | ((j.getUTCMonth() + 1) << 5) | j.getUTCDate(),
  };
}

interface EntriPusat {
  name: Buffer;
  crc: number;
  compressed: number;
  size: number;
  offset: number;
  time: number;
  date: number;
}

const BENDERA_UTF8 = 0x0800;
const BATAS_32 = 0xffffffff;

export class ZipStreamWriter {
  private offset = 0;
  private readonly entri: EntriPusat[] = [];
  private selesai = false;

  constructor(
    private readonly out: Writable,
    private readonly now: Date = new Date()
  ) {}

  private tulis(buf: Buffer): Promise<void> {
    this.offset += buf.length;
    return new Promise((resolve, reject) => {
      const lanjut = this.out.write(buf, (err) => (err ? reject(err) : undefined));
      if (lanjut) resolve();
      else this.out.once("drain", () => resolve());
    });
  }

  /** Tambah satu berkas. `name` memakai `/` sebagai pemisah folder. */
  async addFile(name: string, data: Uint8Array): Promise<void> {
    if (this.selesai) throw new Error("ZIP sudah ditutup");
    if (!name || name.startsWith("/") || name.split("/").includes("..")) {
      throw new Error(`nama entri ZIP tidak sah: ${name}`);
    }
    const nama = Buffer.from(name, "utf8");
    const isi = deflateRawSync(data);
    if (data.length >= BATAS_32 || isi.length >= BATAS_32 || this.offset >= BATAS_32) {
      throw new Error("entri ZIP melewati 4 GiB — ZIP64 tidak didukung penulis ini");
    }
    const crc = crc32(data);
    const { time, date } = dosTime(this.now);

    const kepala = Buffer.alloc(30);
    kepala.writeUInt32LE(0x04034b50, 0);
    kepala.writeUInt16LE(20, 4);
    kepala.writeUInt16LE(BENDERA_UTF8, 6);
    kepala.writeUInt16LE(8, 8);
    kepala.writeUInt16LE(time, 10);
    kepala.writeUInt16LE(date, 12);
    kepala.writeUInt32LE(crc, 14);
    kepala.writeUInt32LE(isi.length, 18);
    kepala.writeUInt32LE(data.length, 22);
    kepala.writeUInt16LE(nama.length, 26);
    kepala.writeUInt16LE(0, 28);

    this.entri.push({ name: nama, crc, compressed: isi.length, size: data.length, offset: this.offset, time, date });
    await this.tulis(kepala);
    await this.tulis(nama);
    await this.tulis(isi);
  }

  /** Tulis direktori pusat. Aliran keluarannya ditutup PEMANGGIL (`writeJobResultStream`). */
  async finish(): Promise<void> {
    if (this.selesai) return;
    this.selesai = true;
    const mulai = this.offset;
    for (const e of this.entri) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(20, 4);
      c.writeUInt16LE(20, 6);
      c.writeUInt16LE(BENDERA_UTF8, 8);
      c.writeUInt16LE(8, 10);
      c.writeUInt16LE(e.time, 12);
      c.writeUInt16LE(e.date, 14);
      c.writeUInt32LE(e.crc, 16);
      c.writeUInt32LE(e.compressed, 20);
      c.writeUInt32LE(e.size, 24);
      c.writeUInt16LE(e.name.length, 28);
      c.writeUInt16LE(0, 30);
      c.writeUInt16LE(0, 32);
      c.writeUInt16LE(0, 34);
      c.writeUInt16LE(0, 36);
      c.writeUInt32LE(0, 38);
      c.writeUInt32LE(e.offset, 42);
      await this.tulis(c);
      await this.tulis(e.name);
    }
    const ukuran = this.offset - mulai;
    const akhir = Buffer.alloc(22);
    akhir.writeUInt32LE(0x06054b50, 0);
    akhir.writeUInt16LE(0, 4);
    akhir.writeUInt16LE(0, 6);
    akhir.writeUInt16LE(this.entri.length, 8);
    akhir.writeUInt16LE(this.entri.length, 10);
    akhir.writeUInt32LE(ukuran, 12);
    akhir.writeUInt32LE(mulai, 16);
    akhir.writeUInt16LE(0, 20);
    await this.tulis(akhir);
  }

  /** Nama entri yang sudah ditulis, berurutan. */
  names(): string[] {
    return this.entri.map((e) => e.name.toString("utf8"));
  }
}
