import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const Badge = ({ className, ...props }: HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ui-badge', className)} {...props} />
);
