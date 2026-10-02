import { Body, Controller, Get, Param, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@shared/security/jwt-auth.guard';
import { PolicyGuard, CheckPolicy } from '@shared/security/policy.guard';
import { CurrentUser, AuthenticatedUser } from '@shared/security/current-user.decorator';
import { ProfilesService } from './profiles.service';

@Controller()
@UseGuards(JwtAuthGuard, PolicyGuard)
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get('me/profile')
  @CheckPolicy('profile', 'read-own')
  getMine(@CurrentUser() user: AuthenticatedUser) {
    return this.profiles.getMyProfile(user);
  }

  @Put('me/profile')
  @CheckPolicy('profile', 'update-own')
  updateMine(
    @CurrentUser() user: AuthenticatedUser,
    @Body() data: { firstName?: string; lastName?: string; phone?: string },
  ) {
    return this.profiles.updateMyProfile(user, data);
  }

  @Get('users/:id/profile')
  @CheckPolicy('profile', 'read-own') // la restriccion fina (solo ADMIN o self) vive en el service
  getOther(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.profiles.getProfileOf(user, id);
  }
}
