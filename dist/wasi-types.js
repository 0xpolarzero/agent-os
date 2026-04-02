/**
 * WASI type definitions and interfaces.
 *
 * Defines the contracts that the WASI polyfill depends on.
 * Concrete implementations are provided by the kernel (production)
 * or test helpers (testing).
 */
/**
 * Structured error for VFS operations.
 * Carries a machine-readable `code` so callers can map to errno without string matching.
 */
export class VfsError extends Error {
    code;
    constructor(code, message) {
        super(`${code}: ${message}`);
        this.code = code;
        this.name = 'VfsError';
    }
}
// ---------------------------------------------------------------------------
// FD table types
// ---------------------------------------------------------------------------
/**
 * Represents an open file description (distinct from a file descriptor).
 * Multiple FDs can share the same FileDescription via dup()/dup2(),
 * causing them to share the cursor position — per POSIX semantics.
 */
export class FileDescription {
    inode;
    cursor;
    flags;
    refCount;
    constructor(inode, flags) {
        this.inode = inode;
        this.cursor = 0n;
        this.flags = flags;
        this.refCount = 1;
    }
}
/**
 * An entry in the file descriptor table.
 */
export class FDEntry {
    resource;
    filetype;
    rightsBase;
    rightsInheriting;
    fdflags;
    fileDescription;
    path;
    /** Convenience accessor — reads/writes the shared FileDescription cursor. */
    get cursor() {
        return this.fileDescription.cursor;
    }
    set cursor(value) {
        this.fileDescription.cursor = value;
    }
    constructor(resource, filetype, rightsBase, rightsInheriting, fdflags, path, fileDescription) {
        this.resource = resource;
        this.filetype = filetype;
        this.rightsBase = rightsBase;
        this.rightsInheriting = rightsInheriting;
        this.fdflags = fdflags;
        this.fileDescription = fileDescription ?? new FileDescription(0, fdflags);
        this.path = path ?? null;
    }
}
//# sourceMappingURL=wasi-types.js.map