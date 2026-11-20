import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Некоректний email' })
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword: string;

  @IsString()
  @MinLength(10, { message: 'Пароль має містити щонайменше 10 символів' })
  @MaxLength(200)
  newPassword: string;
}
