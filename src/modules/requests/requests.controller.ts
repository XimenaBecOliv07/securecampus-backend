import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@shared/security/jwt-auth.guard';
import { PolicyGuard, CheckPolicy } from '@shared/security/policy.guard';
import { CurrentUser, AuthenticatedUser } from '@shared/security/current-user.decorator';
import { RequestsService } from './requests.service';
import { RequestStatus } from './entities/request.entity';

@Controller('requests')
@UseGuards(JwtAuthGuard, PolicyGuard)
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Post()
  @CheckPolicy('request', 'create')
  create(@CurrentUser() user: AuthenticatedUser, @Body('type') type: string, @Body('description') description?: string) {
    return this.requests.create(user, type, description);
  }

  @Get('mine')
  @CheckPolicy('request', 'read')
  mine(@CurrentUser() user: AuthenticatedUser) {
    return this.requests.myRequests(user);
  }

  @Post(':id/transition')
  @CheckPolicy('request', 'read')
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body('toStatus') toStatus: RequestStatus,
    @Body('comment') comment?: string,
  ) {
    return this.requests.transition(user, id, toStatus, comment);
  }
}
