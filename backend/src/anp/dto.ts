import { Transform, Type } from 'class-transformer';
import { IsDate, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { ANPStatus } from '../generated/prisma/enums';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateAnpItemDto {
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Transform(trim)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @Type(() => Date)
  @IsDate({ message: 'Некоректна дата дедлайну' })
  deadline: Date;

  @IsUUID()
  departmentId: string;

  @IsUUID()
  responsibleId: string;
}

export class UpdateAnpItemDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  @Transform(trim)
  title?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(5000)
  description?: string | null;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  deadline?: Date;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  responsibleId?: string;
}

/** multipart/form-data: reportText + необов'язковий файл "file". */
export class SubmitReportDto {
  @IsString()
  @MinLength(10, { message: 'Опишіть виконання хоча б кількома реченнями' })
  @MaxLength(20000)
  reportText: string;
}

export class ReviewDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision: 'APPROVE' | 'REJECT';

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  comment?: string;
}

export class AnpQueryDto {
  @IsOptional()
  @IsEnum(ANPStatus)
  status?: ANPStatus;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}
