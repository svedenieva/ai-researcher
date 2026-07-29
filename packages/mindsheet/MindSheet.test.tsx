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

  it('uses filterOptions for select options when provided, even values absent from records', () => {
    render(
      <MindSheet columns={columns} records={records} filterOptions={{ region: ['EU', 'US', 'APAC'] }}
        onSortChange={() => {}} onFilterChange={() => {}} />,
    );
    const select = screen.getByLabelText(/Фильтр Регион/);
    expect(screen.getByRole('option', { name: 'APAC' })).toBeInTheDocument();
    expect(select).toBeInTheDocument();
  });

  it('moves long-text columns into a click-to-open detail panel', () => {
    const cols: ColumnDef[] = [
      { key: 'name', label: 'Название', type: 'text' },
      { key: 'bio', label: 'Описание', type: 'long-text' },
    ];
    const rows: Row[] = [{ id: 'a', name: 'Alpha', bio: 'Длинный текст про Alpha' }];
    render(
      <MindSheet columns={cols} records={rows}
        onSortChange={() => {}} onFilterChange={() => {}} />,
    );
    // the long-text column is not a grid header, and its value is hidden…
    expect(screen.queryByRole('columnheader', { name: /Описание/ })).toBeNull();
    expect(screen.queryByText('Длинный текст про Alpha')).toBeNull();
    // …until the row is clicked
    fireEvent.click(screen.getByText('Alpha'));
    expect(screen.getByText('Длинный текст про Alpha')).toBeInTheDocument();
    expect(screen.getByText('Описание')).toBeInTheDocument();
  });
});
