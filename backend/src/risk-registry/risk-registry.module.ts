import { Module } from '@nestjs/common';
import { RiskRegistryController } from './risk-registry.controller';

@Module({ controllers: [RiskRegistryController] })
export class RiskRegistryModule {}
