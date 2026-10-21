import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ImagePlus,
  Loader2,
  Package,
  PauseCircle,
  ReceiptText,
  RotateCw,
  SendHorizontal,
  X,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { LoadError } from '@/components/console/empty-state';
import { ShopLogo } from '@/components/console/shop-logo';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/user-avatar';
import {
  CHAT_KEY,
  CHAT_UNREAD_KEY,
  appendMessage,
  chronological,
  conversationKey,
  useConversation,
  useMessages,
} from '@/hooks/use-chat';
import { NOTIFICATIONS_KEY } from '@/hooks/use-notifications';
import { API, api } from '@/lib/api';
import type { ProductDetail } from '@/lib/catalog-types';
import type { ChatAttach, ChatMessage, ChatRole, Conversation } from '@/lib/chat-types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { MessageBody, dayLabel, messageTime, sameDay } from './chat-parts';
import { OrderPicker, ProductPicker } from './chat-pickers';

const MAX_TEXT = 1000;

/** Nội dung một tin sắp gửi */
type Draft =
  | { type: 'TEXT'; text: string }
  | { type: 'IMAGE'; preview: string; file: File; imageKey?: string }
  | { type: 'PRODUCT'; productId: string; label: string }
  | { type: 'ORDER'; shopOrderId: string; label: string };

/** Tin đang gửi (hiện ngay, mờ) hoặc gửi lỗi (có nút thử lại) */
interface Pending {
  clientKey: string;
  draft: Draft;
  error: string | null;
}

const newKey = () => crypto.randomUUID();

function ChatHeader({ conv, backTo }: { conv: Conversation; backTo: string }) {
  const buyerView = conv.role === 'BUYER';
  return (
    <div className="flex items-center gap-3 border-b px-3 py-2.5 md:px-4">
      <Link
        to={backTo}
        className="rounded-full p-1.5 text-ink/70 transition hover:bg-ivory-200 lg:hidden"
        aria-label="Về danh sách"
      >
        <ArrowLeft className="size-5" />
      </Link>
      {buyerView ? (
        <ShopLogo
          url={conv.shop.logoUrl}
          className="size-10 rounded-full border border-ivory-200"
        />
      ) : (
        <UserAvatar name={conv.buyer.name} className="size-10" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold text-navy">
            {buyerView ? conv.shop.name : conv.buyer.name}
          </span>
          {buyerView && conv.shop.suspended && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-ink/10 px-2 py-0.5 text-[11px] text-ink/70">
              <PauseCircle className="size-3" /> Tạm ngừng bán
            </span>
          )}
        </div>
        <div className="text-xs text-ink/50">{buyerView ? 'Shop' : 'Người mua'}</div>
      </div>
      {buyerView && (
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to={`/shop/${conv.shop.id}`}>Xem shop</Link>
        </Button>
      )}
    </div>
  );
}

/** Gợi ý gửi thẻ sản phẩm/đơn mang từ nút "Chat với shop" */
function AttachOffer({
  attach,
  onSend,
  onDismiss,
}: {
  attach: ChatAttach;
  onSend: (d: Draft) => void;
  onDismiss: () => void;
}) {
  const productId = attach.kind === 'PRODUCT' ? attach.productId : undefined;
  const product = useQuery({
    queryKey: ['chat-attach-product', productId],
    queryFn: () => api<ProductDetail>(`${API.market}/products/${productId}`),
    enabled: !!productId,
  });
  if (attach.kind === 'PRODUCT' && product.isError) return null;
  const p = product.data;
  const label =
    attach.kind === 'ORDER' ? `Đơn ${attach.code}` : p ? p.name : 'Sản phẩm bạn đang xem';
  return (
    <div className="mx-3 mb-2 flex items-center gap-3 rounded-2xl border border-champagne/50 bg-champagne-50 p-2.5">
      <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-card text-champagne-600">
        {p?.images[0] ? (
          <img src={p.images[0].url} alt="" className="size-full object-cover" />
        ) : attach.kind === 'ORDER' ? (
          <ReceiptText className="size-5" />
        ) : (
          <Package className="size-5" />
        )}
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <div className="text-xs text-ink/60">
          {attach.kind === 'ORDER' ? 'Gửi đơn này cho shop?' : 'Gửi sản phẩm này cho shop?'}
        </div>
        <div className="line-clamp-1 font-medium text-ink">{label}</div>
        {p && <div className="text-xs font-semibold text-navy">{formatMoney(p.minPrice)}</div>}
      </div>
      <Button
        size="sm"
        disabled={attach.kind === 'PRODUCT' && !p}
        onClick={() =>
          onSend(
            attach.kind === 'ORDER'
              ? { type: 'ORDER', shopOrderId: attach.shopOrderId, label }
              : { type: 'PRODUCT', productId: attach.productId, label },
          )
        }
      >
        Gửi
      </Button>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-full p-1 text-ink/50 transition hover:bg-card"
        aria-label="Bỏ qua"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}

function PendingBody({ draft }: { draft: Draft }) {
  if (draft.type === 'IMAGE') {
    return (
      <div className="size-48 overflow-hidden rounded-2xl bg-ivory-200">
        <img src={draft.preview} alt="Ảnh đang gửi" className="size-full object-cover" />
      </div>
    );
  }
  const text =
    draft.type === 'TEXT'
      ? draft.text
      : draft.type === 'PRODUCT'
        ? `[Sản phẩm] ${draft.label}`
        : `[Đơn hàng] ${draft.label}`;
  return (
    <div className="max-w-full rounded-2xl rounded-br-md bg-navy px-3.5 py-2 text-sm leading-relaxed break-words whitespace-pre-wrap text-white">
      {text}
    </div>
  );
}

/**
 * Khung chat một cuộc trò chuyện (MSG-01), dùng chung cho người mua và Kênh người bán:
 * tin hiện ngay khi bấm gửi, tin mới tới qua Socket.IO, cuộn lên đầu để tải tin cũ hơn.
 */
export function ChatWindow({
  conversationId,
  basePath,
}: {
  conversationId: string;
  basePath: string;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const conv = useConversation(conversationId);
  const msgs = useMessages(conversationId);
  const [pending, setPending] = useState<Pending[]>([]);
  const [text, setText] = useState('');
  const [picker, setPicker] = useState<'product' | 'order' | null>(null);
  const [attach, setAttach] = useState<ChatAttach | null>(
    () => (location.state as { attach?: ChatAttach } | null)?.attach ?? null,
  );
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const role: ChatRole | undefined = conv.data?.role;

  // Đọc thẻ đính kèm xong thì xóa khỏi lịch sử trình duyệt (tải lại trang không hỏi lại)
  useEffect(() => {
    if ((location.state as { attach?: unknown } | null)?.attach) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, location.state, navigate]);

  // Mở cuộc hoặc có tin mới của bên kia: đánh dấu đã đọc
  const { mutate: markRead, isPending: reading } = useMutation({
    mutationFn: () =>
      api<Conversation>(`${API.market}/conversations/${conversationId}/read`, { method: 'POST' }),
    onSuccess: (c) => {
      qc.setQueryData(conversationKey(conversationId), c);
      void qc.invalidateQueries({ queryKey: [...CHAT_KEY, 'conversations'] });
      void qc.invalidateQueries({ queryKey: CHAT_UNREAD_KEY });
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
    },
  });
  const unread = conv.data?.unread ?? 0;
  // Mỗi lượt tin mới chỉ gọi một lần (lỗi thì không gọi lặp liên tục)
  const readFor = useRef<string | null>(null);
  const readKey = `${unread}:${conv.data?.lastMessageAt ?? ''}`;
  useEffect(() => {
    if (unread > 0 && !reading && readFor.current !== readKey) {
      readFor.current = readKey;
      markRead();
    }
  }, [unread, reading, readKey, markRead]);

  const messages = chronological(msgs.data);
  const shown = pending.filter(
    (p) => !messages.some((m) => m.senderRole === role && m.clientKey === p.clientKey),
  );

  // ----- cuộn: lần đầu xuống cuối; tải tin cũ thì giữ chỗ; tin mới thì xuống cuối nếu đang ở gần cuối
  const firstId = messages[0]?.id;
  const lastId = messages[messages.length - 1]?.id;
  const lastMine = shown.length > 0 || messages[messages.length - 1]?.senderRole === role;
  const snap = useRef({
    first: undefined as string | undefined,
    last: undefined as string | undefined,
    pending: 0,
    height: 0,
    top: 0,
  });
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const prev = snap.current;
    if (!prev.first && firstId) {
      el.scrollTop = el.scrollHeight;
    } else if (firstId !== prev.first && lastId === prev.last) {
      el.scrollTop = el.scrollHeight - prev.height + prev.top;
    } else if (lastId !== prev.last || shown.length !== prev.pending) {
      const nearBottom = prev.height - prev.top - el.clientHeight < 160;
      if (nearBottom || lastMine) el.scrollTop = el.scrollHeight;
    }
    snap.current = {
      first: firstId,
      last: lastId,
      pending: shown.length,
      height: el.scrollHeight,
      top: el.scrollTop,
    };
  }, [firstId, lastId, shown.length, lastMine]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    snap.current.top = el.scrollTop;
    snap.current.height = el.scrollHeight;
    if (el.scrollTop < 80 && msgs.hasNextPage && !msgs.isFetchingNextPage)
      void msgs.fetchNextPage();
  };

  // ----- gửi
  const deliver = async (p: Pending) => {
    setPending((list) =>
      list.map((x) => (x.clientKey === p.clientKey ? { ...x, error: null } : x)),
    );
    try {
      const d = p.draft;
      let body: Record<string, string> = { clientKey: p.clientKey, type: d.type };
      if (d.type === 'TEXT') body = { ...body, text: d.text };
      if (d.type === 'PRODUCT') body = { ...body, productId: d.productId };
      if (d.type === 'ORDER') body = { ...body, shopOrderId: d.shopOrderId };
      if (d.type === 'IMAGE') {
        let imageKey = d.imageKey;
        if (!imageKey) {
          const form = new FormData();
          form.append('file', d.file);
          imageKey = (
            await api<{ key: string }>(`${API.market}/uploads/chat-image`, {
              method: 'POST',
              formData: form,
              query: { conversationId },
            })
          ).key;
          // Ảnh đã lên: gửi lại (nếu lỗi) dùng đúng ảnh này, không tải lại
          const key = imageKey;
          setPending((list) =>
            list.map((x) =>
              x.clientKey === p.clientKey && x.draft.type === 'IMAGE'
                ? { ...x, draft: { ...x.draft, imageKey: key } }
                : x,
            ),
          );
        }
        body = { ...body, imageKey };
      }
      const msg = await api<ChatMessage>(`${API.market}/conversations/${conversationId}/messages`, {
        method: 'POST',
        body,
      });
      appendMessage(qc, msg);
      setPending((list) => list.filter((x) => x.clientKey !== p.clientKey));
      if (d.type === 'IMAGE') URL.revokeObjectURL(d.preview);
      void qc.invalidateQueries({ queryKey: conversationKey(conversationId) });
      void qc.invalidateQueries({ queryKey: [...CHAT_KEY, 'conversations'] });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Chưa gửi được tin nhắn.';
      setPending((list) =>
        list.map((x) => (x.clientKey === p.clientKey ? { ...x, error: message } : x)),
      );
    }
  };
  const send = (draft: Draft) => {
    const p: Pending = { clientKey: newKey(), draft, error: null };
    setPending((list) => [...list, p]);
    void deliver(p);
  };
  const sendText = () => {
    const t = text.trim();
    if (!t) return;
    send({ type: 'TEXT', text: t });
    setText('');
  };
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('Chỉ gửi được ảnh JPG, PNG hoặc WebP.');
      return;
    }
    send({ type: 'IMAGE', file, preview: URL.createObjectURL(file) });
  };

  if (conv.isPending) {
    return (
      <div className="flex h-full flex-col gap-3 p-4">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="flex-1 rounded-xl" />
      </div>
    );
  }
  if (conv.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center">
        <LoadError message={conv.error.message} onRetry={() => void conv.refetch()} />
        <Link to={basePath} className="text-sm text-navy underline lg:hidden">
          Về danh sách tin nhắn
        </Link>
      </div>
    );
  }
  const c = conv.data;
  const lastOwn = [...messages].reverse().find((m) => m.senderRole === c.role);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatHeader conv={c} backTo={basePath} />

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto bg-ivory/70 px-3 py-4 md:px-5"
      >
        {msgs.isPending ? (
          <div className="flex justify-center py-10 text-ink/40">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : msgs.isError ? (
          <LoadError message={msgs.error.message} onRetry={() => void msgs.refetch()} />
        ) : (
          <>
            {msgs.isFetchingNextPage && (
              <div className="flex justify-center pb-3 text-ink/40">
                <Loader2 className="size-4 animate-spin" />
              </div>
            )}
            {!msgs.hasNextPage && (
              <p className="pb-4 text-center text-xs text-ink/40">
                {messages.length === 0
                  ? c.role === 'BUYER'
                    ? 'Hãy gửi lời chào hoặc câu hỏi cho shop.'
                    : 'Chưa có tin nhắn.'
                  : 'Bắt đầu cuộc trò chuyện'}
              </p>
            )}
            <div className="space-y-2">
              {messages.map((m, i) => {
                const mine = m.senderRole === c.role;
                const prev = messages[i - 1];
                return (
                  <div key={m.id}>
                    {(!prev || !sameDay(prev.createdAt, m.createdAt)) && (
                      <div className="my-3 text-center text-[11px] font-medium text-ink/40">
                        {dayLabel(m.createdAt)}
                      </div>
                    )}
                    <div className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
                      <div className="max-w-[85%] md:max-w-[70%]">
                        <MessageBody m={m} mine={mine} role={c.role} />
                      </div>
                      <span className="mt-0.5 px-1 text-[10px] text-ink/40">
                        {messageTime(m.createdAt)}
                        {mine &&
                          m.id === lastOwn?.id &&
                          shown.length === 0 &&
                          (c.otherUnread === 0 ? ' · Đã xem' : ' · Đã gửi')}
                      </span>
                    </div>
                  </div>
                );
              })}
              {shown.map((p) => (
                <div key={p.clientKey} className="flex flex-col items-end">
                  <div className={cn('max-w-[85%] md:max-w-[70%]', !p.error && 'opacity-60')}>
                    <PendingBody draft={p.draft} />
                  </div>
                  {p.error ? (
                    <span className="mt-0.5 flex flex-wrap items-center justify-end gap-x-2 px-1 text-[11px] text-destructive">
                      {p.error}
                      <button
                        type="button"
                        className="flex items-center gap-1 font-medium underline"
                        onClick={() => void deliver(p)}
                      >
                        <RotateCw className="size-3" /> Gửi lại
                      </button>
                      <button
                        type="button"
                        className="font-medium text-ink/50 underline"
                        onClick={() =>
                          setPending((list) => list.filter((x) => x.clientKey !== p.clientKey))
                        }
                      >
                        Bỏ
                      </button>
                    </span>
                  ) : (
                    <span className="mt-0.5 px-1 text-[10px] text-ink/40">Đang gửi…</span>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="border-t bg-card pt-2">
        {attach && (
          <AttachOffer
            attach={attach}
            onDismiss={() => setAttach(null)}
            onSend={(d) => {
              send(d);
              setAttach(null);
            }}
          />
        )}
        <form
          className="flex items-end gap-1.5 px-2 pb-2 md:px-3"
          onSubmit={(e) => {
            e.preventDefault();
            sendText();
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onFile}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Gửi ảnh"
            title="Gửi ảnh"
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="size-5 text-champagne-600" />
          </Button>
          {!c.shop.suspended && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Gửi sản phẩm"
              title="Gửi sản phẩm"
              onClick={() => setPicker('product')}
            >
              <Package className="size-5 text-champagne-600" />
            </Button>
          )}
          {c.role === 'BUYER' && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Gửi đơn hàng"
              title="Gửi đơn hàng"
              onClick={() => setPicker('order')}
            >
              <ReceiptText className="size-5 text-champagne-600" />
            </Button>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // Enter gửi, Shift+Enter xuống dòng (đang gõ tiếng Việt bằng bộ gõ thì không gửi)
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                sendText();
              }
            }}
            rows={1}
            maxLength={MAX_TEXT}
            placeholder="Nhập tin nhắn…"
            aria-label="Nội dung tin nhắn"
            className="max-h-32 min-h-9 min-w-0 flex-1 resize-none rounded-2xl border border-ivory-200 bg-ivory px-3.5 py-2 text-sm text-ink outline-none field-sizing-content placeholder:text-ink/40 focus:border-champagne"
          />
          <Button
            type="submit"
            size="icon"
            className="rounded-full"
            disabled={!text.trim()}
            aria-label="Gửi"
          >
            <SendHorizontal className="size-4" />
          </Button>
        </form>
      </div>

      <ProductPicker
        shopId={c.shop.id}
        open={picker === 'product'}
        onOpenChange={(v) => setPicker(v ? 'product' : null)}
        onPick={(productId, name) => {
          setPicker(null);
          send({ type: 'PRODUCT', productId, label: name });
        }}
      />
      {c.role === 'BUYER' && (
        <OrderPicker
          shopId={c.shop.id}
          open={picker === 'order'}
          onOpenChange={(v) => setPicker(v ? 'order' : null)}
          onPick={(shopOrderId, code) => {
            setPicker(null);
            send({ type: 'ORDER', shopOrderId, label: code });
          }}
        />
      )}
    </div>
  );
}
