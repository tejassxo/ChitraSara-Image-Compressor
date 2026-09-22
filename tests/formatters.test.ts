import { describe, expect, it } from 'vitest';
import { formatBytes, formatDimensions, formatLatency, formatPercent } from '../src/utils/formatters';

describe('Unit Formatting Utilities', () => {
  describe('formatBytes', () => {
    it('formats 0 or negative bytes as "0 B"', () => {
      expect(formatBytes(0)).toBe('0 B');
      expect(formatBytes(-100)).toBe('0 B');
    });

    it('formats Bytes, KB, MB, and GB boundaries with specified decimal places', () => {
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(2621440, 2)).toBe('2.5 MB');
      expect(formatBytes(1073741824)).toBe('1 GB');
    });
  });

  describe('formatLatency', () => {
    it('formats sub-millisecond latencies as "< 1ms"', () => {
      expect(formatLatency(0.4)).toBe('< 1ms');
    });

    it('formats millisecond latencies', () => {
      expect(formatLatency(42.3)).toBe('42ms');
      expect(formatLatency(500)).toBe('500ms');
    });

    it('formats second-level latencies', () => {
      expect(formatLatency(1250)).toBe('1.25s');
    });
  });

  describe('formatDimensions', () => {
    it('formats integer dimensions with px suffix', () => {
      expect(formatDimensions(1920, 1080)).toBe('1920 × 1080 px');
      expect(formatDimensions(1920.4, 1079.8)).toBe('1920 × 1080 px');
    });
  });

  describe('formatPercent', () => {
    it('formats positive savings with minus sign', () => {
      expect(formatPercent(45.67)).toBe('-45.7%');
    });

    it('formats negative savings (size increase) with plus sign', () => {
      expect(formatPercent(-12.4)).toBe('+12.4%');
    });
  });
});
