import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Seed for baseline reference data (§12 M1). Idempotent — safe to re-run.
 *
 * Seeds:
 *  - identity.roles          additive role catalogue (ADR-0002)
 *  - content.clinics         the single-clinic profile row
 *  - content.business_hours  weekly opening hours (0=Sun … 6=Sat)
 *  - notifications.delivery_channels  email | whatsapp_template | in_app_dashboard
 *  - commerce.catalog_facets pet_type / life_stage / health_condition facets
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

    console.log('seed complete');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
