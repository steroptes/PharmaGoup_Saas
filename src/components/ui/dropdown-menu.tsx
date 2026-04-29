import { useEffect, useRef, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface DropdownAction {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

export const ActionDropdown = ({ actions, ariaLabel = 'Actions' }: { actions: DropdownAction[]; ariaLabel?: string }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <Button variant="ghost" type="button" aria-label={ariaLabel} onClick={() => setOpen((v) => !v)}>
        <MoreHorizontal size={16} />
      </Button>
      {open && (
        <div className="ui-dropdown-menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', minWidth: 170, zIndex: 30 }}>
          {actions.map((action) => (
            <button key={action.label} className="ui-dropdown-item" type="button" disabled={action.disabled} onClick={() => { action.onClick(); setOpen(false); }} style={{ cursor: action.disabled ? 'not-allowed' : 'pointer', opacity: action.disabled ? 0.5 : 1 }}>
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
