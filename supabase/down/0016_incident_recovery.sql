-- IMP-33 | rollback : la table incidents retrouve son schéma 0006.

DELETE FROM public.state_transitions
 WHERE entity = 'mikrotik_sync' AND to_state = 'PENDING'
   AND from_state IN ('FAILED', 'BLOCKED');

DROP TRIGGER IF EXISTS incidents_state_guard ON public.incidents;
DROP FUNCTION IF EXISTS public.incident_state_guard();
DROP INDEX IF EXISTS public.incidents_detection_key_idx;
DROP INDEX IF EXISTS public.incidents_order_idx;
DROP INDEX IF EXISTS public.incidents_open_state_idx;

ALTER TABLE public.incidents DROP CONSTRAINT incidents_state_check;
ALTER TABLE public.incidents
  ADD CONSTRAINT incidents_state_check
  CHECK (state IN ('OPEN','INVESTIGATING','RESOLVED','CLOSED'));

ALTER TABLE public.incidents
  DROP COLUMN IF EXISTS detection_key,
  DROP COLUMN IF EXISTS order_id,
  DROP COLUMN IF EXISTS payment_id,
  DROP COLUMN IF EXISTS ticket_id,
  DROP COLUMN IF EXISTS connector_id,
  DROP COLUMN IF EXISTS error,
  DROP COLUMN IF EXISTS recommended_action,
  DROP COLUMN IF EXISTS acknowledged_at,
  DROP COLUMN IF EXISTS acknowledged_by,
  DROP COLUMN IF EXISTS last_attempt_at,
  DROP COLUMN IF EXISTS attempts,
  DROP COLUMN IF EXISTS reopened_count,
  DROP COLUMN IF EXISTS close_reason,
  DROP COLUMN IF EXISTS last_retry_key;
