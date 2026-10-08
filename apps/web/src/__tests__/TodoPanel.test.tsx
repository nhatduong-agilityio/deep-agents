import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TodoPanel, type TodoItem } from '../TodoPanel.js';

describe('TodoPanel', () => {
  it('renders nothing when todos is empty', () => {
    const { container } = render(<TodoPanel todos={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a todo item with pending status', () => {
    const todos: TodoItem[] = [{ content: 'Gather corpus sources', status: 'pending' }];
    render(<TodoPanel todos={todos} />);
    expect(screen.getByText('Gather corpus sources')).toBeDefined();
    expect(screen.getByLabelText('Pending')).toBeDefined();
  });

  it('renders in_progress status', () => {
    const todos: TodoItem[] = [{ content: 'Write summary', status: 'in_progress' }];
    render(<TodoPanel todos={todos} />);
    expect(screen.getByLabelText('In progress')).toBeDefined();
  });

  it('renders completed status', () => {
    const todos: TodoItem[] = [{ content: 'Write sources', status: 'completed' }];
    render(<TodoPanel todos={todos} />);
    expect(screen.getByLabelText('Done')).toBeDefined();
  });

  it('renders all three statuses together', () => {
    const todos: TodoItem[] = [
      { content: 'Step 1', status: 'completed' },
      { content: 'Step 2', status: 'in_progress' },
      { content: 'Step 3', status: 'pending' },
    ];
    render(<TodoPanel todos={todos} />);
    expect(screen.getByLabelText('Done')).toBeDefined();
    expect(screen.getByLabelText('In progress')).toBeDefined();
    expect(screen.getByLabelText('Pending')).toBeDefined();
    expect(screen.getByText('Step 1')).toBeDefined();
    expect(screen.getByText('Step 2')).toBeDefined();
    expect(screen.getByText('Step 3')).toBeDefined();
  });

  it('has accessible section label', () => {
    const todos: TodoItem[] = [{ content: 'Task A', status: 'pending' }];
    render(<TodoPanel todos={todos} />);
    expect(screen.getByRole('region', { name: /todo list/i })).toBeDefined();
  });
});
