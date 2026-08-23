import { describe, expect, it } from 'vitest';
import { extractLineInnerHtml } from './highlightLine';

describe('extractLineInnerHtml', () => {
  it('keeps nested token spans (markdown list line)', () => {
    const pre = `<pre class="shiki"><code><span class="line"><span style="color:#6796E6">-</span><span style="color:#D4D4D4"> 상태 머신으로 app</span></span></code></pre>`;
    const inner = extractLineInnerHtml(pre);
    expect(inner).toContain('상태 머신으로 app');
    expect(inner).toContain('color:#6796E6');
  });

  it('keeps text after bold markdown tokens', () => {
    const pre = `<pre><code><span class="line"><span style="color:#569CD6;font-weight:bold">**핵심 목표**</span><span style="color:#D4D4D4">: 분리 구현된 core</span></span></code></pre>`;
    const inner = extractLineInnerHtml(pre);
    expect(inner).toContain('분리 구현된 core');
    expect(inner).toContain('**핵심 목표**');
  });
});
