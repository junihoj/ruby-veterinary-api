import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createApp } from '../src/app.factory';
import { PrismaService } from '../src/prisma/prisma.service';
import type { ErrorEnvelope } from '../src/shared/cross-cutting/envelope';
import { PrefixedId } from '../src/shared/kernel/domain/prefixed-id';
import type { AuthTokensDto } from '../src/modules/identity/application/dto/auth-response.dto';
import {
  CATALOG_MANAGER_EMAIL,
  CATALOG_MANAGER_PASSWORD,
} from '../prisma/seed-credentials';

/** Response envelopes typed at the assertion sites (supertest body is any). */
interface Envelope<T> {
  data: T;
  meta: { requestId: string; timestamp: string };
}

/**
 * Care path M4 e2e — Flow 1 (anonymous forms → alerts + events) and the
 * Flow 2 normative sequence (signed-in intake → staff accept → client/pet
 * filed through the clients module → owner pet claim), plus upload review,
 * idempotency, and the staff roster surface.
 *
 * Requires DATABASE_URL → ruby_veterinary_test, migrated and seeded
 * (`pnpm db:seed`). Form routes are throttled 5/10min per IP, so this suite
 * budgets ≤4 calls per form route (the throttle counts every request,
 * success or failure).
 */
jest.setTimeout(120_000);

describe('Care path — intake, acceptance, uploads, records (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  const runId = `${Date.now()}-${Math.floor(Math.random() * 1_000)}`;
  const ownerEmail = `m4-owner-${runId}@example.com`;
  const owner2Email = `m4-owner2-${runId}@example.com`;
  const password = 'm4-password-123';

  let staffToken = '';
  let ownerToken = '';
  let owner2Token = '';

  const server = () => request(app.getHttpServer());
  const auth = (token?: string) =>
    token ? { Authorization: `Bearer ${token}` } : {};
  const get = (path: string, token?: string) =>
    server().get(`/api/v1${path}`).set(auth(token));
  const post = (path: string, token?: string) =>
    server().post(`/api/v1${path}`).set(auth(token));
  const patch = (path: string, token?: string) =>
    server().patch(`/api/v1${path}`).set(auth(token));

  const registerAndLogin = async (email: string) => {
    await post('/auth/register').send({ email, password }).expect(201);
    const login = await post('/auth/login')
      .send({ email, password })
      .expect(200);
    return (login.body as Envelope<AuthTokensDto>).data.tokens.accessToken;
  };

  const errorBody = (res: request.Response) =>
    (res.body as ErrorEnvelope).error;

  beforeAll(async () => {
    app = (await createApp()) as INestApplication<App>;
    prisma = app.get(PrismaService);

    const adminLogin = await post('/auth/login')
      .send({
        email: CATALOG_MANAGER_EMAIL,
        password: CATALOG_MANAGER_PASSWORD,
      })
      .expect(200);
    staffToken = (adminLogin.body as Envelope<AuthTokensDto>).data.tokens
      .accessToken;

    ownerToken = await registerAndLogin(ownerEmail);
    owner2Token = await registerAndLogin(owner2Email);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Flow 1 — appointment request form (anonymous)', () => {
    it('files the request, routes alerts, and triages through the staff queue', async () => {
      const created = await post('/appointment-requests')
        .send({
          contactName: 'Mabel Whitcombe',
          contactPhone: '+442079991234',
          contactEmail: 'mabel@example.com',
          petName: 'Biscuit',
          petSpecies: 'dog',
          reason: 'Annual vaccination',
          urgency: 'routine',
        })
        .expect(201);

      const appointmentId = (
        created.body as Envelope<{ appointmentRequestId: string }>
      ).data.appointmentRequestId;
      expect(appointmentId).toMatch(/^apt_/);

      // Alerts: dashboard row queued, email row delivered (console adapter).
      const alerts = await prisma.formSubmissionAlert.findMany({
        where: {
          sourceType: 'appointment_request',
          sourceId: PrefixedId.tryAnyToUuid(appointmentId) ?? '',
        },
      });
      expect(alerts).toHaveLength(2);
      const emailAlert = alerts.find((a) => a.channel === 'email');
      const dashboardAlert = alerts.find(
        (a) => a.channel === 'admin_dashboard',
      );
      expect(emailAlert?.status).toBe('delivered');
      expect(dashboardAlert?.status).toBe('queued');

      // Staff queue + triage transitions.
      const queue = await get('/admin/appointment-requests', staffToken).expect(
        200,
      );
      expect(
        (queue.body as Envelope<Array<{ id: string }>>).data.some(
          (row) => row.id === appointmentId,
        ),
      ).toBe(true);

      await patch(`/admin/appointment-requests/${appointmentId}`, staffToken)
        .send({ status: 'triaged' })
        .expect(200);
      await patch(`/admin/appointment-requests/${appointmentId}`, staffToken)
        .send({ status: 'declined' })
        .expect(200);
      const conflict = await patch(
        `/admin/appointment-requests/${appointmentId}`,
        staffToken,
      )
        .send({ status: 'triaged' })
        .expect(409);
      expect(errorBody(conflict).code).toBe('STATE_CONFLICT');

      // Auth scoping: 401 anonymous, 403 for a client without care:write.
      await patch(`/admin/appointment-requests/${appointmentId}`)
        .send({ status: 'cancelled' })
        .expect(401);
      await patch(`/admin/appointment-requests/${appointmentId}`, ownerToken)
        .send({ status: 'cancelled' })
        .expect(403);
      expect(
        errorBody(
          await patch(
            `/admin/appointment-requests/${appointmentId}`,
            ownerToken,
          ).expect(403),
        ).code,
      ).toBe('STAFF_ONLY');

      const missing = await patch(
        '/admin/appointment-requests/apt_unknown',
        staffToken,
      )
        .send({ status: 'triaged' })
        .expect(404);
      expect(errorBody(missing).code).toBe('RESOURCE_NOT_FOUND');
    });
  });

  describe('Flow 1 — intake form (anonymous) + review', () => {
    it('files the submission, routes alerts, and moves it through review', async () => {
      const created = await post('/clients/intake')
        .send({
          contactName: 'Priya Shah',
          contactPhone: '+442079995678',
          contactEmail: 'priya@example.com',
          city: 'London',
          country: 'GB',
        })
        .expect(201);

      const intakeId = (
        created.body as Envelope<{ intakeSubmissionId: string }>
      ).data.intakeSubmissionId;
      expect(intakeId).toMatch(/^int_/);

      const alerts = await prisma.formSubmissionAlert.findMany({
        where: {
          sourceType: 'intake_submission',
          sourceId: PrefixedId.tryAnyToUuid(intakeId) ?? '',
        },
      });
      expect(alerts).toHaveLength(2);

      // Status read: Bearer-only and owner-scoped.
      await get(`/clients/intake/${intakeId}/status`).expect(401);
      const foreign = await get(
        `/clients/intake/${intakeId}/status`,
        ownerToken,
      ).expect(404);
      expect(errorBody(foreign).code).toBe('RESOURCE_NOT_FOUND');

      await patch(`/admin/clients/intake/${intakeId}`, staffToken)
        .send({ status: 'in_review' })
        .expect(200);
      // Out-of-enum statuses are validation failures, not state conflicts.
      const invalid = await patch(
        `/admin/clients/intake/${intakeId}`,
        staffToken,
      )
        .send({ status: 'received' })
        .expect(400);
      expect(errorBody(invalid).code).toBe('VALIDATION_FAILED');
    });
  });

  describe('Flow 2 — signed-in intake → accept → pet claim', () => {
    it('accepts through the clients module and links the pets to the owner', async () => {
      const created = await post('/clients/intake', ownerToken)
        .send({
          contactName: 'Mabel Whitcombe',
          contactPhone: '+442079998877',
          contactEmail: 'mabel-new@example.com',
          addressLine1: '14 Ruby Lane',
          city: 'London',
          postalCode: 'NW1 6XE',
          country: 'GB',
        })
        .expect(201);

      const intakeId = (
        created.body as Envelope<{ intakeSubmissionId: string }>
      ).data.intakeSubmissionId;

      // The owner can watch their own submission.
      const status = await get(
        `/clients/intake/${intakeId}/status`,
        ownerToken,
      ).expect(200);
      expect((status.body as Envelope<{ status: string }>).data.status).toBe(
        'received',
      );

      // Staff accept — files Client + Pets via the clients module (Flow 2).
      const accepted = await post(
        `/admin/clients/intake/${intakeId}/accept`,
        staffToken,
      )
        .send({
          pets: [
            {
              name: 'Biscuit',
              species: 'dog',
              breed: 'Border Terrier',
              neutered: true,
            },
            { name: 'Cleo', species: 'cat', sex: 'female' },
          ],
        })
        .expect(201);

      const data = (
        accepted.body as Envelope<{
          status: string;
          clientId: string;
          pets: Array<{ id: string; name: string }>;
        }>
      ).data;
      expect(data.status).toBe('accepted');
      expect(data.clientId).toMatch(/^cli_/);
      expect(data.pets).toHaveLength(2);

      // The client row is linked to the submitting user (pet claim).
      const clientUuid = PrefixedId.tryAnyToUuid(data.clientId);
      if (clientUuid === null) throw new Error('bad client id');
      const client = await prisma.client.findUniqueOrThrow({
        where: { id: clientUuid },
      });
      const ownerUser = await prisma.user.findUniqueOrThrow({
        where: { email: ownerEmail },
      });
      expect(client.userId).toBe(ownerUser.id);

      // Pet claim: the owner sees their pets.
      const pets = await get('/pets', ownerToken).expect(200);
      const petNames = (
        pets.body as Envelope<Array<{ name: string }>>
      ).data.map((pet) => pet.name);
      expect(petNames).toEqual(expect.arrayContaining(['Biscuit', 'Cleo']));

      // The submission is terminal — a second accept is 409.
      const again = await post(
        `/admin/clients/intake/${intakeId}/accept`,
        staffToken,
      )
        .send({ pets: [{ name: 'Ghost', species: 'other' }] })
        .expect(409);
      expect(errorBody(again).code).toBe('STATE_CONFLICT');
    });

    it('answers 422 when an existingClient submission is accepted without clientId', async () => {
      const created = await post('/clients/intake', owner2Token)
        .send({
          contactName: 'Ravi Patel',
          contactPhone: '+442079994433',
          contactEmail: 'ravi@example.com',
          existingClient: true,
        })
        .expect(201);
      const intakeId = (
        created.body as Envelope<{ intakeSubmissionId: string }>
      ).data.intakeSubmissionId;

      const res = await post(
        `/admin/clients/intake/${intakeId}/accept`,
        staffToken,
      )
        .send({ pets: [{ name: 'Milo', species: 'rabbit' }] })
        .expect(422);
      expect(errorBody(res).code).toBe('INTAKE_NOT_ACCEPTABLE');
    });
  });

  describe('Upload review — sign, PUT, finalise/reject', () => {
    it('verifies the object in storage before finalising and rejects with a reason', async () => {
      // Sign a medical-history upload as the owner.
      const sign = await post('/uploads/sign', ownerToken)
        .send({
          purpose: 'medical_history',
          filename: 'lab-results.pdf',
          mimeType: 'application/pdf',
          byteSize: 1024,
        })
        .expect(200);
      const signData = (
        sign.body as Envelope<{
          uploadId: string;
          uploadUrl: string;
          headers: Record<string, string>;
        }>
      ).data;
      expect(signData.uploadId).toMatch(/^upl_/);

      // The owner references it from their intake submission.
      const created = await post('/clients/intake', ownerToken)
        .send({
          contactName: 'Mabel Whitcombe',
          contactPhone: '+442079991122',
          contactEmail: 'mabel-uploads@example.com',
          historyUploadIds: [signData.uploadId],
        })
        .expect(201);
      const intakeId = (
        created.body as Envelope<{ intakeSubmissionId: string }>
      ).data.intakeSubmissionId;
      const intakeUuid = PrefixedId.tryAnyToUuid(intakeId);
      if (intakeUuid === null) throw new Error('bad intake id');
      const intake = await prisma.intakeSubmission.findUniqueOrThrow({
        where: { id: intakeUuid },
        include: { uploads: true },
      });
      expect(
        intake.uploads.map((u) => PrefixedId.format('historyUpload', u.id)),
      ).toEqual([signData.uploadId]);

      // Finalise before the bytes land → 422 UPLOAD_MISSING.
      const missing = await patch(
        `/admin/uploads/${signData.uploadId}`,
        staffToken,
      )
        .send({ status: 'finalised' })
        .expect(422);
      expect(errorBody(missing).code).toBe('UPLOAD_MISSING');

      // Upload the bytes directly to SeaweedFS via the presigned PUT.
      const put = await fetch(signData.uploadUrl, {
        method: 'PUT',
        headers: signData.headers,
        body: Buffer.from('fake-pdf-bytes'),
      });
      expect(put.status).toBe(200);

      const finalised = await patch(
        `/admin/uploads/${signData.uploadId}`,
        staffToken,
      )
        .send({ status: 'finalised' })
        .expect(200);
      expect((finalised.body as Envelope<{ status: string }>).data.status).toBe(
        'finalised',
      );

      // Terminal — a second review is 409.
      const again = await patch(
        `/admin/uploads/${signData.uploadId}`,
        staffToken,
      )
        .send({ status: 'rejected', rejectionReason: 'too late' })
        .expect(409);
      expect(errorBody(again).code).toBe('STATE_CONFLICT');

      // Reject path requires a reason.
      const sign2 = await post('/uploads/sign', ownerToken)
        .send({
          purpose: 'medical_history',
          filename: 'scan.jpg',
          mimeType: 'image/jpeg',
          byteSize: 512,
        })
        .expect(200);
      const upload2 = (sign2.body as Envelope<{ uploadId: string }>).data
        .uploadId;

      const noReason = await patch(`/admin/uploads/${upload2}`, staffToken)
        .send({ status: 'rejected' })
        .expect(400);
      expect(errorBody(noReason).code).toBe('VALIDATION_FAILED');

      const rejected = await patch(`/admin/uploads/${upload2}`, staffToken)
        .send({ status: 'rejected', rejectionReason: 'Blurry scan.' })
        .expect(200);
      expect(
        (rejected.body as Envelope<{ status: string; rejectionReason: string }>)
          .data.rejectionReason,
      ).toBe('Blurry scan.');

      // Staff can mint a short-lived download URL for a finalised upload.
      const urlRes = await get(
        `/admin/uploads/${signData.uploadId}/url`,
        staffToken,
      ).expect(200);
      expect((urlRes.body as Envelope<{ url: string }>).data.url).toContain(
        'http',
      );
    });
  });

  describe('Idempotency on the form routes', () => {
    it('replays the same key and conflicts on a different body', async () => {
      const key = `m4-${runId}`;
      const body = {
        contactName: 'Ida Empotent',
        contactPhone: '+442079990000',
        contactEmail: 'ida@example.com',
        petName: 'Noodle',
        petSpecies: 'cat',
        reason: 'Check-up',
      };

      const first = await post('/appointment-requests')
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);
      const replay = await post('/appointment-requests')
        .set('Idempotency-Key', key)
        .send(body)
        .expect(201);
      // The stored body replays verbatim; only the envelope meta is fresh.
      expect(
        (
          replay.body as Envelope<{
            appointmentRequestId: string;
            status: string;
          }>
        ).data,
      ).toEqual(
        (
          first.body as Envelope<{
            appointmentRequestId: string;
            status: string;
          }>
        ).data,
      );

      const conflict = await post('/appointment-requests')
        .set('Idempotency-Key', key)
        .send({ ...body, reason: 'Different reason' })
        .expect(409);
      expect(errorBody(conflict).code).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  describe('Staff roster & patient records', () => {
    it('walks the seeded client, files history, and sets the primary vet', async () => {
      // The seeded phone-only client is in the roster (by phone — the Flow 2
      // flow creates a same-named client later).
      const roster = await get(
        '/admin/clients?q=%2B442079991234',
        staffToken,
      ).expect(200);
      const clients = (
        roster.body as Envelope<Array<{ id: string; displayName: string }>>
      ).data;
      const mabel = clients.find((c) => c.displayName === 'Mabel Whitcombe');
      expect(mabel).toBeDefined();
      const mabelId = mabel?.id ?? '';
      expect(mabelId).toMatch(/^cli_/);

      const detail = await get(`/admin/clients/${mabelId}`, staffToken).expect(
        200,
      );
      const pets = (
        detail.body as Envelope<{ pets: Array<{ id: string; name: string }> }>
      ).data.pets;
      expect(pets.map((p) => p.name)).toEqual(
        expect.arrayContaining(['Biscuit', 'Cleo']),
      );
      const biscuit = pets.find((p) => p.name === 'Biscuit');
      expect(biscuit).toBeDefined();
      const biscuitId = biscuit?.id ?? '';
      expect(biscuitId).toMatch(/^pet_/);

      // Medical history: record + presigned PUT, then listed.
      const history = await post(
        `/admin/pets/${biscuitId}/medical-history`,
        staffToken,
      )
        .send({
          title: 'Annual labs',
          fileName: 'labs.pdf',
          mimeType: 'application/pdf',
          byteSize: 2048,
          visitDate: '2026-01-10',
          summary: 'All within range.',
        })
        .expect(201);
      const historyData = (
        history.body as Envelope<{
          id: string;
          uploadUrl: string;
          headers: Record<string, string>;
        }>
      ).data;
      expect(historyData.id).toMatch(/^mhr_/);
      const put = await fetch(historyData.uploadUrl, {
        method: 'PUT',
        headers: historyData.headers,
        body: Buffer.from('fake-labs-pdf'),
      });
      expect(put.status).toBe(200);

      const list = await get(
        `/admin/pets/${biscuitId}/medical-history`,
        staffToken,
      ).expect(200);
      expect(
        (list.body as Envelope<Array<{ id: string }>>).data.map((r) => r.id),
      ).toContain(historyData.id);

      // Primary vet: Dr Ada (veterinarian) succeeds; a non-vet is 422.
      const ada = await prisma.user.findUniqueOrThrow({
        where: { email: 'ada@ruby-veterinary.example.com' },
        select: { id: true },
      });
      const vet = await post(`/admin/pets/${biscuitId}/primary-vet`, staffToken)
        .send({ veterinarianUserId: PrefixedId.format('user', ada.id) })
        .expect(200);
      expect(
        (vet.body as Envelope<{ effectiveTo: string | null }>).data.effectiveTo,
      ).toBeNull();

      const owner2 = await prisma.user.findUniqueOrThrow({
        where: { email: owner2Email },
        select: { id: true },
      });
      const notVet = await post(
        `/admin/pets/${biscuitId}/primary-vet`,
        staffToken,
      )
        .send({ veterinarianUserId: PrefixedId.format('user', owner2.id) })
        .expect(422);
      expect(errorBody(notVet).code).toBe('NOT_A_VETERINARIAN');

      // The seeded current link is superseded by the new one.
      const links = await get(
        `/admin/pets/${biscuitId}/primary-vet`,
        staffToken,
      ).expect(200);
      const linkRows = (
        links.body as Envelope<Array<{ effectiveTo: string | null }>>
      ).data;
      // History is preserved; exactly one link is current (re-run safe).
      expect(linkRows.length).toBeGreaterThanOrEqual(2);
      expect(linkRows.filter((l) => l.effectiveTo === null)).toHaveLength(1);

      // Walk-in client creation; linking the same account twice is 409.
      const created = await post('/admin/clients', staffToken)
        .send({
          displayName: 'Walk-In Wendy',
          phone: '+442079997766',
          source: 'walk_in',
        })
        .expect(201);
      const wendyId = (created.body as Envelope<{ id: string }>).data.id;
      expect(wendyId).toMatch(/^cli_/);

      const linked = await post('/admin/clients', staffToken)
        .send({
          displayName: 'Walk-In Wendy Again',
          phone: '+442079997755',
          userId: PrefixedId.format('user', owner2.id),
          source: 'walk_in',
        })
        .expect(201);
      const linkedId = (linked.body as Envelope<{ id: string }>).data.id;
      expect(linkedId).toMatch(/^cli_/);

      const duplicate = await post('/admin/clients', staffToken)
        .send({
          displayName: 'Walk-In Wendy Third',
          phone: '+442079997744',
          userId: PrefixedId.format('user', owner2.id),
          source: 'walk_in',
        })
        .expect(409);
      expect(errorBody(duplicate).code).toBe('ALREADY_LINKED');

      // The intake queue static route still wins over GET /admin/clients/:id.
      const queue = await get('/admin/clients/intake', staffToken).expect(200);
      expect((queue.body as Envelope<unknown[]>).data).toBeDefined();

      // Owner scoping on the roster: clients never see it.
      await get('/admin/clients', ownerToken).expect(403);
      await get('/pets').expect(401);
    });
  });
});
