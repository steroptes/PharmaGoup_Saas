import type { ElementType, HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type CardProps<T extends ElementType> = {
  as?: T;
} & Omit<HTMLAttributes<HTMLElement>, 'as'>;

export const Card = <T extends ElementType = 'section'>({ as, className, ...props }: CardProps<T>) => {
  const Component = as ?? 'section';
  return <Component className={cn('ui-card', className)} {...props} />;
};
