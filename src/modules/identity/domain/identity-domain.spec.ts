import { HttpException } from '@nestjs/common';
import { Email } from './email';
import { Password } from './password';
import { permissionsForRoles, ROLE_PERMISSIONS } from './role-permissions';

describe('identity/domain', () => {
  describe('Email', () => {
    it('normalizes to lowercase and trims', () => {
      expect(Email.create('  User@Example.COM ').toString()).toBe(
        'user@example.com',
      );
    });

    it('accepts a valid address', () => {
      expect(() => Email.create('a.b+tag@sub.example.co')).not.toThrow();
    });

    it.each(['plain', 'a@b', 'a @b.com', '@example.com', 'a@.com'])(
      'rejects %s',
      (raw) => {
        expect(() => Email.create(raw)).toThrow('Invalid email address.');
      },
    );

    it('compares by normalized value', () => {
      expect(Email.create('a@b.com').equals(Email.create('A@B.com '))).toBe(
        true,
      );
      expect(Email.create('a@b.com').equals(Email.create('c@d.com'))).toBe(
        false,
      );
    });
  });

  describe('Password', () => {
    it('accepts a password of exactly the minimum length', () => {
      expect(() => Password.create('x'.repeat(10))).not.toThrow();
    });

    it('rejects a password below the minimum length', () => {
      expect(() => Password.create('x'.repeat(9))).toThrow(
        'Password must be at least 10 characters.',
      );
    });

    it('preserves the plaintext for the hasher', () => {
      expect(Password.create('correct horse battery').toString()).toBe(
        'correct horse battery',
      );
    });
  });

  describe('role → permission map (ADR-0011)', () => {
    it('gives the client role no staff permissions', () => {
      expect(ROLE_PERMISSIONS.client).toEqual([]);
      expect(permissionsForRoles(['client'])).toEqual([]);
    });

    it('maps veterinarian to rx:review only', () => {
      expect(permissionsForRoles(['veterinarian'])).toEqual(['rx:review']);
    });

    it('maps practice_manager to ops + Rx review + catalog writes', () => {
      expect(permissionsForRoles(['practice_manager']).sort()).toEqual(
        ['catalog:write', 'ops:inbox', 'ops:read', 'rx:review'].sort(),
      );
    });

    it('accumulates additively across roles', () => {
      const permissions = permissionsForRoles([
        'receptionist',
        'practice_manager',
      ]);
      expect(permissions.sort()).toEqual(
        ['catalog:write', 'ops:inbox', 'ops:read', 'rx:review'].sort(),
      );
    });

    it('deduplicates overlapping permissions', () => {
      const permissions = permissionsForRoles([
        'receptionist',
        'practice_manager',
      ]);
      expect(new Set(permissions).size).toBe(permissions.length);
    });

    it('ignores unknown roles instead of throwing', () => {
      expect(permissionsForRoles(['made_up_role'])).toEqual([]);
    });
  });
});

describe('HttpException code surface', () => {
  it('EMAIL_TAKEN conflicts (409)', () => {
    const err = new HttpException({ code: 'EMAIL_TAKEN', message: 'x' }, 409);
    expect(err.getStatus()).toBe(409);
    expect((err.getResponse() as { code: string }).code).toBe('EMAIL_TAKEN');
  });
});
