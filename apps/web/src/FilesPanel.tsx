import { memo, useCallback, useState } from 'react';

// Matches deepagents FileDataV1 (content as string[]) and FileDataV2 (content as string|Uint8Array).
interface FileDataV1 {
  content: string[];
  created_at: string;
  modified_at: string;
}
interface FileDataV2 {
  content: string | Uint8Array;
  mimeType: string;
  created_at: string;
  modified_at: string;
}
type FileData = FileDataV1 | FileDataV2;

function getTextContent(file: FileData): string {
  if (Array.isArray((file as FileDataV1).content)) {
    return (file as FileDataV1).content.join('\n');
  }
  const v2 = file as FileDataV2;
  return typeof v2.content === 'string' ? v2.content : '<binary file>';
}

function downloadFile(path: string, file: FileData) {
  const text = getTextContent(file);
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = path.split('/').at(-1) ?? 'file.txt';
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  files: Record<string, FileData>;
}

export const FilesPanel = memo(function FilesPanel({ files }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const reportFiles = Object.entries(files).filter(([path]) => path.startsWith('/report/'));
  if (reportFiles.length === 0) return null;

  return (
    <section aria-label="report files" className="files-section">
      <h2 className="files-heading">Report files ({reportFiles.length})</h2>
      <ul className="files-list">
        {reportFiles.map(([path, file]) => {
          const isExpanded = expanded.has(path);
          return (
            <li key={path} className="files-item">
              <div className="files-item-header">
                <button
                  type="button"
                  aria-label={`${isExpanded ? 'collapse' : 'expand'} ${path}`}
                  aria-expanded={isExpanded}
                  aria-controls={`file-content-${path}`}
                  onClick={() => toggle(path)}
                  className="files-toggle"
                >
                  <span className="files-toggle-icon" aria-hidden="true">
                    ▸
                  </span>
                  <span className="files-path">{path}</span>
                </button>
                <button
                  type="button"
                  aria-label={`download ${path}`}
                  onClick={() => downloadFile(path, file)}
                  className="files-download"
                >
                  ↓
                </button>
              </div>
              {isExpanded && (
                <pre id={`file-content-${path}`} className="files-content">
                  {getTextContent(file)}
                </pre>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
});
