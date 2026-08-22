// node_modules/astro/dist/toolbar/index.js
function defineToolbarApp(app) {
  return app;
}

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

// src/app.ts
var app_default = defineToolbarApp({
  init(canvas, app, _server) {
    let activeOverlays = [];
    let foldLineEl = null;
    let panelEl = null;
    let isAppActive = false;
    const styles = document.createElement("style");
    styles.textContent = `
      :host {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #f1f5f9;
        font-size: 13px;
        box-sizing: border-box;
      }

      .advisor-panel {
        position: fixed;
        bottom: 70px;
        right: 20px;
        width: 440px;
        max-height: 75vh;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 12px;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5);
        display: flex;
        flex-direction: column;
        z-index: 999999;
        overflow: hidden;
        backdrop-filter: blur(8px);
      }

      .advisor-header {
        padding: 14px 16px;
        background: #1e293b;
        border-bottom: 1px solid #334155;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .advisor-title {
        font-weight: 700;
        font-size: 14px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: #38bdf8;
      }

      .badge-ai {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 9999px;
        background: linear-gradient(135deg, #6366f1, #a855f7);
        color: #ffffff;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .advisor-body {
        padding: 14px 16px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .stats-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
        margin-bottom: 4px;
      }

      .stat-card {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 8px;
        text-align: center;
      }

      .stat-value {
        font-size: 18px;
        font-weight: 700;
      }
      .stat-value.critical { color: #f87171; }
      .stat-value.warning { color: #fbbf24; }
      .stat-value.good { color: #4ade80; }

      .stat-label {
        font-size: 10px;
        color: #94a3b8;
        text-transform: uppercase;
        margin-top: 2px;
      }

      .island-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .island-item {
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 10px 12px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        transition: border-color 0.2s;
      }

      .island-item.critical {
        border-left: 4px solid #ef4444;
      }

      .island-item.warning {
        border-left: 4px solid #f59e0b;
      }

      .island-item.good {
        border-left: 4px solid #22c55e;
      }

      .island-header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .island-name {
        font-weight: 600;
        font-size: 12px;
        color: #e2e8f0;
      }

      .directive-badge {
        font-family: monospace;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        background: #334155;
        color: #93c5fd;
      }
      .directive-badge.flagged {
        background: #7f1d1d;
        color: #fca5a5;
      }

      .island-meta {
        font-size: 11px;
        color: #94a3b8;
        display: flex;
        gap: 10px;
      }

      .advisor-btn {
        background: #2563eb;
        color: #fff;
        border: none;
        padding: 6px 10px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 11px;
        font-weight: 600;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: background 0.2s;
      }
      .advisor-btn:hover {
        background: #1d4ed8;
      }

      .ai-advice-box {
        margin-top: 6px;
        padding: 8px 10px;
        background: #020617;
        border: 1px solid #1e293b;
        border-radius: 6px;
        font-size: 11px;
        line-height: 1.4;
        color: #cbd5e1;
      }

      .fold-line-indicator {
        position: fixed;
        left: 0;
        right: 0;
        height: 2px;
        background: repeating-linear-gradient(to right, #ef4444 0, #ef4444 8px, transparent 8px, transparent 16px);
        z-index: 999990;
        pointer-events: none;
      }

      .fold-line-label {
        position: absolute;
        right: 20px;
        top: -18px;
        background: #ef4444;
        color: #fff;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        border-radius: 4px;
        text-transform: uppercase;
      }

      .island-highlight-box {
        position: absolute;
        pointer-events: none;
        border-radius: 4px;
        border: 2px dashed;
        z-index: 999980;
        transition: all 0.15s ease;
      }
      .island-highlight-box.critical {
        border-color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
      }
      .island-highlight-box.warning {
        border-color: #f59e0b;
        background: rgba(245, 158, 11, 0.1);
      }
      .island-highlight-box.good {
        border-color: #22c55e;
        background: rgba(34, 197, 94, 0.05);
      }
    `;
    canvas.appendChild(styles);
    function cleanupVisuals() {
      activeOverlays.forEach((el) => el.remove());
      activeOverlays = [];
      if (foldLineEl) {
        foldLineEl.remove();
        foldLineEl = null;
      }
      if (panelEl) {
        panelEl.remove();
        panelEl = null;
      }
    }
    async function renderApp() {
      if (!isAppActive)
        return;
      cleanupVisuals();
      const report = inspectIslands(document, window.innerHeight, window.innerWidth);
      const aiStatus = await checkAIAvailability();
      foldLineEl = document.createElement("div");
      foldLineEl.className = "fold-line-indicator";
      foldLineEl.style.top = `${window.innerHeight}px`;
      foldLineEl.innerHTML = `<span class="fold-line-label">Viewport Fold (${window.innerHeight}px)</span>`;
      canvas.appendChild(foldLineEl);
      report.islands.forEach((island) => {
        if (!island.element)
          return;
        const rect = island.element.getBoundingClientRect();
        const highlight = document.createElement("div");
        highlight.className = `island-highlight-box ${island.severity}`;
        highlight.style.top = `${rect.top + window.scrollY}px`;
        highlight.style.left = `${rect.left + window.scrollX}px`;
        highlight.style.width = `${rect.width}px`;
        highlight.style.height = `${rect.height}px`;
        canvas.appendChild(highlight);
        activeOverlays.push(highlight);
      });
      panelEl = document.createElement("div");
      panelEl.className = "advisor-panel";
      const aiBadgeText = aiStatus.isReady ? "Gemini Nano Ready" : "Heuristic Mode";
      panelEl.innerHTML = `
        <div class="advisor-header">
          <div class="advisor-title">
            <span>⚡ Island Hydration Advisor</span>
            <span class="badge-ai">${aiBadgeText}</span>
          </div>
          <button class="advisor-btn" id="refresh-btn">⟳ Refresh</button>
        </div>
        <div class="advisor-body">
          <div class="stats-grid">
            <div class="stat-card">
              <div class="stat-value">${report.totalIslands}</div>
              <div class="stat-label">Total Islands</div>
            </div>
            <div class="stat-card">
              <div class="stat-value ${report.eagerBelowFoldCount > 0 ? "critical" : "good"}">${report.eagerBelowFoldCount}</div>
              <div class="stat-label">Eager Below Fold</div>
            </div>
            <div class="stat-card">
              <div class="stat-value ${report.flaggedCount > 0 ? "warning" : "good"}">${report.flaggedCount}</div>
              <div class="stat-label">Flagged</div>
            </div>
          </div>

          <div class="island-list" id="island-list-container"></div>
        </div>
      `;
      canvas.appendChild(panelEl);
      const listContainer = panelEl.querySelector("#island-list-container");
      const refreshBtn = panelEl.querySelector("#refresh-btn");
      refreshBtn?.addEventListener("click", () => {
        renderApp();
      });
      if (report.islands.length === 0) {
        if (listContainer) {
          listContainer.innerHTML = `<div style="color: #94a3b8; text-align: center; padding: 20px;">No &lt;astro-island&gt; elements found on this page.</div>`;
        }
        return;
      }
      report.islands.forEach((island, index) => {
        const itemEl = document.createElement("div");
        itemEl.className = `island-item ${island.severity}`;
        const isFlagged = island.severity === "critical" || island.severity === "warning";
        const componentName = island.componentUrl.split("/").pop()?.replace(/\.[^/.]+$/, "") || `Island ${index + 1}`;
        itemEl.innerHTML = `
          <div class="island-header-row">
            <span class="island-name">&lt;${componentName} /&gt;</span>
            <span class="directive-badge ${isFlagged ? "flagged" : ""}">client:${island.directiveRaw || island.directive}</span>
          </div>
          <div class="island-meta">
            <span>${island.isBelowFold ? `↓ ${island.distanceFromFold}px below fold` : "↑ Above fold"}</span>
            <span>•</span>
            <span>${island.domNodeCount} DOM nodes</span>
          </div>
          <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">
            ${island.reason}
          </div>
          ${isFlagged ? `<div style="margin-top: 4px; display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-size: 11px; color: #38bdf8; font-weight: 600;">Recommended: client:${island.recommendedDirective}</span>
                  <button class="advisor-btn ask-ai-btn" data-index="${index}">✨ AI Advice</button>
                </div>
                <div class="ai-advice-slot" id="ai-slot-${index}"></div>` : ""}
        `;
        const aiBtn = itemEl.querySelector(`.ask-ai-btn`);
        const aiSlot = itemEl.querySelector(`#ai-slot-${index}`);
        aiBtn?.addEventListener("click", async () => {
          if (!aiSlot)
            return;
          aiSlot.innerHTML = `<div class="ai-advice-box" style="color: #38bdf8;">\uD83E\uDDE0 Prompting Gemini Nano on-device AI...</div>`;
          const advice = await adviseIsland(island, window.innerHeight);
          aiSlot.innerHTML = `
            <div class="ai-advice-box">
              <div style="font-weight: 700; color: #38bdf8; margin-bottom: 4px;">${advice.source === "chrome-ai-gemini-nano" ? "✨ Gemini Nano Analysis" : "\uD83D\uDCCB Performance Recommendation"}</div>
              <div style="margin-bottom: 4px;"><strong>Estimated TBT Savings:</strong> ${advice.estimatedTbtSavings}</div>
              <div style="white-space: pre-line;">${advice.detailedAnalysis}</div>
            </div>
          `;
        });
        listContainer?.appendChild(itemEl);
      });
    }
    const onScrollOrResize = () => {
      if (isAppActive) {
        renderApp();
      }
    };
    app.onToggled((state) => {
      isAppActive = state.state;
      if (isAppActive) {
        window.addEventListener("resize", onScrollOrResize);
        window.addEventListener("scroll", onScrollOrResize, { passive: true });
        renderApp();
      } else {
        window.removeEventListener("resize", onScrollOrResize);
        window.removeEventListener("scroll", onScrollOrResize);
        cleanupVisuals();
      }
    });
  },
  beforeTogglingOff() {
    return true;
  }
});
export {
  app_default as default
};
