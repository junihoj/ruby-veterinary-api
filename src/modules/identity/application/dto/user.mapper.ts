import { PrefixedId } from '../../../../shared/kernel/domain/prefixed-id';
import { AuthUserDto } from '../dto/auth-response.dto';

/** The user fields the auth API serialises. */
export interface AuthUserProjection {
  id: string;
  email: string;
  displayName: string | null;
  kind: 'client' | 'staff';
  roles: string[];
}

/** Serialises a user projection to the API shape (prefixed id, role codes). */
export function toAuthUserDto(user: AuthUserProjection): AuthUserDto {
  return {
    id: PrefixedId.format('user', user.id),
    email: user.email,
    displayName: user.displayName,
    kind: user.kind,
    roles: user.roles,
  };
}
