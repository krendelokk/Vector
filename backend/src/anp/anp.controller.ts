import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { Audit, CurrentUser, Roles } from '../common/decorators';
import { assertAllowedFile, decodeFileName, uploadOptions } from '../common/files/file-validation';
import { StorageService } from '../common/files/storage.service';
import { AuthUser, Role } from '../common/types';
import { ANP_ROLES, AnpService } from './anp.service';
import { AnpQueryDto, CreateAnpItemDto, ReviewDto, SubmitReportDto, UpdateAnpItemDto } from './dto';

@Controller('anp')
export class AnpController {
  constructor(
    private readonly anp: AnpService,
    private readonly storage: StorageService,
  ) {}

  @Get('items')
  @Roles(...ANP_ROLES)
  list(@CurrentUser() user: AuthUser, @Query() q: AnpQueryDto) {
    return this.anp.list(user, q);
  }

  @Get('stats')
  @Roles(...ANP_ROLES)
  stats(@CurrentUser() user: AuthUser) {
    return this.anp.stats(user);
  }

  @Get('items/:id')
  @Roles(...ANP_ROLES)
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.anp.get(user, id);
  }

  @Get('items/:id/attachment')
  @Roles(...ANP_ROLES)
  async download(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const file = await this.anp.attachment(user, id);
    this.storage.send(res, file.key, file.name);
  }

  @Post('items')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('ANP_CREATE', 'ANPItem')
  create(@Body() dto: CreateAnpItemDto) {
    return this.anp.create(dto);
  }

  @Patch('items/:id')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('ANP_UPDATE', 'ANPItem')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAnpItemDto) {
    return this.anp.update(id, dto);
  }

  @Delete('items/:id')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('ANP_DELETE', 'ANPItem')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.anp.remove(id);
  }

  @Patch('items/:id/submit')
  @Roles(Role.RESPONSIBLE_PERSON, Role.INSTITUTE_DIRECTOR)
  @Audit('ANP_SUBMIT', 'ANPItem')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  submit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitReportDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) assertAllowedFile(file);
    return this.anp.submit(
      user,
      id,
      dto.reportText,
      file ? { buffer: file.buffer, name: decodeFileName(file.originalname) } : undefined,
    );
  }

  @Patch('items/:id/review')
  @Roles(Role.COMPLIANCE_OFFICER)
  @Audit('ANP_REVIEW', 'ANPItem')
  review(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDto) {
    return this.anp.review(user, id, dto);
  }
}
