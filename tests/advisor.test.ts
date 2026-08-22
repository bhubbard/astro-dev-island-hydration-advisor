import { describe, it, expect } from 'bun:test';
import {
  buildPromptForIsland,
  buildPromptForPage,
  getAdvisorSystemPrompt,
  generateHeuristicAdvice,
  checkAIAvailability,
  adviseIsland
} from '../src/advisor.js';
import type { IslandInfo, IslandReport } from '../src/inspector.js';

describe('Advisor: Prompt Formatting', () => {
  const sampleIsland: IslandInfo = {
    id: 'island-1',
    componentUrl: '/src/components/HeavyChart.tsx',
    componentExport: 'default',
    directive: 'load',
    directiveRaw: 'load',
    rect: { top: 1400, bottom: 1800, left: 0, right: 600, width: 600, height: 400 },
    isAboveFold: false,
    isBelowFold: true,
    distanceFromFold: 600,
    domNodeCount: 140,
    propsSize: 320,
    severity: 'critical',
    recommendedDirective: 'visible',
    reason: 'Critical eager load below fold'
  };

  it('should formulate system prompt with performance expertise', () => {
    const sysPrompt = getAdvisorSystemPrompt();
    expect(sysPrompt).toContain('Astro Framework');
    expect(sysPrompt).toContain('Total Blocking Time');
    expect(sysPrompt).toContain('client:load');
  });

  it('should construct comprehensive prompt for individual island', () => {
    const prompt = buildPromptForIsland(sampleIsland, 800);
    expect(prompt).toContain('HeavyChart');
    expect(prompt).toContain('client:load');
    expect(prompt).toContain('600px below the initial viewport fold');
    expect(prompt).toContain('CRITICAL');
    expect(prompt).toContain('~140 elements');
    expect(prompt).toContain('Performance Impact');
  });

  it('should construct summary prompt for whole page report', () => {
    const sampleReport: IslandReport = {
      timestamp: Date.now(),
      viewportHeight: 800,
      viewportWidth: 1200,
      totalIslands: 2,
      flaggedCount: 1,
      eagerBelowFoldCount: 1,
      idleCount: 0,
      visibleCount: 1,
      loadCount: 1,
      onlyCount: 0,
      aiReadyCount: 0,
      islands: [sampleIsland],
      summary: '1 flagged issue'
    };

    const prompt = buildPromptForPage(sampleReport);
    expect(prompt).toContain('Total Islands: 2');
    expect(prompt).toContain('1 client:load');
    expect(prompt).toContain('HeavyChart');
    expect(prompt).toContain('1200x800px');
  });
});

describe('Advisor: Heuristic Fallbacks', () => {
  it('should generate detailed heuristic advice for eager load below fold', () => {
    const sampleIsland: IslandInfo = {
      id: 'island-1',
      componentUrl: '/src/components/CommentsList.vue',
      componentExport: 'default',
      directive: 'load',
      directiveRaw: 'client:load',
      rect: { top: 1200, bottom: 1600, left: 0, right: 500, width: 500, height: 400 },
      isAboveFold: false,
      isBelowFold: true,
      distanceFromFold: 400,
      domNodeCount: 65,
      propsSize: 120,
      severity: 'critical',
      recommendedDirective: 'visible',
      reason: 'Eager hydration below fold'
    };

    const advice = generateHeuristicAdvice(sampleIsland);
    expect(advice.component).toBe('CommentsList');
    expect(advice.currentDirective).toBe('client:client:load');
    expect(advice.recommendedDirective).toBe('client:visible');
    expect(advice.source).toBe('heuristic-fallback');
    expect(advice.estimatedTbtSavings).toContain('TBT');
    expect(advice.detailedAnalysis).toContain('client:visible');
  });

  it('should generate heuristic advice for heavy component above fold', () => {
    const heavyIsland: IslandInfo = {
      id: 'island-2',
      componentUrl: '/src/components/InteractiveHero.svelte',
      componentExport: 'default',
      directive: 'load',
      directiveRaw: 'load',
      rect: { top: 50, bottom: 500, left: 0, right: 1000, width: 1000, height: 450 },
      isAboveFold: true,
      isBelowFold: false,
      distanceFromFold: 0,
      domNodeCount: 95,
      propsSize: 500,
      severity: 'warning',
      recommendedDirective: 'idle',
      reason: 'Heavy component above fold'
    };

    const advice = generateHeuristicAdvice(heavyIsland);
    expect(advice.component).toBe('InteractiveHero');
    expect(advice.recommendedDirective).toBe('client:idle');
    expect(advice.detailedAnalysis).toContain('requestIdleCallback');
  });
});

describe('Advisor: Chrome AI and Fallback execution', () => {
  it('should report unavailable if window.ai is absent in runtime', async () => {
    const status = await checkAIAvailability();
    expect(status.isReady).toBe(false);
    expect(status.available).toBe('unavailable');
  });

  it('should seamlessly execute advice using fallback when AI is unavailable', async () => {
    const island: IslandInfo = {
      id: 'island-3',
      componentUrl: '/src/components/Footer.tsx',
      componentExport: 'default',
      directive: 'load',
      directiveRaw: 'load',
      rect: { top: 2000, bottom: 2200, left: 0, right: 1000, width: 1000, height: 200 },
      isAboveFold: false,
      isBelowFold: true,
      distanceFromFold: 1200,
      domNodeCount: 30,
      propsSize: 50,
      severity: 'critical',
      recommendedDirective: 'visible',
      reason: 'Below fold load'
    };

    const advice = await adviseIsland(island, 800);
    expect(advice.component).toBe('Footer');
    expect(advice.recommendedDirective).toBe('client:visible');
    expect(advice.source).toBe('heuristic-fallback');
  });
});
