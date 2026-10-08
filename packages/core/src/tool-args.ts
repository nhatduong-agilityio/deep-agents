export interface ToolCallLike {
  name: string;
  args: Record<string, unknown>;
  id?: string;
}

// deepagents write_file uses 'file_path'; 'path' kept as defensive fallback.
export function extractToolFilePath(tc: ToolCallLike): string {
  return (
    (tc.args['file_path'] as string | undefined) ?? (tc.args['path'] as string | undefined) ?? ''
  );
}
