import { Module } from '@nestjs/common';
import { SaludController } from './salud.controller.js';
import { SaludService } from './salud.service.js';

@Module({
  controllers: [SaludController],
  providers: [SaludService],
})
export class SaludModule {}
