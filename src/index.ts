import type { AstroIntegration } from 'astro';

export interface IslandHydrationAdvisorOptions {
  /**
   * Whether to enable the Dev Toolbar app during `astro dev`.
   * @default true
   */
  enabled?: boolean;
}

/**
 * Astro Integration for analyzing Island hydration strategies with Chrome Built-in AI (Gemini Nano).
 */
export default function islandHydrationAdvisor(
  options: IslandHydrationAdvisorOptions = {}
): AstroIntegration {
  const { enabled = true } = options;

  return {
    name: 'astro-dev-island-hydration-advisor',
    hooks: {
      'astro:config:setup': ({ addDevToolbarApp, command }) => {
        if (!enabled || command !== 'dev') {
          return;
        }

        addDevToolbarApp({
          id: 'astro-dev-island-hydration-advisor',
          name: 'Island Advisor',
          icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>`,
          entrypoint: new URL('./app.js', import.meta.url).pathname
        });
      }
    }
  };
}

export { islandHydrationAdvisor };
export * from './inspector.js';
export * from './advisor.js';
