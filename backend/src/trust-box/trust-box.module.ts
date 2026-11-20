import { Module } from '@nestjs/common';
import { ConsultationsController } from './consultations.controller';
import { FaqController } from './faq.controller';
import { TrustBoxController } from './trust-box.controller';

@Module({ controllers: [TrustBoxController, FaqController, ConsultationsController] })
export class TrustBoxModule {}
