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
import { z } from 'zod';
import {
  ageGateSchema,
  clientStepSchema,
  profileCreateSchema,
  usernameSchema,
  type ClientStep,
  type ProfileCreate,
} from '@dyce/shared';
import { AuthGuard, CurrentUser, type AuthContext } from '../auth/auth.guard.ts';
import { ZodPipe } from '../common/zod.pipe.ts';
import { ProfileService } from './profile.service.ts';

const usernameQuery = z.object({ username: usernameSchema });

@Controller()
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(@Inject(ProfileService) private readonly profiles: ProfileService) {}

  @Get('me')
  me(@CurrentUser() user: AuthContext) {
    return this.profiles.getMe(user.userId);
  }

  /** Live availability for the username screen (the app debounces). */
  @Get('profile/username/check')
  checkUsername(@Query(new ZodPipe(usernameQuery)) query: { username: string }) {
    return this.profiles.checkUsername(query.username);
  }

  @Post('profile')
  @HttpCode(201)
  createProfile(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(profileCreateSchema)) body: ProfileCreate,
  ) {
    return this.profiles.createProfile(user.userId, body);
  }

  @Post('profile/age-gate')
  @HttpCode(200)
  ageGate(
    @CurrentUser() user: AuthContext,
    @Body(new ZodPipe(ageGateSchema)) body: { birthYear: number },
  ) {
    return this.profiles.setBirthYear(user.userId, body.birthYear);
  }

  /** The client reports a finished (or skipped) step: contacts, avatar or notifications. */
  @Post('onboarding/steps/:step')
  @HttpCode(200)
  completeStep(
    @CurrentUser() user: AuthContext,
    @Param('step', new ZodPipe(clientStepSchema)) step: ClientStep,
  ) {
    return this.profiles.completeStep(user.userId, step);
  }

  @Post('onboarding/welcome-bonus')
  @HttpCode(200)
  welcomeBonus(@CurrentUser() user: AuthContext) {
    return this.profiles.claimWelcomeBonus(user.userId);
  }
}
