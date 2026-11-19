import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Diffs the live Swagger export against the committed openapi/ contract
 * (M2 gate). Compares paths + operationIds + status codes — the contract
 * surface clients depend on. Run: pnpm openapi:diff
 *
 * Usage: pnpm openapi:diff <path-to-docs-repo>
 */
interface OpenApiSpec {
  paths: Record<
    string,
    Record<string, { operationId?: string; responses?: Record<string, unknown> }>
  >;
}

function loadSpec(path: string): OpenApiSpec {
  return JSON.parse(readFileSync(path, 'utf-8')) as OpenApiSpec;
}

function extractContract(spec: OpenApiSpec): Map<string, string[]> {
  const contract = new Map<string, string[]>();
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const key = `${method.toUpperCase()} ${path}`;
      const statuses = Object.keys(operation.responses ?? {}).sort();
      contract.set(key, [operation.operationId ?? '', ...statuses]);
    }
  }
  return contract;
}

function main(): void {
  const docsRepo = process.argv[2];
  if (!docsRepo) {
    console.error('Usage: pnpm openapi:diff <path-to-docs-repo>');
    process.exit(1);
  }

  const livePath = join(__dirname, '..', 'dist', 'openapi.json');
  const live = extractContract(loadSpec(livePath));

  // The committed contract files: auth.yaml + clinic-content.yaml (M2) and
  // commerce.yaml + webhooks.yaml (M3a). We compare against the live export
  // only (the yaml files are the source of truth for descriptions; the
  // export must contain every operation with contract-exact statuses).
  const expected = new Map<string, string[]>();

  // Expected operations from the committed contract.
  const expectedOps: Array<[string, string, string[]]> = [
    // auth.yaml
    ['POST', '/auth/register', ['registerClient', '201', '400', '409', '429']],
    ['POST', '/auth/login', ['login', '200', '401', '429']],
    ['POST', '/auth/refresh', ['refreshToken', '200', '401']],
    ['POST', '/auth/logout', ['logout', '204', '401']],
    ['GET', '/auth/me', ['getCurrentUser', '200', '401']],
    // clinic-content.yaml
    ['GET', '/clinic/hours', ['getClinicHours', '200']],
    ['GET', '/clinic/contact', ['getClinicContact', '200']],
    ['GET', '/services', ['listServices', '200']],
    ['GET', '/services/{slug}', ['getService', '200', '404']],
    ['GET', '/staff', ['listStaff', '200']],
    ['GET', '/documents', ['listDocuments', '200']],
    ['GET', '/documents/{id}', ['getDocumentDownload', '200', '404']],
    // commerce.yaml (M3a money path — M3b ops: subscriptions, downloads)
    ['GET', '/products', ['listProducts', '200']],
    ['GET', '/products/{slug}', ['getProduct', '200', '404']],
    ['GET', '/cart', ['getCart', '200', '401']],
    ['POST', '/cart', ['ensureCart', '200', '401']],
    ['DELETE', '/cart', ['clearCart', '204', '401']],
    [
      'POST',
      '/cart/items',
      ['addCartItem', '201', '400', '401', '409', '422'],
    ],
    ['PATCH', '/cart/items', ['updateCartItem', '200', '400', '401']],
    ['DELETE', '/cart/items', ['removeCartItem', '204', '401']],
    [
      'POST',
      '/checkout/quote',
      ['checkoutQuote', '200', '400', '401', '422'],
    ],
    [
      'POST',
      '/checkout',
      ['checkout', '201', '400', '401', '409', '422', '503'],
    ],
    ['GET', '/orders', ['listOrders', '200', '401']],
    ['GET', '/orders/{id}', ['getOrder', '200', '401', '404']],
    // commerce.yaml (M3b — composite & digital)
    [
      'GET',
      '/orders/{id}/downloads',
      ['listOrderDownloads', '200', '401', '404'],
    ],
    [
      'POST',
      '/downloads/{grantId}/url',
      ['issueDownloadUrl', '200', '401', '403', '404'],
    ],
    ['GET', '/subscriptions', ['listSubscriptions', '200', '401']],
    [
      'POST',
      '/subscriptions',
      ['createSubscription', '201', '400', '401', '422'],
    ],
    [
      'PATCH',
      '/subscriptions/{id}',
      ['updateSubscription', '200', '400', '401', '404'],
    ],
    ['DELETE', '/subscriptions/{id}', ['cancelSubscription', '204', '401']],
    ['POST', '/admin/products', ['adminCreateProduct', '201', '401', '403']],
    [
      'PATCH',
      '/admin/products/{id}',
      ['adminUpdateProduct', '200', '401', '403', '404'],
    ],
    [
      'POST',
      '/admin/products/{id}/download-files',
      ['adminCreateDownloadFile', '201', '400', '401', '403', '404'],
    ],
    // webhooks.yaml (payments)
    ['POST', '/webhooks/payments', ['receivePaymentWebhook', '200', '401']],
    // intake.yaml (M4 — forms, triage, acceptance, upload review)
    [
      'POST',
      '/appointment-requests',
      ['createAppointmentRequest', '201', '400', '409', '429'],
    ],
    [
      'POST',
      '/clients/intake',
      ['createIntakeSubmission', '201', '400', '409', '429'],
    ],
    ['POST', '/uploads/sign', ['signUpload', '200', '400', '401', '413']],
    [
      'GET',
      '/clients/intake/{id}/status',
      ['getIntakeStatus', '200', '401', '404'],
    ],
    [
      'GET',
      '/admin/appointment-requests',
      ['listAppointmentRequests', '200', '401', '403'],
    ],
    [
      'PATCH',
      '/admin/appointment-requests/{id}',
      ['triageAppointmentRequest', '200', '400', '401', '403', '404', '409'],
    ],
    [
      'GET',
      '/admin/clients/intake',
      ['listIntakeSubmissions', '200', '401', '403'],
    ],
    [
      'PATCH',
      '/admin/clients/intake/{id}',
      ['updateIntakeSubmission', '200', '400', '401', '403', '404', '409'],
    ],
    [
      'POST',
      '/admin/clients/intake/{id}/accept',
      [
        'acceptIntakeSubmission',
        '201',
        '400',
        '401',
        '403',
        '404',
        '409',
        '422',
      ],
    ],
    ['GET', '/admin/uploads', ['listHistoryUploads', '200', '401', '403']],
    [
      'GET',
      '/admin/uploads/{id}/url',
      ['getHistoryUploadUrl', '200', '401', '403', '404'],
    ],
    [
      'PATCH',
      '/admin/uploads/{id}',
      ['updateHistoryUpload', '200', '400', '401', '403', '404', '409', '422'],
    ],
    // client-records.yaml (M4 — owner pets + staff roster & patient records)
    ['GET', '/pets', ['listMyPets', '200', '401']],
    ['GET', '/admin/clients', ['listClients', '200', '401', '403']],
    ['POST', '/admin/clients', ['createClient', '201', '400', '401', '403', '409']],
    ['GET', '/admin/clients/{id}', ['getClient', '200', '401', '403', '404']],
    [
      'PATCH',
      '/admin/clients/{id}',
      ['updateClient', '200', '400', '401', '403', '404'],
    ],
    [
      'GET',
      '/admin/clients/{id}/pets',
      ['listClientPets', '200', '401', '403', '404'],
    ],
    [
      'POST',
      '/admin/clients/{id}/pets',
      ['createPet', '201', '400', '401', '403', '404'],
    ],
    ['GET', '/admin/pets/{id}', ['getPet', '200', '401', '403', '404']],
    [
      'PATCH',
      '/admin/pets/{id}',
      ['updatePet', '200', '400', '401', '403', '404'],
    ],
    [
      'GET',
      '/admin/pets/{id}/medical-history',
      ['listMedicalHistory', '200', '401', '403', '404'],
    ],
    [
      'POST',
      '/admin/pets/{id}/medical-history',
      [
        'createMedicalHistoryRecord',
        '201',
        '400',
        '401',
        '403',
        '404',
        '413',
      ],
    ],
    [
      'GET',
      '/admin/pets/{id}/primary-vet',
      ['listPrimaryVeterinarians', '200', '401', '403', '404'],
    ],
    [
      'POST',
      '/admin/pets/{id}/primary-vet',
      ['setPrimaryVeterinarian', '200', '400', '401', '403', '404', '422'],
    ],
    // pharmacy.yaml (M5 — review queue, decisions, Rx hold)
    [
      'GET',
      '/prescriptions/queue',
      ['listPrescriptionQueue', '200', '401', '403'],
    ],
    [
      'GET',
      '/prescriptions/{id}',
      ['getPrescriptionRequest', '200', '401', '403', '404'],
    ],
    [
      'POST',
      '/prescriptions/{id}/approve',
      ['approvePrescription', '200', '400', '401', '403', '404', '409'],
    ],
    [
      'POST',
      '/prescriptions/{id}/reject',
      ['rejectPrescription', '200', '400', '401', '403', '404', '409'],
    ],
    [
      'POST',
      '/prescriptions/{id}/query',
      ['queryPrescription', '200', '400', '401', '403', '404', '409'],
    ],
    // messaging.yaml (M6a — chat sessions + admin AI documents; M6b adds the
    // Telegram webhook)
    [
      'POST',
      '/chat/session',
      ['createWebChatSession', '200', '403', '429'],
    ],
    [
      'POST',
      '/chat/session/mobile',
      ['createMobileChatSession', '200', '403', '429'],
    ],
    ['POST', '/chat/token/refresh', ['refreshMobileToken', '200', '401']],
    ['GET', '/chat/messages', ['getChatMessages', '200', '401']],
    [
      'GET',
      '/admin/ai/documents',
      ['listDocuments', '200', '403'],
    ],
    [
      'POST',
      '/admin/ai/documents',
      ['ingestDocument', '201', '400', '403', '409'],
    ],
    [
      'GET',
      '/admin/ai/documents/{documentId}',
      ['getDocument', '200', '404'],
    ],
    [
      'PUT',
      '/admin/ai/documents/{documentId}',
      ['updateDocument', '200', '404'],
    ],
    [
      'DELETE',
      '/admin/ai/documents/{documentId}',
      ['deleteDocument', '204', '404'],
    ],
    [
      'POST',
      '/admin/ai/documents/{documentId}/approve',
      ['approveDocument', '200', '404', '409'],
    ],
    [
      'POST',
      '/admin/ai/documents/{documentId}/reindex',
      ['reindexDocument', '202', '404'],
    ],
    [
      'POST',
      '/admin/ai/documents/{documentId}/archive',
      ['archiveDocument', '200', '404'],
    ],
    // messaging.yaml (M6b — Telegram staff handoff webhook)
    ['POST', '/webhooks/telegram', ['telegramWebhook', '200', '401']],
  ];

  for (const [method, path, values] of expectedOps) {
    expected.set(`${method} ${path}`, values);
  }

  let failed = false;
  for (const [key, expectedValues] of expected) {
    const liveValues = live.get(key);
    if (!liveValues) {
      console.error(`MISSING in export: ${key}`);
      failed = true;
      continue;
    }
    const [expectedOpId, ...expectedStatuses] = expectedValues;
    const [liveOpId, ...liveStatuses] = liveValues;
    if (expectedOpId !== liveOpId) {
      console.error(
        `MISMATCH ${key}: operationId expected=${expectedOpId} live=${liveOpId}`,
      );
      failed = true;
    }
    for (const status of expectedStatuses) {
      if (!liveStatuses.includes(status)) {
        console.error(`MISMATCH ${key}: missing status ${status}`);
        failed = true;
      }
    }
  }

  if (failed) {
    console.error('OpenAPI diff FAILED');
    process.exit(1);
  }
  console.log('OpenAPI diff PASSED');
}

main();
