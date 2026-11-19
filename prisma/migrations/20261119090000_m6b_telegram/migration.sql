-- M6b: Telegram handoff. Durable webhook dedupe (Telegram delivers updates
-- at least once). No changes to the message stream.

CREATE TABLE "messaging"."webhook_updates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "provider" TEXT NOT NULL,
    "update_id" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_updates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_webhook_updates_provider_update"
    ON "messaging"."webhook_updates" ("provider", "update_id");

CREATE INDEX "ix_webhook_updates_received"
    ON "messaging"."webhook_updates" ("received_at");
