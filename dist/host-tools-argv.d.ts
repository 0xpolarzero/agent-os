import type { ZodType } from "zod";
/**
 * Convert camelCase to kebab-case.
 * fullPage -> full-page
 */
export declare function camelToKebab(str: string): string;
export interface FieldInfo {
    camelName: string;
    typeName: string;
    isOptional: boolean;
    innerTypeName: string;
    arrayItemTypeName: string | null;
}
/**
 * Unwrap ZodOptional/ZodDefault layers to get the inner type.
 */
export declare function unwrapType(schema: ZodType): {
    typeName: string;
    isOptional: boolean;
};
/**
 * Extract field info from a ZodObject schema.
 */
export declare function getFieldInfos(schema: ZodType): Map<string, FieldInfo>;
interface ParseResult {
    ok: true;
    input: Record<string, unknown>;
}
interface ParseError {
    ok: false;
    message: string;
}
/**
 * Parse argv against a zod schema to produce input JSON.
 *
 * Mapping rules:
 * - camelCase zod fields map to kebab-case flags: fullPage -> --full-page
 * - z.string(): --name value -> {name: "value"}
 * - z.number(): --limit 5 -> {limit: 5}
 * - z.boolean(): --full-page -> {fullPage: true}, --no-full-page -> {fullPage: false}
 * - z.enum(): --format json -> {format: "json"}
 * - z.array(z.string()): --tags foo --tags bar -> {tags: ["foo", "bar"]}
 * - Optional fields omitted from argv are undefined in input
 * - Unknown flags return error
 * - Missing required fields return error with field name
 */
export declare function parseArgv(schema: ZodType, argv: string[]): ParseResult | ParseError;
/**
 * Get the description from a ZodType, unwrapping Optional/Default layers.
 */
export declare function getZodDescription(schema: ZodType): string | undefined;
/**
 * Get enum values from a ZodEnum schema, unwrapping Optional/Default layers.
 */
export declare function getZodEnumValues(schema: ZodType): string[] | undefined;
export {};
