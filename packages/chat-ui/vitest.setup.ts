/**
 * Vitest setup for @agent-k/chat-ui (jsdom).
 * jsdom does not implement Element.prototype.scrollIntoView — ChatApp's
 * sticky-scroll rAF callback calls it on every render, so stub it globally
 * (same guard style as ModelSelector.tsx `el?.scrollIntoView?.()`).
 */
Element.prototype.scrollIntoView = () => {};
