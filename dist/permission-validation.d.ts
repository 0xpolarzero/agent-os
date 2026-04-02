/**
 * Validate permission callback source strings before revival via new Function().
 *
 * Permission callbacks are serialized with fn.toString() on the host and revived
 * in the Web Worker. Because revival uses new Function(), the source must be
 * validated to prevent code injection.
 */
/**
 * Validate that a permission callback source string is safe to revive.
 *
 * Returns true if the source appears to be a safe function expression.
 * Returns false if the source contains blocked patterns that could indicate
 * code injection.
 */
export declare function validatePermissionSource(source: string): boolean;
