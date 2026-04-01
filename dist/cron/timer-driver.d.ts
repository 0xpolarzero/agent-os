import type { ScheduleDriver, ScheduleEntry, ScheduleHandle } from "./schedule-driver.js";
/**
 * Default ScheduleDriver that uses in-process timers. For cron expressions
 * it parses via croner and sets a single timeout for the next fire time,
 * rescheduling after each fire. For ISO 8601 one-shot timestamps it fires
 * once and removes the entry.
 *
 * Uses long-timeout to support delays exceeding setTimeout's 2^31ms limit.
 */
export declare class TimerScheduleDriver implements ScheduleDriver {
    private timers;
    private entries;
    schedule(entry: ScheduleEntry): ScheduleHandle;
    cancel(handle: ScheduleHandle): void;
    dispose(): void;
    private scheduleNext;
}
