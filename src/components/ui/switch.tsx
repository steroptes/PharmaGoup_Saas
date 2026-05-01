import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type SwitchProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export const Switch = ({ checked, onCheckedChange, className, disabled, ...props }: SwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-disabled={disabled}
    disabled={disabled}
    className={cn('ui-switch', checked && 'ui-switch-checked', className)}
    onClick={() => {
      if (disabled) return;
      onCheckedChange?.(!checked);
    }}
    {...props}
  >
    <span className={cn('ui-switch-thumb', checked && 'ui-switch-thumb-checked')} />
  </button>
);
