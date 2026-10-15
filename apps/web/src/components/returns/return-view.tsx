import { Banknote, FileText, Scale, Store, Truck, UserRound } from 'lucide-react';
import { MoneyRow, RefundBadge } from '@/components/orders/order-parts';
import { ShipmentPanel } from '@/components/orders/shipment-parts';
import type { ReturnRequest } from '@/lib/after-sales-types';
import { formatDateTime, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { EvidenceGallery, RETURN_REASONS, ReturnItemsList, ReturnTimeline } from './return-parts';

type Viewer = 'BUYER' | 'SELLER' | 'ADMIN';

/** Khung có tiêu đề dùng trong trang chi tiết yêu cầu trả hàng */
export function Card({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: React.ReactNode;
  icon?: typeof FileText;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn('rounded-2xl border border-ivory-200 bg-card px-4 py-4 md:px-5', className)}
    >
      <div className="mb-2 flex items-center gap-2 font-semibold text-navy">
        {Icon && <Icon className="size-4 text-champagne-600" />}
        {title}
      </div>
      {children}
    </section>
  );
}

/** Dải trên cùng: trạng thái hiện tại, hạn và việc cần làm */
export function ActionBar({
  tone,
  icon: Icon,
  title,
  text,
  actions,
}: {
  tone: 'info' | 'warn' | 'danger' | 'success' | 'muted';
  icon: typeof FileText;
  title: React.ReactNode;
  text?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-2xl border px-4 py-4 sm:flex-row sm:items-center md:px-5',
        {
          info: 'border-champagne/50 bg-champagne-50 text-navy',
          warn: 'border-amber-200 bg-amber-50 text-amber-900',
          danger: 'border-red-200 bg-red-50 text-red-900',
          success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
          muted: 'bg-ivory text-ink/75',
        }[tone],
      )}
    >
      <Icon className="hidden size-6 shrink-0 opacity-70 sm:block" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold">{title}</div>
        {text && <div className="opacity-90">{text}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Nội dung chung của một yêu cầu trả hàng cho người mua, shop và admin: món trả, lý do và ảnh, lời hai bên,
 * vận đơn trả, tiền hoàn, các bước đã qua.
 */
export function ReturnBody({ ret: r, viewer }: { ret: ReturnRequest; viewer: Viewer }) {
  const decided = r.decidedRefund !== null;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Card title={`Món trả (${r.items.reduce((a, i) => a + i.quantity, 0)})`}>
          <ReturnItemsList items={r.items} showRestock={viewer !== 'BUYER'} />
        </Card>

        <Card title="Lý do và bằng chứng của người mua" icon={UserRound}>
          <div className="text-sm font-medium text-ink">{RETURN_REASONS[r.reason]}</div>
          <p className="mt-1 text-sm break-words whitespace-pre-line text-ink/70">
            {r.description}
          </p>
          <div className="mt-3">
            <EvidenceGallery keys={r.images} />
          </div>
          {r.disputeNote && (
            <div className="mt-4 border-t border-ivory-200 pt-3">
              <div className="text-sm font-medium text-ink">Lời khiếu nại</div>
              <p className="mt-1 text-sm break-words whitespace-pre-line text-ink/70">
                {r.disputeNote}
              </p>
              <div className="mt-2">
                <EvidenceGallery keys={r.disputeImages} />
              </div>
            </div>
          )}
        </Card>

        {(r.sellerNote || r.sellerImages.length > 0) && (
          <Card
            title={
              r.disputeStage === 'GOODS_PROBLEM'
                ? 'Shop báo hàng trả về không đúng'
                : 'Lời của shop'
            }
            icon={Store}
          >
            <p className="text-sm break-words whitespace-pre-line text-ink/70">{r.sellerNote}</p>
            <div className="mt-3">
              <EvidenceGallery keys={r.sellerImages} />
            </div>
          </Card>
        )}

        {r.shipment && (
          <Card title="Vận đơn trả hàng (người mua → shop)" icon={Truck}>
            <ShipmentPanel
              shipment={{ ...r.shipment, failedAttempts: 0 }}
              forSeller={viewer !== 'BUYER'}
            />
          </Card>
        )}

        {r.history && r.history.length > 0 && (
          <Card title="Các bước đã qua" icon={FileText}>
            <ReturnTimeline history={r.history} />
          </Card>
        )}
      </div>

      <div className="space-y-4">
        <Card
          title={
            <span className="flex w-full items-center justify-between gap-2">
              Tiền hoàn <RefundBadge status={r.refundStatus} />
            </span>
          }
          icon={Banknote}
        >
          <MoneyRow
            label="Hoàn tối đa"
            hint="Số đã trả cho món trả, sau voucher"
            value={r.refundAmount}
          />
          {decided && (
            <>
              <div className="my-2 border-t border-ivory-200" />
              <MoneyRow
                label={r.decidedRefund! < r.refundAmount ? 'Hoàn một phần' : 'Hoàn cho người mua'}
                value={r.decidedRefund!}
                strong
              />
            </>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Không hoàn phí vận chuyển chiều đi. Phí gửi trả do sàn chịu.
            {r.paymentMethod === 'COD'
              ? ' Đơn COD: sàn chuyển khoản vào tài khoản bên dưới.'
              : ' Hoàn về tài khoản đã thanh toán VNPay.'}
          </p>
          {r.platformCovers && (
            <p className="mt-2 rounded-lg bg-champagne-50 px-3 py-2 text-xs text-navy">
              Kiện trả bị thất lạc: sàn chịu khoản hoàn, shop không bị trừ tiền.
            </p>
          )}
          {r.bankAccount && (
            <div className="mt-3 rounded-lg bg-ivory px-3 py-2 text-xs text-ink/70">
              <div className="font-medium text-ink">Tài khoản nhận tiền hoàn</div>
              {r.bankAccount.bankName} · {r.bankAccount.accountNumber} · {r.bankAccount.accountName}
            </div>
          )}
        </Card>

        <Card title="Thông tin" icon={Scale}>
          <dl className="space-y-1 text-sm">
            <Row label="Mã yêu cầu" value={r.code} />
            <Row label="Đơn" value={r.shopOrderCode} />
            <Row label="Shop" value={r.shop.name} />
            {r.buyer && <Row label="Người mua" value={r.buyer.name} />}
            <Row label="Thanh toán" value={r.paymentMethod === 'COD' ? 'COD' : 'VNPay'} />
            <Row label="Gửi lúc" value={formatDateTime(r.createdAt)} />
            {r.resolvedAt && <Row label="Có kết quả lúc" value={formatDateTime(r.resolvedAt)} />}
            {r.refundWithoutReturn && <Row label="Gửi trả hàng" value="Không cần" />}
            {r.decidedRefund !== null && r.decidedRefund > 0 && (
              <Row label="Số hoàn" value={formatMoney(r.decidedRefund)} />
            )}
          </dl>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink/55">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}
