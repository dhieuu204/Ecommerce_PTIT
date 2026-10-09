import { Button } from '@/components/ui/button';
import { startGoogleLogin } from '@/lib/api';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.2s2.69-6.2 6-6.2c1.88 0 3.15.8 3.87 1.5l2.64-2.55C16.84 3.2 14.65 2.2 12 2.2 6.66 2.2 2.4 6.5 2.4 12s4.26 9.8 9.6 9.8c5.54 0 9.2-3.9 9.2-9.38 0-.63-.07-1.11-.16-1.6H12z"
      />
    </svg>
  );
}

/** Nút đăng nhập Google: chuyển sang Google, xong quay về returnTo */
export function GoogleButton({ label, returnTo }: { label: string; returnTo?: string }) {
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11 w-full rounded-full bg-white"
      onClick={() => startGoogleLogin(returnTo)}
    >
      <GoogleIcon />
      {label}
    </Button>
  );
}
