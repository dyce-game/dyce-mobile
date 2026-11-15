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
  userIdParamSchema,
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

  /** Your friends, A-Z. */
  @Get()
  list(@CurrentUser() user: AuthContext) {
    return this.friends.list(user.userId);
  }

  /** Requests waiting for you (with mutual friend counts) and requests you sent. */
  @Get('requests')
  requests(@CurrentUser() user: AuthContext) {
    return this.friends.requests(user.userId);
  }

  @Post('requests')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  request(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(friendRequestSchema)) body: { userId: string },
  ) {
    return this.friends.sendRequest(user.userId, body.userId);
  }

  @Post('requests/:userId/accept')
  @HttpCode(200)
  accept(
    @CurrentUser() user: AuthContext,
    @Param('userId', new ZodPipe(userIdParamSchema)) userId: string,
  ) {
    return this.friends.accept(user.userId, userId);
  }

  /** "Ignore": hides the request without telling the sender. */
  @Post('requests/:userId/decline')
  @HttpCode(200)
  decline(
    @CurrentUser() user: AuthContext,
    @Param('userId', new ZodPipe(userIdParamSchema)) userId: string,
  ) {
    return this.friends.decline(user.userId, userId);
  }

  /** Withdraw a request you sent. */
  @Delete('requests/:userId')
  @HttpCode(204)
  async cancel(
    @CurrentUser() user: AuthContext,
    @Param('userId', new ZodPipe(userIdParamSchema)) userId: string,
  ): Promise<void> {
    await this.friends.cancel(user.userId, userId);
  }

  /** Remove a friend. */
  @Delete(':userId')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthContext,
    @Param('userId', new ZodPipe(userIdParamSchema)) userId: string,
  ): Promise<void> {
    await this.friends.remove(user.userId, userId);
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
