package efaktur

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"strings"
)

// SettingsKeyEnv: kunci yang menyegel rahasia pengaturan per PT — SAMA dengan
// `SETTINGS_ENCRYPTION_KEY` sisi Node (`@sai/core/settings-crypto`). Satu
// kunci, dua pembaca: Node menyegel saat pengguna menyimpan, Go membuka saat
// mengirim.
const SettingsKeyEnv = "SETTINGS_ENCRYPTION_KEY"

var kunciHex = regexp.MustCompile(`^[0-9a-fA-F]{64}$`)

// Sealed: rahasia tersegel apa adanya seperti tersimpan (base64, bertiga).
type Sealed struct {
	Ciphertext string
	IV         string
	Tag        string
}

// OpenSecret membuka rahasia yang disegel `sealSecret()` Node: AES-256-GCM,
// IV 12 byte, tag 16 byte disimpan TERPISAH dari sandi-teks (Go menuntutnya
// bersambung: ciphertext‖tag).
//
// Gagal-tertutup seperti sisi Node: kunci hilang/salah bentuk, potongan segel
// tidak lengkap, atau tag yang tidak cocok MELEMPAR — tidak pernah
// memulangkan teks yang "mungkin benar". Galatnya tidak memuat rahasia.
func OpenSecret(keyRaw string, s Sealed) (string, error) {
	keyRaw = strings.TrimSpace(keyRaw)
	if keyRaw == "" {
		return "", errors.New(SettingsKeyEnv + " belum diset di svc-integrator — kredensial PJAP tidak bisa dibuka")
	}
	if !kunciHex.MatchString(keyRaw) {
		return "", errors.New(SettingsKeyEnv + " harus 64 karakter heksadesimal")
	}
	if s.Ciphertext == "" || s.IV == "" || s.Tag == "" {
		return "", errors.New("rahasia tersegel tidak lengkap (ciphertext/iv/tag)")
	}
	key, err := hex.DecodeString(keyRaw)
	if err != nil {
		return "", fmt.Errorf("kunci: %w", err)
	}
	ct, err1 := base64.StdEncoding.DecodeString(s.Ciphertext)
	iv, err2 := base64.StdEncoding.DecodeString(s.IV)
	tag, err3 := base64.StdEncoding.DecodeString(s.Tag)
	if err := errors.Join(err1, err2, err3); err != nil {
		return "", fmt.Errorf("segel bukan base64: %w", err)
	}
	blok, err := aes.NewCipher(key)
	if err != nil {
		return "", fmt.Errorf("kunci AES: %w", err)
	}
	gcm, err := cipher.NewGCMWithNonceSize(blok, len(iv))
	if err != nil {
		return "", fmt.Errorf("GCM: %w", err)
	}
	if len(tag) != gcm.Overhead() {
		return "", errors.New("tag autentikasi berukuran salah")
	}
	plain, err := gcm.Open(nil, iv, append(ct, tag...), nil)
	if err != nil {
		return "", errors.New("rahasia tidak bisa dibuka — kunci berganti atau segel diubah")
	}
	return string(plain), nil
}
