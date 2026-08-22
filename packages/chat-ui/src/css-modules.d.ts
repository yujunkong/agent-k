/**
 * Allow side-effect CSS imports in the chat-ui webview (esbuild bundles .css).
 * Without this, TS reports: Cannot find module or type declarations for './chat.css'.
 */
declare module '*.css';
