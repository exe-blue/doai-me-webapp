import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  HumanSimulator,
  DEFAULT_HUMAN_SIMULATOR_CONFIG,
  type HumanSimulatorConfig,
} from './HumanSimulator';
import type { AdbController } from './AdbController';

/**
 * Create a mock AdbController with just the methods HumanSimulator needs.
 */
function createMockAdb(): AdbController {
  return {
    executeShell: vi.fn().mockResolvedValue(''),
  } as unknown as AdbController;
}

describe('HumanSimulator', () => {
  let mockAdb: AdbController;
  let simulator: HumanSimulator;

  beforeEach(() => {
    mockAdb = createMockAdb();
    simulator = new HumanSimulator(mockAdb);
  });

  // ----------------------------------------------------------------
  // DEFAULT_HUMAN_SIMULATOR_CONFIG
  // ----------------------------------------------------------------
  describe('DEFAULT_HUMAN_SIMULATOR_CONFIG', () => {
    it('has expected default values', () => {
      expect(DEFAULT_HUMAN_SIMULATOR_CONFIG).toEqual({
        baseDelayMs: 1000,
        delayVariance: 0.3,
        likeProbability: 0.1,
        commentProbability: 0.02,
        minScrollIntervalSec: 15,
        maxScrollIntervalSec: 45,
        screenWidth: 1080,
        screenHeight: 1920,
        coordVariancePx: 15,
        maxNodeVarianceMs: 3000,
        charDelayMs: 80,
      });
    });

    it('has all required fields', () => {
      const keys: (keyof HumanSimulatorConfig)[] = [
        'baseDelayMs',
        'delayVariance',
        'likeProbability',
        'commentProbability',
        'minScrollIntervalSec',
        'maxScrollIntervalSec',
        'screenWidth',
        'screenHeight',
        'coordVariancePx',
        'maxNodeVarianceMs',
        'charDelayMs',
      ];

      for (const key of keys) {
        expect(DEFAULT_HUMAN_SIMULATOR_CONFIG).toHaveProperty(key);
        expect(typeof DEFAULT_HUMAN_SIMULATOR_CONFIG[key]).toBe('number');
      }
    });
  });

  // ----------------------------------------------------------------
  // getConfig()
  // ----------------------------------------------------------------
  describe('getConfig()', () => {
    it('returns a copy of the current config', () => {
      const config = simulator.getConfig();
      expect(config).toEqual(DEFAULT_HUMAN_SIMULATOR_CONFIG);
    });

    it('returns a new object each time (not same reference)', () => {
      const config1 = simulator.getConfig();
      const config2 = simulator.getConfig();
      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });

    it('modifying returned config does not affect internal config', () => {
      const config = simulator.getConfig();
      config.baseDelayMs = 99999;

      const freshConfig = simulator.getConfig();
      expect(freshConfig.baseDelayMs).toBe(DEFAULT_HUMAN_SIMULATOR_CONFIG.baseDelayMs);
    });
  });

  // ----------------------------------------------------------------
  // updateConfig()
  // ----------------------------------------------------------------
  describe('updateConfig()', () => {
    it('merges partial config into current config', () => {
      simulator.updateConfig({ baseDelayMs: 2000, likeProbability: 0.5 });

      const config = simulator.getConfig();
      expect(config.baseDelayMs).toBe(2000);
      expect(config.likeProbability).toBe(0.5);
      // Other fields should remain default
      expect(config.delayVariance).toBe(DEFAULT_HUMAN_SIMULATOR_CONFIG.delayVariance);
      expect(config.screenWidth).toBe(DEFAULT_HUMAN_SIMULATOR_CONFIG.screenWidth);
    });

    it('can update a single field', () => {
      simulator.updateConfig({ screenWidth: 720 });
      expect(simulator.getConfig().screenWidth).toBe(720);
    });
  });

  // ----------------------------------------------------------------
  // addVariance()
  // ----------------------------------------------------------------
  describe('addVariance()', () => {
    it('result is within expected range (default variance)', () => {
      const baseValue = 1000;
      const variance = DEFAULT_HUMAN_SIMULATOR_CONFIG.delayVariance; // 0.3
      const min = baseValue * (1 - variance);
      const max = baseValue * (1 + variance);

      for (let i = 0; i < 100; i++) {
        const result = simulator.addVariance(baseValue);
        expect(result).toBeGreaterThanOrEqual(Math.floor(min));
        expect(result).toBeLessThanOrEqual(Math.ceil(max));
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    it('result is within expected range (custom variance)', () => {
      const baseValue = 500;
      const customVariance = 0.5;
      const min = baseValue * (1 - customVariance);
      const max = baseValue * (1 + customVariance);

      for (let i = 0; i < 100; i++) {
        const result = simulator.addVariance(baseValue, customVariance);
        expect(result).toBeGreaterThanOrEqual(Math.floor(min));
        expect(result).toBeLessThanOrEqual(Math.ceil(max));
      }
    });

    it('returns integer values', () => {
      for (let i = 0; i < 50; i++) {
        const result = simulator.addVariance(333);
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    it('with zero variance, returns the exact value', () => {
      for (let i = 0; i < 20; i++) {
        const result = simulator.addVariance(500, 0);
        expect(result).toBe(500);
      }
    });
  });

  // ----------------------------------------------------------------
  // addCoordVariance()
  // ----------------------------------------------------------------
  describe('addCoordVariance()', () => {
    it('result stays within screen bounds', () => {
      const config = simulator.getConfig();

      for (let i = 0; i < 100; i++) {
        const [rx, ry] = simulator.addCoordVariance(540, 960);
        expect(rx).toBeGreaterThanOrEqual(0);
        expect(rx).toBeLessThanOrEqual(config.screenWidth);
        expect(ry).toBeGreaterThanOrEqual(0);
        expect(ry).toBeLessThanOrEqual(config.screenHeight);
      }
    });

    it('clamps to 0 when near left/top edge', () => {
      for (let i = 0; i < 100; i++) {
        const [rx, ry] = simulator.addCoordVariance(0, 0);
        expect(rx).toBeGreaterThanOrEqual(0);
        expect(ry).toBeGreaterThanOrEqual(0);
      }
    });

    it('clamps to screen max when near right/bottom edge', () => {
      const config = simulator.getConfig();

      for (let i = 0; i < 100; i++) {
        const [rx, ry] = simulator.addCoordVariance(config.screenWidth, config.screenHeight);
        expect(rx).toBeLessThanOrEqual(config.screenWidth);
        expect(ry).toBeLessThanOrEqual(config.screenHeight);
      }
    });

    it('uses custom variance when provided', () => {
      // With variance 0, should return exact coordinates
      for (let i = 0; i < 20; i++) {
        const [rx, ry] = simulator.addCoordVariance(100, 200, 0);
        expect(rx).toBe(100);
        expect(ry).toBe(200);
      }
    });

    it('produces varying results with non-zero variance', () => {
      const results = new Set<string>();
      for (let i = 0; i < 50; i++) {
        const [rx, ry] = simulator.addCoordVariance(540, 960, 15);
        results.add(`${rx},${ry}`);
      }
      // With variance, we should get more than just one unique result
      expect(results.size).toBeGreaterThan(1);
    });
  });

  // ----------------------------------------------------------------
  // addNodeVariance()
  // ----------------------------------------------------------------
  describe('addNodeVariance()', () => {
    it('same nodeId always gives same extra delay', () => {
      const baseDelay = 1000;
      const nodeId = 'node-alpha';

      const result1 = simulator.addNodeVariance(baseDelay, nodeId);
      const result2 = simulator.addNodeVariance(baseDelay, nodeId);
      const result3 = simulator.addNodeVariance(baseDelay, nodeId);

      expect(result1).toBe(result2);
      expect(result2).toBe(result3);
    });

    it('different nodeId gives different extra delay (usually)', () => {
      const baseDelay = 1000;
      const results = new Set<number>();

      // Test with many sufficiently different node IDs to ensure hash diversity
      const nodeIds = [
        'worker-node-alpha-001',
        'worker-node-beta-002',
        'worker-node-gamma-003',
        'worker-node-delta-004',
        'worker-node-epsilon-005',
        'farm-cluster-east-10',
        'farm-cluster-west-20',
        'farm-cluster-south-30',
        'production-server-abc',
        'production-server-xyz',
      ];
      for (const nodeId of nodeIds) {
        results.add(simulator.addNodeVariance(baseDelay, nodeId));
      }

      // With 10 very different node IDs, we should get at least 2 unique delays
      expect(results.size).toBeGreaterThanOrEqual(2);
    });

    it('result is >= baseDelay (extra delay is non-negative)', () => {
      const baseDelay = 500;
      const nodeIds = ['a', 'bb', 'ccc', 'dddd', 'test-node-12345'];

      for (const nodeId of nodeIds) {
        const result = simulator.addNodeVariance(baseDelay, nodeId);
        expect(result).toBeGreaterThanOrEqual(baseDelay);
      }
    });

    it('extra delay is within maxNodeVarianceMs', () => {
      const baseDelay = 1000;
      const maxVariance = DEFAULT_HUMAN_SIMULATOR_CONFIG.maxNodeVarianceMs;
      const nodeIds = ['x', 'y', 'z', 'longernodeid', '12345'];

      for (const nodeId of nodeIds) {
        const result = simulator.addNodeVariance(baseDelay, nodeId);
        const extra = result - baseDelay;
        expect(extra).toBeGreaterThanOrEqual(0);
        expect(extra).toBeLessThanOrEqual(maxVariance);
      }
    });

    it('respects updated maxNodeVarianceMs config', () => {
      simulator.updateConfig({ maxNodeVarianceMs: 100 });
      const baseDelay = 1000;

      for (const nodeId of ['a', 'b', 'c', 'd', 'e']) {
        const result = simulator.addNodeVariance(baseDelay, nodeId);
        const extra = result - baseDelay;
        expect(extra).toBeGreaterThanOrEqual(0);
        expect(extra).toBeLessThanOrEqual(100);
      }
    });
  });

  // ----------------------------------------------------------------
  // shouldPerform()
  // ----------------------------------------------------------------
  describe('shouldPerform()', () => {
    it('probability 0 always returns false', () => {
      for (let i = 0; i < 100; i++) {
        expect(simulator.shouldPerform(0)).toBe(false);
      }
    });

    it('probability 1 always returns true', () => {
      for (let i = 0; i < 100; i++) {
        expect(simulator.shouldPerform(1)).toBe(true);
      }
    });

    it('probability 0.5 returns both true and false over many iterations', () => {
      let trueCount = 0;
      let falseCount = 0;
      const iterations = 500;

      for (let i = 0; i < iterations; i++) {
        if (simulator.shouldPerform(0.5)) {
          trueCount++;
        } else {
          falseCount++;
        }
      }

      // With p=0.5 and 500 iterations, both should be > 0
      expect(trueCount).toBeGreaterThan(0);
      expect(falseCount).toBeGreaterThan(0);
    });

    it('returns boolean type', () => {
      expect(typeof simulator.shouldPerform(0.5)).toBe('boolean');
    });
  });

  // ----------------------------------------------------------------
  // shouldLike()
  // ----------------------------------------------------------------
  describe('shouldLike()', () => {
    it('is probability-based using likeProbability config', () => {
      // With default likeProbability = 0.1, over many iterations
      // most should be false, but some true
      let trueCount = 0;
      const iterations = 1000;

      for (let i = 0; i < iterations; i++) {
        if (simulator.shouldLike()) {
          trueCount++;
        }
      }

      // With p=0.1 over 1000 iterations, expect roughly 100 trues
      // Allow wide range to avoid flaky tests
      expect(trueCount).toBeGreaterThan(0);
      expect(trueCount).toBeLessThan(iterations);
    });

    it('with likeProbability 0, always returns false', () => {
      simulator.updateConfig({ likeProbability: 0 });
      for (let i = 0; i < 100; i++) {
        expect(simulator.shouldLike()).toBe(false);
      }
    });

    it('with likeProbability 1, always returns true', () => {
      simulator.updateConfig({ likeProbability: 1 });
      for (let i = 0; i < 100; i++) {
        expect(simulator.shouldLike()).toBe(true);
      }
    });
  });

  // ----------------------------------------------------------------
  // shouldComment()
  // ----------------------------------------------------------------
  describe('shouldComment()', () => {
    it('is probability-based using commentProbability config', () => {
      // With default commentProbability = 0.02, most should be false
      let trueCount = 0;
      const iterations = 2000;

      for (let i = 0; i < iterations; i++) {
        if (simulator.shouldComment()) {
          trueCount++;
        }
      }

      // Should get some trues but mostly false
      // Very unlikely to get 0 trues in 2000 iterations with p=0.02
      expect(trueCount).toBeGreaterThan(0);
      expect(trueCount).toBeLessThan(iterations);
    });

    it('with commentProbability 0, always returns false', () => {
      simulator.updateConfig({ commentProbability: 0 });
      for (let i = 0; i < 100; i++) {
        expect(simulator.shouldComment()).toBe(false);
      }
    });

    it('with commentProbability 1, always returns true', () => {
      simulator.updateConfig({ commentProbability: 1 });
      for (let i = 0; i < 100; i++) {
        expect(simulator.shouldComment()).toBe(true);
      }
    });
  });

  // ----------------------------------------------------------------
  // getRandomScrollInterval()
  // ----------------------------------------------------------------
  describe('getRandomScrollInterval()', () => {
    it('returns value within configured range (in milliseconds)', () => {
      const config = simulator.getConfig();
      const minMs = config.minScrollIntervalSec * 1000;
      const maxMs = config.maxScrollIntervalSec * 1000;

      for (let i = 0; i < 100; i++) {
        const result = simulator.getRandomScrollInterval();
        expect(result).toBeGreaterThanOrEqual(minMs);
        expect(result).toBeLessThanOrEqual(maxMs);
      }
    });

    it('returns integer values', () => {
      for (let i = 0; i < 50; i++) {
        const result = simulator.getRandomScrollInterval();
        expect(Number.isInteger(result)).toBe(true);
      }
    });

    it('respects updated scroll interval config', () => {
      simulator.updateConfig({ minScrollIntervalSec: 5, maxScrollIntervalSec: 10 });
      const minMs = 5 * 1000;
      const maxMs = 10 * 1000;

      for (let i = 0; i < 100; i++) {
        const result = simulator.getRandomScrollInterval();
        expect(result).toBeGreaterThanOrEqual(minMs);
        expect(result).toBeLessThanOrEqual(maxMs);
      }
    });

    it('produces varying results', () => {
      const results = new Set<number>();
      for (let i = 0; i < 50; i++) {
        results.add(simulator.getRandomScrollInterval());
      }
      // With a range of 15-45 seconds, should get multiple different values
      expect(results.size).toBeGreaterThan(1);
    });
  });

  // ----------------------------------------------------------------
  // Constructor with partial config
  // ----------------------------------------------------------------
  describe('constructor', () => {
    it('accepts partial config and merges with defaults', () => {
      const customSim = new HumanSimulator(mockAdb, { baseDelayMs: 2000 });
      const config = customSim.getConfig();

      expect(config.baseDelayMs).toBe(2000);
      expect(config.delayVariance).toBe(DEFAULT_HUMAN_SIMULATOR_CONFIG.delayVariance);
      expect(config.screenWidth).toBe(DEFAULT_HUMAN_SIMULATOR_CONFIG.screenWidth);
    });

    it('uses all defaults when no config provided', () => {
      const defaultSim = new HumanSimulator(mockAdb);
      expect(defaultSim.getConfig()).toEqual(DEFAULT_HUMAN_SIMULATOR_CONFIG);
    });
  });
});
