import { HTMLAttributes, TableHTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const Table = ({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) => (
  <table className={cn('ui-table', className)} {...props} />
);

export const TableHead = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => (
  <thead className={cn(className)} {...props} />
);

export const TableBody = ({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) => (
  <tbody className={cn(className)} {...props} />
);

export const TableRow = ({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) => (
  <tr className={cn('ui-table-row', className)} {...props} />
);

export const TableHeaderCell = ({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('ui-table-head-cell', className)} {...props} />
);

export const TableCell = ({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('ui-table-cell', className)} {...props} />
);
