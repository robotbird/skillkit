import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** shadcn 组件条件 className 合并工具(与 desktop 同)。 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
