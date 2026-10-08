import {
  createFilesystemMiddleware,
  type AnyBackendProtocol,
  type FilesystemPermission,
  type FsToolName,
} from 'deepagents';

// Single entry point for all filesystem middleware construction.
// Always requires an explicit backend so writes go to the correct backend,
// not the in-memory StateBackend that createFilesystemMiddleware defaults to.
// tools: optional allowlist — omit to expose all filesystem tools (default behaviour).
export function makeFilesystemMiddleware(
  backend: () => AnyBackendProtocol,
  permissions: FilesystemPermission[],
  tools?: readonly FsToolName[],
) {
  return createFilesystemMiddleware({ backend, permissions, ...(tools ? { tools } : {}) });
}
