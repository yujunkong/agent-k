/**
 * STREAM-009 / STREAM-010 — understanding vs opening lead helpers.
 */
import { describe, expect, it } from 'vitest';
import { extractUnderstandingLead } from './understandingLead';
import {
  isValidOpeningLead,
  looksLikeMarkdownBody,
  splitStreamingLead,
  stripDuplicateOpeningLead
} from './openingLead';

describe('STREAM-009 extractUnderstandingLead', () => {
  it('extracts a complete Korean ack sentence and leaves the rest', () => {
    const { lead, rest } = extractUnderstandingLead(
      '네, 확인하겠습니다. 관련 파일을 먼저 읽어보겠습니다.'
    );
    expect(lead).toContain('확인하겠습니다');
    expect(rest).toContain('관련 파일');
  });

  it('returns empty lead for incomplete / non-ack fragments', () => {
    expect(extractUnderstandingLead('네, 확인').lead).toBe('');
    expect(extractUnderstandingLead('```ts\nconst x = 1').lead).toBe('');
  });
});

describe('STREAM-010 openingLead helpers', () => {
  it('rejects markdown dumps as leads', () => {
    expect(looksLikeMarkdownBody('# Title\n\n- a\n- b\n- c\n- d')).toBe(true);
    expect(isValidOpeningLead('```code```')).toBe(false);
  });

  it('splitStreamingLead waits for a complete ack', () => {
    expect(splitStreamingLead('네, 확인').lead).toBe('');
    const split = splitStreamingLead('네, 확인하겠습니다. 본문입니다.');
    expect(split.lead).toContain('확인하겠습니다');
    expect(split.rest).toContain('본문');
  });

  it('stripDuplicateOpeningLead removes repeated lead prefix', () => {
    const lead = '네, 확인하겠습니다.';
    expect(stripDuplicateOpeningLead(`${lead} 이어서 설명합니다.`, lead)).toBe(
      '이어서 설명합니다.'
    );
  });
});
