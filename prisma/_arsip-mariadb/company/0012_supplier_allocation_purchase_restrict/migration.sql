-- Tighten the purchase-side FK of `supplier_payment_allocations` to RESTRICT (issue #42).
--
-- WHY (and why only the purchase side):
-- As shipped in 0009 both FKs were CASCADE, on the assumption that an allocation
-- is inert reporting data. Since #23 that is only true for pure-IDR payments. A
-- FOREIGN-currency payment relieves each slice of Hutang Usaha at the DOCUMENT
-- rate of the purchase it settles, so the allocation is part of what that
-- payment's journal is computed from.
--
--   • PAYMENT side stays CASCADE. Deleting a payment reverses ITS OWN journal
--     first (the supplier-transactions DELETE route unposts before it deletes),
--     so the allocations may cascade away behind a journal that is already
--     reversed. Nothing is orphaned, and the delete flow relies on the cascade.
--
--   • PURCHASE side becomes RESTRICT. Deleting a purchase reverses the purchase's
--     own journal but NOT the paying payment's. Cascading the allocation away
--     would leave that payment's journal relieving a hutang slice — at this
--     purchase's document rate — for a purchase that no longer exists: a stale
--     journal, the exact thing #42 forbids. RESTRICT makes the database refuse
--     the delete; the route turns it into a clear 409 telling the user to clear
--     the allocation first (editing the payment, which reposts it flat).
--
-- This mirrors the reason `advance_applications` (0010) uses RESTRICT, one step
-- removed: there each row owns a journal; here each row FEEDS another row's
-- journal. Either way a row must not vanish and leave a journal stranded.
--
-- Data-safe: no column added or dropped, only the ON DELETE action of one
-- constraint changed. The supporting index (`..._purchase_id_idx`) is left in
-- place — it belongs to the table, not the constraint.

ALTER TABLE `supplier_payment_allocations`
    DROP FOREIGN KEY `supplier_payment_allocations_purchase_id_fkey`;

ALTER TABLE `supplier_payment_allocations`
    ADD CONSTRAINT `supplier_payment_allocations_purchase_id_fkey`
    FOREIGN KEY (`purchase_id`) REFERENCES `supplier_transactions`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
