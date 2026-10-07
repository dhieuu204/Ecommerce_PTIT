import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('trả về trạng thái ok', () => {
    expect(new HealthController().check()).toEqual({ status: 'ok', service: 'payment-service' });
  });
});
