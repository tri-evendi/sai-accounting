/**
 * Isi surel AKSES AKUN — undangan dan atur ulang kata sandi — di SATU tempat.
 *
 * Dipakai dua pintu: rute pelanggan (`api/tenant/invitations`,
 * `api/auth/forgot-password`) dan bantuan pengguna konsol operator
 * (kirim ulang undangan, kirim tautan atur ulang). Surel yang dikirim operator
 * HARUS kalimat yang sama persis dengan yang dikirim aplikasi: pelanggan yang
 * menerima surel berbeda dari "biasanya" berhak curiga itu phishing — dan
 * kecurigaan itu benar dalam kasus lain mana pun.
 *
 * MURNI: menghasilkan subjek + badan; pengirimnya (`sendMail`, `sensitive:
 * true`) tetap di pemanggil.
 */

export interface MailContent {
  subject: string;
  text: string;
}

export function invitationMail(input: {
  companyName: string;
  inviterName: string;
  link: string;
}): MailContent {
  return {
    subject: `Undangan bergabung ke ${input.companyName} — SAI Accounting`,
    text:
      `Halo,\n\n` +
      `${input.inviterName} mengundang Anda bergabung ke ${input.companyName} di SAI Accounting.\n` +
      "Buka tautan berikut untuk MENENTUKAN KATA SANDI ANDA SENDIRI — tidak ada\n" +
      "kata sandi sementara, tidak ada yang perlu dikirim lewat pesan:\n\n" +
      `  ${input.link}\n\n` +
      "Tautan berlaku 7 hari dan hanya bisa dipakai sekali.\n" +
      "Tidak merasa diundang? Abaikan surel ini.\n\n" +
      "— SAI Accounting",
  };
}

export function passwordResetMail(input: { name: string | null; link: string }): MailContent {
  return {
    subject: "Atur ulang kata sandi — SAI Accounting",
    text:
      `Halo ${input.name ?? ""},\n\n` +
      "Seseorang (semoga Anda) meminta pengaturan ulang kata sandi untuk akun ini.\n" +
      "Buka tautan berikut untuk membuat kata sandi baru — berlaku 60 menit,\n" +
      "sekali pakai:\n\n" +
      `  ${input.link}\n\n` +
      "Bukan Anda yang meminta? Abaikan surel ini; kata sandi Anda tidak berubah.\n\n" +
      "— SAI Accounting",
  };
}
