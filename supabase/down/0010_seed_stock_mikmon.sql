-- IMP-16 | rollback 0010_seed_stock_mikmon
-- Retire le stock digital Mikmon du 17/09/2026 (6 batches, 660 tickets hashés).
-- GARDE NATURELLE : si le moindre ticket du stock est SOLD/USED (associé à une
-- commande), la FK tickets.order_id et l'intégrité métier font ÉCHOUER ce
-- rollback — on ne supprime jamais un stock déjà vendu. (Phase 1 : le rollback
-- n'est utilisé que sur bases neuves de CI/test.)
DELETE FROM public.tickets
 WHERE batch_id IN (SELECT id FROM public.ticket_batches WHERE notes LIKE 'mikmon-2026-09-17-B%');

DELETE FROM public.ticket_batches WHERE notes LIKE 'mikmon-2026-09-17-B%';
