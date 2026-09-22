import { describe, expect, it, vi } from 'vitest';
import { Store } from '../src/state/Store';

describe('Store - Zero-Dependency Reactive Pub-Sub', () => {
  it('initializes with default options and autoProcess enabled', () => {
    const store = new Store();
    const state = store.getState();

    expect(state.autoProcess).toBe(true);
    expect(state.options.quality).toBe(0.75);
    expect(state.options.format).toBe('original');
    expect(state.sourceImage).toBeNull();
  });

  it('notifies subscribers on state updates', () => {
    const store = new Store();
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState({ isProcessing: true });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ isProcessing: true }),
      expect.objectContaining({ isProcessing: false })
    );
  });

  it('unsubscribes listeners cleanly', () => {
    const store = new Store();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.setState({ isProcessing: true });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    store.setState({ isProcessing: false });
    expect(listener).toHaveBeenCalledTimes(1); // not called again
  });

  it('updates options deeply with updateOptions', () => {
    const store = new Store();
    store.updateOptions({
      quality: 0.9,
      resize: { mode: 'constraint', maxWidth: 1920, maintainAspectRatio: true },
    });

    const state = store.getState();
    expect(state.options.quality).toBe(0.9);
    expect(state.options.resize.mode).toBe('constraint');
    expect(state.options.resize.maxWidth).toBe(1920);
    expect(state.options.resize.maintainAspectRatio).toBe(true);
  });

  it('revokes URLs on reset', () => {
    const revokeSpy = vi.spyOn(URL, 'revokeObjectURL');
    const store = new Store({
      sourceImage: {
        file: new File([], 'test.jpg', { type: 'image/jpeg' }),
        originalUrl: 'blob:test-orig-url',
        dimensions: { width: 100, height: 100 },
        size: 1000,
        type: 'image/jpeg',
      },
      compressionResult: {
        blob: new Blob(),
        objectUrl: 'blob:test-comp-url',
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
    });

    store.reset();
    expect(revokeSpy).toHaveBeenCalledWith('blob:test-orig-url');
    expect(revokeSpy).toHaveBeenCalledWith('blob:test-comp-url');
    expect(store.getState().sourceImage).toBeNull();
    expect(store.getState().compressionResult).toBeNull();

    revokeSpy.mockRestore();
  });
});
