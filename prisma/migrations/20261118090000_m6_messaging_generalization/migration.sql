-- M6a: generalise messaging from WhatsApp-only to multi-channel chat.
-- Adds web/mobile chat sessions, per-session sequence ordering, provider
-- threads, and the daily AI usage ledger (ADR-0017).

-- DropIndex
DROP INDEX "messaging"."ix_conversations_contact";

-- DropIndex
DROP INDEX "messaging"."ix_conversations_status";

-- AlterTable
ALTER TABLE "messaging"."conversations" ADD COLUMN     "channel" TEXT NOT NULL,
ADD COLUMN     "contact_identity" TEXT NOT NULL,
ALTER COLUMN "wa_phone_number" DROP NOT NULL,
ALTER COLUMN "contact_phone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "messaging"."handover_sessions" ADD COLUMN     "closed_at" TIMESTAMPTZ,
ADD COLUMN     "closed_reason" TEXT,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT 'telegram',
ADD COLUMN     "provider_thread_id" TEXT;

-- AlterTable
ALTER TABLE "messaging"."inbox_messages" ADD COLUMN     "citations" JSONB,
ADD COLUMN     "client_type" TEXT,
ADD COLUMN     "frame_type" TEXT,
ADD COLUMN     "request_id" TEXT,
ADD COLUMN     "seq" BIGINT,
ADD COLUMN     "session_id" UUID,
ALTER COLUMN "provider_message_id" DROP NOT NULL;

-- CreateTable
CREATE TABLE "messaging"."chat_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "token_hash" TEXT NOT NULL,
    "client_type" TEXT NOT NULL,
    "conversation_id" UUID NOT NULL,
    "last_seq" BIGINT NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_activity_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handoff_started_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."provider_threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_thread_id" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provider_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."chat_usage_daily" (
    "day" DATE NOT NULL,
    "requests" INTEGER NOT NULL DEFAULT 0,
    "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
    "completion_tokens" INTEGER NOT NULL DEFAULT 0,
    "cost_usd" DECIMAL(10,6) NOT NULL DEFAULT 0,

    CONSTRAINT "chat_usage_daily_pkey" PRIMARY KEY ("day")
);

-- CreateIndex
CREATE UNIQUE INDEX "ix_chat_sessions_token" ON "messaging"."chat_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "ix_chat_sessions_expiry" ON "messaging"."chat_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_provider_threads_conv_provider" ON "messaging"."provider_threads"("conversation_id", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "uq_provider_threads_provider_id" ON "messaging"."provider_threads"("provider", "provider_thread_id");

-- CreateIndex
CREATE INDEX "ix_conversations_channel" ON "messaging"."conversations"("channel", "status", "last_inbound_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_conversations_channel_identity" ON "messaging"."conversations"("channel", "contact_identity");

-- CreateIndex
CREATE UNIQUE INDEX "uq_inbox_messages_session_seq" ON "messaging"."inbox_messages"("session_id", "seq");

-- AddForeignKey
ALTER TABLE "messaging"."inbox_messages" ADD CONSTRAINT "inbox_messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "messaging"."chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."chat_sessions" ADD CONSTRAINT "chat_sessions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "messaging"."conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."provider_threads" ADD CONSTRAINT "provider_threads_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "messaging"."conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ix_handover_open already exists (created by the initial Foundation
-- migration's raw SQL); nothing to add here.
