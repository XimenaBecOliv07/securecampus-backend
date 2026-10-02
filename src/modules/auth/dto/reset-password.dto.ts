import { IsEmail, IsString, MinLength } from 'class-validator';

export class RequestResetDto {
  @IsEmail()
  email: string;
}

export class ConfirmResetDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(12)
  newPassword: string;
}
