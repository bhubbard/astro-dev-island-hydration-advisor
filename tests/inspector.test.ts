import { describe, it, expect } from 'bun:test';
import {
  parseDirective,
  isElementBelowFold,
  calculateDistanceFromFold,
  assessIsland,
  inspectIslands,
  type IslandInfo
} from '../src/inspector.js';

describe('Inspector: parseDirective', () => {
  it('should correctly normalize Astro hydration directives', () => {
    expect(parseDirective('load')).toBe('load');
    expect(parseDirective('client:load')).toBe('load');
    expect(parseDirective('idle')).toBe('idle');
    expect(parseDirective('client:idle')).toBe('idle');
    expect(parseDirective('visible')).toBe('visible');
    expect(parseDirective('client:visible')).toBe('visible');
    expect(parseDirective('only')).toBe('only');
    expect(parseDirective('client:only')).toBe('only');
    expect(parseDirective('ai-ready')).toBe('ai-ready');
    expect(parseDirective('client:ai-ready')).toBe('ai-ready');
    expect(parseDirective('media (max-width: 600px)')).toBe('media');
    expect(parseDirective(null)).toBe('none');
    expect(parseDirective(undefined)).toBe('none');
    expect(parseDirective('custom-directive')).toBe('custom');
  });
});

describe('Inspector: Fold Detection', () => {
  const viewportHeight = 800;

  it('should detect when an element is below the fold', () => {
    expect(isElementBelowFold({ top: 900, bottom: 1100 }, viewportHeight)).toBe(true);
    expect(isElementBelowFold({ top: 800, bottom: 1000 }, viewportHeight)).toBe(true);
    expect(isElementBelowFold({ top: 799, bottom: 950 }, viewportHeight)).toBe(false);
    expect(isElementBelowFold({ top: 100, bottom: 300 }, viewportHeight)).toBe(false);
  });

  it('should calculate distance from fold line accurately', () => {
    expect(calculateDistanceFromFold({ top: 1200 }, viewportHeight)).toBe(400);
    expect(calculateDistanceFromFold({ top: 800 }, viewportHeight)).toBe(0);
    expect(calculateDistanceFromFold({ top: 500 }, viewportHeight)).toBe(0);
  });
});

describe('Inspector: assessIsland', () => {
  it('should flag eager client:load below fold as critical', () => {
    const assessment = assessIsland('load', true, 500, 20, 100);
    expect(assessment.severity).toBe('critical');
    expect(assessment.recommendedDirective).toBe('visible');
    expect(assessment.reason).toContain('blocks the main thread');
  });

  it('should recommend client:idle for near-fold client:load', () => {
    const assessment = assessIsland('load', true, 100, 20, 100);
    expect(assessment.severity).toBe('critical');
    expect(assessment.recommendedDirective).toBe('idle');
  });

  it('should flag heavy client:load above fold as warning', () => {
    const assessment = assessIsland('load', false, 0, 120, 500);
    expect(assessment.severity).toBe('warning');
    expect(assessment.recommendedDirective).toBe('idle');
    expect(assessment.reason).toContain('Heavy island (120 DOM nodes)');
  });

  it('should flag client:only below fold as warning', () => {
    const assessment = assessIsland('only', true, 600, 10, 50);
    expect(assessment.severity).toBe('warning');
    expect(assessment.recommendedDirective).toBe('visible');
  });

  it('should flag client:idle far below fold as info', () => {
    const assessment = assessIsland('idle', true, 900, 10, 50);
    expect(assessment.severity).toBe('info');
    expect(assessment.recommendedDirective).toBe('visible');
  });

  it('should validate optimal hydration directives', () => {
    const goodVisible = assessIsland('visible', true, 500, 30, 200);
    expect(goodVisible.severity).toBe('good');
    expect(goodVisible.recommendedDirective).toBe('visible');

    const goodLoad = assessIsland('load', false, 0, 10, 50);
    expect(goodLoad.severity).toBe('good');
    expect(goodLoad.recommendedDirective).toBe('load');

    const goodAi = assessIsland('ai-ready', false, 0, 10, 50);
    expect(goodAi.severity).toBe('good');
    expect(goodAi.recommendedDirective).toBe('ai-ready');
  });
});

describe('Inspector: inspectIslands DOM scan', () => {
  it('should return empty report when no islands exist', () => {
    const mockDoc = {
      querySelectorAll: () => []
    } as unknown as Document;

    const report = inspectIslands(mockDoc, 800, 1200);
    expect(report.totalIslands).toBe(0);
    expect(report.flaggedCount).toBe(0);
    expect(report.islands.length).toBe(0);
  });

  it('should parse and assess simulated astro-island elements', () => {
    const mockElements = [
      {
        getAttribute: (attr: string) => {
          if (attr === 'client') return 'load';
          if (attr === 'component-url') return '/src/components/FooterNewsletter.tsx';
          if (attr === 'uid') return 'island-1';
          return null;
        },
        querySelectorAll: () => [{}, {}, {}],
        getBoundingClientRect: () => ({ top: 1200, bottom: 1400, left: 0, right: 800, width: 800, height: 200 })
      },
      {
        getAttribute: (attr: string) => {
          if (attr === 'client') return 'visible';
          if (attr === 'component-url') return '/src/components/PricingTable.vue';
          if (attr === 'uid') return 'island-2';
          return null;
        },
        querySelectorAll: () => [{}, {}],
        getBoundingClientRect: () => ({ top: 900, bottom: 1100, left: 0, right: 800, width: 800, height: 200 })
      },
      {
        getAttribute: (attr: string) => {
          if (attr === 'client') return 'load';
          if (attr === 'component-url') return '/src/components/HeroNav.svelte';
          if (attr === 'uid') return 'island-3';
          return null;
        },
        querySelectorAll: () => [{}],
        getBoundingClientRect: () => ({ top: 50, bottom: 100, left: 0, right: 800, width: 800, height: 50 })
      }
    ];

    const mockDoc = {
      querySelectorAll: (sel: string) => (sel === 'astro-island' ? mockElements : [])
    } as unknown as Document;

    const report = inspectIslands(mockDoc, 800, 1200);
    expect(report.totalIslands).toBe(3);
    expect(report.loadCount).toBe(2);
    expect(report.visibleCount).toBe(1);
    expect(report.eagerBelowFoldCount).toBe(1);
    expect(report.flaggedCount).toBe(1);

    const island1 = report.islands.find((i) => i.id === 'island-1') as IslandInfo;
    expect(island1.isBelowFold).toBe(true);
    expect(island1.severity).toBe('critical');
    expect(island1.recommendedDirective).toBe('visible');

    const island2 = report.islands.find((i) => i.id === 'island-2') as IslandInfo;
    expect(island2.isBelowFold).toBe(true);
    expect(island2.severity).toBe('good');

    const island3 = report.islands.find((i) => i.id === 'island-3') as IslandInfo;
    expect(island3.isAboveFold).toBe(true);
    expect(island3.severity).toBe('good');
  });
});
