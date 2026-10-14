import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

/** POST /auth/register request body (auth.yaml). */
export class RegisterRequestDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(10)
  password: string;

  @IsOptional()
  @IsString()
  displayName?: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
