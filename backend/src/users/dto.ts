import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Role } from '../generated/prisma/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateUserDto {
  @IsEmail({}, { message: 'Некоректний email' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email: string;

  @IsString()
  @MinLength(10, { message: 'Пароль має містити щонайменше 10 символів' })
  @MaxLength(200)
  password: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Transform(trim)
  fullName: string;

  @IsEnum(Role)
  role: Role;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  departmentId?: string | null;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  @Transform(trim)
  fullName?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(10, { message: 'Пароль має містити щонайменше 10 символів' })
  @MaxLength(200)
  password?: string;
}

export class DepartmentDto {
  @IsString()
  @MinLength(2)
  @MaxLength(300)
  @Transform(trim)
  name: string;
}
