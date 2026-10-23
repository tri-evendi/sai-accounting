package ledgerread

import (
	"context"
	"time"
)

// ══ LAPORAN KAS & BANK — PADANAN `cashBankPayload(getCashFlow(...))` ═══════
//
// Laporan Kas & Bank TIDAK punya pembaca sendiri di TS: halaman dan jalur
// berkasnya membentuk muatan dari hasil `getCashFlow` (`src/lib/report-payload.ts`,
// `cashBankPayload`) — satu pembacaan, dua pemakai. Go mengikuti bentuk yang
// sama: angkanya dari `CashFlow` (dibuktikan `bun run parity:cash-flow`), dan
// yang ditambahkan di sini hanya PEMILIHANNYA, dibuktikan
// `bun run parity:cash-bank`:
//
//   - baris = akun kas & bank yang saldo awal ATAU akhirnya bukan nol, urutan
//     kode (`CashFlow.CashAccounts`);
//   - total = saldo kas awal, PERUBAHAN BERSIH ARUS KAS (`netChange` — jumlah
//     kelompok, bukan selisih akhir − awal; keduanya berbeda tepat ketika
//     arus kasnya tidak terekonsiliasi, dan TS mencetak yang pertama), dan
//     saldo kas akhir.

// CashBankRow: satu akun kas & bank.
type CashBankRow struct {
	Code    string `json:"code"`
	Name    string `json:"name"`
	Opening Cents  `json:"opening"`
	Net     Cents  `json:"net"`
	Closing Cents  `json:"closing"`
}

// CashBank: muatan Laporan Kas & Bank satu periode.
type CashBank struct {
	From        time.Time     `json:"from"`
	To          time.Time     `json:"to"`
	Rows        []CashBankRow `json:"rows"`
	OpeningCash Cents         `json:"openingCash"`
	NetChange   Cents         `json:"netChange"`
	ClosingCash Cents         `json:"closingCash"`
}

// CashBankFrom: bentuk Laporan Kas & Bank dari Arus Kas — MURNI.
func CashBankFrom(cf *CashFlow, from, to time.Time) *CashBank {
	cb := &CashBank{
		From: from.UTC(), To: to.UTC(), Rows: make([]CashBankRow, 0, len(cf.CashAccounts)),
		OpeningCash: cf.OpeningCash, NetChange: cf.NetChange, ClosingCash: cf.ClosingCash,
	}
	for _, a := range cf.CashAccounts {
		cb.Rows = append(cb.Rows, CashBankRow{Code: a.Code, Name: a.Name, Opening: a.Opening, Net: a.Net, Closing: a.Closing})
	}
	return cb
}

// CashBank: Laporan Kas & Bank [from, to] (keduanya INKLUSIF) — Arus Kas
// periode yang sama, satu transaksi baca.
func (r *Reader) CashBank(ctx context.Context, from, to time.Time) (*CashBank, error) {
	cf, err := r.CashFlow(ctx, &from, &to)
	if err != nil {
		return nil, err
	}
	return CashBankFrom(cf, from, to), nil
}
