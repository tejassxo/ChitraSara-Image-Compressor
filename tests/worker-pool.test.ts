import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { WorkerPool } from '../src/core/workers/WorkerPool';
import { HardwareGovernor } from '../src/core/governor/HardwareGovernor';
import type { TaskEnvelope, WorkerResponse } from '../src/types';

// Mock Worker implementation for testing WorkerPool logic
class MockWorker {
  public onmessage: ((e: MessageEvent<WorkerResponse>) => void) | null = null;
  public onerror: ((e: ErrorEvent) => void) | null = null;
  public terminated = false;
  public messages: TaskEnvelope[] = [];

  postMessage(message: TaskEnvelope): void {
    this.messages.push(message);
  }

  terminate(): void {
    this.terminated = true;
  }

  // Test helper to simulate worker replying
  simulateSuccess(taskId: string): void {
    if (this.onmessage) {
      this.onmessage({
        data: {
          taskId,
          success: true,
          result: {
            blob: new Blob(['test'], { type: 'image/jpeg' }),
            objectUrl: 'blob:test',
            format: 'image/jpeg',
            dimensions: { width: 100, height: 100 },
            sourceSize: 1000,
            outputSize: 500,
            bytesSaved: 500,
            savingsPercent: 50,
            compressionRatio: 2,
            latencyMs: 10,
            filename: 'test.min.jpg',
          },
        },
      } as MessageEvent<WorkerResponse>);
    }
  }

  simulateError(taskId: string, errorMsg: string): void {
    if (this.onmessage) {
      this.onmessage({
        data: {
          taskId,
          success: false,
          error: errorMsg,
        },
      } as MessageEvent<WorkerResponse>);
    }
  }

  simulateCrash(errorMsg: string): void {
    if (this.onerror) {
      this.onerror({ message: errorMsg } as ErrorEvent);
    }
  }
}

describe('WorkerPool - Dynamic Lifecycle & Fault Tolerance', () => {
  let createdWorkers: MockWorker[] = [];

  const mockFactory = () => {
    const worker = new MockWorker();
    createdWorkers.push(worker);
    return worker as unknown as Worker;
  };

  beforeEach(() => {
    createdWorkers = [];
    HardwareGovernor.resetCache();
  });

  afterEach(() => {
    WorkerPool.resetInstance();
  });

  it('enforces concurrency limit matching LOW (1), BALANCED (<= 3), and HIGH (<= 6) profiles', () => {
    // 1. LOW profile (<= 2 cores or <= 2GB) -> 1 worker
    const lowPool = new WorkerPool(mockFactory, 1);
    expect(lowPool.getMaxConcurrency()).toBe(1);

    // 2. BALANCED profile (4 cores) -> clamped to <= 3
    const balancedPool = new WorkerPool(mockFactory, 3);
    expect(balancedPool.getMaxConcurrency()).toBe(3);

    // 3. HIGH profile (8 cores) -> clamped to <= 6
    const highPool = new WorkerPool(mockFactory, 6);
    expect(highPool.getMaxConcurrency()).toBe(6);
  });

  it('dispatches jobs and resolves when worker posts success', async () => {
    const pool = new WorkerPool(mockFactory, 2);

    const taskEnvelope: TaskEnvelope = {
      taskId: 'task-1',
      action: 'COMPRESS',
      options: {
        format: 'image/jpeg',
        quality: 0.8,
        resize: { mode: 'original', maintainAspectRatio: true },
      },
      format: 'image/jpeg',
      maxDimensions: { width: 100, height: 100 },
    };

    const promise = pool.dispatch(taskEnvelope);

    expect(createdWorkers.length).toBe(1);
    expect(pool.getActiveWorkerCount()).toBe(1);

    // Simulate worker success
    createdWorkers[0].simulateSuccess('task-1');

    const result = await promise;
    expect(result.format).toBe('image/jpeg');
    expect(result.outputSize).toBe(500);
    expect(pool.getActiveWorkerCount()).toBe(0);
  });

  it('cancels queued tasks immediately without executing them', async () => {
    const pool = new WorkerPool(mockFactory, 1);

    // Fill the 1 slot
    const task1: TaskEnvelope = {
      taskId: 'task-1',
      action: 'COMPRESS',
      options: { format: 'image/jpeg', quality: 0.8, resize: { mode: 'original', maintainAspectRatio: true } },
      format: 'image/jpeg',
      maxDimensions: { width: 100, height: 100 },
    };

    const task2: TaskEnvelope = {
      taskId: 'task-2',
      action: 'COMPRESS',
      options: { format: 'image/jpeg', quality: 0.8, resize: { mode: 'original', maintainAspectRatio: true } },
      format: 'image/jpeg',
      maxDimensions: { width: 100, height: 100 },
    };

    const promise1 = pool.dispatch(task1);
    const promise2 = pool.dispatch(task2);

    expect(pool.getQueueLength()).toBe(1);

    // Cancel queued task2
    const canceled = pool.cancelTask('task-2');
    expect(canceled).toBe(true);

    await expect(promise2).rejects.toThrow('Task canceled in queue');

    // Complete task1
    createdWorkers[0].simulateSuccess('task-1');
    await promise1;
  });

  it('recovers cleanly from worker crash and retries failed tasks up to 2 times', async () => {
    const pool = new WorkerPool(mockFactory, 1);

    const task: TaskEnvelope = {
      taskId: 'task-retry',
      action: 'COMPRESS',
      options: { format: 'image/jpeg', quality: 0.8, resize: { mode: 'original', maintainAspectRatio: true } },
      format: 'image/jpeg',
      maxDimensions: { width: 100, height: 100 },
    };

    const promise = pool.dispatch(task);
    expect(createdWorkers.length).toBe(1);

    // 1st crash
    createdWorkers[0].simulateCrash('OOM Killed');
    expect(createdWorkers[0].terminated).toBe(true);

    // Should spawn replacement worker for retry 1
    expect(createdWorkers.length).toBe(2);

    // 2nd crash
    createdWorkers[1].simulateCrash('OOM Killed 2');
    expect(createdWorkers[1].terminated).toBe(true);

    // Should spawn replacement worker for retry 2
    expect(createdWorkers.length).toBe(3);

    // Simulate success on 3rd attempt
    createdWorkers[2].simulateSuccess('task-retry');

    const result = await promise;
    expect(result.outputSize).toBe(500);
  });
});
