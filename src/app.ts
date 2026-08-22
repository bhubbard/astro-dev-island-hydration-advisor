import { defineToolbarApp } from 'astro/toolbar';
import { inspectIslands, type IslandInfo, type IslandReport } from './inspector.js';
import { adviseIsland, checkAIAvailability, type AIHydrationAdvice } from './advisor.js';

export default defineToolbarApp({
  init(canvas, app, _server) {
    let activeOverlays: HTMLElement[] = [];
    let foldLineEl: HTMLElement | null = null;
    let panelEl: HTMLElement | null = null;
    let isAppActive = false;

    const styles = document.createElement('style');
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
      if (!isAppActive) return;
      cleanupVisuals();

      const report: IslandReport = inspectIslands(document, window.innerHeight, window.innerWidth);
      const aiStatus = await checkAIAvailability();

      // 1. Render Fold Line
      foldLineEl = document.createElement('div');
      foldLineEl.className = 'fold-line-indicator';
      foldLineEl.style.top = `${window.innerHeight}px`;
      foldLineEl.innerHTML = `<span class="fold-line-label">Viewport Fold (${window.innerHeight}px)</span>`;
      canvas.appendChild(foldLineEl);

      // 2. Render Island Highlights in DOM
      report.islands.forEach((island) => {
        if (!island.element) return;
        const rect = island.element.getBoundingClientRect();
        const highlight = document.createElement('div');
        highlight.className = `island-highlight-box ${island.severity}`;
        highlight.style.top = `${rect.top + window.scrollY}px`;
        highlight.style.left = `${rect.left + window.scrollX}px`;
        highlight.style.width = `${rect.width}px`;
        highlight.style.height = `${rect.height}px`;
        canvas.appendChild(highlight);
        activeOverlays.push(highlight);
      });

      // 3. Render Floating Advisor Panel
      panelEl = document.createElement('div');
      panelEl.className = 'advisor-panel';

      const aiBadgeText = aiStatus.isReady ? 'Gemini Nano Ready' : 'Heuristic Mode';

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
              <div class="stat-value ${report.eagerBelowFoldCount > 0 ? 'critical' : 'good'}">${report.eagerBelowFoldCount}</div>
              <div class="stat-label">Eager Below Fold</div>
            </div>
            <div class="stat-card">
              <div class="stat-value ${report.flaggedCount > 0 ? 'warning' : 'good'}">${report.flaggedCount}</div>
              <div class="stat-label">Flagged</div>
            </div>
          </div>

          <div class="island-list" id="island-list-container"></div>
        </div>
      `;

      canvas.appendChild(panelEl);

      const listContainer = panelEl.querySelector('#island-list-container');
      const refreshBtn = panelEl.querySelector('#refresh-btn');

      refreshBtn?.addEventListener('click', () => {
        renderApp();
      });

      if (report.islands.length === 0) {
        if (listContainer) {
          listContainer.innerHTML = `<div style="color: #94a3b8; text-align: center; padding: 20px;">No &lt;astro-island&gt; elements found on this page.</div>`;
        }
        return;
      }

      report.islands.forEach((island, index) => {
        const itemEl = document.createElement('div');
        itemEl.className = `island-item ${island.severity}`;
        const isFlagged = island.severity === 'critical' || island.severity === 'warning';
        const componentName = island.componentUrl.split('/').pop()?.replace(/\.[^/.]+$/, '') || `Island ${index + 1}`;

        itemEl.innerHTML = `
          <div class="island-header-row">
            <span class="island-name">&lt;${componentName} /&gt;</span>
            <span class="directive-badge ${isFlagged ? 'flagged' : ''}">client:${island.directiveRaw || island.directive}</span>
          </div>
          <div class="island-meta">
            <span>${island.isBelowFold ? `↓ ${island.distanceFromFold}px below fold` : '↑ Above fold'}</span>
            <span>•</span>
            <span>${island.domNodeCount} DOM nodes</span>
          </div>
          <div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">
            ${island.reason}
          </div>
          ${
            isFlagged
              ? `<div style="margin-top: 4px; display: flex; align-items: center; justify-content: space-between;">
                  <span style="font-size: 11px; color: #38bdf8; font-weight: 600;">Recommended: client:${island.recommendedDirective}</span>
                  <button class="advisor-btn ask-ai-btn" data-index="${index}">✨ AI Advice</button>
                </div>
                <div class="ai-advice-slot" id="ai-slot-${index}"></div>`
              : ''
          }
        `;

        const aiBtn = itemEl.querySelector(`.ask-ai-btn`);
        const aiSlot = itemEl.querySelector(`#ai-slot-${index}`);

        aiBtn?.addEventListener('click', async () => {
          if (!aiSlot) return;
          aiSlot.innerHTML = `<div class="ai-advice-box" style="color: #38bdf8;">🧠 Prompting Gemini Nano on-device AI...</div>`;
          const advice: AIHydrationAdvice = await adviseIsland(island, window.innerHeight);
          aiSlot.innerHTML = `
            <div class="ai-advice-box">
              <div style="font-weight: 700; color: #38bdf8; margin-bottom: 4px;">${advice.source === 'chrome-ai-gemini-nano' ? '✨ Gemini Nano Analysis' : '📋 Performance Recommendation'}</div>
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
        // Quick update for overlays
        renderApp();
      }
    };

    app.onToggled((state) => {
      isAppActive = state.state;
      if (isAppActive) {
        window.addEventListener('resize', onScrollOrResize);
        window.addEventListener('scroll', onScrollOrResize, { passive: true });
        renderApp();
      } else {
        window.removeEventListener('resize', onScrollOrResize);
        window.removeEventListener('scroll', onScrollOrResize);
        cleanupVisuals();
      }
    });
  },
  beforeTogglingOff() {
    return true;
  }
});
