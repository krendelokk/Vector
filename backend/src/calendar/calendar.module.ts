import { Module } from '@nestjs/common';
import { AnpModule } from '../anp/anp.module';
import { CalendarController } from './calendar.controller';

@Module({ imports: [AnpModule], controllers: [CalendarController] })
export class CalendarModule {}
