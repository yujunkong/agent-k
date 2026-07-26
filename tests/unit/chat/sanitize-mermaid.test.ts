/**
 * sanitizeMermaid — quote unsafe labels, preserve cylinder DB shapes
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  aggressiveQuoteMermaid,
  sanitizeMermaid
} from '../../../src/chat/mermaidSanitize';

describe('sanitizeMermaid', () => {
  test('quotes rect labels with parentheses / br', () => {
    const out = sanitizeMermaid(`graph LR
  R[API Routers<br/>(9개)]
  S[Service Layer<br/>(20+ services)]
`);
    assert.match(out, /R\["API Routers<br\/>\(9개\)"\]/);
    assert.match(out, /S\["Service Layer<br\/>\(20\+ services\)"\]/);
  });

  test('preserves cylinder DB[(SQLite)]', () => {
    const out = sanitizeMermaid(`graph LR
  DB[(SQLite)]
  R[API] --> DB
`);
    assert.match(out, /DB\[\(SQLite\)\]/);
    assert.doesNotMatch(out, /DB\["\(SQLite\)"\]/);
  });

  test('quotes cylinder label when it has nested parens', () => {
    const out = sanitizeMermaid(`graph LR
  DB[(SQLite (WAL))]
`);
    assert.match(out, /DB\[\("SQLite \(WAL\)"\)\]/);
  });

  test('quotes edge labels with slash', () => {
    const out = sanitizeMermaid(`graph LR
  A -->|HTTP / WS| B
`);
    assert.match(out, /-->\|"HTTP \/ WS"\|/);
  });

  test('aggressiveQuoteMermaid does not smash cylinders', () => {
    const base = sanitizeMermaid(`graph LR
  DB[(SQLite)]
  R[API Routers<br/>(9개)]
`);
    const out = aggressiveQuoteMermaid(base);
    assert.match(out, /DB\[\(SQLite\)\]/);
    assert.match(out, /R\["API Routers<br\/>\(9개\)"\]/);
  });
});
