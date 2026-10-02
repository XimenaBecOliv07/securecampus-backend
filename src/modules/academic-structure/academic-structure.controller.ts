import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@shared/security/jwt-auth.guard';
import { PolicyGuard, CheckPolicy } from '@shared/security/policy.guard';
import { CurrentUser, AuthenticatedUser } from '@shared/security/current-user.decorator';
import { AcademicStructureService } from './academic-structure.service';

@Controller()
@UseGuards(JwtAuthGuard, PolicyGuard)
export class AcademicStructureController {
  constructor(private readonly svc: AcademicStructureService) {}

  @Post('groups')
  @CheckPolicy('group', 'create')
  createGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Body('courseId') courseId: string,
    @Body('termId') termId: string,
    @Body('code') code: string,
    @Body('capacity') capacity: number,
  ) {
    return this.svc.createGroup(user, courseId, termId, code, capacity);
  }

  @Post('groups/assign-professor')
  @CheckPolicy('group', 'create')
  assignProfessor(
    @CurrentUser() user: AuthenticatedUser,
    @Body('groupId') groupId: string,
    @Body('professorId') professorId: string,
  ) {
    return this.svc.assignProfessor(user, groupId, professorId);
  }

  @Post('enrollments')
  @CheckPolicy('enrollment', 'create')
  enroll(
    @CurrentUser() user: AuthenticatedUser,
    @Body('groupId') groupId: string,
    @Body('studentId') studentId: string,
  ) {
    return this.svc.enrollStudent(user, groupId, studentId);
  }

  @Get('me/groups')
  @CheckPolicy('group', 'read')
  myGroups(@CurrentUser() user: AuthenticatedUser) {
    return this.svc.myGroups(user);
  }
}
