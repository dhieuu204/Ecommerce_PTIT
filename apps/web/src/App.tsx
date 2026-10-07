/**
 * Màn hình tạm để kiểm tra khung chạy được.
 * Khung thật (header, thanh danh mục, footer) làm theo docs/so-do/07-ui-khung-chung.png.
 */
export function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-4">
          <span className="rounded-lg border-2 border-champagne px-4 py-2 font-semibold text-champagne">
            TÊN SÀN
          </span>
          <span className="text-sm text-white/80">Khung frontend đã chạy</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <h1 className="text-2xl font-semibold text-navy">Sàn TMĐT nhiều shop</h1>
        <p className="mt-2 text-muted">
          Đây là màn hình tạm. Các trang thật được làm theo từng giai đoạn P1 → P6.
        </p>
      </main>
      <footer className="bg-ivory py-6 text-center text-sm text-muted">
        Đồ án môn học. Môi trường thử: thanh toán sandbox, không trừ tiền thật.
      </footer>
    </div>
  );
}
