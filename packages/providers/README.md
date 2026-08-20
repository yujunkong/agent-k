# @agent-k/providers

**Status:** extracted (Phase 1)  
**Feature IDs:** PROVIDER-*, MODEL-*, UXPROV-*, CFG-008  
**R-001:** Composer dropdown ≠ runtime ModelRouter.

Implementation: `packages/providers/src/*`  
Shims: `src/providers/*` — prefer `@agent-k/providers/...` in new code.

**금지:** chat/host/tools imports, React, tool execution.
