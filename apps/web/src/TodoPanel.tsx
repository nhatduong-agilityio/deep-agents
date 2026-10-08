import { memo } from 'react';

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export interface TodoItem {
  content: string;
  status: TodoStatus;
}

const STATUS_ICON: Record<TodoStatus, string> = {
  pending: '○',
  in_progress: '◑',
  completed: '●',
};

const STATUS_LABEL: Record<TodoStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  completed: 'Done',
};

interface Props {
  todos: TodoItem[];
}

export const TodoPanel = memo(function TodoPanel({ todos }: Props) {
  if (todos.length === 0) return null;

  return (
    <section aria-label="todo list" className="todo-section">
      <h2 className="todo-heading">Plan</h2>
      <ol className="todo-list">
        {todos.map((todo, i) => (
          <li key={i} className="todo-item">
            <span
              aria-label={STATUS_LABEL[todo.status]}
              className={`todo-icon todo-icon--${todo.status}`}
            >
              {STATUS_ICON[todo.status]}
            </span>
            <span
              className={
                todo.status === 'completed' ? 'todo-label todo-label--completed' : 'todo-label'
              }
            >
              {todo.content}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
});
