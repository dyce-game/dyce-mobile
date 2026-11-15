import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  conversationIdParamSchema,
  listConversationsQuerySchema,
  messagesQuerySchema,
  openDirectSchema,
  sendMessageSchema,
  type MessagesQuery,
  type OpenDirectRequest,
  type SendMessageRequest,
} from '@dyce/shared';
import type { z } from 'zod';
import { AuthGuard, CurrentUser, type AuthContext } from '../auth/auth.guard.ts';
import { ZodPipe } from '../common/zod.pipe.ts';
import { MessagesService } from './messages.service.ts';

const idPipe = new ZodPipe(conversationIdParamSchema);

@Controller('conversations')
@UseGuards(AuthGuard)
export class ChatController {
  constructor(@Inject(MessagesService) private readonly messages: MessagesService) {}

  /** `?filter=all|friends|requests` */
  @Get()
  list(
    @CurrentUser() user: AuthContext,
    @Query(new ZodPipe(listConversationsQuerySchema))
    query: z.output<typeof listConversationsQuerySchema>,
  ) {
    return this.messages.list(user.userId, query.filter);
  }

  /** Opens (or creates) your conversation with one person. Sends nothing. */
  @Post('direct')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  openDirect(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(openDirectSchema)) body: OpenDirectRequest,
  ) {
    return this.messages.openDirect(user.userId, body.userId);
  }

  @Get(':id')
  get(@CurrentUser() user: AuthContext, @Param('id', idPipe) id: string) {
    return this.messages.get(user.userId, id);
  }

  /** Newest first; pass the returned `nextCursor` as `before` for older ones. */
  @Get(':id/messages')
  history(
    @CurrentUser() user: AuthContext,
    @Param('id', idPipe) id: string,
    @Query(new ZodPipe(messagesQuerySchema)) query: MessagesQuery,
  ) {
    return this.messages.messages(user.userId, id, query);
  }

  /** The client chooses the message id, so retrying a failed send is safe. */
  @Post(':id/messages')
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  send(
    @CurrentUser() user: AuthContext,
    @Param('id', idPipe) id: string,
    @Body(new ZodPipe(sendMessageSchema)) body: SendMessageRequest,
  ) {
    return this.messages.send(user.userId, id, body);
  }

  @Post(':id/read')
  @HttpCode(200)
  read(@CurrentUser() user: AuthContext, @Param('id', idPipe) id: string) {
    return this.messages.markRead(user.userId, id);
  }

  @Post(':id/accept')
  @HttpCode(200)
  accept(@CurrentUser() user: AuthContext, @Param('id', idPipe) id: string) {
    return this.messages.accept(user.userId, id);
  }

  /** "Decline": hides the request; the sender is not told. */
  @Post(':id/decline')
  @HttpCode(204)
  async decline(@CurrentUser() user: AuthContext, @Param('id', idPipe) id: string): Promise<void> {
    await this.messages.decline(user.userId, id);
  }
}
