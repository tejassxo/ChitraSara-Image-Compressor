import { WORKER_CONSTANTS } from '../../config/constants';
import type { CompressionResult, TaskEnvelope, WorkerResponse } from '../../types';
import { HardwareGovernor } from '../governor/HardwareGovernor';

export type WorkerFactory = () => Worker;

interface ActiveJob {
  envelope: TaskEnvelope;
  resolve: (result: CompressionResult) => void;
  reject: (error: Error) => void;
  workerIndex: number;
  retries: number;
  startTime: number;
  timeoutId?: ReturnType<typeof setTimeout>;
}

export class WorkerPool {
  private static instance: WorkerPool | null = null;
  private maxConcurrency: number;
  private workers: (Worker | null)[] = [];
  private workerBusy: boolean[] = [];
  private activeJobs: Map<number, ActiveJob> = new Map(); // workerIndex -> ActiveJob
  private queue: Array<{
    envelope: TaskEnvelope;
    resolve: (result: CompressionResult) => void;
    reject: (error: Error) => void;
    retries: number;
  }> = [];
  private idleTimers: (ReturnType<typeof setTimeout> | null)[] = [];
  private workerFactory: WorkerFactory;

  constructor(customFactory?: WorkerFactory, maxConcurrencyOverride?: number) {
    const caps = HardwareGovernor.getCapabilities();
    this.maxConcurrency = maxConcurrencyOverride ?? caps.workerCount;
    this.workerFactory =
      customFactory ??
      (() =>
        new Worker(new URL('../../workers/compression.worker.ts', import.meta.url), {
          type: 'module',
        }));

    for (let i = 0; i < this.maxConcurrency; i++) {
      this.workers.push(null);
      this.workerBusy.push(false);
      this.idleTimers.push(null);
    }
  }

  public static getInstance(): WorkerPool {
    if (!this.instance) {
      this.instance = new WorkerPool();
    }
    return this.instance;
  }

  public static resetInstance(): void {
    if (this.instance) {
      this.instance.terminateAll();
      this.instance = null;
    }
  }

  public getMaxConcurrency(): number {
    return this.maxConcurrency;
  }

  public getActiveWorkerCount(): number {
    return this.workerBusy.filter(Boolean).length;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public dispatch(envelope: TaskEnvelope): Promise<CompressionResult> {
    return new Promise<CompressionResult>((resolve, reject) => {
      this.queue.push({
        envelope,
        resolve,
        reject,
        retries: 0,
      });
      this.pump();
    });
  }

  public cancelTask(taskId: string): boolean {
    // 1. Remove from queue if not started
    const queueIndex = this.queue.findIndex((item) => item.envelope.taskId === taskId);
    if (queueIndex !== -1) {
      const removed = this.queue.splice(queueIndex, 1)[0];
      removed.reject(new DOMException('Task canceled in queue', 'AbortError'));
      return true;
    }

    // 2. If running on a worker, notify worker and terminate if needed
    for (const [workerIndex, job] of this.activeJobs.entries()) {
      if (job.envelope.taskId === taskId) {
        const worker = this.workers[workerIndex];
        if (worker) {
          worker.postMessage({ taskId, action: 'CANCEL' });
        }
        if (job.timeoutId) clearTimeout(job.timeoutId);
        this.activeJobs.delete(workerIndex);
        this.workerBusy[workerIndex] = false;
        job.reject(new DOMException('Task canceled during execution', 'AbortError'));
        this.pump();
        return true;
      }
    }

    return false;
  }

  private pump(): void {
    if (this.queue.length === 0) return;

    // Find available worker slot
    const slot = this.workerBusy.findIndex((busy) => !busy);
    if (slot === -1) return; // All slots busy

    const nextJob = this.queue.shift();
    if (!nextJob) return;

    this.workerBusy[slot] = true;
    this.ensureWorker(slot);

    const worker = this.workers[slot];
    if (!worker) {
      this.workerBusy[slot] = false;
      this.queue.unshift(nextJob);
      return;
    }

    // Clear idle timer for this worker
    if (this.idleTimers[slot]) {
      clearTimeout(this.idleTimers[slot]!);
      this.idleTimers[slot] = null;
    }

    const job: ActiveJob = {
      ...nextJob,
      workerIndex: slot,
      startTime: performance.now(),
    };

    // Watchdog timeout to prevent frozen workers
    job.timeoutId = setTimeout(() => {
      this.handleWorkerTimeout(slot);
    }, WORKER_CONSTANTS.TASK_TIMEOUT_MS);

    this.activeJobs.set(slot, job);

    try {
      worker.postMessage(job.envelope);
    } catch (err: unknown) {
      this.handleWorkerError(slot, err instanceof Error ? err : new Error(String(err)));
    }
  }

  private ensureWorker(index: number): Worker {
    if (this.workers[index]) {
      return this.workers[index]!;
    }

    const worker = this.workerFactory();

    worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      this.handleWorkerMessage(index, e.data);
    };

    worker.onerror = (e: ErrorEvent) => {
      this.handleWorkerError(index, new Error(e.message || 'Worker encountered an unhandled error'));
    };

    this.workers[index] = worker;
    return worker;
  }

  private handleWorkerMessage(index: number, response: WorkerResponse): void {
    const job = this.activeJobs.get(index);
    if (!job || job.envelope.taskId !== response.taskId) return;

    if (response.success) {
      if (job.timeoutId) clearTimeout(job.timeoutId);
      this.activeJobs.delete(index);
      this.workerBusy[index] = false;
      this.scheduleIdleReclamation(index);
      job.resolve(response.result);
      this.pump();
    } else {
      if (response.isAborted) {
        if (job.timeoutId) clearTimeout(job.timeoutId);
        this.activeJobs.delete(index);
        this.workerBusy[index] = false;
        job.reject(new DOMException('Worker task aborted', 'AbortError'));
        this.scheduleIdleReclamation(index);
        this.pump();
      } else {
        this.handleJobFailure(index, new Error(response.error || 'Worker execution failed'));
      }
    }
  }

  private handleJobFailure(index: number, error: Error): void {
    const job = this.activeJobs.get(index);
    if (!job) return;

    if (job.timeoutId) clearTimeout(job.timeoutId);
    this.activeJobs.delete(index);
    this.workerBusy[index] = false;

    // Retry up to MAX_RETRY_COUNT
    if (job.retries < WORKER_CONSTANTS.MAX_RETRY_COUNT) {
      job.retries++;
      this.queue.unshift(job);
    } else {
      job.reject(error);
    }

    this.scheduleIdleReclamation(index);
    this.pump();
  }

  private handleWorkerTimeout(index: number): void {
    const job = this.activeJobs.get(index);
    if (!job) return;

    this.terminateWorker(index);
    this.handleJobFailure(index, new Error(`Task ${job.envelope.taskId} timed out after 30s`));
  }

  private handleWorkerError(index: number, error: Error): void {
    const job = this.activeJobs.get(index);
    this.terminateWorker(index);

    if (job) {
      this.handleJobFailure(index, error);
    } else {
      this.workerBusy[index] = false;
      this.pump();
    }
  }

  private scheduleIdleReclamation(index: number): void {
    if (this.idleTimers[index]) {
      clearTimeout(this.idleTimers[index]!);
    }

    this.idleTimers[index] = setTimeout(() => {
      // If still idle, terminate to reclaim resources
      if (!this.workerBusy[index]) {
        this.terminateWorker(index);
      }
      this.idleTimers[index] = null;
    }, WORKER_CONSTANTS.IDLE_RECLAMATION_MS);
  }

  private terminateWorker(index: number): void {
    const worker = this.workers[index];
    if (worker) {
      try {
        worker.terminate();
      } catch {
        // Ignore termination error
      }
      this.workers[index] = null;
    }
    this.workerBusy[index] = false;
  }

  public terminateAll(): void {
    for (let i = 0; i < this.workers.length; i++) {
      if (this.idleTimers[i]) {
        clearTimeout(this.idleTimers[i]!);
        this.idleTimers[i] = null;
      }
      this.terminateWorker(i);
    }

    for (const [, job] of this.activeJobs.entries()) {
      if (job.timeoutId) clearTimeout(job.timeoutId);
      job.reject(new DOMException('Worker pool terminated', 'AbortError'));
    }
    this.activeJobs.clear();

    for (const queued of this.queue) {
      queued.reject(new DOMException('Worker pool terminated', 'AbortError'));
    }
    this.queue = [];
  }
}
