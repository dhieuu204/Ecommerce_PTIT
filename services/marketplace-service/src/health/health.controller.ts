import { Controller, Get } from '@nestjs/common';
import { Public } from '@san/nest-common';

@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check() {
    return { status: 'ok', service: 'marketplace-service' };
  }
}
