// Package backup mencadangkan SETIAP basis data sebagai objeknya sendiri.
//
// Menutup celah on-premise #5 dan §6 rancangan: `pg_dumpall` berarti satu
// tenant tidak bisa dipulihkan tanpa menyentuh tenant lain — padahal "pulihkan
// data kami saja ke keadaan Selasa" adalah permintaan biasa di SaaS berbayar.
package backup

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"fmt"
	"io"

	"golang.org/x/crypto/pbkdf2"
)

// ══ FORMATNYA SENGAJA FORMAT `openssl enc`, BUKAN FORMAT BUATAN SENDIRI ═════
//
// Go punya AES-GCM di pustaka baku, dan GCM lebih baik daripada CBC dalam
// hampir setiap perbandingan teknis. Yang dipilih di sini tetap CBC, dan
// alasannya bukan teknis melainkan operasional:
//
//	Pada hari pemulihan, perkakas yang dibutuhkan harus perkakas yang ADA.
//
// Artefak berformat `openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt`
// dibuka oleh satu perintah yang sudah tertulis di PRODUCTION.md, tersedia di
// setiap mesin Linux, dan tidak menuntut satu baris kode kita. Format buatan
// sendiri menuntut biner Go ini — yaitu biner yang hidup di dalam image yang,
// pada hari itu, mungkin justru tidak bisa ditarik.
//
// Konsekuensi kedua yang sama pentingnya: artefak LAMA dari `scripts/backup.sh`
// dan artefak BARU dari jalur ini dibuka dengan cara yang persis sama. Dua
// format berarti dua prosedur pemulihan, dan yang kedua akan ditemukan orang
// pada saat ia sedang mencari yang pertama.
//
// CBC tidak membawa pemeriksaan keutuhan sendiri. Itu DIJAWAB, bukan
// diabaikan: sidik jari SHA-256 atas CIPHERTEXT ikut dikirim di sebelahnya,
// dan `manifest.json` memuatnya untuk setiap objek. Tanpa itu, cadangan yang
// rusak di tengah jalan baru ketahuan pada hari kita paling tidak ingin
// menemukannya.

const (
	// Kepala berkas `openssl enc -salt`: delapan byte magic + delapan byte garam.
	magicOpenSSL = "Salted__"
	panjangGaram = 8

	// Jumlah iterasi PBKDF2, SAMA dengan `scripts/backup.sh`. Mengubahnya di
	// satu sisi saja membuat artefak yang tidak bisa dibuka oleh prosedur yang
	// tertulis di runbook — dan itu baru terlihat pada percobaan pemulihan.
	iterasiPBKDF2 = 200000
)

// Sandikan menyalin isi dari `sumber` ke `tujuan` dalam format `openssl enc`,
// dan memulangkan sidik jari SHA-256 atas CIPHERTEXT beserta jumlah byte yang
// ditulis.
//
// Sidik jarinya dihitung SAMBIL menulis, bukan dengan membaca ulang berkasnya:
// dump satu tenant bisa berukuran gigabyte, dan membacanya dua kali
// menggandakan IO pada mesin yang sedang melayani produksi.
func Sandikan(tujuan io.Writer, sumber io.Reader, kunci string) (sidik string, ditulis int64, err error) {
	if kunci == "" {
		return "", 0, errors.New(
			"BACKUP_ENCRYPTION_KEY kosong — cadangan TIDAK PERNAH ditulis tanpa sandi: " +
				"isinya seluruh pembukuan setiap customer")
	}

	garam := make([]byte, panjangGaram)
	if _, err := rand.Read(garam); err != nil {
		return "", 0, fmt.Errorf("garam: %w", err)
	}

	// 48 byte = 32 kunci + 16 IV, persis seperti yang diturunkan `openssl enc`.
	turunan := pbkdf2.Key([]byte(kunci), garam, iterasiPBKDF2, 48, sha256.New)
	blok, err := aes.NewCipher(turunan[:32])
	if err != nil {
		return "", 0, fmt.Errorf("aes: %w", err)
	}
	cbc := cipher.NewCBCEncrypter(blok, turunan[32:48])

	h := sha256.New()
	// Setiap byte yang ditulis ke tujuan lewat `w`, jadi sidik jarinya tidak bisa
	// menyimpang dari yang sungguh tersimpan.
	w := io.MultiWriter(tujuan, h)

	n, err := w.Write(append([]byte(magicOpenSSL), garam...))
	if err != nil {
		return "", 0, fmt.Errorf("tulis kepala: %w", err)
	}
	ditulis = int64(n)

	const ukuranPotongan = 64 * 1024 // kelipatan 16, syarat CBC
	masuk := make([]byte, ukuranPotongan)
	keluar := make([]byte, ukuranPotongan)
	var sisa []byte

	for {
		baca, errBaca := io.ReadFull(sumber, masuk)
		if baca > 0 {
			sisa = append(sisa, masuk[:baca]...)
			penuh := len(sisa) - len(sisa)%aes.BlockSize
			if penuh > 0 {
				cbc.CryptBlocks(keluar[:penuh], sisa[:penuh])
				n, errTulis := w.Write(keluar[:penuh])
				ditulis += int64(n)
				if errTulis != nil {
					return "", ditulis, fmt.Errorf("tulis blok: %w", errTulis)
				}
				sisa = append(sisa[:0], sisa[penuh:]...)
			}
		}
		if errBaca == io.EOF || errors.Is(errBaca, io.ErrUnexpectedEOF) {
			break
		}
		if errBaca != nil {
			return "", ditulis, fmt.Errorf("baca sumber: %w", errBaca)
		}
	}

	// Padding PKCS#7, dan SELALU ditulis — termasuk ketika sisanya nol byte.
	// Blok padding penuh pada masukan yang kebetulan kelipatan 16 adalah bagian
	// dari formatnya; menghilangkannya membuat `openssl enc -d` memulangkan
	// "bad decrypt" pada berkas yang justru paling mudah terjadi: yang kosong.
	isi := aes.BlockSize - len(sisa)%aes.BlockSize
	for i := 0; i < isi; i++ {
		sisa = append(sisa, byte(isi))
	}
	cbc.CryptBlocks(keluar[:len(sisa)], sisa)
	n, err = w.Write(keluar[:len(sisa)])
	ditulis += int64(n)
	if err != nil {
		return "", ditulis, fmt.Errorf("tulis padding: %w", err)
	}

	return fmt.Sprintf("%x", h.Sum(nil)), ditulis, nil
}
