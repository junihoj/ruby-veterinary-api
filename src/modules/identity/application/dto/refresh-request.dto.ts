import { IsString } from 'class-validator';

/** POST /auth/refresh and /auth/logout request body (auth.yaml). */
export class RefreshRequestDto {
  @IsString()
  refreshToken: string;
}
