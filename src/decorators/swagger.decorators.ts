import { CursorPaginatedDto } from '@/common/dto/cursor-pagination/paginated.dto';
import { OffsetPaginatedDto } from '@/common/dto/offset-pagination/paginated.dto';
import { applyDecorators, Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiResponseOptions,
  getSchemaPath,
} from '@nestjs/swagger';

export const ApiPaginatedResponse = <T extends Type<any>>(options: {
  type: T;
  description?: string;
  paginationType?: 'cursor' | 'offset';
}): MethodDecorator => {
  return applyDecorators(
    ApiExtraModels(
      options.paginationType === 'offset'
        ? OffsetPaginatedDto
        : CursorPaginatedDto,
      options.type,
    ),
    ApiOkResponse({
      description:
        options.description || `Paginated list of ${options.type.name}`,
      schema: {
        title: `PaginatedResponseOf${options.type.name}`,
        allOf: [
          {
            $ref: getSchemaPath(
              options.paginationType === 'offset'
                ? OffsetPaginatedDto
                : CursorPaginatedDto,
            ),
          },
          {
            properties: {
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(options.type) },
              },
            },
          },
        ],
      },
    } as ApiResponseOptions | undefined),
  );
};
