import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MindSheet from './MindSheet';
import type { ColumnDef, Row } from './types';

const columns: ColumnDef[] = [
  { key: 'name', label: 'Название', type: 'text', sortable: true },
  { key: 'region', label: 'Регион', type: 'select', sortable: true, filterable: true },
];
const records: Row[] = [
  { id: 'a', name: 'Alpha', region: 'EU' },
  { id: 'b', name: 'Beta', region: 'US' },
];

describe('MindSheet', () => {
  it('renders a header per column and a row per record', () => {
    render(
      <MindSheet columns={columns} records={records}
        onSortChange={() => {}} onFilterChange={() => {}} />,
    );
    expect(screen.getByRole('columnheader', { name: /Название/ })).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
  });

  it('calls onSortChange when a sortable header is clicked', () => {
    const onSortChange = vi.fn();
    render(
      <MindSheet columns={columns} records={records}
        onSortChange={onSortChange} onFilterChange={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Название/ }));
    expect(onSortChange).toHaveBeenCalledWith('name');
  });

  it('calls onFilterChange with the selected value', () => {
    const onFilterChange = vi.fn();
    render(
      <MindSheet columns={columns} records={records}
        onSortChange={() => {}} onFilterChange={onFilterChange} />,
    );
    fireEvent.change(screen.getByLabelText(/Фильтр Регион/), { target: { value: 'US' } });
    expect(onFilterChange).toHaveBeenCalledWith({ key: 'region', value: 'US' });
  });
});
