import { Module } from '@nestjs/common';
import type pg from 'pg';
import { AuthModule } from '../auth/auth.module.ts';
import { validateEnv } from '../config/env.ts';
import { PG_POOL } from '../db/db.module.ts';
import { ContactsService } from './contacts.service.ts';
import { FriendsService } from './friends.service.ts';
import { ContactsController, FriendsController, UsersController } from './social.controller.ts';

@Module({
  imports: [AuthModule], // for AuthGuard / TokenService
  controllers: [ContactsController, FriendsController, UsersController],
  providers: [
    {
      provide: ContactsService,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool) =>
        new ContactsService(pool, validateEnv(process.env).PHONE_HASH_SALT),
    },
    {
      provide: FriendsService,
      inject: [PG_POOL],
      useFactory: (pool: pg.Pool) => new FriendsService(pool),
    },
  ],
})
export class SocialModule {}
