import type { AILanguageModel, AICapabilityAvailability } from './chrome-ai.js';
import type { IslandInfo, IslandReport } from './inspector.js';

export interface AdvisorOptions {
  temperature?: number;
  topK?: number;
  useFallbackIfUnavailable?: boolean;
}

export interface AIHydrationAdvice {
  component: string;
  currentDirective: string;
  recommendedDirective: string;
  impactSummary: string;
  estimatedTbtSavings: string;
  source: 'chrome-ai-gemini-nano' | 'heuristic-fallback';
  detailedAnalysis: string;
}

/**
 * Checks Chrome Built-in AI (window.ai.languageModel) availability.
 */
export async function checkAIAvailability(): Promise<{
  available: AICapabilityAvailability;
  isReady: boolean;
}> {
  if (typeof window === 'undefined' || !window.ai || !window.ai.languageModel) {
    return { available: 'unavailable', isReady: false };
  }

  try {
    const caps = await window.ai.languageModel.capabilities();
    return {
      available: caps.available,
      isReady: caps.available === 'readily'
    };
  } catch {
    return { available: 'unavailable', isReady: false };
  }
}

/**
 * Builds the system prompt for the Gemini Nano session.
 */
export function getAdvisorSystemPrompt(): string {
  return `You are an expert Astro Framework and Web Performance Engineer specializing in Islands Architecture, client hydration directives (client:load, client:visible, client:idle, client:only, client:ai-ready), Total Blocking Time (TBT), Interaction to Next Paint (INP), and Core Web Vitals.
Provide concise, actionable, high-impact advice on why eager hydration below the fold or inappropriate hydration directives degrade user performance, and recommend the exact optimal Astro directive.`;
}

/**
 * Builds a prompt for an individual island analysis.
 */
export function buildPromptForIsland(island: IslandInfo, viewportHeight: number): string {
  const componentName = island.componentUrl.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Component';
  const positionDesc = island.isBelowFold
    ? `${island.distanceFromFold}px below the initial viewport fold (${viewportHeight}px)`
    : `above the fold (${island.rect.top}px from top)`;

  return `Analyze this Astro Island hydration directive:
- Component: ${componentName} (${island.componentUrl})
- Current Directive: client:${island.directiveRaw || island.directive}
- Position: ${positionDesc}
- Bounding Box: ${island.rect.width}x${island.rect.height}px
- DOM Subtree Complexity: ~${island.domNodeCount} elements
- Props Payload Size: ~${island.propsSize} characters
- Initial Severity Flag: ${island.severity.toUpperCase()}

Please provide:
1. Performance Impact: How this current directive impacts main-thread scheduling, TBT, and LCP.
2. Recommended Directive: Exactly which directive should be used (e.g. client:visible, client:idle, client:load).
3. Recommendation Rationale: Why this directive is ideal given the component's position and weight.`;
}

/**
 * Builds a prompt for the entire page summary.
 */
export function buildPromptForPage(report: IslandReport): string {
  const flaggedDetails = report.islands
    .filter((i) => i.severity === 'critical' || i.severity === 'warning')
    .map(
      (i) =>
        `- ${i.componentUrl} (client:${i.directive}, ${i.isBelowFold ? `${i.distanceFromFold}px below fold` : 'above fold'}, ${i.domNodeCount} nodes)`
    )
    .join('\n');

  return `Summarize the island hydration health of this Astro page:
- Total Islands: ${report.totalIslands}
- Viewport: ${report.viewportWidth}x${report.viewportHeight}px
- Directive breakdown: ${report.loadCount} client:load, ${report.visibleCount} client:visible, ${report.idleCount} client:idle, ${report.onlyCount} client:only, ${report.aiReadyCount} client:ai-ready
- Flagged Issues (${report.flaggedCount} total, ${report.eagerBelowFoldCount} eager below fold):
${flaggedDetails || 'None'}

Provide a 2-3 sentence executive summary of hydration efficiency and the top action item.`;
}

/**
 * Generates heuristic fallback advice when Chrome AI is not enabled or available.
 */
export function generateHeuristicAdvice(island: IslandInfo): AIHydrationAdvice {
  const componentName = island.componentUrl.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Component';

  let impactSummary = 'Hydration configuration is balanced.';
  let estimatedTbtSavings = '0ms';
  let detailedAnalysis = `The directive client:${island.directive} suits the element's position.`;

  if (island.directive === 'load' && island.isBelowFold) {
    impactSummary = `Critical main-thread contention during page load. JavaScript bundle is fetched and executed immediately before the user scrolls down to this component.`;
    estimatedTbtSavings = island.domNodeCount > 50 ? '~50-150ms TBT' : '~20-60ms TBT';
    detailedAnalysis = `Replace 'client:load' with 'client:visible' on <${componentName} />. Because this island is ${island.distanceFromFold}px below the initial viewport (${island.rect.top}px from top), loading and executing its JavaScript immediately during page load wastes CPU cycles and blocks First Input / INP without user benefit. 'client:visible' uses IntersectionObserver to hydrate only when scrolled near.`;
  } else if (island.directive === 'load' && !island.isBelowFold && island.domNodeCount > 80) {
    impactSummary = `Moderate main-thread blocking from heavy component above fold.`;
    estimatedTbtSavings = '~30-80ms TBT';
    detailedAnalysis = `Consider switching <${componentName} /> to 'client:idle'. While above the fold, heavy components with ${island.domNodeCount} DOM nodes can delay critical paint. Hydrating via requestIdleCallback prioritizes main-thread paint before component initialization.`;
  } else if (island.directive === 'only' && island.isBelowFold) {
    impactSummary = `Unrendered SSR placeholder below fold with eager JS downloading.`;
    estimatedTbtSavings = '~15-40ms TBT';
    detailedAnalysis = `Change to standard SSR island with 'client:visible'. 'client:only' completely skips HTML server-rendering, resulting in layout shift (CLS) when loaded and unnecessary JS execution.`;
  }

  return {
    component: componentName,
    currentDirective: `client:${island.directiveRaw || island.directive}`,
    recommendedDirective: `client:${island.recommendedDirective}`,
    impactSummary,
    estimatedTbtSavings,
    source: 'heuristic-fallback',
    detailedAnalysis
  };
}

let cachedAISession: AILanguageModel | null = null;

/**
 * Gets or initializes a Chrome AI language model session.
 */
export async function getOrCreateAISession(options?: AdvisorOptions): Promise<AILanguageModel | null> {
  if (cachedAISession) return cachedAISession;

  if (typeof window === 'undefined' || !window.ai || !window.ai.languageModel) {
    return null;
  }

  try {
    const caps = await window.ai.languageModel.capabilities();
    if (caps.available === 'no' || caps.available === 'unavailable') {
      return null;
    }

    cachedAISession = await window.ai.languageModel.create({
      systemPrompt: getAdvisorSystemPrompt(),
      temperature: options?.temperature ?? 0.2,
      topK: options?.topK ?? 3
    });

    return cachedAISession;
  } catch (err) {
    console.warn('[astro-dev-island-hydration-advisor] Failed to initialize Chrome AI language model:', err);
    return null;
  }
}

/**
 * Destroys any active Chrome AI language model session.
 */
export function destroyAISession(): void {
  if (cachedAISession) {
    try {
      cachedAISession.destroy();
    } catch {
      // ignore
    }
    cachedAISession = null;
  }
}

/**
 * Generates comprehensive advice for an island using Gemini Nano (or heuristic fallback).
 */
export async function adviseIsland(
  island: IslandInfo,
  viewportHeight: number,
  options?: AdvisorOptions
): Promise<AIHydrationAdvice> {
  const componentName = island.componentUrl.split('/').pop()?.replace(/\.[^/.]+$/, '') || 'Component';

  try {
    const session = await getOrCreateAISession(options);
    if (session) {
      const prompt = buildPromptForIsland(island, viewportHeight);
      const aiResponse = await session.prompt(prompt);

      return {
        component: componentName,
        currentDirective: `client:${island.directiveRaw || island.directive}`,
        recommendedDirective: `client:${island.recommendedDirective}`,
        impactSummary: `AI-analyzed performance impact on Main Thread & TBT`,
        estimatedTbtSavings: island.directive === 'load' && island.isBelowFold ? '~50-200ms TBT' : '~10-40ms TBT',
        source: 'chrome-ai-gemini-nano',
        detailedAnalysis: aiResponse
      };
    }
  } catch (err) {
    console.warn('[astro-dev-island-hydration-advisor] Chrome AI prompt failed, falling back to heuristics:', err);
  }

  return generateHeuristicAdvice(island);
}
