import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilesPanel } from '../FilesPanel.js';

const reportFile = {
  content: '# Summary\n\nEU AI Act overview.',
  mimeType: 'text/markdown',
  created_at: '2026-10-08T10:00:00Z',
  modified_at: '2026-10-08T10:00:00Z',
};

const notesFile = {
  content: 'scratch notes',
  mimeType: 'text/plain',
  created_at: '2026-10-08T10:00:00Z',
  modified_at: '2026-10-08T10:00:00Z',
};

describe('FilesPanel', () => {
  it('renders nothing when files is empty', () => {
    const { container } = render(<FilesPanel files={{}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no /report/ files exist', () => {
    const { container } = render(<FilesPanel files={{ '/notes/scratch.md': notesFile }} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders a /report/ file entry', () => {
    render(<FilesPanel files={{ '/report/summary.md': reportFile }} />);
    expect(screen.getByText(/\/report\/summary\.md/)).toBeDefined();
  });

  it('filters out non-report files', () => {
    render(
      <FilesPanel
        files={{
          '/report/summary.md': reportFile,
          '/notes/scratch.md': notesFile,
        }}
      />,
    );
    expect(screen.getByText(/\/report\/summary\.md/)).toBeDefined();
    expect(screen.queryByText(/scratch\.md/)).toBeNull();
  });

  it('expands file content on button click', () => {
    render(<FilesPanel files={{ '/report/summary.md': reportFile }} />);
    const expandBtn = screen.getByRole('button', { name: /expand.*\/report\/summary\.md/ });
    expect(screen.queryByText(/EU AI Act overview/)).toBeNull();
    fireEvent.click(expandBtn);
    expect(screen.getByText(/EU AI Act overview/)).toBeDefined();
  });

  it('collapses file content on second click', () => {
    render(<FilesPanel files={{ '/report/summary.md': reportFile }} />);
    const expandBtn = screen.getByRole('button', { name: /expand.*\/report\/summary\.md/ });
    fireEvent.click(expandBtn);
    expect(screen.getByText(/EU AI Act overview/)).toBeDefined();
    // after expand the label flips to "collapse …"
    const collapseBtn = screen.getByRole('button', { name: /collapse.*\/report\/summary\.md/ });
    fireEvent.click(collapseBtn);
    expect(screen.queryByText(/EU AI Act overview/)).toBeNull();
  });

  it('renders download button for each file', () => {
    render(<FilesPanel files={{ '/report/summary.md': reportFile }} />);
    expect(screen.getByRole('button', { name: /download.*summary\.md/i })).toBeDefined();
  });

  it('handles FileDataV1 (content as string array)', () => {
    const v1File = {
      content: ['Line one', 'Line two'],
      created_at: '2026-10-08T10:00:00Z',
      modified_at: '2026-10-08T10:00:00Z',
    };
    render(<FilesPanel files={{ '/report/findings/f1.md': v1File }} />);
    const expandBtn = screen.getByRole('button', { name: /expand.*\/report\/findings\/f1\.md/ });
    fireEvent.click(expandBtn);
    expect(screen.getByText(/Line one/)).toBeDefined();
  });

  it('has accessible section label', () => {
    render(<FilesPanel files={{ '/report/summary.md': reportFile }} />);
    expect(screen.getByRole('region', { name: /report files/i })).toBeDefined();
  });
});
