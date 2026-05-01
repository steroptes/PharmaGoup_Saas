import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type CheckboxProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
};

export const Checkbox = ({ checked, onCheckedChange, className, disabled, ...props }: CheckboxProps) => (
  <button
    type="button"
    role="checkbox"
    aria-checked={checked}
    aria-disabled={disabled}
    disabled={disabled}
    className={cn('ui-checkbox', checked && 'ui-checkbox-checked', className)}
    onClick={() => {
      if (disabled) return;
      onCheckedChange?.(!checked);
    }}
    {...props}
  >
    {checked && <span className="ui-checkbox-check">✓</span>}
  </button>
);
