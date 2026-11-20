import { Module } from '@nestjs/common';
import { IntegrityIndexController } from './integrity-index.controller';
import { IntegrityIndexService } from './integrity-index.service';

@Module({
  controllers: [IntegrityIndexController],
  providers: [IntegrityIndexService],
  exports: [IntegrityIndexService],
})
export class IntegrityIndexModule {}
