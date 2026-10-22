package ledgerread

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

// TestTrialBalanceAgainstDatabase membaca SATU buku sungguhan bila
// LEDGERREAD_TEST_DATABASE (nama basis data perusahaan) diset, memakai
// template kredensial yang sama dengan aplikasi. Tanpa itu ia DILEWATI dengan
// jelas — gerbang `bun run go:test` tidak boleh bergantung pada basis data.
//
// Ia sengaja tidak MENGISI apa pun: fikstur buku ditulis dari sisi TypeScript
// (pintu posting, I-2), dan pohon Go tidak menulis tabel buku, bahkan dari
// tes. Yang dibuktikan di sini sifat yang berlaku untuk buku MANA PUN:
// kuerinya jalan, transaksinya benar-benar hanya-baca, dan hasilnya patuh
// aturan. Kesetaraan angka dengan TS dibuktikan `bun run parity:trial-balance`.
func TestTrialBalanceAgainstDatabase(t *testing.T) {
	name := os.Getenv("LEDGERREAD_TEST_DATABASE")
	if name == "" {
		t.Skip("LEDGERREAD_TEST_DATABASE tidak diset — uji integrasi dilewati")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	r, err := Open(ctx, name)
	if err != nil {
		t.Fatal(err)
	}
	defer r.Close()

	tb, err := r.TrialBalance(ctx, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	var debit, credit Cents
	for _, row := range tb.Rows {
		if row.Debit != 0 && row.Credit != 0 {
			t.Errorf("akun %s bersaldo di DUA sisi", row.Code)
		}
		if row.Debit < 0 || row.Credit < 0 {
			t.Errorf("akun %s bersaldo negatif", row.Code)
		}
		debit += row.Debit
		credit += row.Credit
	}
	if debit != tb.TotalDebit || credit != tb.TotalCredit {
		t.Errorf("total tidak sama dengan jumlah barisnya")
	}

	// Transaksinya HANYA-BACA menurut PostgreSQL sendiri, bukan hanya menurut
	// penjaga teks.
	err = r.readOnly(ctx, func(tx pgx.Tx) error {
		var ro string
		if err := tx.QueryRow(ctx, "SHOW transaction_read_only").Scan(&ro); err != nil {
			return err
		}
		if ro != "on" {
			t.Errorf("transaction_read_only = %s", ro)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
