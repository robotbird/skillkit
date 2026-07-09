import { cn } from '@/lib/utils';

/** Skillkit 品牌标(圆角方块 + 星形)+ 文字。纯展示,由调用方决定是否包 Link。 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className="block rounded-md"
      >
        <rect width="24" height="24" rx="6" fill="#c9761a" />
        <path
          fill="#ffffff"
          d="M12 5l1.8 5.2L19 12l-5.2 1.8L12 19l-1.8-5.2L5 12l5.2-1.8z"
        />
      </svg>
      Skillkit
    </span>
  );
}
