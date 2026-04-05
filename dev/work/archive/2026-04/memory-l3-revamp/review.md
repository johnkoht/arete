---
title: "L3 Memory Revamp — Plan Review"
---

# Plan Review: memory-l3-revamp

## Checklist

- [x] Problem clearly stated with evidence (empty summaries/, 1 observation in 6 weeks)
- [x] Follows PersonMemoryRefresh pattern as instructed
- [x] Uses StorageAdapter for all I/O
- [x] New service wired via factory.ts (DI pattern)
- [x] CLI follows established command skeleton
- [x] Tests planned for each step
- [x] Quality gates defined (typecheck + test before every commit)
- [x] No direct fs imports in services
- [x] .js extensions in imports (NodeNext)
- [x] Risks identified with mitigations

## Architecture Assessment

**Good decisions**:
- Separate AreaMemoryService (not bolted onto AreaParserService) — keeps parsing and computation separate
- Following the PersonMemoryRefresh pattern exactly — proven, well-tested
- Decision compaction archives originals — reversible
- Extending existing memory QMD scope rather than creating new one

**Potential concerns**:
- AreaMemoryService depends on 3 other services (areaParser, commitments, memory) — moderate coupling, but justified since it's a pure computation aggregator
- Decision compaction (Step 2) is the riskiest step — grouping by area requires matching decisions to areas, which may not have clean mappings. Should handle unmatched decisions gracefully.

## Sequence Assessment

Steps are correctly ordered:
1. Core service first (foundation)
2. Compaction builds on core service
3. CLI wraps core service
4. Search indexing after files exist
5. Freshness after files exist
6-7. Downstream wiring last

## Recommendation

Proceed to pre-mortem, then build.
