import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { Response } from 'express';
import { Audit, CurrentUser, Roles } from '../common/decorators';
import { assertAllowedFile, decodeFileName, SURVEY_EXTENSIONS, uploadOptions } from '../common/files/file-validation';
import { StorageService } from '../common/files/storage.service';
import { AuthUser, Role, STAFF_ROLES } from '../common/types';
import { IntegrityIndexService } from './integrity-index.service';

class ImportDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  periodLabel: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  scaleMin?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  scaleMax?: number;
}

@Controller('integrity-index')
export class IntegrityIndexController {
  constructor(
    private readonly service: IntegrityIndexService,
    private readonly storage: StorageService,
  ) {}

  @Post('import')
  @Roles(Role.COMPLIANCE_OFFICER)
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  import(@CurrentUser() user: AuthUser, @Body() dto: ImportDto, @UploadedFile() file?: Express.Multer.File) {
    const ext = assertAllowedFile(file, SURVEY_EXTENSIONS);
    return this.service.importSurvey(user.id, {
      buffer: file!.buffer,
      fileName: decodeFileName(file!.originalname),
      ext,
      periodLabel: dto.periodLabel,
      scaleMin: dto.scaleMin,
      scaleMax: dto.scaleMax,
    });
  }

  @Get('imports')
  @Roles(Role.COMPLIANCE_OFFICER)
  listAll() {
    return this.service.listAll();
  }

  @Get('published')
  @Roles(...STAFF_ROLES)
  published() {
    return this.service.listPublished();
  }

  @Post(':id/publish')
  @HttpCode(200)
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('INTEGRITY_PUBLISH', 'SurveyImport')
  publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.setPublished(id, true);
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('INTEGRITY_UNPUBLISH', 'SurveyImport')
  unpublish(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.setPublished(id, false);
  }

  /** Сирі дані опитування: виключно уповноважений. */
  @Get('raw/:id')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('SURVEY_RAW_DOWNLOAD', 'SurveyImport')
  async raw(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const file = await this.service.rawFile(id);
    this.storage.send(res, file.key, file.name);
  }

  @Delete(':id')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('SURVEY_DELETE', 'SurveyImport')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
