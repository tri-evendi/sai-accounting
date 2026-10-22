-- Mode Akuntan (accountant mode) — a per-user DISPLAY preference (issue #11).
--
-- "Mode Akuntan" toggles whether a user sees the accounting surfaces (Jurnal,
-- Buku Besar, COA) and the debit/kredit terminology on transaction forms. It is
-- display-only: it never changes authorisation (role still gates every
-- accounting page) and it never changes what the posting engine writes.
--
-- NULLable with NO DEFAULT and NO backfill, on purpose:
--   * NULL means "follow the role default" — bos → ON, core/ptg → OFF — which is
--     computed in application code (src/lib/accountant-mode.ts,
--     effectiveAccountantMode). Every existing user therefore keeps their
--     role-appropriate default with no data migration.
--   * An explicit TRUE/FALSE is written only when a user flips the navbar toggle,
--     and from then on that choice overrides the role default. A user who never
--     toggles stays NULL and tracks their role's default even if their role
--     later changes.
-- A DEFAULT would have frozen today's role→default mapping into the column and
-- lost the "unset, follow role" state, so it is deliberately omitted (same
-- posture as rate/base_amount in 0005/0008).

-- AlterTable: display-only accountant-mode preference on users.
ALTER TABLE `users`
    ADD COLUMN `accountant_mode` BOOLEAN NULL;
