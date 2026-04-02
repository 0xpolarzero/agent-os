/**
 * S3-backed FsBlockStore.
 *
 * Stores blocks as objects in S3-compatible storage (AWS S3, MinIO, etc.).
 * Block key "ino/chunkIndex" maps to S3 object key "{prefix}blocks/{key}".
 *
 * Implements the FsBlockStore interface from @secure-exec/core so it can be
 * composed with any FsMetadataStore via ChunkedVFS.
 */
import type { FsBlockStore, VirtualFileSystem } from "@secure-exec/core";
export interface S3BlockStoreOptions {
    /** S3 bucket name. */
    bucket: string;
    /** Key prefix prepended to all block keys (e.g. "vm-1/"). Trailing slash added automatically. */
    prefix?: string;
    /** AWS region (default "us-east-1"). */
    region?: string;
    /** Explicit credentials (otherwise uses default SDK chain). */
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
    };
    /** Custom S3-compatible endpoint URL (e.g. for MinIO). */
    endpoint?: string;
}
export declare class S3BlockStore implements FsBlockStore {
    private client;
    private bucket;
    private prefix;
    constructor(options: S3BlockStoreOptions);
    private objectKey;
    read(key: string): Promise<Uint8Array>;
    readRange(key: string, offset: number, length: number): Promise<Uint8Array>;
    write(key: string, data: Uint8Array): Promise<void>;
    delete(key: string): Promise<void>;
    deleteMany(keys: string[]): Promise<void>;
    copy(srcKey: string, dstKey: string): Promise<void>;
}
/** @deprecated Use S3BlockStore with ChunkedVFS instead. */
export interface S3FsOptions {
    bucket: string;
    prefix?: string;
    region?: string;
    credentials?: {
        accessKeyId: string;
        secretAccessKey: string;
    };
    endpoint?: string;
}
/**
 * Create a VirtualFileSystem backed by S3 via ChunkedVFS.
 * @deprecated Use S3BlockStore with ChunkedVFS directly.
 */
export declare function createS3Backend(options: S3FsOptions): VirtualFileSystem;
