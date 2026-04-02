/**
 * WASI protocol constants.
 *
 * All constants from the wasi_snapshot_preview1 specification:
 * file types, fd flags, rights bitmasks, errno codes.
 */
export declare const FILETYPE_UNKNOWN: 0;
export declare const FILETYPE_BLOCK_DEVICE: 1;
export declare const FILETYPE_CHARACTER_DEVICE: 2;
export declare const FILETYPE_DIRECTORY: 3;
export declare const FILETYPE_REGULAR_FILE: 4;
export declare const FILETYPE_SOCKET_DGRAM: 5;
export declare const FILETYPE_SOCKET_STREAM: 6;
export declare const FILETYPE_SYMBOLIC_LINK: 7;
export type WasiFiletype = typeof FILETYPE_UNKNOWN | typeof FILETYPE_BLOCK_DEVICE | typeof FILETYPE_CHARACTER_DEVICE | typeof FILETYPE_DIRECTORY | typeof FILETYPE_REGULAR_FILE | typeof FILETYPE_SOCKET_DGRAM | typeof FILETYPE_SOCKET_STREAM | typeof FILETYPE_SYMBOLIC_LINK;
export declare const FDFLAG_APPEND: number;
export declare const FDFLAG_DSYNC: number;
export declare const FDFLAG_NONBLOCK: number;
export declare const FDFLAG_RSYNC: number;
export declare const FDFLAG_SYNC: number;
export declare const RIGHT_FD_DATASYNC: bigint;
export declare const RIGHT_FD_READ: bigint;
export declare const RIGHT_FD_SEEK: bigint;
export declare const RIGHT_FD_FDSTAT_SET_FLAGS: bigint;
export declare const RIGHT_FD_SYNC: bigint;
export declare const RIGHT_FD_TELL: bigint;
export declare const RIGHT_FD_WRITE: bigint;
export declare const RIGHT_FD_ADVISE: bigint;
export declare const RIGHT_FD_ALLOCATE: bigint;
export declare const RIGHT_PATH_CREATE_DIRECTORY: bigint;
export declare const RIGHT_PATH_CREATE_FILE: bigint;
export declare const RIGHT_PATH_LINK_SOURCE: bigint;
export declare const RIGHT_PATH_LINK_TARGET: bigint;
export declare const RIGHT_PATH_OPEN: bigint;
export declare const RIGHT_FD_READDIR: bigint;
export declare const RIGHT_PATH_READLINK: bigint;
export declare const RIGHT_PATH_RENAME_SOURCE: bigint;
export declare const RIGHT_PATH_RENAME_TARGET: bigint;
export declare const RIGHT_PATH_FILESTAT_GET: bigint;
export declare const RIGHT_PATH_FILESTAT_SET_SIZE: bigint;
export declare const RIGHT_PATH_FILESTAT_SET_TIMES: bigint;
export declare const RIGHT_FD_FILESTAT_GET: bigint;
export declare const RIGHT_FD_FILESTAT_SET_SIZE: bigint;
export declare const RIGHT_FD_FILESTAT_SET_TIMES: bigint;
export declare const RIGHT_PATH_SYMLINK: bigint;
export declare const RIGHT_PATH_REMOVE_DIRECTORY: bigint;
export declare const RIGHT_PATH_UNLINK_FILE: bigint;
export declare const RIGHT_POLL_FD_READWRITE: bigint;
export declare const RIGHT_SOCK_SHUTDOWN: bigint;
export declare const RIGHT_SOCK_ACCEPT: bigint;
export declare const RIGHTS_STDIO: bigint;
export declare const RIGHTS_FILE_ALL: bigint;
export declare const RIGHTS_DIR_ALL: bigint;
export declare const ERRNO_SUCCESS = 0;
export declare const ERRNO_EADDRINUSE = 3;
export declare const ERRNO_EACCES = 2;
export declare const ERRNO_EAGAIN = 6;
export declare const ERRNO_EBADF = 8;
export declare const ERRNO_ECHILD = 10;
export declare const ERRNO_ECONNREFUSED = 14;
export declare const ERRNO_EEXIST = 20;
export declare const ERRNO_EINVAL = 28;
export declare const ERRNO_EIO = 76;
export declare const ERRNO_EISDIR = 31;
export declare const ERRNO_ENOENT = 44;
export declare const ERRNO_ENOSPC = 51;
export declare const ERRNO_ENOSYS = 52;
export declare const ERRNO_ENOTDIR = 54;
export declare const ERRNO_ENOTEMPTY = 55;
export declare const ERRNO_EPERM = 63;
export declare const ERRNO_EPIPE = 64;
export declare const ERRNO_ESPIPE = 70;
export declare const ERRNO_ESRCH = 71;
export declare const ERRNO_ETIMEDOUT = 73;
/** Map POSIX error code strings to WASI errno numbers. */
export declare const ERRNO_MAP: Record<string, number>;
//# sourceMappingURL=wasi-constants.d.ts.map