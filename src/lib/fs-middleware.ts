import {
  createFilesystemMiddleware,
  FilesystemBackend,
  type FilesystemPermission,
} from 'deepagents';

// Single entry point for all filesystem middleware construction in T-DA-04.
// Always requires an explicit backend so writes go to the run's FilesystemBackend on disk,
// not the in-memory StateBackend that createFilesystemMiddleware defaults to.
export function makeFilesystemMiddleware(
  backend: () => FilesystemBackend,
  permissions: FilesystemPermission[],
) {
  return createFilesystemMiddleware({ backend, permissions });
}
