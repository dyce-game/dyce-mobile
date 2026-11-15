import { Inject, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import type { OnApplicationBootstrap } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { Server } from 'node:http';
import type pg from 'pg';
import { AuthModule } from '../auth/auth.module.ts';
import { TokenService } from '../auth/tokens.ts';
import { PG_POOL } from '../db/db.module.ts';
import { ChatController } from './chat.controller.ts';
import { RealtimeHub } from './hub.ts';
import { MessagesService } from './messages.service.ts';
import { RealtimeServer } from './realtime.server.ts';

/** Starts the WebSocket endpoint on the same HTTP server (and port) as the REST API. */
@Injectable()
export class RealtimeLifecycle implements OnApplicationBootstrap, OnApplicationShutdown {
  private server?: RealtimeServer;

  constructor(
    @Inject(HttpAdapterHost) private readonly host: HttpAdapterHost,
    @Inject(TokenService) private readonly tokens: TokenService,
    @Inject(RealtimeHub) private readonly hub: RealtimeHub,
    @Inject(MessagesService) private readonly messages: MessagesService,
  ) {}

  onApplicationBootstrap(): void {
    const http = this.host.httpAdapter.getHttpServer() as Server;
    this.server = new RealtimeServer(http, this.tokens, this.hub, this.messages);
    this.server.attach();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.server?.close();
  }
}

@Module({
  imports: [AuthModule], // AuthGuard, TokenService
  controllers: [ChatController],
  providers: [
    RealtimeHub,
    {
      provide: MessagesService,
      inject: [PG_POOL, RealtimeHub],
      useFactory: (pool: pg.Pool, hub: RealtimeHub) => new MessagesService(pool, hub),
    },
    RealtimeLifecycle,
  ],
})
export class ChatModule {}
