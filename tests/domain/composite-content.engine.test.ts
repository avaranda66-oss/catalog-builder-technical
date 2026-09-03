// tests/domain/composite-content.engine.test.ts
// Testes unitários para o motor puro de conteúdo composto (CORE.E6B).

import { describe, it, expect } from 'vitest';
import { ContentBlock } from '../../src/domain/catalog.schema';
import {
  getEffectiveModeDesc,
  getMultiModeItems,
  buildMultiModeItemsPatch,
  getSoftwareConnectivityItems,
  buildSoftwareConnectivityItemsPatch,
  CalibratorModeItem,
  SoftwareConnectivityItem
} from '../../src/domain/composite-content.engine';

describe('composite-content.engine', () => {
  describe('getEffectiveModeDesc', () => {
    it('prioritizes desc over legacy description', () => {
      const mode: CalibratorModeItem = {
        id: 'm1',
        badge: '01',
        title: 'Mode',
        desc: 'New Description',
        description: 'Old Description'
      };
      expect(getEffectiveModeDesc(mode)).toBe('New Description');
    });

    it('falls back to legacy description if desc is empty or absent', () => {
      const mode: CalibratorModeItem = {
        id: 'm2',
        badge: '01',
        title: 'Mode',
        desc: '',
        description: 'Legacy Description'
      };
      expect(getEffectiveModeDesc(mode)).toBe('Legacy Description');
    });

    it('returns empty string if neither is present', () => {
      const mode: CalibratorModeItem = {
        id: 'm3',
        badge: '01',
        title: 'Mode',
        desc: ''
      };
      expect(getEffectiveModeDesc(mode)).toBe('');
    });
  });

  describe('getMultiModeItems', () => {
    it('returns empty array when customData or modes is undefined', () => {
      const block: ContentBlock = {
        id: 'b1',
        type: 'multi_mode_calibrator'
      };
      expect(getMultiModeItems(block)).toEqual([]);
    });

    it('returns normalized items with desc populated from legacy description', () => {
      const block: ContentBlock = {
        id: 'b1',
        type: 'multi_mode_calibrator',
        customData: {
          modes: [
            { id: 'm1', badge: '01', title: 'Mode 1', description: 'Legacy 1' },
            { id: 'm2', badge: '02', title: 'Mode 2', desc: 'Canonical 2' }
          ]
        }
      };

      const modes = getMultiModeItems(block);
      expect(modes).toHaveLength(2);
      expect(modes[0].desc).toBe('Legacy 1');
      expect(modes[1].desc).toBe('Canonical 2');
    });
  });

  describe('buildMultiModeItemsPatch', () => {
    it('preserves unrelated customData and writes desc only', () => {
      const block: ContentBlock = {
        id: 'b1',
        type: 'multi_mode_calibrator',
        customData: {
          preserveMe: 'important_value',
          modes: [{ id: 'm1', badge: '01', title: 'Old', desc: 'Old' }]
        }
      };

      const newModes: CalibratorModeItem[] = [
        { id: 'm1', badge: '01', title: 'New Title', desc: 'New Desc', description: 'Stale' }
      ];

      const patch = buildMultiModeItemsPatch(block, newModes);
      expect(patch.customData.preserveMe).toBe('important_value');
      expect(patch.customData.modes).toHaveLength(1);
      expect(patch.customData.modes[0].title).toBe('New Title');
      expect(patch.customData.modes[0].desc).toBe('New Desc');
      expect(patch.customData.modes[0].description).toBeUndefined(); // Normalized out
    });

    it('handles block with undefined customData without crashing', () => {
      const block: ContentBlock = {
        id: 'b1',
        type: 'multi_mode_calibrator'
      };

      const newModes: CalibratorModeItem[] = [
        { id: 'm1', badge: '01', title: 'First', desc: 'First' }
      ];

      const patch = buildMultiModeItemsPatch(block, newModes);
      expect(patch.customData.modes).toEqual(newModes);
    });
  });

  describe('getSoftwareConnectivityItems and buildSoftwareConnectivityItemsPatch', () => {
    it('returns empty array when customData or items is undefined', () => {
      const block: ContentBlock = {
        id: 'b1',
        type: 'software_connectivity'
      };
      expect(getSoftwareConnectivityItems(block)).toEqual([]);
    });

    it('preserves unrelated customData when updating items', () => {
      const block: ContentBlock = {
        id: 'b1',
        type: 'software_connectivity',
        customData: {
          unrelatedFlag: true,
          nested: { key: 123 }
        }
      };

      const newItems: SoftwareConnectivityItem[] = [
        { badge: 'Tag', title: 'Title', desc: 'Desc' }
      ];

      const patch = buildSoftwareConnectivityItemsPatch(block, newItems);
      expect(patch.customData.unrelatedFlag).toBe(true);
      expect(patch.customData.nested).toEqual({ key: 123 });
      expect(patch.customData.items).toEqual(newItems);
    });
  });
});
