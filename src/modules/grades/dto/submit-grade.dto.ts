import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class GradeEntryDto {
  @IsUUID()
  enrollmentId: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  value: number;
}

export class SubmitGradesDto {
  @IsUUID()
  groupId: string;

  @IsIn(['PARCIAL1', 'PARCIAL2', 'FINAL'])
  component: string;

  @ValidateNested({ each: true })
  @Type(() => GradeEntryDto)
  entries: GradeEntryDto[];

  @IsString()
  idempotencyKey: string;
}

export class CorrectGradeDto {
  @IsUUID()
  gradeId: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  value: number;

  @IsString()
  reason: string; // obligatorio: ninguna correccion sin motivo

  @IsOptional()
  @IsUUID()
  approvedBy?: string; // Jefe de Carrera que aprueba la rectificacion
}
