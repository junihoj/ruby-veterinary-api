/**
 * Development-only credentials shared by `prisma/seed.ts` (which hashes the
 * password at seed runtime) and the e2e suite (which logs in with it).
 * Never a production secret — this file must never hold real credentials.
 */
export const CATALOG_MANAGER_EMAIL = 'grace@ruby-veterinary.example.com';
export const CATALOG_MANAGER_PASSWORD = 'catalog-manager-dev-2026';
