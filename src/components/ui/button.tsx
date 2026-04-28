import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type ButtonVariant = 'default' | 'secondary' | 'ghost' | 'danger';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

const variantClasses: Record<ButtonVariant, string> = {
  default: 'ui-btn',
  secondary: 'ui-btn ui-btn-secondary',
  ghost: 'ui-btn ui-btn-ghost',
  danger: 'ui-btn ui-btn-danger',
};

export const Button = ({ className, variant = 'default', type = 'button', ...props }: ButtonProps) => (
  <button className={cn(variantClasses[variant], className)} type={type} {...props} />
);
