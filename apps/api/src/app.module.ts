import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.ts';
import { DbModule } from './db/db.module.ts';
import { HealthController } from './health/health.controller.ts';
import { LedgerModule } from './ledger/ledger.module.ts';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DbModule,
    LedgerModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
