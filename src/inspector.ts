export type IslandDirective = 'load' | 'idle' | 'visible' | 'only' | 'media' | 'ai-ready' | 'custom' | 'none';

export type IssueSeverity = 'critical' | 'warning' | 'info' | 'good';

export interface IslandRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  width: number;
  height: number;
}

export interface IslandInfo {
  id: string;
  componentUrl: string;
  componentExport: string;
  directive: IslandDirective;
  directiveRaw: string;
  rect: IslandRect;
  isAboveFold: boolean;
  isBelowFold: boolean;
  distanceFromFold: number;
  domNodeCount: number;
  propsSize: number;
  severity: IssueSeverity;
  recommendedDirective: IslandDirective;
  reason: string;
  element?: HTMLElement | Element;
}

export interface IslandReport {
  timestamp: number;
  viewportHeight: number;
  viewportWidth: number;
  totalIslands: number;
  flaggedCount: number;
  eagerBelowFoldCount: number;
  idleCount: number;
  visibleCount: number;
  loadCount: number;
  onlyCount: number;
  aiReadyCount: number;
  islands: IslandInfo[];
  summary: string;
}

/**
 * Normalizes directive from client attribute (e.g., "load", "visible", "idle", "only", "ai-ready").
 */
export function parseDirective(clientAttr: string | null | undefined): IslandDirective {
  if (!clientAttr) return 'none';
  const normalized = clientAttr.trim().toLowerCase();
  if (normalized === 'load' || normalized === 'client:load') return 'load';
  if (normalized === 'idle' || normalized === 'client:idle') return 'idle';
  if (normalized === 'visible' || normalized === 'client:visible') return 'visible';
  if (normalized === 'only' || normalized === 'client:only') return 'only';
  if (normalized === 'media' || normalized.startsWith('media')) return 'media';
  if (normalized === 'ai-ready' || normalized === 'client:ai-ready') return 'ai-ready';
  return 'custom';
}

/**
 * Determines whether a given bounding box is below the viewport fold.
 */
export function isElementBelowFold(
  rect: { top: number; bottom: number; height?: number },
  viewportHeight: number,
  thresholdOffset = 0
): boolean {
  // If top of element is below viewportHeight + threshold
  return rect.top >= (viewportHeight + thresholdOffset);
}

/**
 * Calculates the distance from the viewport fold line (in px).
 * Returns 0 if element starts above or within the fold.
 */
export function calculateDistanceFromFold(
  rect: { top: number },
  viewportHeight: number
): number {
  if (rect.top <= viewportHeight) {
    return 0;
  }
  return Math.round(rect.top - viewportHeight);
}

/**
 * Evaluates an island's directive against its viewport positioning and weight.
 */
export function assessIsland(
  directive: IslandDirective,
  isBelowFold: boolean,
  distanceFromFold: number,
  domNodeCount: number = 0,
  propsSize: number = 0
): { severity: IssueSeverity; recommendedDirective: IslandDirective; reason: string } {
  // 1. Eager hydration below fold: critical anti-pattern
  if (directive === 'load' && isBelowFold) {
    const rec = isBelowFold && distanceFromFold > 300 ? 'visible' : 'idle';
    return {
      severity: 'critical',
      recommendedDirective: rec,
      reason: `Island uses client:load but is located ${distanceFromFold}px below the fold. It blocks the main thread during initial page load for non-visible UI. Switching to client:${rec} defers hydration until needed.`
    };
  }

  // 2. Heavy component above fold with client:load that could be client:idle
  if (directive === 'load' && !isBelowFold && domNodeCount > 80) {
    return {
      severity: 'warning',
      recommendedDirective: 'idle',
      reason: `Heavy island (${domNodeCount} DOM nodes) uses client:load above the fold. If this island does not require immediate interactivity (e.g. non-critical interactive widget), consider client:idle to improve Total Blocking Time (TBT).`
    };
  }

  // 3. client:only used below fold without need
  if (directive === 'only' && isBelowFold) {
    return {
      severity: 'warning',
      recommendedDirective: 'visible',
      reason: `Island uses client:only below the fold. It skips SSR and downloads client runtime eagerly. Consider client:visible or standard SSR + hydration.`
    };
  }

  // 4. client:idle when far below the fold
  if (directive === 'idle' && isBelowFold && distanceFromFold > 800) {
    return {
      severity: 'info',
      recommendedDirective: 'visible',
      reason: `Island is located far below the fold (${distanceFromFold}px). client:idle hydrates during browser idle time even if user never scrolls. client:visible is more resource-efficient.`
    };
  }

  // 5. client:ai-ready / Chrome AI on-device island
  if (directive === 'ai-ready') {
    return {
      severity: 'good',
      recommendedDirective: 'ai-ready',
      reason: `AI-enhanced island configured with client:ai-ready for on-device Gemini Nano inference.`
    };
  }

  // 6. Good configurations
  if (directive === 'visible' && isBelowFold) {
    return {
      severity: 'good',
      recommendedDirective: 'visible',
      reason: `Optimal hydration strategy: component loads lazily when scrolled into view.`
    };
  }

  if (directive === 'load' && !isBelowFold) {
    return {
      severity: 'good',
      recommendedDirective: 'load',
      reason: `Appropriate hydration strategy for above-the-fold critical interactive element.`
    };
  }

  return {
    severity: 'good',
    recommendedDirective: directive,
    reason: `Hydration strategy client:${directive} is within acceptable performance bounds.`
  };
}

/**
 * Inspects all <astro-island> elements currently present in the DOM.
 */
export function inspectIslands(
  doc: Document = typeof document !== 'undefined' ? document : ({} as Document),
  viewportHeight: number = typeof window !== 'undefined' ? window.innerHeight : 800,
  viewportWidth: number = typeof window !== 'undefined' ? window.innerWidth : 1280
): IslandReport {
  const islandElements = doc.querySelectorAll ? Array.from(doc.querySelectorAll('astro-island')) : [];
  const islands: IslandInfo[] = [];

  let flaggedCount = 0;
  let eagerBelowFoldCount = 0;
  let idleCount = 0;
  let visibleCount = 0;
  let loadCount = 0;
  let onlyCount = 0;
  let aiReadyCount = 0;

  islandElements.forEach((el, index) => {
    const rawDirective = el.getAttribute('client') || '';
    const directive = parseDirective(rawDirective);
    const componentUrl = el.getAttribute('component-url') || el.getAttribute('component-export') || 'UnknownComponent';
    const componentExport = el.getAttribute('component-export') || 'default';
    const propsAttr = el.getAttribute('props') || '';
    const propsSize = propsAttr.length;
    const domNodeCount = el.querySelectorAll ? el.querySelectorAll('*').length : 0;

    let rect: IslandRect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    if (typeof el.getBoundingClientRect === 'function') {
      const domRect = el.getBoundingClientRect();
      rect = {
        top: domRect.top + (typeof window !== 'undefined' ? window.scrollY || 0 : 0),
        bottom: domRect.bottom + (typeof window !== 'undefined' ? window.scrollY || 0 : 0),
        left: domRect.left + (typeof window !== 'undefined' ? window.scrollX || 0 : 0),
        right: domRect.right + (typeof window !== 'undefined' ? window.scrollX || 0 : 0),
        width: domRect.width,
        height: domRect.height,
      };
    }

    const belowFold = isElementBelowFold(rect, viewportHeight);
    const aboveFold = !belowFold;
    const distanceFromFold = calculateDistanceFromFold(rect, viewportHeight);

    const assessment = assessIsland(directive, belowFold, distanceFromFold, domNodeCount, propsSize);

    if (assessment.severity === 'critical' || assessment.severity === 'warning') {
      flaggedCount++;
    }
    if (directive === 'load' && belowFold) {
      eagerBelowFoldCount++;
    }

    if (directive === 'idle') idleCount++;
    else if (directive === 'visible') visibleCount++;
    else if (directive === 'load') loadCount++;
    else if (directive === 'only') onlyCount++;
    else if (directive === 'ai-ready') aiReadyCount++;

    const islandId = el.getAttribute('uid') || `island-${index + 1}`;

    islands.push({
      id: islandId,
      componentUrl,
      componentExport,
      directive,
      directiveRaw: rawDirective,
      rect,
      isAboveFold: aboveFold,
      isBelowFold: belowFold,
      distanceFromFold,
      domNodeCount,
      propsSize,
      severity: assessment.severity,
      recommendedDirective: assessment.recommendedDirective,
      reason: assessment.reason,
      element: el as HTMLElement
    });
  });

  const summary = flaggedCount > 0
    ? `Found ${totalOrSingular(islands.length, 'island')}. ${flaggedCount} flagged for sub-optimal hydration (${eagerBelowFoldCount} eager load below fold).`
    : `Found ${totalOrSingular(islands.length, 'island')}. All hydration strategies appear optimal.`;

  return {
    timestamp: Date.now(),
    viewportHeight,
    viewportWidth,
    totalIslands: islands.length,
    flaggedCount,
    eagerBelowFoldCount,
    idleCount,
    visibleCount,
    loadCount,
    onlyCount,
    aiReadyCount,
    islands,
    summary
  };
}

function totalOrSingular(count: number, word: string): string {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}
