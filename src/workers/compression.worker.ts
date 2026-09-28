import type { TaskEnvelope, WorkerResponse } from '../types/worker';
import type { CompressionResult, ImageDimensions } from '../types/engine';
import { MIME_TO_EXTENSION } from '../config/mime';
import { TargetSizeSolver } from '../core/solver/TargetSizeSolver';
import { CanvasRasterizer } from '../core/engine/CanvasRasterizer';

// Active task abort controllers for cancellation inside worker
const activeTasks = new Map<string, AbortController>();

self.onmessage = async (e: MessageEvent<TaskEnvelope>) => {
  const envelope = e.data;
  const { taskId, action } = envelope;

  if (action === 'CANCEL') {
    const controller = activeTasks.get(taskId);
    if (controller) {
      controller.abort();
      activeTasks.delete(taskId);
    }
    return;
  }

  const controller = new AbortController();
  activeTasks.set(taskId, controller);

  try {
    let bitmap: ImageBitmap;
    let ownBitmap = false;

    if (envelope.imageBitmap) {
      bitmap = envelope.imageBitmap;
    } else if (envelope.fileBlob) {
      bitmap = await createImageBitmap(envelope.fileBlob);
      ownBitmap = true;
    } else {
      throw new Error('Task missing imageBitmap or fileBlob');
    }

    if (controller.signal.aborted) {
      if (ownBitmap) bitmap.close();
      throw new DOMException('Worker task aborted', 'AbortError');
    }

    const startTime = performance.now();
    let finalBlob: Blob;
    let finalDims: ImageDimensions = envelope.maxDimensions;
    let iterationsCount = 1;
    let downscaled = false;

    if (action === 'SOLVE_TARGET' && envelope.solverOptions?.targetBytes) {
      // Execute TargetSizeSolver loop
      const solverResult = await TargetSizeSolver.solve({
        sourceImage: bitmap,
        targetBytes: envelope.solverOptions.targetBytes,
        format: envelope.format,
        maxDimensions: envelope.maxDimensions,
        toleranceRatio: envelope.solverOptions.toleranceRatio,
        maxIterations: envelope.solverOptions.maxIterations,
        minDimensions: envelope.solverOptions.minDimensions,
        minQuality: envelope.solverOptions.minQuality,
        signal: controller.signal,
      });

      finalBlob = solverResult.finalBlob;
      finalDims = solverResult.finalDimensions;
      iterationsCount = solverResult.iterationsCount;
      downscaled = solverResult.downscaled;
    } else {
      // Standard Direct Compression
      finalBlob = await CanvasRasterizer.renderAndEncode(bitmap, {
        dimensions: envelope.maxDimensions,
        format: envelope.format,
        quality: envelope.options.quality,
        useOffscreen: true,
        signal: controller.signal,
      });
    }

    if (ownBitmap) {
      try {
        bitmap.close();
      } catch {
        // Ignore
      }
    }

    const latencyMs = performance.now() - startTime;
    const sourceSize = envelope.fileBlob ? envelope.fileBlob.size : (envelope.options.targetBytes || 0);
    const outputSize = finalBlob.size;
    const bytesSaved = Math.max(0, sourceSize - outputSize);
    const savingsPercent = sourceSize > 0 ? ((sourceSize - outputSize) / sourceSize) * 100 : 0;
    const compressionRatio = outputSize > 0 ? sourceSize / outputSize : 1;

    const ext = MIME_TO_EXTENSION[envelope.format] || 'jpg';
    const filename = `compressed.${ext}`;

    const result: CompressionResult = {
      blob: finalBlob,
      objectUrl: '', // Will be created on main thread with MemoryLifecycle
      format: envelope.format,
      dimensions: finalDims,
      sourceSize,
      outputSize,
      bytesSaved,
      savingsPercent,
      compressionRatio,
      latencyMs,
      filename,
      iterationsCount,
      downscaled,
    };

    const response: WorkerResponse = {
      taskId,
      success: true,
      result,
    };

    self.postMessage(response);
  } catch (err: unknown) {
    const isAborted = err instanceof DOMException && err.name === 'AbortError';
    const errorMessage = err instanceof Error ? err.message : String(err);

    const errorResponse: WorkerResponse = {
      taskId,
      success: false,
      error: errorMessage,
      isAborted,
    };

    self.postMessage(errorResponse);
  } finally {
    activeTasks.delete(taskId);
  }
};
