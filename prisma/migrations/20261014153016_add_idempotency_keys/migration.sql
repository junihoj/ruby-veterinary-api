-- CreateTable
CREATE TABLE "operations"."idempotency_keys" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "user_id" UUID,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_idempotency_created" ON "operations"."idempotency_keys"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_idempotency_scope_key" ON "operations"."idempotency_keys"("scope", "key");
