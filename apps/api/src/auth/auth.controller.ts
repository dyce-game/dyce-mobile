import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  type OtpRequest,
  type OtpVerify,
  type SessionResponse,
  type SessionTokens,
} from '@dyce/shared';
import { ZodPipe } from '../common/zod.pipe.ts';
import { AuthService } from './auth.service.ts';

// Per-IP limits on top of the per-phone limits inside AuthService.
const OTP_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('otp/request')
  @HttpCode(202)
  @Throttle(OTP_THROTTLE)
  requestOtp(@Body(new ZodPipe(otpRequestSchema)) body: OtpRequest) {
    return this.auth.requestOtp(body);
  }

  @Post('otp/verify')
  @HttpCode(200)
  @Throttle(OTP_THROTTLE)
  verifyOtp(@Body(new ZodPipe(otpVerifySchema)) body: OtpVerify): Promise<SessionResponse> {
    return this.auth.verifyOtp(body);
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(
    @Body(new ZodPipe(refreshSchema)) body: { refreshToken: string },
  ): Promise<SessionTokens> {
    return this.auth.refresh(body.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body(new ZodPipe(refreshSchema)) body: { refreshToken: string }): Promise<void> {
    await this.auth.logout(body.refreshToken);
  }
}
