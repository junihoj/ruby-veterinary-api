-- Partial indexes not expressible in the Prisma schema (per ruby-veterinary-docs/data-model/*.md)

-- data-model/identity.md — active sessions per user (revoked_at IS NULL)
CREATE INDEX "ix_sessions_user_active" ON "identity"."sessions"("user_id") WHERE "revoked_at" IS NULL;

-- data-model/client-patient-records.md — at most one current primary vet per pet (effective_to IS NULL)
CREATE UNIQUE INDEX "ix_primary_vet_current" ON "clients"."primary_veterinarian_links"("pet_id") WHERE "effective_to" IS NULL;

-- data-model/commerce.md — one open cart per user (status = 'open')
CREATE UNIQUE INDEX "uq_carts_open_user" ON "commerce"."carts"("user_id") WHERE "status" = 'open';

-- data-model/commerce.md — download grants expiry window
CREATE INDEX "ix_product_download_grants_expiry" ON "commerce"."product_download_grants"("expires_at") WHERE "expires_at" IS NOT NULL;

-- data-model/care-messaging.md — open handover queue (requested or claimed only)
CREATE INDEX "ix_handover_open" ON "messaging"."handover_sessions"("status", "requested_at") WHERE "status" IN ('requested', 'claimed');

-- data-model/notifications.md — pending notification backlog
CREATE INDEX "ix_notifications_pending" ON "notifications"."notifications"("status", "created_at") WHERE "status" = 'pending';

-- Append-only guards (ADR-0012; acceptance criteria of pharmacy and operations data models)
CREATE OR REPLACE FUNCTION public.assert_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'append-only table: %.% may not be %', TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prescription_decisions_append_only
  BEFORE UPDATE OR DELETE ON pharmacy.prescription_decisions
  FOR EACH ROW EXECUTE FUNCTION public.assert_append_only();

CREATE TRIGGER trg_rx_audit_log_append_only
  BEFORE UPDATE OR DELETE ON pharmacy.rx_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.assert_append_only();

CREATE TRIGGER trg_audit_log_append_only
  BEFORE UPDATE OR DELETE ON operations.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.assert_append_only();
