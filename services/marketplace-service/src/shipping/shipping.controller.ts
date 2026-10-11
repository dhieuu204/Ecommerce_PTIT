import { Body, Controller, Get, HttpCode, Logger, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AppError, ParseIdPipe, Public, RequirePermissions } from '@san/nest-common';
import { IsIn } from 'class-validator';
import { AppConfig } from '../config';
import { SIMULATOR_EVENTS, type SimulatorEvent } from './ghn-status';
import { ShipmentsService, type SimulatorRow } from './shipments.service';

export class SimulatorEventDto {
  /** PICKED, DELIVERY_FAILED, DELIVERED, RETURN, RETURNED, LOST */
  @IsIn(Object.keys(SIMULATOR_EVENTS), { message: 'Bước không hợp lệ.' })
  event!: SimulatorEvent;
}

/** Tin trạng thái GHN gửi về (các trường dùng tới) */
interface GhnWebhookBody {
  OrderCode?: string;
  Status?: string;
  Time?: string;
  Reason?: string;
  TotalFee?: number;
}

/** Nhận trạng thái GHN thật (SHIP-03) */
@ApiTags('Vận chuyển')
@Controller('webhooks')
export class GhnWebhookController {
  private readonly logger = new Logger(GhnWebhookController.name);

  constructor(
    private readonly shipments: ShipmentsService,
    private readonly config: AppConfig,
  ) {}

  /**
   * GHN gọi khi vận đơn đổi trạng thái. GHN không ký dữ liệu nên kiểm mã bí mật trong đường dẫn.
   * Trả 200 cả khi bỏ qua (tin trùng, vận đơn lạ) để GHN không gửi lại mãi.
   */
  @Public()
  @Post('ghn')
  @HttpCode(200)
  @ApiResponse({ status: 401, description: 'Sai mã bí mật' })
  async ghn(
    @Query('token') token: string,
    @Body() body: GhnWebhookBody,
  ): Promise<{ result: string }> {
    if (!this.config.ghnWebhookToken || token !== this.config.ghnWebhookToken) {
      throw new AppError(401, 'UNAUTHENTICATED', 'Sai mã webhook.');
    }
    if (!body.OrderCode || !body.Status) return { result: 'IGNORED' };
    const at = body.Time ? new Date(body.Time) : new Date();
    const result = await this.shipments.applyCarrierEvent({
      ghnCode: body.OrderCode,
      status: body.Status,
      at: Number.isNaN(at.getTime()) ? new Date() : at,
      source: 'GHN',
      fee: typeof body.TotalFee === 'number' ? body.TotalFee : undefined,
      note: body.Reason,
    });
    this.logger.log(`GHN ${body.OrderCode} ${body.Status}: ${result}`);
    return { result };
  }
}

/** Bảng GHN MÔ PHỎNG cho admin hỗ trợ: bấm các mốc giao hàng thay cho GHN (khi chưa có GHN_TOKEN) */
@ApiTags('Admin: GHN mô phỏng')
@ApiBearerAuth()
@RequirePermissions('SUPPORT')
@Controller('admin/carrier-simulator')
export class CarrierSimulatorController {
  constructor(private readonly shipments: ShipmentsService) {}

  /** Vận đơn chưa kết thúc và các bước bấm được */
  @Get()
  @ApiResponse({ status: 404, description: 'NOT_FOUND: đang dùng GHN thật' })
  list(): Promise<SimulatorRow[]> {
    return this.shipments.simulatorList();
  }

  /** Bấm một bước: đi đúng đường xử lý như tin GHN thật báo về */
  @Post(':shipmentId/events')
  @HttpCode(200)
  @ApiResponse({
    status: 409,
    description: 'INVALID_CARRIER_EVENT: bước không hợp lệ với trạng thái hiện tại',
  })
  event(
    @Param('shipmentId', ParseIdPipe) id: string,
    @Body() dto: SimulatorEventDto,
  ): Promise<SimulatorRow | null> {
    return this.shipments.simulate(id, dto.event);
  }
}
