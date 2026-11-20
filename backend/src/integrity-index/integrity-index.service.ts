import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UploadChannel } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../common/files/storage.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { computeIntegrityIndex, FORMULA_VERSION } from './integrity-formula';
import { parseSurveyFile } from './survey-parser';

export interface ImportInput {
  buffer: Buffer;
  fileName: string;
  ext: string;
  periodLabel: string;
  scaleMin?: number;
  scaleMax?: number;
  channel?: UploadChannel;
}

@Injectable()
export class IntegrityIndexService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditLogService,
  ) {}

  /** Спільна точка імпорту для вебінтерфейсу й Telegram-бота. */
  async importSurvey(uploaderId: string, input: ImportInput) {
    const periodLabel = input.periodLabel?.trim();
    if (!periodLabel) throw new BadRequestException('Вкажіть період опитування, наприклад "2026, весна"');

    const { headers, rows } = parseSurveyFile(input.buffer, input.ext);
    let result;
    try {
      result = computeIntegrityIndex(headers, rows, {
        scaleMin: input.scaleMin ?? 1,
        scaleMax: input.scaleMax ?? 5,
      });
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }

    const rawFileUrl = await this.storage.save('surveys', input.buffer, input.fileName);
    const created = await this.prisma.surveyImport.create({
      data: {
        uploadedById: uploaderId,
        periodLabel,
        rawFileUrl,
        rawFileName: input.fileName,
        channel: input.channel ?? UploadChannel.WEB,
        respondentsCount: result.respondents,
        integrityIndex: result.index,
        riskAreas: { areas: result.areas, questions: result.questions } as any,
        formulaVersion: FORMULA_VERSION,
      },
    });
    await this.audit.log(uploaderId, 'SURVEY_IMPORT', 'SurveyImport', created.id, { channel: created.channel });
    return this.toOfficerView(created);
  }

  async listAll() {
    const items = await this.prisma.surveyImport.findMany({
      orderBy: { createdAt: 'asc' },
      include: { uploadedBy: { select: { fullName: true } } },
    });
    return items.map((i) => ({ ...this.toOfficerView(i), uploadedBy: i.uploadedBy.fullName }));
  }

  /** Для інших ролей: лише опубліковані агреговані дані, без посилань на файли. */
  async listPublished() {
    const items = await this.prisma.surveyImport.findMany({
      where: { published: true },
      orderBy: { createdAt: 'asc' },
    });
    return items.map((i) => ({
      id: i.id,
      periodLabel: i.periodLabel,
      integrityIndex: i.integrityIndex,
      respondentsCount: i.respondentsCount,
      riskAreas: i.riskAreas,
      publishedAt: i.publishedAt,
    }));
  }

  async setPublished(id: string, published: boolean) {
    const item = await this.prisma.surveyImport.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Імпорт не знайдено');
    const min = Number(process.env.MIN_RESPONDENTS_TO_PUBLISH ?? 5);
    if (published && item.respondentsCount < min) {
      throw new BadRequestException(
        `Для збереження анонімності потрібно щонайменше ${min} респондентів (зараз ${item.respondentsCount})`,
      );
    }
    const updated = await this.prisma.surveyImport.update({
      where: { id },
      data: { published, publishedAt: published ? new Date() : null },
    });
    return this.toOfficerView(updated);
  }

  async rawFile(id: string) {
    const item = await this.prisma.surveyImport.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Імпорт не знайдено');
    return { key: item.rawFileUrl, name: item.rawFileName };
  }

  async remove(id: string) {
    const item = await this.prisma.surveyImport.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Імпорт не знайдено');
    await this.prisma.surveyImport.delete({ where: { id } });
    await this.storage.remove(item.rawFileUrl);
    return { id };
  }

  private toOfficerView(i: {
    id: string; periodLabel: string; rawFileName: string; channel: UploadChannel; respondentsCount: number;
    integrityIndex: number; riskAreas: unknown; formulaVersion: string; published: boolean; publishedAt: Date | null; createdAt: Date;
  }) {
    return {
      id: i.id,
      periodLabel: i.periodLabel,
      rawFileName: i.rawFileName,
      channel: i.channel,
      respondentsCount: i.respondentsCount,
      integrityIndex: i.integrityIndex,
      riskAreas: i.riskAreas,
      formulaVersion: i.formulaVersion,
      published: i.published,
      publishedAt: i.publishedAt,
      createdAt: i.createdAt,
    };
  }
}
