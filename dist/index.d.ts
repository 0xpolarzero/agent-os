/**
 * Google Drive-backed FsBlockStore.
 *
 * Stores blocks as files in a Google Drive folder using the Drive API v3.
 * Block key "ino/chunkIndex" maps to a file named "{keyPrefix}{key}" in the
 * configured folder.
 *
 * Implements the FsBlockStore interface from @secure-exec/core so it can be
 * composed with any FsMetadataStore via ChunkedVFS.
 *
 * **Preview**: This package is in preview and may have breaking changes.
 */
import type { FsBlockStore } from "@secure-exec/core";
export interface GoogleDriveCredentials {
    /** Google service account client email. */
    clientEmail: string;
    /** Google service account private key (PEM format). */
    privateKey: string;
}
export interface GoogleDriveBlockStoreOptions {
    /** Google service account credentials. */
    credentials: GoogleDriveCredentials;
    /** Google Drive folder ID where blocks are stored. */
    folderId: string;
    /** Optional prefix for block file names. */
    keyPrefix?: string;
}
export declare class GoogleDriveBlockStore implements FsBlockStore {
    private drive;
    private folderId;
    private prefix;
    /** Cache file name -> Drive file ID to avoid repeated lookups. */
    private fileIdCache;
    constructor(options: GoogleDriveBlockStoreOptions);
    private fileName;
    /**
     * Find the Drive file ID for a given block key.
     * Returns null if the file does not exist.
     */
    private findFileId;
    read(key: string): Promise<Uint8Array>;
    readRange(key: string, offset: number, length: number): Promise<Uint8Array>;
    write(key: string, data: Uint8Array): Promise<void>;
    delete(key: string): Promise<void>;
    deleteMany(keys: string[]): Promise<void>;
    copy(srcKey: string, dstKey: string): Promise<void>;
}
