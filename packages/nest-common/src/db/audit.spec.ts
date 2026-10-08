import { writeAudit } from './audit';

describe('writeAudit', () => {
  it('ghi người làm, việc làm, dữ liệu trước/sau dạng JSON thuần', async () => {
    const create = jest.fn().mockResolvedValue({});
    await writeAudit(
      { auditLog: { create } },
      {
        actor: { id: 'admin-1', name: 'Bình' },
        action: 'SET_PERMISSIONS',
        targetType: 'USER',
        targetId: 'u-1',
        before: { permissions: [] },
        after: { permissions: ['SUPPORT'], at: new Date('2026-10-08T00:00:00Z') },
      },
    );
    expect(create).toHaveBeenCalledWith({
      data: {
        actorId: 'admin-1',
        actorName: 'Bình',
        action: 'SET_PERMISSIONS',
        targetType: 'USER',
        targetId: 'u-1',
        reason: null,
        before: { permissions: [] },
        after: { permissions: ['SUPPORT'], at: '2026-10-08T00:00:00.000Z' },
      },
    });
  });
});
