import { Module } from '@nestjs/common';
import { AnpModule } from '../anp/anp.module';
import { DashboardController } from './dashboard.controller';

@Module({ imports: [AnpModule], controllers: [DashboardController] })
export class DashboardModule {}
