import { IsEmail, IsString } from 'class-validator';

/** POST /auth/login request body (auth.yaml). */
export class LoginRequestDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
