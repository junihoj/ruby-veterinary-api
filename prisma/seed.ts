import 'dotenv/config';
import { CreateBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { PrismaClient } from '../src/generated/prisma/client';
import {
  CATALOG_MANAGER_EMAIL,
  CATALOG_MANAGER_PASSWORD,
  VETERINARIAN_EMAIL,
  VETERINARIAN_PASSWORD,
} from './seed-credentials';

/**
 * Seed for baseline reference data (§12 M1). Idempotent — safe to re-run.
 *
 * Seeds:
 *  - identity.roles          additive role catalogue (ADR-0002)
 *  - identity.users          the catalog manager (practice_manager, M3a)
 *  - content.clinics         the single-clinic profile row
 *  - content.business_hours  weekly opening hours (0=Sun … 6=Sat)
 *  - content.services        published service catalog (M2)
 *  - content.staff_profiles  published staff grid (M2)
 *  - content.downloadable_documents  care documents (M2)
 *  - notifications.delivery_channels  email | whatsapp_template | in_app_dashboard
 *  - commerce.catalog_facets pet_type / life_stage / health_condition facets
 *  - commerce.product_categories + products of every shape + variants,
 *    grouped members, composite slots, facet links (M3a storefront)
 *  - commerce.product_download_files + SeaweedFS objects for downloadable
 *    products (M3b; skipped with a warning when S3_* is unconfigured)
 *
 * Re-seeding re-baselines variant stock so e2e runs are deterministic.
 * Composite slots are upserted by name (never delete-recreated): M3b cart
 * and order component rows FK to slot ids, so those ids must stay stable.
 *
 * Run with: pnpm db:seed
 */

const ROLE_SEED = [
  { code: 'client', name: 'Client' },
  { code: 'receptionist', name: 'Receptionist' },
  { code: 'veterinarian', name: 'Veterinarian' },
  { code: 'vet_technician', name: 'Veterinary Technician' },
  { code: 'practice_manager', name: 'Practice Manager' },
];

const DELIVERY_CHANNEL_SEED = [
  { code: 'email', adapter: 'email' },
  { code: 'whatsapp_template', adapter: 'whatsapp' },
  { code: 'in_app_dashboard', adapter: 'in_app' },
];

const PET_TYPES = [
  { value: 'dog', slug: 'dog', sortOrder: 0 },
  { value: 'cat', slug: 'cat', sortOrder: 1 },
  { value: 'rabbit', slug: 'rabbit', sortOrder: 2 },
  { value: 'bird', slug: 'bird', sortOrder: 3 },
  { value: 'other', slug: 'other', sortOrder: 4 },
];

const LIFE_STAGES = [
  { value: 'puppy_kitten', slug: 'puppy-kitten', sortOrder: 0 },
  { value: 'adult', slug: 'adult', sortOrder: 1 },
  { value: 'senior', slug: 'senior', sortOrder: 2 },
];

const HEALTH_CONDITIONS = [
  { value: 'joint_support', slug: 'joint-support', sortOrder: 0 },
  { value: 'digestive_health', slug: 'digestive-health', sortOrder: 1 },
  { value: 'skin_coat', slug: 'skin-coat', sortOrder: 2 },
  { value: 'weight_management', slug: 'weight-management', sortOrder: 3 },
];

/** hh:mm → a Date suitable for a @db.Time(6) column (time-of-day only). */
function time(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(0);
  d.setUTCHours(h, m, 0, 0);
  return d;
}

async function main(): Promise<void> {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  try {
    // --- identity.roles ---
    for (const role of ROLE_SEED) {
      await prisma.role.upsert({
        where: { code: role.code },
        update: { name: role.name },
        create: role,
      });
    }
    console.log(`roles: upserted ${ROLE_SEED.length}`);

    // --- content.clinics (single row) ---
    const clinic = await prisma.clinic.upsert({
      where: { slug: 'ruby-veterinary' },
      update: {},
      create: {
        name: 'Ruby Veterinary Clinic',
        slug: 'ruby-veterinary',
        addressLine1: '1 Ruby Lane',
        city: 'London',
        country: 'GB',
        mainPhone: '+442071234567',
        emergencyPhone: '+442071234568',
        timezone: 'Europe/London',
      },
    });
    console.log(`clinics: ensured "${clinic.slug}"`);

    // --- content.business_hours (Mon–Fri 09:00–18:00, Sat 09:00–13:00, Sun closed) ---
    const hours = [
      { weekday: 1, opensAt: '09:00', closesAt: '18:00', closed: false },
      { weekday: 2, opensAt: '09:00', closesAt: '18:00', closed: false },
      { weekday: 3, opensAt: '09:00', closesAt: '18:00', closed: false },
      { weekday: 4, opensAt: '09:00', closesAt: '18:00', closed: false },
      { weekday: 5, opensAt: '09:00', closesAt: '18:00', closed: false },
      { weekday: 6, opensAt: '09:00', closesAt: '13:00', closed: false },
      { weekday: 0, opensAt: '00:00', closesAt: '00:00', closed: true },
    ];
    for (const h of hours) {
      await prisma.businessHour.upsert({
        where: { clinicId_weekday: { clinicId: clinic.id, weekday: h.weekday } },
        update: { opensAt: time(h.opensAt), closesAt: time(h.closesAt), closed: h.closed },
        create: {
          clinicId: clinic.id,
          weekday: h.weekday,
          opensAt: time(h.opensAt),
          closesAt: time(h.closesAt),
          closed: h.closed,
        },
      });
    }
    console.log(`business_hours: upserted ${hours.length}`);

    // --- content.services (published catalog for M2 public reads) ---
    const serviceSeeds = [
      {
        name: 'Consultation',
        slug: 'consultation',
        summary: 'Standard veterinary consultation for your pet.',
        descriptionMd: 'A full health assessment with one of our veterinarians.',
        baselinePrice: 45.0,
        currency: 'GBP',
        category: 'consultation',
        featured: true,
        requiresAppointment: true,
        published: true,
        sortOrder: 0,
      },
      {
        name: 'Vaccination',
        slug: 'vaccination',
        summary: 'Core vaccinations for dogs, cats, and rabbits.',
        descriptionMd: 'Routine vaccination with health check.',
        baselinePrice: 35.0,
        currency: 'GBP',
        category: 'vaccination',
        featured: false,
        requiresAppointment: true,
        published: true,
        sortOrder: 1,
      },
      {
        name: 'Dental Cleaning',
        slug: 'dental-cleaning',
        summary: 'Scale and polish under anaesthetic.',
        descriptionMd: 'Full dental procedure with pre-anaesthetic bloods.',
        baselinePrice: 180.0,
        currency: 'GBP',
        category: 'dentistry',
        featured: false,
        requiresAppointment: true,
        published: true,
        sortOrder: 2,
      },
    ];
    for (const svc of serviceSeeds) {
      await prisma.service.upsert({
        where: { slug: svc.slug },
        update: {
          name: svc.name,
          summary: svc.summary,
          descriptionMd: svc.descriptionMd,
          baselinePrice: svc.baselinePrice,
          currency: svc.currency,
          category: svc.category,
          featured: svc.featured,
          requiresAppointment: svc.requiresAppointment,
          published: svc.published,
          sortOrder: svc.sortOrder,
        },
        create: { clinicId: clinic.id, ...svc },
      });
    }
    console.log(`services: upserted ${serviceSeeds.length}`);

    // --- content.staff_profiles (published grid for M2) ---
    // Staff profiles link to identity users; create the users first.
    const staffUsers = [
      {
        email: 'ada@ruby-veterinary.example.com',
        displayName: 'Dr. Ada Lovelace',
        kind: 'staff' as const,
        roles: ['veterinarian'],
      },
      {
        email: 'james@ruby-veterinary.example.com',
        displayName: 'James Turing',
        kind: 'staff' as const,
        roles: ['vet_technician'],
      },
    ];
    for (const su of staffUsers) {
      await prisma.user.upsert({
        where: { email: su.email },
        update: { kind: 'staff', status: 'active' },
        create: {
          email: su.email,
          passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$seed$seed',
          displayName: su.displayName,
          kind: 'staff',
          status: 'active',
          roles: {
            create: su.roles.map((code) => ({
              role: { connect: { code } },
              grantedAt: new Date(),
            })),
          },
        },
      });
    }

    const staffSeeds = [
      {
        email: 'ada@ruby-veterinary.example.com',
        displayName: 'Dr. Ada Lovelace',
        title: 'Veterinarian',
        credentials: ['BVetMed'],
        accreditations: ['RCVS'],
        bioMd: 'Ada has a special interest in feline medicine.',
        photoObjectKey: null,
        specialisms: ['feline', 'internal-medicine'],
        published: true,
        sortOrder: 0,
      },
      {
        email: 'james@ruby-veterinary.example.com',
        displayName: 'James Turing',
        title: 'Veterinary Nurse',
        credentials: ['RVN'],
        accreditations: [],
        bioMd: 'James leads our nurse clinics.',
        photoObjectKey: null,
        specialisms: ['nutrition', 'weight-management'],
        published: true,
        sortOrder: 1,
      },
    ];
    for (const staff of staffSeeds) {
      const user = await prisma.user.findUnique({
        where: { email: staff.email },
      });
      if (!user) continue;
      const { email: _email, ...profile } = staff;
      await prisma.staffProfile.upsert({
        where: { userId: user.id },
        update: profile,
        create: { ...profile, userId: user.id },
      });
    }
    console.log(`staff_profiles: upserted ${staffSeeds.length}`);

    // --- content.downloadable_documents (care documents for M2) ---
    const documentSeeds = [
      {
        title: 'Post-Operation Care Sheet',
        slug: 'post-op-care',
        description: 'What to expect after your pet\'s surgery.',
        objectKey: 'documents/post-op-care.pdf',
        mimeType: 'application/pdf',
        byteSize: 24576,
        published: true,
      },
      {
        title: 'Boarding Waiver',
        slug: 'boarding-waiver',
        description: 'Required waiver for overnight stays.',
        objectKey: 'documents/boarding-waiver.pdf',
        mimeType: 'application/pdf',
        byteSize: 12288,
        published: true,
      },
    ];
    for (const doc of documentSeeds) {
      await prisma.downloadableDocument.upsert({
        where: { slug: doc.slug },
        update: {
          title: doc.title,
          description: doc.description,
          objectKey: doc.objectKey,
          mimeType: doc.mimeType,
          byteSize: doc.byteSize,
          published: doc.published,
        },
        create: doc,
      });
    }
    console.log(`downloadable_documents: upserted ${documentSeeds.length}`);

    // --- notifications.delivery_channels ---
    for (const channel of DELIVERY_CHANNEL_SEED) {
      await prisma.deliveryChannel.upsert({
        where: { code: channel.code },
        update: { adapter: channel.adapter },
        create: channel,
      });
    }
    console.log(`delivery_channels: upserted ${DELIVERY_CHANNEL_SEED.length}`);

    // --- commerce.catalog_facets ---
    const facetSeeds = [
      ...PET_TYPES.map((f) => ({ facetType: 'pet_type', ...f })),
      ...LIFE_STAGES.map((f) => ({ facetType: 'life_stage', ...f })),
      ...HEALTH_CONDITIONS.map((f) => ({ facetType: 'health_condition', ...f })),
    ];
    for (const facet of facetSeeds) {
      await prisma.catalogFacet.upsert({
        where: { facetType_slug: { facetType: facet.facetType, slug: facet.slug } },
        update: { value: facet.value, sortOrder: facet.sortOrder },
        create: facet,
      });
    }
    console.log(`catalog_facets: upserted ${facetSeeds.length}`);

    // --- commerce.product_categories (storefront filters) ---
    const categorySeeds = [
      {
        name: 'Parasite Control',
        slug: 'parasite-control',
        description: 'Spot-ons, collars and sprays.',
        sortOrder: 10,
      },
      {
        name: 'Joint Care',
        slug: 'joint-care',
        description: 'Mobility support for dogs and cats.',
        sortOrder: 20,
      },
      {
        name: 'Pharmacy',
        slug: 'pharmacy',
        description: 'Prescription and partner-delivered items.',
        sortOrder: 30,
      },
      {
        name: 'Telehealth & Guides',
        slug: 'services-and-guides',
        description: 'Virtual consults and downloadable care guides.',
        sortOrder: 40,
      },
      {
        name: 'Bundles',
        slug: 'bundles',
        description: 'Grouped and configurable bundles.',
        sortOrder: 50,
      },
    ];
    for (const cat of categorySeeds) {
      await prisma.productCategory.upsert({
        where: { slug: cat.slug },
        update: {
          name: cat.name,
          description: cat.description,
          sortOrder: cat.sortOrder,
        },
        create: cat,
      });
    }
    console.log(`product_categories: upserted ${categorySeeds.length}`);

    // --- identity: catalog manager for admin flows (M3a) ---
    // The only seeded account with a real password: practice_manager holds
    // catalog:write, and the admin e2e logs in here. The password is hashed
    // at seed runtime and shared with the e2e suite via seed-credentials.ts.
    // Other seeded staff keep their placeholder hashes untouched.
    await prisma.user.upsert({
      where: { email: CATALOG_MANAGER_EMAIL },
      update: { kind: 'staff', status: 'active' },
      create: {
        email: CATALOG_MANAGER_EMAIL,
        passwordHash: await argon2.hash(CATALOG_MANAGER_PASSWORD),
        displayName: 'Grace Okonjo',
        kind: 'staff',
        status: 'active',
        roles: {
          create: [
            {
              role: { connect: { code: 'practice_manager' } },
              grantedAt: new Date(),
            },
          ],
        },
      },
    });
    console.log('users: ensured catalog manager (practice_manager)');

    // --- identity: veterinarian with a real password (M5 pharmacy) ---
    // The pharmacy e2e logs in here: a veterinarian holds rx:review AND is
    // the only role allowed to decide (PRESCRIBER_REQUIRED gate). Hashed at
    // seed runtime like the catalog manager; the update branch rewrites the
    // hash too, so previously seeded databases gain a working password.
    const veterinarianHash = await argon2.hash(VETERINARIAN_PASSWORD);
    await prisma.user.upsert({
      where: { email: VETERINARIAN_EMAIL },
      update: {
        kind: 'staff',
        status: 'active',
        passwordHash: veterinarianHash,
      },
      create: {
        email: VETERINARIAN_EMAIL,
        passwordHash: veterinarianHash,
        displayName: 'Dr. Ada Lovelace',
        kind: 'staff',
        status: 'active',
        roles: {
          create: [
            {
              role: { connect: { code: 'veterinarian' } },
              grantedAt: new Date(),
            },
          ],
        },
      },
    });
    console.log('users: ensured veterinarian (Dr. Ada)');

    // --- commerce.products: one product of every shape (M3a storefront) ---
    // Shapes covered: simple, variable, grouped, external, composite, plus
    // is_virtual and is_downloadable flags; an Rx simple covers the 422 path.
    interface SeedVariant {
      name: string;
      sku: string;
      price: number;
      stock: number;
      isDefault?: boolean;
      weightGrams?: number | null;
    }
    interface SeedSlotOption {
      productSlug: string;
      componentVariantSku?: string;
      quantity: number;
      priceOverride?: number;
      sortOrder: number;
    }
    interface SeedSlot {
      name: string;
      description?: string;
      position: number;
      minSelect: number;
      maxSelect: number;
      options: SeedSlotOption[];
    }
    interface SeedProduct {
      slug: string;
      categorySlug: string;
      name: string;
      summary: string;
      productType: string;
      descriptionMd?: string;
      featured?: boolean;
      isVirtual?: boolean;
      isDownloadable?: boolean;
      requiresPrescription?: boolean;
      pricingMode?: string;
      externalUrl?: string;
      buttonText?: string;
      variants: SeedVariant[];
      members?: Array<{ slug: string; sortOrder: number }>;
      slots?: SeedSlot[];
      facets?: Array<{ facetType: string; slug: string }>;
    }

    const productSeeds: SeedProduct[] = [
      {
        slug: 'flea-tick-spot-on',
        categorySlug: 'parasite-control',
        name: 'Flea & Tick Spot-On',
        summary: 'Monthly spot-on protection against fleas and ticks.',
        descriptionMd: 'One pipette, once a month. Waterproof after 24h.',
        productType: 'simple',
        featured: true,
        variants: [
          {
            name: 'Single pipette',
            sku: 'SKU-FLS-001',
            price: 12.5,
            stock: 40,
            isDefault: true,
            weightGrams: 40,
          },
        ],
        facets: [{ facetType: 'pet_type', slug: 'dog' }],
      },
      {
        slug: 'joint-care-chews',
        categorySlug: 'joint-care',
        name: 'Joint Care Chews',
        summary: 'Glucosamine soft chews for everyday mobility support.',
        descriptionMd: 'Daily soft chew with glucosamine and green-lipped mussel.',
        productType: 'variable',
        variants: [
          {
            name: 'Small dog (up to 15 kg)',
            sku: 'SKU-JCC-S',
            price: 15.0,
            stock: 25,
            isDefault: true,
            weightGrams: 180,
          },
          {
            name: 'Large dog (over 15 kg)',
            sku: 'SKU-JCC-L',
            price: 24.0,
            stock: 15,
            weightGrams: 420,
          },
        ],
        facets: [
          { facetType: 'pet_type', slug: 'dog' },
          { facetType: 'health_condition', slug: 'joint-support' },
        ],
      },
      {
        slug: 'antibiotic-oral-suspension',
        categorySlug: 'pharmacy',
        name: 'Antibiotic Oral Suspension',
        summary: 'Prescription-only antibiotic suspension for dogs and cats.',
        descriptionMd: 'Dispensed after veterinary authorisation (Rx hold).',
        productType: 'simple',
        requiresPrescription: true,
        variants: [
          {
            name: '100 ml bottle',
            sku: 'SKU-ABX-100',
            price: 18.0,
            stock: 20,
            isDefault: true,
            weightGrams: 160,
          },
        ],
        facets: [
          { facetType: 'pet_type', slug: 'dog' },
          { facetType: 'pet_type', slug: 'cat' },
        ],
      },
      {
        slug: 'telehealth-triage',
        categorySlug: 'services-and-guides',
        name: 'Telehealth Triage Add-On',
        summary: 'Virtual nurse triage before your appointment.',
        productType: 'simple',
        isVirtual: true,
        variants: [
          {
            name: '30-minute video consult',
            sku: 'SKU-TELE-30',
            price: 25.0,
            stock: 100,
            isDefault: true,
            weightGrams: null,
          },
        ],
      },
      {
        slug: 'puppy-training-guide',
        categorySlug: 'services-and-guides',
        name: 'Puppy Training Guide',
        summary: 'Downloadable 30-page guide to the first weeks at home.',
        productType: 'simple',
        isVirtual: true,
        isDownloadable: true,
        variants: [
          {
            name: 'PDF download',
            sku: 'SKU-GUIDE-PUP',
            price: 6.0,
            stock: 999,
            isDefault: true,
            weightGrams: null,
          },
        ],
        facets: [{ facetType: 'life_stage', slug: 'puppy-kitten' }],
      },
      {
        slug: 'daily-wellness-chews',
        categorySlug: 'joint-care',
        name: 'Daily Wellness Chews',
        summary: 'Everyday multivitamin soft chew for dogs.',
        descriptionMd: 'One chew a day; the wellness box favourite.',
        productType: 'simple',
        variants: [
          {
            name: '30 chews',
            sku: 'SKU-WCH-100',
            price: 9.0,
            stock: 300,
            isDefault: true,
            weightGrams: 240,
          },
        ],
        facets: [{ facetType: 'pet_type', slug: 'dog' }],
      },
      {
        slug: 'care-video-pack',
        categorySlug: 'services-and-guides',
        name: 'Pet Care Video Pack',
        summary: 'Downloadable video series: handling, grooming, and first aid.',
        descriptionMd: 'Streamable now, downloadable after purchase.',
        productType: 'simple',
        isVirtual: true,
        isDownloadable: true,
        variants: [
          {
            name: 'Video pack',
            sku: 'SKU-VID-001',
            price: 5.0,
            stock: 500,
            isDefault: true,
            weightGrams: null,
          },
        ],
      },
      {
        slug: 'partner-diet-delivery',
        categorySlug: 'pharmacy',
        name: 'Renal Diet Delivery (Partner)',
        summary: 'Therapeutic diet fulfilled by our partner — leaves this site.',
        productType: 'external',
        externalUrl: 'https://partner.example.com/renal-diet',
        buttonText: 'Order from partner',
        variants: [],
      },
      {
        slug: 'puppy-starter-bundle',
        categorySlug: 'bundles',
        name: 'Puppy Starter Bundle',
        summary: 'Spot-on cover and the training guide, listed together.',
        descriptionMd: 'Members are added to the cart as normal lines.',
        productType: 'grouped',
        variants: [],
        members: [
          { slug: 'flea-tick-spot-on', sortOrder: 10 },
          { slug: 'puppy-training-guide', sortOrder: 20 },
        ],
      },
      {
        slug: 'wellness-box',
        categorySlug: 'bundles',
        name: 'Monthly Wellness Box',
        summary: 'Configurable box — pick a chew and an optional guide.',
        descriptionMd:
          'Fixed-price composite: the default variant carries the £27 box price; stock lives on the components.',
        productType: 'composite',
        pricingMode: 'fixed',
        variants: [
          {
            // Price carrier only — components hold the stock (M3b).
            name: 'Monthly box',
            sku: 'SKU-WELL-BOX',
            price: 27.0,
            stock: 0,
            isDefault: true,
            weightGrams: null,
          },
        ],
        slots: [
          {
            name: 'Choose your chew',
            description: 'One chew type per box.',
            position: 10,
            minSelect: 1,
            maxSelect: 1,
            options: [
              {
                productSlug: 'daily-wellness-chews',
                componentVariantSku: 'SKU-WCH-100',
                quantity: 1,
                sortOrder: 10,
              },
            ],
          },
          {
            name: 'Add a care guide',
            description: 'Optional downloadable guide.',
            position: 20,
            minSelect: 0,
            maxSelect: 1,
            options: [
              {
                productSlug: 'puppy-training-guide',
                quantity: 1,
                priceOverride: 3.0,
                sortOrder: 10,
              },
            ],
          },
        ],
      },
      {
        slug: 'pet-care-kit',
        categorySlug: 'bundles',
        name: 'Pet Care Kit',
        summary: 'Sum-priced kit — pay only for the options you pick.',
        descriptionMd:
          'Composite product priced as the total of its selected components.',
        productType: 'composite',
        pricingMode: 'sum',
        variants: [],
        slots: [
          {
            name: 'Build your kit',
            description: 'Pick up to three items.',
            position: 10,
            minSelect: 1,
            maxSelect: 3,
            options: [
              {
                productSlug: 'puppy-training-guide',
                quantity: 1,
                priceOverride: 3.0,
                sortOrder: 10,
              },
              {
                productSlug: 'care-video-pack',
                quantity: 1,
                sortOrder: 20,
              },
              {
                // Rx option: selecting it trips the derived-prescription
                // 422 at add-to-cart (commerce.md derived flags).
                productSlug: 'antibiotic-oral-suspension',
                componentVariantSku: 'SKU-ABX-100',
                quantity: 1,
                sortOrder: 30,
              },
            ],
          },
        ],
      },
    ];

    for (const p of productSeeds) {
      const category = await prisma.productCategory.findUnique({
        where: { slug: p.categorySlug },
      });
      if (!category) {
        throw new Error(`seed: missing category "${p.categorySlug}"`);
      }

      const productFields = {
        name: p.name,
        summary: p.summary,
        descriptionMd: p.descriptionMd ?? null,
        productType: p.productType,
        isVirtual: p.isVirtual ?? false,
        isDownloadable: p.isDownloadable ?? false,
        pricingMode: p.pricingMode ?? null,
        externalUrl: p.externalUrl ?? null,
        buttonText: p.buttonText ?? null,
        requiresPrescription: p.requiresPrescription ?? false,
        published: true,
        featured: p.featured ?? false,
        categoryId: category.id,
      };
      const product = await prisma.product.upsert({
        where: { slug: p.slug },
        update: productFields,
        create: { slug: p.slug, ...productFields },
      });

      for (const v of p.variants) {
        await prisma.productVariant.upsert({
          where: { sku: v.sku },
          update: {
            name: v.name,
            price: v.price,
            stockQuantity: v.stock,
            stockReserved: 0,
            isDefault: v.isDefault ?? false,
            active: true,
            weightGrams: v.weightGrams ?? null,
          },
          create: {
            productId: product.id,
            name: v.name,
            sku: v.sku,
            price: v.price,
            currency: 'GBP',
            stockQuantity: v.stock,
            isDefault: v.isDefault ?? false,
            weightGrams: v.weightGrams ?? null,
          },
        });
      }

      for (const member of p.members ?? []) {
        const memberProduct = await prisma.product.findUnique({
          where: { slug: member.slug },
        });
        if (!memberProduct) {
          throw new Error(`seed: missing member "${member.slug}"`);
        }
        await prisma.groupedMember.upsert({
          where: {
            groupedProductId_memberProductId: {
              groupedProductId: product.id,
              memberProductId: memberProduct.id,
            },
          },
          update: { sortOrder: member.sortOrder },
          create: {
            groupedProductId: product.id,
            memberProductId: memberProduct.id,
            sortOrder: member.sortOrder,
          },
        });
      }

      // Slots must stay stable across re-seeds: M3b cart/order component
      // rows FK to slot ids, so ids are upserted by name — never deleted.
      // Options may be recreated freely (no inbound FK).
      if (p.slots?.length) {
        for (const slotSeed of p.slots) {
          const slotFields = {
            description: slotSeed.description ?? null,
            position: slotSeed.position,
            minSelect: slotSeed.minSelect,
            maxSelect: slotSeed.maxSelect,
          };
          const existingSlot = await prisma.compositeSlot.findFirst({
            where: { compositeProductId: product.id, name: slotSeed.name },
            select: { id: true },
          });
          const slot = existingSlot
            ? await prisma.compositeSlot.update({
                where: { id: existingSlot.id },
                data: slotFields,
              })
            : await prisma.compositeSlot.create({
                data: {
                  compositeProductId: product.id,
                  name: slotSeed.name,
                  ...slotFields,
                },
              });

          await prisma.compositeSlotOption.deleteMany({
            where: { slotId: slot.id },
          });
          for (const optionSeed of slotSeed.options) {
            const target = await prisma.product.findUnique({
              where: { slug: optionSeed.productSlug },
            });
            if (!target) {
              throw new Error(`seed: missing slot option "${optionSeed.productSlug}"`);
            }
            const pinned = optionSeed.componentVariantSku
              ? await prisma.productVariant.findUnique({
                  where: { sku: optionSeed.componentVariantSku },
                })
              : null;
            await prisma.compositeSlotOption.create({
              data: {
                slotId: slot.id,
                productId: target.id,
                componentVariantId: pinned?.id ?? null,
                quantity: optionSeed.quantity,
                priceOverride: optionSeed.priceOverride ?? null,
                sortOrder: optionSeed.sortOrder,
              },
            });
          }
        }
      }

      for (const f of p.facets ?? []) {
        const facet = await prisma.catalogFacet.findUnique({
          where: { facetType_slug: { facetType: f.facetType, slug: f.slug } },
        });
        if (!facet) continue; // non-fatal: facet may not exist in this baseline
        await prisma.productFacet.upsert({
          where: {
            productId_facetId: { productId: product.id, facetId: facet.id },
          },
          update: {},
          create: { productId: product.id, facetId: facet.id },
        });
      }
    }
    console.log(`products: upserted ${productSeeds.length}`);

    // --- commerce.product_download_files + SeaweedFS objects (M3b) ---
    // Actual bytes are PUT to SeaweedFS at seed time so signed URLs really
    // serve something. Skipped with a warning when S3_* is unconfigured.
    interface SeedDownloadFile {
      productSlug: string;
      fileName: string;
      mimeType: string;
      content: string;
      sortOrder: number;
    }
    const downloadFileSeeds: SeedDownloadFile[] = [
      {
        productSlug: 'puppy-training-guide',
        fileName: 'puppy-training-guide.pdf',
        mimeType: 'application/pdf',
        content:
          '%PDF-1.4\n% Ruby Veterinary seeded placeholder: puppy training guide\n%%EOF\n',
        sortOrder: 0,
      },
      {
        productSlug: 'care-video-pack',
        fileName: 'care-video-part-1.mp4',
        mimeType: 'video/mp4',
        content: 'seeded-placeholder-video-part-1',
        sortOrder: 0,
      },
      {
        productSlug: 'care-video-pack',
        fileName: 'care-video-part-2.mp4',
        mimeType: 'video/mp4',
        content: 'seeded-placeholder-video-part-2',
        sortOrder: 1,
      },
    ];

    const s3Configured = Boolean(
      process.env.S3_ENDPOINT &&
        process.env.S3_ACCESS_KEY &&
        process.env.S3_SECRET_KEY,
    );
    const s3 = s3Configured
      ? new S3Client({
          endpoint: process.env.S3_ENDPOINT,
          region: 'us-east-1',
          forcePathStyle: true,
          credentials: {
            accessKeyId: process.env.S3_ACCESS_KEY as string,
            secretAccessKey: process.env.S3_SECRET_KEY as string,
          },
        })
      : null;
    if (s3) {
      try {
        await s3.send(new CreateBucketCommand({ Bucket: 'ruby-veterinary' }));
      } catch {
        // Already exists — fine.
      }
    } else {
      console.warn(
        'seed: S3_* not configured — download file records will be created without uploaded bytes.',
      );
    }

    let uploadedObjects = 0;
    for (const file of downloadFileSeeds) {
      const product = await prisma.product.findUnique({
        where: { slug: file.productSlug },
      });
      if (!product) {
        throw new Error(`seed: missing download file product "${file.productSlug}"`);
      }
      const objectKey = `products/${product.id}/downloads/${file.fileName}`;
      const bytes = Buffer.from(file.content, 'utf8');

      const existingFile = await prisma.productDownloadFile.findFirst({
        where: { productId: product.id, objectKey },
        select: { id: true },
      });
      const fileFields = {
        fileName: file.fileName,
        fileSizeBytes: bytes.byteLength,
        mimeType: file.mimeType,
        sortOrder: file.sortOrder,
      };
      if (existingFile) {
        await prisma.productDownloadFile.update({
          where: { id: existingFile.id },
          data: fileFields,
        });
      } else {
        await prisma.productDownloadFile.create({
          data: { productId: product.id, objectKey, ...fileFields },
        });
      }

      if (s3) {
        await s3.send(
          new PutObjectCommand({
            Bucket: 'ruby-veterinary',
            Key: objectKey,
            Body: bytes,
            ContentType: file.mimeType,
          }),
        );
        uploadedObjects += 1;
      }
    }
    console.log(
      `product_download_files: upserted ${downloadFileSeeds.length} (${uploadedObjects} objects uploaded)`,
    );

    // --- clients.clients + clients.pets + primary vet link (M4 care path) ---
    // A phone-only legacy client (no email, no identity link) with two pets
    // and a current primary-vet link to Dr Ada — exercises the roster, the
    // pet detail/history surface, and the one-current-link invariant seed.
    const ada = await prisma.user.findUnique({
      where: { email: 'ada@ruby-veterinary.example.com' },
      select: { id: true },
    });

    const clientSeed = {
      displayName: 'Mabel Whitcombe',
      phone: '+442079991234',
    };
    let careClient = await prisma.client.findFirst({
      where: { phone: clientSeed.phone },
    });
    if (!careClient) {
      careClient = await prisma.client.create({
        data: {
          userId: null,
          displayName: clientSeed.displayName,
          email: null,
          phone: clientSeed.phone,
          addressLine1: '14 Ruby Lane',
          addressLine2: null,
          city: 'London',
          postalCode: 'NW1 6XE',
          country: 'GB',
          preferredContact: 'phone',
          source: 'walk_in',
          status: 'active',
        },
      });
    } else {
      await prisma.client.update({
        where: { id: careClient.id },
        data: { displayName: clientSeed.displayName, status: 'active' },
      });
    }

    const petSeeds = [
      {
        name: 'Biscuit',
        species: 'dog',
        breed: 'Border Terrier',
        sex: 'male',
        neutered: true,
        dateOfBirth: new Date('2021-03-14'),
        weightKg: 8.4,
        microchipId: '981020000123456',
        notes: 'Nervous around loud noises.',
      },
      {
        name: 'Cleo',
        species: 'cat',
        breed: 'Domestic Shorthair',
        sex: 'female',
        neutered: true,
        dateOfBirth: new Date('2019-11-02'),
        weightKg: 4.1,
        microchipId: '981020000654321',
        notes: null,
      },
    ];
    const carePets = [] as Array<{ id: string }>;
    for (const pet of petSeeds) {
      const existing = await prisma.pet.findFirst({
        where: { clientId: careClient.id, name: pet.name },
      });
      if (existing) {
        await prisma.pet.update({ where: { id: existing.id }, data: pet });
        carePets.push(existing);
      } else {
        carePets.push(
          await prisma.pet.create({
            data: { clientId: careClient.id, status: 'active', ...pet },
          }),
        );
      }
    }

    if (ada && carePets.length > 0) {
      const current = await prisma.primaryVeterinarianLink.findFirst({
        where: { petId: carePets[0].id, effectiveTo: null },
        select: { id: true },
      });
      if (!current) {
        await prisma.primaryVeterinarianLink.create({
          data: {
            petId: carePets[0].id,
            veterinarianUserId: ada.id,
            effectiveFrom: new Date('2026-01-05'),
            effectiveTo: null,
          },
        });
      }
    }
    console.log(
      `clients: seeded 1 phone-only client, ${carePets.length} pets, primary-vet link to Dr Ada`,
    );

    console.log('seed complete');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
