-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "clients";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "commerce";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "content";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "identity";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "intake";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "messaging";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "notifications";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "operations";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "pharmacy";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "publishing";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "citext";

-- CreateTable
CREATE TABLE "identity"."users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT,
    "phone" TEXT,
    "kind" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'active',
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."user_roles" (
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL,
    "granted_by" UUID,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("user_id","role_id")
);

-- CreateTable
CREATE TABLE "identity"."sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "device_label" TEXT,
    "ip" INET,
    "user_agent" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity"."staff_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "job_title" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "starts_on" DATE,
    "ends_on" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content"."clinics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "postal_code" TEXT,
    "country" TEXT NOT NULL,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "main_phone" TEXT NOT NULL,
    "emergency_phone" TEXT NOT NULL,
    "whatsapp_display" TEXT,
    "timezone" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "clinics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content"."services" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description_md" TEXT,
    "baseline_price" DECIMAL(10,2),
    "currency" CHAR(3),
    "category" TEXT NOT NULL,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "requires_appointment" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content"."staff_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "display_name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "credentials" TEXT[],
    "accreditations" TEXT[],
    "bio_md" TEXT,
    "photo_object_key" TEXT,
    "specialisms" TEXT[],
    "published" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "staff_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content"."business_hours" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "opens_at" TIME(6) NOT NULL,
    "closes_at" TIME(6) NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "business_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content"."holiday_hours" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "clinic_id" UUID NOT NULL,
    "holiday_date" DATE NOT NULL,
    "opens_at" TIME(6),
    "closes_at" TIME(6),
    "closed" BOOLEAN NOT NULL DEFAULT true,
    "label" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holiday_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content"."information_pages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body_md" TEXT NOT NULL,
    "seo_title" TEXT,
    "seo_description" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "information_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content"."downloadable_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "object_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "downloadable_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publishing"."articles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT,
    "body_md" TEXT NOT NULL,
    "cover_object_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "category_id" UUID,
    "author_profile_id" UUID,
    "published_at" TIMESTAMPTZ,
    "seo_metadata_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publishing"."categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publishing"."tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publishing"."article_tags" (
    "article_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "article_tags_pkey" PRIMARY KEY ("article_id","tag_id")
);

-- CreateTable
CREATE TABLE "publishing"."seo_metadata" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "meta_title" TEXT,
    "meta_description" TEXT,
    "canonical_path" TEXT,
    "og_image_object_key" TEXT,
    "no_index" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "seo_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publishing"."media_assets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "object_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "alt_text" TEXT NOT NULL,
    "width_px" INTEGER,
    "height_px" INTEGER,
    "uploaded_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "publishing"."article_relations" (
    "article_id" UUID NOT NULL,
    "related_article_id" UUID NOT NULL,
    "weight" SMALLINT NOT NULL DEFAULT 0,

    CONSTRAINT "article_relations_pkey" PRIMARY KEY ("article_id","related_article_id")
);

-- CreateTable
CREATE TABLE "publishing"."newsletter_subscribers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "email" CITEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "consented_at" TIMESTAMPTZ NOT NULL,
    "confirmed_at" TIMESTAMPTZ,
    "source" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake"."appointment_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "contact_name" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "contact_email" CITEXT NOT NULL,
    "pet_name" TEXT NOT NULL,
    "pet_species" TEXT,
    "reason" TEXT NOT NULL,
    "preferred_window_start" TIMESTAMPTZ,
    "preferred_window_end" TIMESTAMPTZ,
    "urgency" TEXT NOT NULL DEFAULT 'routine',
    "status" TEXT NOT NULL DEFAULT 'received',
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "appointment_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake"."intake_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "contact_name" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "contact_email" CITEXT NOT NULL,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "postal_code" TEXT,
    "country" TEXT,
    "existing_client" BOOLEAN NOT NULL DEFAULT false,
    "preferred_vet_user_id" UUID,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "idempotency_key" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "intake_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake"."history_uploads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "appointment_request_id" UUID,
    "intake_submission_id" UUID,
    "object_key" TEXT NOT NULL,
    "original_filename" TEXT,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "uploaded_by_user_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "history_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake"."form_submission_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "destination" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" SMALLINT NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ,

    CONSTRAINT "form_submission_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients"."clients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "display_name" TEXT NOT NULL,
    "email" CITEXT,
    "phone" TEXT NOT NULL,
    "address_line1" TEXT,
    "address_line2" TEXT,
    "city" TEXT,
    "postal_code" TEXT,
    "country" TEXT,
    "preferred_contact" TEXT NOT NULL DEFAULT 'phone',
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients"."pets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "client_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "breed" TEXT,
    "sex" TEXT,
    "neutered" BOOLEAN,
    "date_of_birth" DATE,
    "weight_kg" DECIMAL(6,2),
    "microchip_id" TEXT,
    "photo_object_key" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "pets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients"."medical_history_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pet_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "uploaded_by_user_id" UUID,
    "visit_date" DATE,
    "summary" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_history_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients"."primary_veterinarian_links" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "pet_id" UUID NOT NULL,
    "veterinarian_user_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "primary_veterinarian_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."product_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "description_md" TEXT,
    "product_type" TEXT NOT NULL,
    "is_virtual" BOOLEAN NOT NULL DEFAULT false,
    "is_downloadable" BOOLEAN NOT NULL DEFAULT false,
    "pricing_mode" TEXT,
    "external_url" TEXT,
    "button_text" TEXT,
    "requires_prescription" BOOLEAN NOT NULL DEFAULT false,
    "requires_pet_claim" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."product_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "compare_at_price" DECIMAL(10,2),
    "currency" CHAR(3) NOT NULL,
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "stock_reserved" INTEGER NOT NULL DEFAULT 0,
    "weight_grams" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."composite_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "composite_product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "min_select" INTEGER NOT NULL DEFAULT 0,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "composite_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."composite_slot_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slot_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "component_variant_id" UUID,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "price_override" DECIMAL(10,2),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "composite_slot_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."grouped_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "grouped_product_id" UUID NOT NULL,
    "member_product_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grouped_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."product_download_files" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "product_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "object_key" TEXT NOT NULL,
    "file_size_bytes" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_download_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."product_download_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_item_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "downloads_used" INTEGER NOT NULL DEFAULT 0,
    "max_downloads" INTEGER,
    "expires_at" TIMESTAMP(3),
    "last_download_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_download_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."catalog_facets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "facet_type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "catalog_facets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."product_facets" (
    "product_id" UUID NOT NULL,
    "facet_id" UUID NOT NULL,

    CONSTRAINT "product_facets_pkey" PRIMARY KEY ("product_id","facet_id")
);

-- CreateTable
CREATE TABLE "commerce"."carts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."cart_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cart_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "quantity" INTEGER NOT NULL,
    "pet_id" UUID,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."cart_item_components" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cart_item_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cart_item_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "client_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'pending_payment',
    "subtotal" DECIMAL(10,2) NOT NULL,
    "tax_total" DECIMAL(10,2) NOT NULL,
    "shipping_total" DECIMAL(10,2) NOT NULL,
    "grand_total" DECIMAL(10,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "fulfilment_method" TEXT NOT NULL,
    "shipping_address_json" JSONB,
    "idempotency_key" TEXT,
    "placed_at" TIMESTAMPTZ NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "line_total" DECIMAL(10,2) NOT NULL,
    "pet_id" UUID,
    "prescription_request_id" UUID,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."order_item_components" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_item_id" UUID NOT NULL,
    "slot_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_item_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."fulfilments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "method" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "carrier" TEXT,
    "tracking_number" TEXT,
    "pickup_code" TEXT,
    "estimated_ready_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fulfilments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "gateway" TEXT NOT NULL,
    "gateway_payment_ref" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "failure_code" TEXT,
    "idempotency_key" TEXT,
    "captured_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commerce"."subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "pet_id" UUID,
    "frequency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "next_order_at" TIMESTAMPTZ NOT NULL,
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacy"."prescription_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "order_id" UUID NOT NULL,
    "order_item_ids" UUID[],
    "user_id" UUID NOT NULL,
    "pet_id" UUID NOT NULL,
    "veterinarian_user_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "owner_note" TEXT,
    "requested_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_at" TIMESTAMPTZ,
    "decided_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacy"."prescription_decisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prescription_request_id" UUID NOT NULL,
    "decision" TEXT NOT NULL,
    "reason_code" TEXT,
    "reason_text" TEXT,
    "decided_by" UUID NOT NULL,
    "decided_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescription_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacy"."rx_audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prescription_request_id" UUID NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "detail_json" JSONB,
    "request_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rx_audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pharmacy"."patient_associations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "prescription_request_id" UUID NOT NULL,
    "pet_id" UUID NOT NULL,
    "veterinarian_user_id" UUID NOT NULL,
    "client_id" UUID,
    "snapshot_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_associations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "wa_phone_number" TEXT NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "contact_name" TEXT,
    "client_id" UUID,
    "user_id" UUID,
    "direction" TEXT NOT NULL DEFAULT 'inbound',
    "status" TEXT NOT NULL DEFAULT 'bot_active',
    "emergency_flag" BOOLEAN NOT NULL DEFAULT false,
    "last_inbound_at" TIMESTAMPTZ NOT NULL,
    "last_outbound_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."inbox_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "provider_message_id" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "sender_type" TEXT NOT NULL,
    "sender_user_id" UUID,
    "body_text" TEXT NOT NULL,
    "media_object_key" TEXT,
    "media_mime" TEXT,
    "status" TEXT NOT NULL DEFAULT 'received',
    "dedupe_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."bot_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "keywords" TEXT[],
    "priority" SMALLINT NOT NULL DEFAULT 0,
    "response_template" TEXT,
    "action" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "bot_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."menu_flows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "definition_json" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "menu_flows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."conversation_menu_state" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "menu_flow_id" UUID NOT NULL,
    "menu_version" INTEGER NOT NULL,
    "current_step" TEXT NOT NULL,
    "answers_json" JSONB NOT NULL,
    "started_at" TIMESTAMPTZ NOT NULL,
    "completed_at" TIMESTAMPTZ,
    "abandoned_at" TIMESTAMPTZ,

    CONSTRAINT "conversation_menu_state_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."handover_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "requested_reason" TEXT NOT NULL,
    "requested_at" TIMESTAMPTZ NOT NULL,
    "claimed_by" UUID,
    "claimed_at" TIMESTAMPTZ,
    "status" TEXT NOT NULL DEFAULT 'requested',
    "resolved_at" TIMESTAMPTZ,
    "appointment_request_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."messaging_business_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "wa_phone_number" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "away_message" TEXT NOT NULL,
    "hours_json" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messaging_business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications"."notifications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body_text" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "recipient_user_id" UUID,
    "recipient_email" CITEXT,
    "recipient_phone" TEXT,
    "source_type" TEXT NOT NULL,
    "source_id" UUID NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "delivered_at" TIMESTAMPTZ,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications"."delivery_channels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "adapter" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "config_json" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications"."delivery_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "notification_id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "provider_ref" TEXT,
    "error_code" TEXT,
    "error_message" TEXT,
    "attempt_number" SMALLINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications"."alert_subscriptions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "staff_user_id" UUID NOT NULL,
    "alert_type" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations"."dashboard_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "staff_user_id" UUID NOT NULL,
    "preferences_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "dashboard_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations"."audit_log" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actor_user_id" UUID NOT NULL,
    "actor_role" TEXT,
    "action" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" UUID NOT NULL,
    "before_json" JSONB,
    "after_json" JSONB,
    "request_id" TEXT,
    "ip_hash" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_users_email" ON "identity"."users"("email");

-- CreateIndex
CREATE INDEX "ix_users_kind_status" ON "identity"."users"("kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_roles_code" ON "identity"."roles"("code");

-- CreateIndex
CREATE INDEX "ix_sessions_expires" ON "identity"."sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_staff_memberships_user" ON "identity"."staff_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_clinics_slug" ON "content"."clinics"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "uq_services_slug" ON "content"."services"("slug");

-- CreateIndex
CREATE INDEX "ix_services_published_category" ON "content"."services"("published", "category", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "uq_staff_profiles_user" ON "content"."staff_profiles"("user_id");

-- CreateIndex
CREATE INDEX "ix_staff_profiles_published" ON "content"."staff_profiles"("published", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "uq_business_hours_day" ON "content"."business_hours"("clinic_id", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "uq_holiday_hours_date" ON "content"."holiday_hours"("clinic_id", "holiday_date");

-- CreateIndex
CREATE UNIQUE INDEX "uq_information_pages_slug" ON "content"."information_pages"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "uq_downloadable_documents_slug" ON "content"."downloadable_documents"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "uq_articles_slug" ON "publishing"."articles"("slug");

-- CreateIndex
CREATE INDEX "ix_articles_status_published" ON "publishing"."articles"("status", "published_at" DESC);

-- CreateIndex
CREATE INDEX "ix_articles_category" ON "publishing"."articles"("category_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_categories_slug" ON "publishing"."categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "uq_tags_slug" ON "publishing"."tags"("slug");

-- CreateIndex
CREATE INDEX "ix_article_tags_tag" ON "publishing"."article_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_media_assets_object_key" ON "publishing"."media_assets"("object_key");

-- CreateIndex
CREATE UNIQUE INDEX "uq_newsletter_subscribers_email" ON "publishing"."newsletter_subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "uq_appointment_requests_idempotency" ON "intake"."appointment_requests"("idempotency_key");

-- CreateIndex
CREATE INDEX "ix_appointment_requests_status_created" ON "intake"."appointment_requests"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_appointment_requests_user" ON "intake"."appointment_requests"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_intake_submissions_idempotency" ON "intake"."intake_submissions"("idempotency_key");

-- CreateIndex
CREATE INDEX "ix_intake_submissions_status_created" ON "intake"."intake_submissions"("status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_history_uploads_appointment" ON "intake"."history_uploads"("appointment_request_id");

-- CreateIndex
CREATE INDEX "ix_history_uploads_intake" ON "intake"."history_uploads"("intake_submission_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_clients_user" ON "clients"."clients"("user_id");

-- CreateIndex
CREATE INDEX "ix_clients_phone" ON "clients"."clients"("phone");

-- CreateIndex
CREATE INDEX "ix_clients_status" ON "clients"."clients"("status");

-- CreateIndex
CREATE INDEX "ix_pets_client" ON "clients"."pets"("client_id", "status");

-- CreateIndex
CREATE INDEX "ix_pets_name" ON "clients"."pets"("name");

-- CreateIndex
CREATE INDEX "ix_medical_history_records_pet" ON "clients"."medical_history_records"("pet_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_product_categories_slug" ON "commerce"."product_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "uq_products_slug" ON "commerce"."products"("slug");

-- CreateIndex
CREATE INDEX "ix_products_catalog" ON "commerce"."products"("published", "category_id", "featured");

-- CreateIndex
CREATE UNIQUE INDEX "uq_product_variants_sku" ON "commerce"."product_variants"("sku");

-- CreateIndex
CREATE INDEX "ix_product_variants_product" ON "commerce"."product_variants"("product_id", "active");

-- CreateIndex
CREATE INDEX "ix_composite_slots_product" ON "commerce"."composite_slots"("composite_product_id", "position");

-- CreateIndex
CREATE INDEX "ix_composite_slot_options_product" ON "commerce"."composite_slot_options"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_composite_slot_options" ON "commerce"."composite_slot_options"("slot_id", "product_id", "component_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_grouped_members" ON "commerce"."grouped_members"("grouped_product_id", "member_product_id");

-- CreateIndex
CREATE INDEX "ix_product_download_files_product" ON "commerce"."product_download_files"("product_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "uq_product_download_grants" ON "commerce"."product_download_grants"("order_item_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_catalog_facets_type_slug" ON "commerce"."catalog_facets"("facet_type", "slug");

-- CreateIndex
CREATE INDEX "ix_cart_items_cart" ON "commerce"."cart_items"("cart_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_cart_items_line" ON "commerce"."cart_items"("cart_id", "variant_id", "pet_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_cart_item_components" ON "commerce"."cart_item_components"("cart_item_id", "slot_id", "product_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_orders_idempotency" ON "commerce"."orders"("idempotency_key");

-- CreateIndex
CREATE INDEX "ix_orders_user_placed" ON "commerce"."orders"("user_id", "placed_at" DESC);

-- CreateIndex
CREATE INDEX "ix_orders_status" ON "commerce"."orders"("status", "placed_at" DESC);

-- CreateIndex
CREATE INDEX "ix_order_items_order" ON "commerce"."order_items"("order_id");

-- CreateIndex
CREATE INDEX "ix_order_item_components_item" ON "commerce"."order_item_components"("order_item_id");

-- CreateIndex
CREATE INDEX "ix_payments_order" ON "commerce"."payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_payments_gateway_ref" ON "commerce"."payments"("gateway", "gateway_payment_ref");

-- CreateIndex
CREATE INDEX "ix_subscriptions_due" ON "commerce"."subscriptions"("status", "next_order_at");

-- CreateIndex
CREATE INDEX "ix_subscriptions_user" ON "commerce"."subscriptions"("user_id");

-- CreateIndex
CREATE INDEX "ix_rx_requests_queue" ON "pharmacy"."prescription_requests"("status", "requested_at");

-- CreateIndex
CREATE INDEX "ix_rx_requests_order" ON "pharmacy"."prescription_requests"("order_id");

-- CreateIndex
CREATE INDEX "ix_rx_requests_pet" ON "pharmacy"."prescription_requests"("pet_id");

-- CreateIndex
CREATE INDEX "ix_rx_decisions_request" ON "pharmacy"."prescription_decisions"("prescription_request_id", "decided_at");

-- CreateIndex
CREATE INDEX "ix_rx_audit_log_request" ON "pharmacy"."rx_audit_log"("prescription_request_id", "created_at");

-- CreateIndex
CREATE INDEX "ix_conversations_contact" ON "messaging"."conversations"("contact_phone", "last_inbound_at" DESC);

-- CreateIndex
CREATE INDEX "ix_conversations_status" ON "messaging"."conversations"("status", "last_inbound_at");

-- CreateIndex
CREATE INDEX "ix_conversations_emergency" ON "messaging"."conversations"("emergency_flag", "status");

-- CreateIndex
CREATE UNIQUE INDEX "uq_inbox_messages_dedupe" ON "messaging"."inbox_messages"("dedupe_key");

-- CreateIndex
CREATE INDEX "ix_inbox_messages_conversation" ON "messaging"."inbox_messages"("conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_messaging_business_profiles_number" ON "messaging"."messaging_business_profiles"("wa_phone_number");

-- CreateIndex
CREATE INDEX "ix_notifications_source" ON "notifications"."notifications"("source_type", "source_id");

-- CreateIndex
CREATE INDEX "ix_notifications_recipient" ON "notifications"."notifications"("recipient_user_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uq_delivery_channels_code" ON "notifications"."delivery_channels"("code");

-- CreateIndex
CREATE INDEX "ix_delivery_attempts_notification" ON "notifications"."delivery_attempts"("notification_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_alert_subs" ON "notifications"."alert_subscriptions"("staff_user_id", "alert_type", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "uq_dashboard_prefs_user" ON "operations"."dashboard_preferences"("staff_user_id");

-- CreateIndex
CREATE INDEX "ix_audit_log_actor_time" ON "operations"."audit_log"("actor_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_audit_log_entity" ON "operations"."audit_log"("entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "ix_audit_log_action" ON "operations"."audit_log"("action", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "identity"."user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "identity"."roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."user_roles" ADD CONSTRAINT "user_roles_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "identity"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity"."staff_memberships" ADD CONSTRAINT "staff_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "identity"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content"."services" ADD CONSTRAINT "services_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "content"."clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content"."business_hours" ADD CONSTRAINT "business_hours_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "content"."clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content"."holiday_hours" ADD CONSTRAINT "holiday_hours_clinic_id_fkey" FOREIGN KEY ("clinic_id") REFERENCES "content"."clinics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishing"."articles" ADD CONSTRAINT "articles_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "publishing"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishing"."articles" ADD CONSTRAINT "articles_seo_metadata_id_fkey" FOREIGN KEY ("seo_metadata_id") REFERENCES "publishing"."seo_metadata"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishing"."article_tags" ADD CONSTRAINT "article_tags_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "publishing"."articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishing"."article_tags" ADD CONSTRAINT "article_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "publishing"."tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishing"."article_relations" ADD CONSTRAINT "article_relations_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "publishing"."articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "publishing"."article_relations" ADD CONSTRAINT "article_relations_related_article_id_fkey" FOREIGN KEY ("related_article_id") REFERENCES "publishing"."articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake"."history_uploads" ADD CONSTRAINT "history_uploads_appointment_request_id_fkey" FOREIGN KEY ("appointment_request_id") REFERENCES "intake"."appointment_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "intake"."history_uploads" ADD CONSTRAINT "history_uploads_intake_submission_id_fkey" FOREIGN KEY ("intake_submission_id") REFERENCES "intake"."intake_submissions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients"."pets" ADD CONSTRAINT "pets_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"."clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients"."medical_history_records" ADD CONSTRAINT "medical_history_records_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "clients"."pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clients"."primary_veterinarian_links" ADD CONSTRAINT "primary_veterinarian_links_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "clients"."pets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "commerce"."product_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."product_variants" ADD CONSTRAINT "product_variants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."composite_slots" ADD CONSTRAINT "composite_slots_composite_product_id_fkey" FOREIGN KEY ("composite_product_id") REFERENCES "commerce"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."composite_slot_options" ADD CONSTRAINT "composite_slot_options_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "commerce"."composite_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."composite_slot_options" ADD CONSTRAINT "composite_slot_options_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."composite_slot_options" ADD CONSTRAINT "composite_slot_options_component_variant_id_fkey" FOREIGN KEY ("component_variant_id") REFERENCES "commerce"."product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."grouped_members" ADD CONSTRAINT "grouped_members_grouped_product_id_fkey" FOREIGN KEY ("grouped_product_id") REFERENCES "commerce"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."grouped_members" ADD CONSTRAINT "grouped_members_member_product_id_fkey" FOREIGN KEY ("member_product_id") REFERENCES "commerce"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."product_download_files" ADD CONSTRAINT "product_download_files_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."product_download_grants" ADD CONSTRAINT "product_download_grants_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "commerce"."order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."product_download_grants" ADD CONSTRAINT "product_download_grants_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."product_facets" ADD CONSTRAINT "product_facets_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."product_facets" ADD CONSTRAINT "product_facets_facet_id_fkey" FOREIGN KEY ("facet_id") REFERENCES "commerce"."catalog_facets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "commerce"."carts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."cart_items" ADD CONSTRAINT "cart_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce"."product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."cart_item_components" ADD CONSTRAINT "cart_item_components_cart_item_id_fkey" FOREIGN KEY ("cart_item_id") REFERENCES "commerce"."cart_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."cart_item_components" ADD CONSTRAINT "cart_item_components_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "commerce"."composite_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."cart_item_components" ADD CONSTRAINT "cart_item_components_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."cart_item_components" ADD CONSTRAINT "cart_item_components_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce"."product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."order_items" ADD CONSTRAINT "order_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce"."product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."order_item_components" ADD CONSTRAINT "order_item_components_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "commerce"."order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."order_item_components" ADD CONSTRAINT "order_item_components_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "commerce"."composite_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."order_item_components" ADD CONSTRAINT "order_item_components_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."order_item_components" ADD CONSTRAINT "order_item_components_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce"."product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."fulfilments" ADD CONSTRAINT "fulfilments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."payments" ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "commerce"."orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."subscriptions" ADD CONSTRAINT "subscriptions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "commerce"."products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commerce"."subscriptions" ADD CONSTRAINT "subscriptions_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "commerce"."product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy"."prescription_decisions" ADD CONSTRAINT "prescription_decisions_prescription_request_id_fkey" FOREIGN KEY ("prescription_request_id") REFERENCES "pharmacy"."prescription_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy"."rx_audit_log" ADD CONSTRAINT "rx_audit_log_prescription_request_id_fkey" FOREIGN KEY ("prescription_request_id") REFERENCES "pharmacy"."prescription_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pharmacy"."patient_associations" ADD CONSTRAINT "patient_associations_prescription_request_id_fkey" FOREIGN KEY ("prescription_request_id") REFERENCES "pharmacy"."prescription_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."inbox_messages" ADD CONSTRAINT "inbox_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "messaging"."conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."conversation_menu_state" ADD CONSTRAINT "conversation_menu_state_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "messaging"."conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."conversation_menu_state" ADD CONSTRAINT "conversation_menu_state_menu_flow_id_fkey" FOREIGN KEY ("menu_flow_id") REFERENCES "messaging"."menu_flows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."handover_sessions" ADD CONSTRAINT "handover_sessions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "messaging"."conversations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications"."delivery_attempts" ADD CONSTRAINT "delivery_attempts_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"."notifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications"."delivery_attempts" ADD CONSTRAINT "delivery_attempts_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "notifications"."delivery_channels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
