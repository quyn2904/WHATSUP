import { ErrorDetailDto } from '@/common/dto/error-detail.dto';
import { ErrorDto } from '@/common/dto/error.dto';
import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
  UnprocessableEntityException,
  ValidationError,
} from '@nestjs/common';
import { STATUS_CODES } from 'http';
import { AllConfigType } from '@/config/config.type';
import { ConfigService } from '@nestjs/config';
import { ValidationException } from '@/exceptions/validation.exception';
import { ErrorCode } from '@/constants/error-code.constant';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private debug: boolean = false;
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly configService: ConfigService<AllConfigType>) {}

  catch(exception: any, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    this.debug = this.configService.getOrThrow('app.debug', { infer: true });

    let error: ErrorDto;

    if (exception instanceof UnprocessableEntityException) {
      error = this.handleUnprocessableEntityException(exception);
    } else if (exception instanceof ValidationException) {
      error = this.handleValidationException(exception);
    } else if (exception instanceof HttpException) {
      error = this.handleHttpException(exception);
    } else if (exception instanceof PrismaClientKnownRequestError) {
      error = this.handleQueryFailedError(exception);
    } else {
      error = this.handleError(exception);
    }

    response.status(error.statusCode).json(error);
  }

  private extractValidationErrorDetails(
    errors: ValidationError[],
  ): ErrorDetailDto[] {
    const extractErrors = (
      error: ValidationError,
      parentProperty: string = '',
    ): ErrorDetailDto[] => {
      const propertyPath = parentProperty
        ? `${parentProperty}.${error.property}`
        : error.property;

      const currentErrors: ErrorDetailDto[] = Object.entries(
        error.constraints || {},
      ).map(([code, message]) => ({
        property: propertyPath,
        code,
        message,
      }));

      const childErrors: ErrorDetailDto[] = error.children.flatMap(
        (childError) => extractErrors(childError, propertyPath) || [],
      );

      return [...currentErrors, ...childErrors];
    };

    return errors.flatMap((error) => extractErrors(error));
  }

  private handleUnprocessableEntityException(
    exception: UnprocessableEntityException,
  ): ErrorDto {
    const r = exception.getResponse() as { message: ValidationError[] };
    const statusCode = exception.getStatus();

    const errorResponse: ErrorDto = {
      timeStamp: new Date().toISOString(),
      statusCode,
      message: 'Validation failed',
      error: STATUS_CODES[statusCode],
      details: this.extractValidationErrorDetails(r.message),
    };

    this.logger.debug(exception);

    return errorResponse;
  }

  private handleError(error: Error): ErrorDto {
    const statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    const errorResponse: ErrorDto = {
      timeStamp: new Date().toISOString(),
      statusCode,
      error: STATUS_CODES[statusCode],
      message: error?.message || 'An unexpected error occurred',
    };

    this.logger.error(error);

    return errorResponse;
  }

  private handleValidationException(exception: ValidationException): ErrorDto {
    const r = exception.getResponse() as {
      errorCode: ErrorCode;
      message: string;
    };
    const statusCode = exception.getStatus();

    const errorResponse: ErrorDto = {
      timeStamp: new Date().toISOString(),
      statusCode,
      error: STATUS_CODES[statusCode],
      errorCode:
        Object.keys(ErrorCode)[Object.values(ErrorCode).indexOf(r.errorCode)],
      message: r.message,
    };

    this.logger.debug(exception);

    return errorResponse;
  }

  private handleHttpException(exception: HttpException): ErrorDto {
    const statusCode = exception.getStatus();
    const errorResponse = {
      timeStamp: new Date().toISOString(),
      statusCode,
      error: STATUS_CODES[statusCode],
      message: exception.message,
    };

    this.logger.debug(exception);

    return errorResponse;
  }

  private handleQueryFailedError(
    error: PrismaClientKnownRequestError,
  ): ErrorDto {
    const r = error as PrismaClientKnownRequestError;

    // if (r.code === 'P2002') {
    //   const status = HttpStatus.CONFLICT;

    //   const constraintFailedField = (r.meta?.target as string[])
    //     .flatMap((field) => `${field} is already existed`)
    //     .join('\n');

    //   errorResponse = {
    //     timeStamp: new Date().toISOString(),
    //     statusCode: status,
    //     error: STATUS_CODES[status],
    //     message: constraintFailedField,
    //   };
    // } else {
    const statusCode = HttpStatus.BAD_REQUEST;
    const errorResponse: ErrorDto = {
      timeStamp: new Date().toISOString(),
      statusCode,
      error: STATUS_CODES[statusCode],
      message: r.message,
      errorCode: r.code,
    };
    // }

    this.logger.debug(error);

    return errorResponse;
  }
}
