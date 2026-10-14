/**
 * Auth API response shapes (auth.yaml AuthData). User ids are prefixed
 * opaque strings (api-specification.md §Identifiers), never raw UUIDs.
 */
export interface AuthUserDto {
  id: string;
  email: string;
  displayName: string | null;
  kind: 'client' | 'staff';
  roles: string[];
}

export interface AuthTokensDto {
  tokens: {
    accessToken: string;
    refreshToken: string;
    tokenType: 'Bearer';
    expiresIn: number;
  };
  user: AuthUserDto;
}
