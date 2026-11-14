import { Module } from '@nestjs/common';
import type pg from 'pg';
import { PG_POOL } from '../db/db.module.ts';
import { LedgerRepo } from './ledger.repo.ts';

@Module({
  providers: [
    {
      provide: LedgerRepo,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool): LedgerRepo => new LedgerRepo(pool),
    },
  ],
  exports: [LedgerRepo],
})
export class LedgerModule {}
