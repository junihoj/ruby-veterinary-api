import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Seed for baseline reference data (§12 M1). Idempotent — safe to re-run.
 *
 * Seeds:
 *  - identity.roles          additive role catalogue (ADR-0002)
 *  - content.clinics         the single-clinic profile row
 *  - content.business_hours  weekly opening hours (0=Sun … 6=Sat)
 *  - content.services        published service catalog (M2)
 *  - content.staff_profiles  published staff grid (M2)
 *  - content.downloadable_documents  care documents (M2)
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

    console.log('seed complete');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
