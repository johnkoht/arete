# Decisions Log

> **Purpose**: Key product and business decisions with rationale. Reference this to understand why things are the way they are.

---

## How to Log Decisions

When logging a decision, include:
- **Date**: When the decision was made
- **Project**: What project drove this decision (if applicable)
- **Context**: What situation led to this
- **Decision**: What was decided
- **Rationale**: Why this choice
- **Alternatives**: What we didn't choose and why
- **Status**: Active / Revisited / Reversed

---

## Decisions

<!-- Add new decisions at the top -->

### [Template] YYYY-MM-DD: [Decision Title]

**Project**: [Project name or N/A]
**Context**: [What led to this decision?]
**Decision**: [What was decided]
**Rationale**: [Why this choice]
**Alternatives Considered**:
- [Option A]: [Why not this?]
- [Option B]: [Why not this?]
**Status**: Active
**Review Date**: [When to revisit, if applicable]

---

<!-- 
Example:

### 2026-01-27: Chose Stripe over PayPal for payments

**Project**: checkout-prd
**Context**: Needed to implement payment processing for the checkout flow. Had to choose between Stripe and PayPal as primary processor.
**Decision**: Stripe as primary payment processor
**Rationale**: 
- Better developer experience and documentation
- Lower fees at our expected volume
- Better international support
- More flexible API for future features
**Alternatives Considered**:
- PayPal: Higher brand recognition but higher fees and worse API
- Square: Good for in-person but weaker for online-only
**Status**: Active
**Review Date**: Q4 2026 (when we hit higher volume tier)

-->
