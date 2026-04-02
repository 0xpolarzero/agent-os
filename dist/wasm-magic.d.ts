/**
 * WASM magic byte validation.
 *
 * Identifies WASM binaries by reading the first 4 bytes and checking
 * for the magic number (0x00 0x61 0x73 0x6D = "\0asm"), the same
 * approach Linux uses with ELF headers.
 */
/** Check WASM magic bytes — async version for init scans. */
export declare function isWasmBinary(path: string): Promise<boolean>;
/** Check WASM magic bytes — sync version for tryResolve. */
export declare function isWasmBinarySync(path: string): boolean;
//# sourceMappingURL=wasm-magic.d.ts.map