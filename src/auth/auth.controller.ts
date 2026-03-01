import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './decorators/current-user.decorator';

@Controller('auth')
export class AuthController {
  @Get('me')
  me(@CurrentUser() user: { sub: string; email?: string; roles: string[] }) {
    return {
      id: user.sub,
      email: user.email,
      roles: user.roles,
    };
  }
}
