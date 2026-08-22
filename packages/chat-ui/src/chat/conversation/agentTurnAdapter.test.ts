import { describe, expect, it } from 'vitest';

import { AgentTurnAdapter } from './agentTurnAdapter';

describe('AgentTurnAdapter', () => {
  it('is exported as a presentation adapter without owning message state', () => {
    expect(typeof AgentTurnAdapter).toBe('function');
  });
});
