import { ApiPublic } from '@/decorators/http.decorators';
import {
  Controller,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';

@Controller({
  version: '1',
  path: 'file',
})
export class FileController {
  @Post('upload')
  @ApiPublic()
  @UseInterceptors(AnyFilesInterceptor())
  uploadFile(@UploadedFiles() files: Array<Express.Multer.File>) {
    return files;
  }
}
