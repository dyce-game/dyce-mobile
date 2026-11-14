import { Logger, Module } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type pg from 'pg';
import { validateEnv } from '../config/env.ts';
import { PG_POOL } from '../db/db.module.ts';
import { LedgerModule } from '../ledger/ledger.module.ts';
import { LedgerRepo } from '../ledger/ledger.repo.ts';
import { ProfileController } from '../profile/profile.controller.ts';
import { ProfileService } from '../profile/profile.service.ts';
import { buildSmsProvider } from '../sms/sms.factory.ts';
import type { SmsProvider } from '../sms/sms-provider.ts';
import { AuthController } from './auth.controller.ts';
import { AuthGuard } from './auth.guard.ts';
import { AuthService } from './auth.service.ts';
import { TokenService } from './tokens.ts';

const SMS_PROVIDER = Symbol('SMS_PROVIDER');
const log = new Logger('Auth');

/** Nightly housekeeping for spent OTP challenges and long-dead refresh tokens. */
export class AuthMaintenance {
  constructor(private readonly auth: AuthService) {}

  @Cron('0 3 * * *')
  async purge(): Promise<void> {
    const r = await this.auth.purgeExpired();
    log.log(`purged ${r.otp} otp challenges and ${r.refresh} refresh tokens`);
  }
}

@Module({
  imports: [LedgerModule],
  controllers: [AuthController, ProfileController],
  providers: [
    {
      provide: TokenService,
      useFactory: () => {
        // ConfigModule has already validated and loaded the environment by the time providers are built.
        const env = validateEnv(process.env);
        return new TokenService(env.JWT_SECRET, { accessTtlSeconds: env.JWT_ACCESS_TTL_SECONDS });
      },
    },
    {
      provide: SMS_PROVIDER,
      useFactory: (): SmsProvider =>
        buildSmsProvider(validateEnv(process.env), (err) =>
          log.warn(`sms delivery failed via ${err.provider}`),
        ),
    },
    {
      provide: AuthService,
      inject: [PG_POOL, SMS_PROVIDER, TokenService],
      useFactory: (pool: pg.Pool, sms: SmsProvider, tokens: TokenService) => {
        const env = validateEnv(process.env);
        return new AuthService(
          pool,
          sms,
          tokens,
          {
            phoneSecret: env.PHONE_HASH_SALT,
            otpTtlSeconds: env.OTP_TTL_SECONDS,
            refreshTtlDays: env.REFRESH_TTL_DAYS,
            otpTestCode: env.OTP_TEST_CODE,
          },
          () => new Date(),
          { warn: (m) => log.warn(m) },
        );
      },
    },
    {
      provide: ProfileService,
      inject: [PG_POOL, LedgerRepo],
      useFactory: (pool: pg.Pool, ledger: LedgerRepo) => new ProfileService(pool, ledger),
    },
    {
      provide: AuthMaintenance,
      inject: [AuthService],
      useFactory: (auth: AuthService) => new AuthMaintenance(auth),
    },
    AuthGuard,
  ],
  exports: [TokenService, AuthGuard],
})
export class AuthModule {}
