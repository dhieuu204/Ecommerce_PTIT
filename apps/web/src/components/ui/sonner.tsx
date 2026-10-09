import { Toaster as Sonner, type ToasterProps } from 'sonner';

/** Thông báo nhỏ góc màn hình (toast). Gọi: toast.success('Đã lưu') từ 'sonner'. */
const Toaster = (props: ToasterProps) => (
  <Sonner
    position="top-right"
    richColors
    closeButton
    toastOptions={{ classNames: { toast: 'font-sans' } }}
    {...props}
  />
);

export { Toaster };
