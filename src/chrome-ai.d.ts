/**
 * Type definitions for Chrome Built-in AI (Prompt API, Summarizer, Rewriter, Writer, Translator)
 * Supporting Chrome 127+ Gemini Nano integration standards.
 */

export type AICapabilityAvailability = 'readily' | 'after-download' | 'no' | 'unavailable';

export interface AICapabilityOptions {
  available: AICapabilityAvailability;
  defaultTemperature?: number;
  defaultTopK?: number;
  maxTopK?: number;
}

export interface AILanguageModelPromptOptions {
  signal?: AbortSignal;
}

export interface AILanguageModelCloneOptions {
  signal?: AbortSignal;
}

export interface AILanguageModelCreateOptions {
  signal?: AbortSignal;
  systemPrompt?: string;
  temperature?: number;
  topK?: number;
  initialPrompts?: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  monitor?: (monitor: EventTarget & { addEventListener: (type: 'downloadprogress', listener: (e: { loaded: number; total: number }) => void) => void }) => void;
}

export interface AILanguageModel {
  readonly maxTokens: number;
  readonly tokensSoFar: number;
  readonly tokensLeft: number;
  readonly topK: number;
  readonly temperature: number;
  prompt(input: string, options?: AILanguageModelPromptOptions): Promise<string>;
  promptStreaming(input: string, options?: AILanguageModelPromptOptions): ReadableStream<string>;
  countPromptTokens(input: string, options?: AILanguageModelPromptOptions): Promise<number>;
  clone(options?: AILanguageModelCloneOptions): Promise<AILanguageModel>;
  destroy(): void;
}

export interface AILanguageModelFactory {
  capabilities(): Promise<AICapabilityOptions>;
  create(options?: AILanguageModelCreateOptions): Promise<AILanguageModel>;
}

export interface AISummarizerCreateOptions {
  type?: 'key-points' | 'tl;dr' | 'teaser' | 'headline';
  format?: 'plain-text' | 'markdown';
  length?: 'short' | 'medium' | 'long';
  sharedContext?: string;
  signal?: AbortSignal;
}

export interface AISummarizer {
  summarize(input: string, options?: { context?: string; signal?: AbortSignal }): Promise<string>;
  summarizeStreaming(input: string, options?: { context?: string; signal?: AbortSignal }): ReadableStream<string>;
  destroy(): void;
}

export interface AISummarizerFactory {
  capabilities(): Promise<AICapabilityOptions>;
  create(options?: AISummarizerCreateOptions): Promise<AISummarizer>;
}

export interface AIRewriterCreateOptions {
  tone?: 'as-is' | 'more-formal' | 'more-casual';
  format?: 'as-is' | 'plain-text' | 'markdown';
  length?: 'as-is' | 'shorter' | 'longer';
  sharedContext?: string;
  signal?: AbortSignal;
}

export interface AIRewriter {
  rewrite(input: string, options?: { context?: string; signal?: AbortSignal }): Promise<string>;
  rewriteStreaming(input: string, options?: { context?: string; signal?: AbortSignal }): ReadableStream<string>;
  destroy(): void;
}

export interface AIRewriterFactory {
  capabilities(): Promise<AICapabilityOptions>;
  create(options?: AIRewriterCreateOptions): Promise<AIRewriter>;
}

export interface AIWriterCreateOptions {
  tone?: 'formal' | 'neutral' | 'casual';
  format?: 'plain-text' | 'markdown';
  length?: 'short' | 'medium' | 'long';
  sharedContext?: string;
  signal?: AbortSignal;
}

export interface AIWriter {
  write(input: string, options?: { context?: string; signal?: AbortSignal }): Promise<string>;
  writeStreaming(input: string, options?: { context?: string; signal?: AbortSignal }): ReadableStream<string>;
  destroy(): void;
}

export interface AIWriterFactory {
  capabilities(): Promise<AICapabilityOptions>;
  create(options?: AIWriterCreateOptions): Promise<AIWriter>;
}

export interface AITranslatorCreateOptions {
  sourceLanguage: string;
  targetLanguage: string;
  signal?: AbortSignal;
}

export interface AITranslator {
  translate(input: string): Promise<string>;
  translateStreaming(input: string): ReadableStream<string>;
  destroy(): void;
}

export interface AITranslatorFactory {
  capabilities(): Promise<AICapabilityOptions>;
  create(options: AITranslatorCreateOptions): Promise<AITranslator>;
}

export interface ChromeAI {
  languageModel: AILanguageModelFactory;
  summarizer?: AISummarizerFactory;
  rewriter?: AIRewriterFactory;
  writer?: AIWriterFactory;
  translator?: AITranslatorFactory;
}

declare global {
  interface Window {
    ai?: ChromeAI;
  }
}
