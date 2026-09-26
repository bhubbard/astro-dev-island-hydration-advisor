# astro-dev-island-hydration-advisor

[![npm version](https://img.shields.io/npm/v/astro-dev-island-hydration-advisor.svg?style=flat-square)](https://www.npmjs.com/package/astro-dev-island-hydration-advisor)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Built for Astro](https://img.shields.io/badge/Astro-5.0+-BC52EE.svg?style=flat-square)](https://astro.build)
[![Chrome Built-in AI](https://img.shields.io/badge/Chrome%20AI-Gemini%20Nano-4285F4.svg?style=flat-square)](https://developer.chrome.com/docs/ai/built-in)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-code.brandonhubbard.com-brightgreen?logo=github)](https://code.brandonhubbard.com/astro-dev-island-hydration-advisor/)

An intelligent Astro Dev Toolbar integration that audits island client directives (`client:load`, `client:visible`, `client:idle`, `client:only`, `client:ai-ready`) in real-time. It visualizes the viewport fold line, highlights sub-optimal hydration choices, and leverages **Chrome Built-in AI (Gemini Nano via `window.ai.languageModel`)** to deliver instant, on-device performance diagnostics and recommendations to boost your Core Web Vitals (TBT, INP, LCP).

> 🎮 **Live Interactive Visualizer & Demo:** [astro-dev-island-hydration-advisor on code.brandonhubbard.com](https://code.brandonhubbard.com/astro-dev-island-hydration-advisor/)

---

## ✨ Features

- 🏝️ **Live Island Auditing**: Scans active `<astro-island>` elements, parses client directives, and measures DOM complexity and props payloads.
- 📏 **Viewport Fold Analysis**: Dynamically renders the viewport fold threshold and identifies components positioned below the fold.
- 🚨 **Eager Hydration Anti-Pattern Detection**: Flags `client:load` used on below-the-fold islands, preventing needless main-thread contention during initial page load.
- 🧠 **On-Device Gemini Nano AI**: Uses the Chrome Prompt API (`window.ai.languageModel`) to analyze component position, DOM weight, and render performance advice locally with zero API keys or cloud latency.
- 🛡️ **Intelligent Heuristic Fallback**: Gracefully falls back to expert rule-based recommendations when Chrome AI is not active.
- 🎨 **Interactive Dev Toolbar App**: Visual overlay on top of your app with highlighted bounding boxes and interactive diagnostic drawer.

---

## 📦 Installation

```bash
# Using bun
bun add astro-dev-island-hydration-advisor

# Using npm
npm install astro-dev-island-hydration-advisor

# Using pnpm
pnpm add astro-dev-island-hydration-advisor
```

---

## 🚀 Quick Start

Add the integration to your `astro.config.mjs`:

```javascript
import { defineConfig } from 'astro/config';
import { islandHydrationAdvisor } from 'astro-dev-island-hydration-advisor';

export default defineConfig({
  integrations: [
    islandHydrationAdvisor({
      enabled: true // Enabled by default in dev mode
    })
  ]
});
```

Run your development server:

```bash
bun run dev
```

Open your app in Google Chrome and click on the **⚡ Island Advisor** icon in the Astro Dev Toolbar at the bottom of the screen.

---

## 🔧 Prerequisites for Chrome Built-in AI (Gemini Nano)

To utilize on-device Gemini Nano inference for live performance explanations:

1. **Use Chrome 127+** (Chrome Canary or Dev channel recommended for latest Prompt API features).
2. Enable the following flags via `chrome://flags`:
   - `Prompt API for Gemini Nano`: Set to **Enabled**.
   - `Enables optimization guide on device`: Set to **Enabled BypassPerfRequirement**.
3. Open `chrome://components` and find **Optimization Guide On Device Model**. Click **Check for update** to download Gemini Nano (~1.5GB).
4. Verify by opening DevTools Console and running:
   ```javascript
   (await window.ai.languageModel.capabilities()).available; // should return 'readily'
   ```

> **Note:** If Gemini Nano is not enabled, the advisor automatically uses the built-in heuristic performance engine without interruption.

---

## 📊 Astro Island Hydration Directives Matrix

| Directive | When It Hydrates | Ideal Use Case | Common Anti-Pattern |
| :--- | :--- | :--- | :--- |
| `client:load` | Immediately on page load | Above-the-fold critical UI (navigation, search bar, hero form) | ❌ **Used on below-the-fold footers/comments** — blocks main thread during initial load |
| `client:visible` | When element enters viewport (`IntersectionObserver`) | Below-the-fold components, carousels, comment feeds, review widgets | ❌ Not used for lazy widgets |
| `client:idle` | Once page finishes initial load (`requestIdleCallback`) | Secondary widgets, analytics, non-critical above-fold widgets | ❌ Eagerly loading heavy widgets that aren't immediately clicked |
| `client:media` | When CSS media query matches | Desktop-only sidebars, mobile-only drawers | ❌ Loading desktop widgets on mobile devices |
| `client:only` | Skips SSR entirely, renders purely on client | Browser-only dashboards, client-authenticated widgets | ❌ Using for static content where SSR improves SEO & CLS |
| `client:ai-ready` | Ready for on-device AI inference | AI interactive chat, smart completion widgets | ❌ Loading cloud models when Gemini Nano is local |

---

## 🛠️ Configuration Options

```typescript
export interface IslandHydrationAdvisorOptions {
  /**
   * Whether to enable the Dev Toolbar app during `astro dev`.
   * @default true
   */
  enabled?: boolean;
}
```

---

## 💡 Example Template Usage

```astro
---
import HeroNav from '../components/HeroNav.tsx';
import PricingCalculator from '../components/PricingCalculator.vue';
import UserComments from '../components/UserComments.svelte';
import LocalAIAssistant from '../components/LocalAIAssistant.tsx';
---

<!-- ✅ Good: Critical above-the-fold navigation -->
<HeroNav client:load />

<!-- ✅ Good: Below-the-fold calculator deferred until visible -->
<div style="margin-top: 1000px;">
  <PricingCalculator client:visible />
</div>

<!-- ⚠️ Flagged by Advisor if client:load was used here! -->
<!-- Recommendation: Switch client:load -> client:visible -->
<UserComments client:visible />

<!-- ✅ Good: On-device AI widget -->
<LocalAIAssistant client:ai-ready />
```

---

## 🧪 Testing & Verification

Run tests and type checks with Bun:

```bash
# Run unit tests
bun test

# Run TypeScript type check
bun run typecheck

# Build integration bundles
bun run build
```

---

## 📄 License

MIT © Antigravity & contributors.
