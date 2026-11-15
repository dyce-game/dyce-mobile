import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { z } from 'zod';
import {
  contactsMatchSchema,
  friendRequestSchema,
  usernameSchema,
  type ContactsMatchRequest,
} from '@dyce/shared';
import { AuthGuard, CurrentUser, type AuthContext } from '../auth/auth.guard.ts';
import { ZodPipe } from '../common/zod.pipe.ts';
import { ContactsService } from './contacts.service.ts';
import { FriendsService } from './friends.service.ts';

@Controller('contacts')
@UseGuards(AuthGuard)
export class ContactsController {
  constructor(@Inject(ContactsService) private readonly contacts: ContactsService) {}

  /** Batch of up to 500 E.164 numbers. The body is never logged. */
  @Post('match')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  match(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(contactsMatchSchema)) body: ContactsMatchRequest,
  ) {
    return this.contacts.match(user.userId, body.numbers);
  }

  @Get('suggestions')
  suggestions(@CurrentUser() user: AuthContext) {
    return this.contacts.suggestions(user.userId);
  }

  /** Forget the contacts we stored from this user's address book. */
  @Delete()
  @HttpCode(204)
  async clear(@CurrentUser() user: AuthContext): Promise<void> {
    await this.contacts.clear(user.userId);
  }
}

@Controller('friends')
@UseGuards(AuthGuard)
export class FriendsController {
  constructor(@Inject(FriendsService) private readonly friends: FriendsService) {}

  @Post('requests')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  request(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(friendRequestSchema)) body: { userId: string },
  ) {
    return this.friends.sendRequest(user.userId, body.userId);
  }
}

const usernameParam = usernameSchema; // lower-cases and validates the format

@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(@Inject(FriendsService) private readonly friends: FriendsService) {}

  /** "Find by username": exact match only (no prefix search here, so it can't be used to browse users). */
  @Get('by-username/:username')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  byUsername(
    @CurrentUser() user: AuthContext,
    @Param('username', new ZodPipe(usernameParam)) username: z.output<typeof usernameParam>,
  ) {
    return this.friends.findByUsername(user.userId, username);
  }
}
