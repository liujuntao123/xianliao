import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface CheckboxProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  size?: 'sm' | 'md';
}

/** shadcn 风格复选框（无 radix 依赖） */
export function Checkbox({ checked, onChange, className, size = 'md', ...props }: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        'peer shrink-0 rounded-[4px] border shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        size === 'md' ? 'h-[18px] w-[18px]' : 'h-4 w-4',
        checked
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-muted-foreground/40 bg-transparent hover:border-primary/70',
        className,
      )}
      {...props}
    >
      {checked && <Check className="h-3.5 w-3.5 mx-auto" strokeWidth={3} />}
    </button>
  );
}
