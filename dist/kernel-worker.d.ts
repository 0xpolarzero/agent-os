/**
 * Worker entry for WasmVM kernel-integrated execution.
 *
 * Runs a single WASM command inside a worker thread. Communicates
 * with the main thread via SharedArrayBuffer RPC for synchronous
 * kernel calls (file I/O, VFS, process spawn) and postMessage for
 * stdout/stderr streaming.
 *
 * proc_spawn is provided as a host_process import so brush-shell
 * pipeline stages route through KernelInterface.spawn() to the
 * correct runtime driver.
 */
export {};
//# sourceMappingURL=kernel-worker.d.ts.map