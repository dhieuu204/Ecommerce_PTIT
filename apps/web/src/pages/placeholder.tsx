/** Trang tạm trong lúc đang làm (sẽ thay bằng trang thật trong P1) */
export function Placeholder({ title }: { title: string }) {
  return (
    <div className="rounded-2xl border border-dashed bg-card p-10 text-center text-muted-foreground">
      {title}: đang làm
    </div>
  );
}
