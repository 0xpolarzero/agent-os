import type { AgentOs } from "../agent-os.js";
import type { ScheduleDriver } from "./schedule-driver.js";
import type { CronEventHandler, CronJob, CronJobInfo, CronJobOptions } from "./types.js";
/**
 * Internal class that bridges ScheduleDriver and AgentOs. Owns the job
 * registry, executes actions, and emits lifecycle events.
 */
export declare class CronManager {
    private jobs;
    private driver;
    private vm;
    private listeners;
    constructor(vm: AgentOs, driver: ScheduleDriver);
    schedule(options: CronJobOptions): CronJob;
    cancel(id: string): void;
    list(): CronJobInfo[];
    onEvent(handler: CronEventHandler): void;
    dispose(): void;
    private emit;
    private executeJob;
    private runAction;
}
