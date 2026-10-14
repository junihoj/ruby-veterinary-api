import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

export interface UserWithRoles {
  id: string;
  email: string;
  passwordHash: string;
  displayName: string | null;
  phone: string | null;
  kind: 'client' | 'staff';
  status: 'active' | 'suspended' | 'deleted';
  lastLoginAt: Date | null;
  roles: string[];
}

/**
 * User repository (identity). The only place outside this class that may
 * import prisma.* for identity users (ESLint boundary, §10).
 */
@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<UserWithRoles | null> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { roles: { include: { role: true } } },
    });
    return user ? this.toWithRoles(user) : null;
  }

  async findById(id: string): Promise<UserWithRoles | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { roles: { include: { role: true } } },
    });
    return user ? this.toWithRoles(user) : null;
  }

  async create(data: {
    email: string;
    passwordHash: string;
    displayName?: string;
    phone?: string;
  }): Promise<UserWithRoles> {
    const user = await this.prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash: data.passwordHash,
        displayName: data.displayName ?? null,
        phone: data.phone ?? null,
        kind: 'client',
        status: 'active',
        roles: {
          create: {
            role: { connect: { code: 'client' } },
            grantedAt: new Date(),
          },
        },
      },
      include: { roles: { include: { role: true } } },
    });
    return this.toWithRoles(user);
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    });
  }

  private toWithRoles(user: {
    id: string;
    email: string;
    passwordHash: string;
    displayName: string | null;
    phone: string | null;
    kind: string;
    status: string;
    lastLoginAt: Date | null;
    roles?: Array<{ role: { code: string } }>;
  }): UserWithRoles {
    return {
      id: user.id,
      email: user.email,
      passwordHash: user.passwordHash,
      displayName: user.displayName,
      phone: user.phone,
      kind: user.kind as 'client' | 'staff',
      status: user.status as 'active' | 'suspended' | 'deleted',
      lastLoginAt: user.lastLoginAt,
      roles: (user.roles ?? []).map((ur) => ur.role.code),
    };
  }
}
