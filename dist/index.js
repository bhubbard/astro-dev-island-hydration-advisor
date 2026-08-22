// src/inspector.ts
function parseDirective(clientAttr) {
  if (!clientAttr)
    return "none";
  const normalized = clientAttr.trim().toLowerCase();
  if (normalized === "load" || normalized === "client:load")
    return "load";
  if (normalized === "idle" || normalized === "client:idle")
    return "idle";
  if (normalized === "visible" || normalized === "client:visible")
    return "visible";
  if (normalized === "only" || normalized === "client:only")
    return "only";
  if (normalized === "media" || normalized.startsWith("media"))
    return "media";
  if (normalized === "ai-ready" || normalized === "client:ai-ready")
    return "ai-ready";
  return "custom";
}
function isElementBelowFold(rect, viewportHeight, thresholdOffset = 0) {
  return rect.top >= viewportHeight + thresholdOffset;
}
function calculateDistanceFromFold(rect, viewportHeight) {
  if (rect.top <= viewportHeight) {
    return 0;
  }
  return Math.round(rect.top - viewportHeight);
}
function assessIsland(directive, isBelowFold, distanceFromFold, domNodeCount = 0, propsSize = 0) {
  if (directive === "load" && isBelowFold) {
    const rec = isBelowFold && distanceFromFold > 300 ? "visible" : "idle";
    return {
      severity: "critical",
      recommendedDirective: rec,
      reason: `Island uses client:load but is located ${distanceFromFold}px below the fold. It blocks the main thread during initial page load for non-visible UI. Switching to client:${rec} defers hydration until needed.`
    };
  }
  if (directive === "load" && !isBelowFold && domNodeCount > 80) {
    return {
      severity: "warning",
      recommendedDirective: "idle",
      reason: `Heavy island (${domNodeCount} DOM nodes) uses client:load above the fold. If this island does not require immediate interactivity (e.g. non-critical interactive widget), consider client:idle to improve Total Blocking Time (TBT).`
    };
  }
  if (directive === "only" && isBelowFold) {
    return {
      severity: "warning",
      recommendedDirective: "visible",
      reason: `Island uses client:only below the fold. It skips SSR and downloads client runtime eagerly. Consider client:visible or standard SSR + hydration.`
    };
  }
  if (directive === "idle" && isBelowFold && distanceFromFold > 800) {
    return {
      severity: "info",
      recommendedDirective: "visible",
      reason: `Island is located far below the fold (${distanceFromFold}px). client:idle hydrates during browser idle time even if user never scrolls. client:visible is more resource-efficient.`
    };
  }
  if (directive === "ai-ready") {
    return {
      severity: "good",
      recommendedDirective: "ai-ready",
      reason: `AI-enhanced island configured with client:ai-ready for on-device Gemini Nano inference.`
    };
  }
  if (directive === "visible" && isBelowFold) {
    return {
      severity: "good",
      recommendedDirective: "visible",
      reason: `Optimal hydration strategy: component loads lazily when scrolled into view.`
    };
  }
  if (directive === "load" && !isBelowFold) {
    return {
      severity: "good",
      recommendedDirective: "load",
      reason: `Appropriate hydration strategy for above-the-fold critical interactive element.`
    };
  }
  return {
    severity: "good",
    recommendedDirective: directive,
    reason: `Hydration strategy client:${directive} is within acceptable performance bounds.`
  };
}
function inspectIslands(doc = typeof document !== "undefined" ? document : {}, viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800, viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1280) {
  const islandElements = doc.querySelectorAll ? Array.from(doc.querySelectorAll("astro-island")) : [];
  const islands = [];
  let flaggedCount = 0;
  let eagerBelowFoldCount = 0;
  let idleCount = 0;
  let visibleCount = 0;
  let loadCount = 0;
  let onlyCount = 0;
  let aiReadyCount = 0;
  islandElements.forEach((el, index) => {
    const rawDirective = el.getAttribute("client") || "";
    const directive = parseDirective(rawDirective);
    const componentUrl = el.getAttribute("component-url") || el.getAttribute("component-export") || "UnknownComponent";
    const componentExport = el.getAttribute("component-export") || "default";
    const propsAttr = el.getAttribute("props") || "";
    const propsSize = propsAttr.length;
    const domNodeCount = el.querySelectorAll ? el.querySelectorAll("*").length : 0;
    let rect = { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
    if (typeof el.getBoundingClientRect === "function") {
      const domRect = el.getBoundingClientRect();
      rect = {
        top: domRect.top + (typeof window !== "undefined" ? window.scrollY || 0 : 0),
        bottom: domRect.bottom + (typeof window !== "undefined" ? window.scrollY || 0 : 0),
        left: domRect.left + (typeof window !== "undefined" ? window.scrollX || 0 : 0),
        right: domRect.right + (typeof window !== "undefined" ? window.scrollX || 0 : 0),
        width: domRect.width,
        height: domRect.height
      };
    }
    const belowFold = isElementBelowFold(rect, viewportHeight);
    const aboveFold = !belowFold;
    const distanceFromFold = calculateDistanceFromFold(rect, viewportHeight);
    const assessment = assessIsland(directive, belowFold, distanceFromFold, domNodeCount, propsSize);
    if (assessment.severity === "critical" || assessment.severity === "warning") {
      flaggedCount++;
    }
    if (directive === "load" && belowFold) {
      eagerBelowFoldCount++;
    }
    if (directive === "idle")
      idleCount++;
    else if (directive === "visible")
      visibleCount++;
    else if (directive === "load")
      loadCount++;
    else if (directive === "only")
      onlyCount++;
    else if (directive === "ai-ready")
      aiReadyCount++;
    const islandId = el.getAttribute("uid") || `island-${index + 1}`;
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
      element: el
    });
  });
  const summary = flaggedCount > 0 ? `Found ${totalOrSingular(islands.length, "island")}. ${flaggedCount} flagged for sub-optimal hydration (${eagerBelowFoldCount} eager load below fold).` : `Found ${totalOrSingular(islands.length, "island")}. All hydration strategies appear optimal.`;
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
function totalOrSingular(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}
// src/advisor.ts
async function checkAIAvailability() {
  if (typeof window === "undefined" || !window.ai || !window.ai.languageModel) {
    return { available: "unavailable", isReady: false };
  }
  try {
    const caps = await window.ai.languageModel.capabilities();
    return {
      available: caps.available,
      isReady: caps.available === "readily"
    };
  } catch {
    return { available: "unavailable", isReady: false };
  }
}
function getAdvisorSystemPrompt() {
  return `You are an expert Astro Framework and Web Performance Engineer specializing in Islands Architecture, client hydration directives (client:load, client:visible, client:idle, client:only, client:ai-ready), Total Blocking Time (TBT), Interaction to Next Paint (INP), and Core Web Vitals.
Provide concise, actionable, high-impact advice on why eager hydration below the fold or inappropriate hydration directives degrade user performance, and recommend the exact optimal Astro directive.`;
}
function buildPromptForIsland(island, viewportHeight) {
  const componentName = island.componentUrl.split("/").pop()?.replace(/\.[^/.]+$/, "") || "Component";
  const positionDesc = island.isBelowFold ? `${island.distanceFromFold}px below the initial viewport fold (${viewportHeight}px)` : `above the fold (${island.rect.top}px from top)`;
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
function buildPromptForPage(report) {
  const flaggedDetails = report.islands.filter((i) => i.severity === "critical" || i.severity === "warning").map((i) => `- ${i.componentUrl} (client:${i.directive}, ${i.isBelowFold ? `${i.distanceFromFold}px below fold` : "above fold"}, ${i.domNodeCount} nodes)`).join(`
`);
  return `Summarize the island hydration health of this Astro page:
- Total Islands: ${report.totalIslands}
- Viewport: ${report.viewportWidth}x${report.viewportHeight}px
- Directive breakdown: ${report.loadCount} client:load, ${report.visibleCount} client:visible, ${report.idleCount} client:idle, ${report.onlyCount} client:only, ${report.aiReadyCount} client:ai-ready
- Flagged Issues (${report.flaggedCount} total, ${report.eagerBelowFoldCount} eager below fold):
${flaggedDetails || "None"}

Provide a 2-3 sentence executive summary of hydration efficiency and the top action item.`;
}
function generateHeuristicAdvice(island) {
  const componentName = island.componentUrl.split("/").pop()?.replace(/\.[^/.]+$/, "") || "Component";
  let impactSummary = "Hydration configuration is balanced.";
  let estimatedTbtSavings = "0ms";
  let detailedAnalysis = `The directive client:${island.directive} suits the element's position.`;
  if (island.directive === "load" && island.isBelowFold) {
    impactSummary = `Critical main-thread contention during page load. JavaScript bundle is fetched and executed immediately before the user scrolls down to this component.`;
    estimatedTbtSavings = island.domNodeCount > 50 ? "~50-150ms TBT" : "~20-60ms TBT";
    detailedAnalysis = `Replace 'client:load' with 'client:visible' on <${componentName} />. Because this island is ${island.distanceFromFold}px below the initial viewport (${island.rect.top}px from top), loading and executing its JavaScript immediately during page load wastes CPU cycles and blocks First Input / INP without user benefit. 'client:visible' uses IntersectionObserver to hydrate only when scrolled near.`;
  } else if (island.directive === "load" && !island.isBelowFold && island.domNodeCount > 80) {
    impactSummary = `Moderate main-thread blocking from heavy component above fold.`;
    estimatedTbtSavings = "~30-80ms TBT";
    detailedAnalysis = `Consider switching <${componentName} /> to 'client:idle'. While above the fold, heavy components with ${island.domNodeCount} DOM nodes can delay critical paint. Hydrating via requestIdleCallback prioritizes main-thread paint before component initialization.`;
  } else if (island.directive === "only" && island.isBelowFold) {
    impactSummary = `Unrendered SSR placeholder below fold with eager JS downloading.`;
    estimatedTbtSavings = "~15-40ms TBT";
    detailedAnalysis = `Change to standard SSR island with 'client:visible'. 'client:only' completely skips HTML server-rendering, resulting in layout shift (CLS) when loaded and unnecessary JS execution.`;
  }
  return {
    component: componentName,
    currentDirective: `client:${island.directiveRaw || island.directive}`,
    recommendedDirective: `client:${island.recommendedDirective}`,
    impactSummary,
    estimatedTbtSavings,
    source: "heuristic-fallback",
    detailedAnalysis
  };
}
var cachedAISession = null;
async function getOrCreateAISession(options) {
  if (cachedAISession)
    return cachedAISession;
  if (typeof window === "undefined" || !window.ai || !window.ai.languageModel) {
    return null;
  }
  try {
    const caps = await window.ai.languageModel.capabilities();
    if (caps.available === "no" || caps.available === "unavailable") {
      return null;
    }
    cachedAISession = await window.ai.languageModel.create({
      systemPrompt: getAdvisorSystemPrompt(),
      temperature: options?.temperature ?? 0.2,
      topK: options?.topK ?? 3
    });
    return cachedAISession;
  } catch (err) {
    console.warn("[astro-dev-island-hydration-advisor] Failed to initialize Chrome AI language model:", err);
    return null;
  }
}
function destroyAISession() {
  if (cachedAISession) {
    try {
      cachedAISession.destroy();
    } catch {}
    cachedAISession = null;
  }
}
async function adviseIsland(island, viewportHeight, options) {
  const componentName = island.componentUrl.split("/").pop()?.replace(/\.[^/.]+$/, "") || "Component";
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
        estimatedTbtSavings: island.directive === "load" && island.isBelowFold ? "~50-200ms TBT" : "~10-40ms TBT",
        source: "chrome-ai-gemini-nano",
        detailedAnalysis: aiResponse
      };
    }
  } catch (err) {
    console.warn("[astro-dev-island-hydration-advisor] Chrome AI prompt failed, falling back to heuristics:", err);
  }
  return generateHeuristicAdvice(island);
}

// src/index.ts
function islandHydrationAdvisor(options = {}) {
  const { enabled = true } = options;
  return {
    name: "astro-dev-island-hydration-advisor",
    hooks: {
      "astro:config:setup": ({ addDevToolbarApp, command }) => {
        if (!enabled || command !== "dev") {
          return;
        }
        addDevToolbarApp({
          id: "astro-dev-island-hydration-advisor",
          name: "Island Advisor",
          icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
          entrypoint: new URL("./app.js", import.meta.url).pathname
        });
      }
    }
  };
}
export {
  parseDirective,
  islandHydrationAdvisor,
  isElementBelowFold,
  inspectIslands,
  getOrCreateAISession,
  getAdvisorSystemPrompt,
  generateHeuristicAdvice,
  destroyAISession,
  islandHydrationAdvisor as default,
  checkAIAvailability,
  calculateDistanceFromFold,
  buildPromptForPage,
  buildPromptForIsland,
  assessIsland,
  adviseIsland
};
