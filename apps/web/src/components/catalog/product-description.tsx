import { ChevronDown } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

type Block = { type: 'p'; lines: string[] } | { type: 'ul'; items: string[] };

/**
 * Mô tả sản phẩm là chữ thường do seller gõ: dòng trống tách đoạn, dòng bắt đầu bằng "- " (hoặc "• ")
 * là gạch đầu dòng. Đoạn một dòng ngắn đứng trước danh sách được hiện như tiêu đề nhỏ.
 */
function parseDescription(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', lines: para });
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ type: 'ul', items: list });
    list = [];
  };
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    const bullet = /^[-•*]\s+(.*)$/.exec(line);
    if (bullet) {
      flushPara();
      list.push(bullet[1]!);
    } else if (line === '') {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line);
    }
  }
  flushPara();
  flushList();
  return blocks;
}

const COLLAPSED_HEIGHT = 320;

/** Phần "Mô tả sản phẩm": đoạn văn, gạch đầu dòng; dài thì thu gọn kèm nút "Xem thêm" */
export function ProductDescription({ text }: { text: string }) {
  const blocks = parseDescription(text);
  const ref = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) setLong(el.scrollHeight > COLLAPSED_HEIGHT + 60);
  }, [text]);

  return (
    <div>
      <div
        ref={ref}
        className={cn('relative overflow-hidden text-[15px] leading-7 text-ink/85')}
        style={long && !open ? { maxHeight: COLLAPSED_HEIGHT } : undefined}
      >
        <div className="space-y-4">
          {blocks.map((b, i) => {
            if (b.type === 'ul') {
              return (
                <ul key={i} className="space-y-2">
                  {b.items.map((item, j) => (
                    <li key={j} className="flex gap-3">
                      <span className="mt-[11px] size-1.5 shrink-0 rounded-full bg-champagne" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              );
            }
            const heading =
              b.lines.length === 1 &&
              b.lines[0]!.length <= 40 &&
              !/[.!?…:]$/.test(b.lines[0]!) &&
              blocks[i + 1]?.type === 'ul';
            if (heading) {
              return (
                <h3 key={i} className="pt-1 text-base font-semibold text-navy">
                  {b.lines[0]}
                </h3>
              );
            }
            return (
              <p key={i}>
                {b.lines.map((l, j) => (
                  <span key={j}>
                    {j > 0 && <br />}
                    {l}
                  </span>
                ))}
              </p>
            );
          })}
        </div>
        {long && !open && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-card to-transparent" />
        )}
      </div>
      {long && (
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-champagne/60 px-5 py-2 text-sm font-medium text-navy transition hover:bg-champagne-50"
          >
            {open ? 'Thu gọn' : 'Xem thêm'}
            <ChevronDown className={cn('size-4 transition', open && 'rotate-180')} />
          </button>
        </div>
      )}
    </div>
  );
}
