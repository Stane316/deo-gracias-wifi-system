ALTER TABLE public.ticket_batches DROP CONSTRAINT IF EXISTS ticket_batches_destination_check;
ALTER TABLE public.ticket_batches DROP COLUMN IF EXISTS idempotency_key;
ALTER TABLE public.ticket_batches DROP COLUMN IF EXISTS destination;
