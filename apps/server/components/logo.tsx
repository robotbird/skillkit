import { cn } from '@/lib/utils';

/** Skillkit 品牌标(深蓝 SK 方块,来自 desktop logo.png)+ 文字。纯展示,由调用方决定是否包 Link。 */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-semibold tracking-tight', className)}>
      <img
        src="/logo.png"
        alt=""
        width={24}
        height={24}
        className="block h-6 w-6 rounded-md"
      />
      Skillkit
    </span>
  );
}
