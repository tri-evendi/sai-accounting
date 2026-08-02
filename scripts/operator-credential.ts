/**
 * Pembuat kredensial OPERATOR (issue #154).
 *
 *   bun run tsx scripts/operator-credential.ts <nama-akun>
 *
 * Membaca kata sandi dari prompt (tanpa menggemakannya), lalu mencetak:
 *   • satu entri `OPERATOR_USERS` (nama:hash-bcrypt:rahasia-totp-base32),
 *   • URI `otpauth://` untuk dipindai aplikasi authenticator (MFA WAJIB —
 *     entri tanpa rahasia TOTP tidak pernah bisa masuk),
 *   • kode TOTP saat ini, untuk memastikan authenticator terpasang benar.
 *
 * TIDAK menulis apa pun: kredensial operator hidup di environment
 * (docker-compose/.env produksi), tidak pernah di basis data mana pun dan
 * tidak pernah di repositori.
 */

import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline";
import { hash } from "bcrypt";

import { totpAt } from "../src/lib/operator/totp";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function randomBase32Secret(bytes = 20): string {
  const raw = randomBytes(bytes);
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of raw) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const stream = rl as unknown as { _writeToOutput?: (s: string) => void; output: NodeJS.WritableStream };
    process.stdout.write(question);
    stream._writeToOutput = () => {
      /* jangan gemakan kata sandi */
    };
    rl.question("", (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  const name = process.argv[2]?.trim();
  if (!name || !/^[a-z0-9._-]{2,50}$/i.test(name)) {
    console.error(
      "Pakai: bun run tsx scripts/operator-credential.ts <nama-akun>\n" +
        "Nama akun: 2–50 huruf/angka/titik/garis (tanpa ':' atau ',')."
    );
    process.exit(1);
  }

  const password = await askHidden(`Kata sandi untuk operator "${name}": `);
  if (password.length < 12) {
    console.error("✗ Kata sandi operator minimal 12 karakter.");
    process.exit(1);
  }

  const passwordHash = await hash(password, 12);
  if (passwordHash.includes(":") || passwordHash.includes(",")) {
    // Tidak pernah terjadi pada bcrypt, tapi format OPERATOR_USERS bergantung
    // pada ketiadaannya — lebih baik meledak di sini daripada diam di parse.
    console.error("✗ Hash mengandung pemisah — laporkan ini.");
    process.exit(1);
  }
  const totpSecret = randomBase32Secret();

  console.log("\nTambahkan (atau gabungkan dengan koma) ke environment produksi:\n");
  console.log(`  OPERATOR_USERS="${name}:${passwordHash}:${totpSecret}"`);
  console.log("\nPindai/isi di aplikasi authenticator (MFA wajib):\n");
  console.log(
    `  otpauth://totp/SAI%20Operator:${encodeURIComponent(name)}?secret=${totpSecret}` +
      "&issuer=SAI%20Operator&algorithm=SHA1&digits=6&period=30"
  );
  const code = totpAt(totpSecret, Math.floor(Date.now() / 1000));
  console.log(`\nKode TOTP saat ini (untuk mencocokkan authenticator): ${code}`);
}

main().catch((error) => {
  console.error("Gagal membuat kredensial operator:", error);
  process.exit(1);
});
