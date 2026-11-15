import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module.ts';
import { validateEnv } from './config/env.ts';
import { DbModule } from './db/db.module.ts';
import { HealthController } from './health/health.controller.ts';
import { LedgerModule } from './ledger/ledger.module.ts';
import { SocialModule } from './social/social.module.ts';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // Global per-IP ceiling; sensitive routes (OTP, refresh) tighten it with @Throttle.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    ScheduleModule.forRoot(),
    DbModule,
    LedgerModule,
    AuthModule,
    SocialModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
