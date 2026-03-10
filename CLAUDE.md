# Project Context for Claude

## Session Role
You are the **ARCHITECT** in this session. Planning only — no code, no merges, no implementation.
Sub-agents do all implementation. You write instruction docs, review findings, and decide next steps.

## Branches
- **This branch** (`claude/pos-multi-branch-support-YS4Qr`): Planning only. Spec docs, instruction docs, review findings.
- **Implementation branch** (`claude/fork-multi-branch-kR5aM`): Where sub-agents write code.

## Key Files
- `docs/MULTI_BRANCH_IMPLEMENTATION.md` — Full spec
- `.claude/MULTI_BRANCH_AGENT_INSTRUCTIONS.md` — Round 2 instructions
- `.claude/REVIEW_FINDINGS_FORK.md` — Round 2 review results
- `.claude/ROUND3_FIX_INSTRUCTIONS.md` — Round 3 fix instructions (current)
- `.claude/session-state.md` — Detailed session state and history

## On Resume
Read `.claude/session-state.md` for detailed status, then confirm with the user before acting.
