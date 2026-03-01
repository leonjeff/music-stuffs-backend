import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  registerDecorator,
  ValidationOptions,
} from 'class-validator';

@ValidatorConstraint({ name: 'isAfterStart', async: false })
class IsAfterStartConstraint implements ValidatorConstraintInterface {
  validate(endTime: number, args: ValidationArguments) {
    const obj = args.object as CreateLoopDto;
    return typeof obj.startTime === 'number' && endTime > obj.startTime;
  }

  defaultMessage(args: ValidationArguments) {
    const obj = args.object as CreateLoopDto;
    return `endTime (${args.value}) debe ser mayor que startTime (${obj.startTime})`;
  }
}

function IsAfterStart(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsAfterStartConstraint,
    });
  };
}

export class CreateLoopDto {
  @IsNumber()
  @Min(0)
  startTime: number;

  @IsNumber()
  @Min(0)
  @IsAfterStart()
  endTime: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  isRecommended?: boolean;
}
