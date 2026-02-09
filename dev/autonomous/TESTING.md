# Testing the Autonomous Agent Loop

## Prerequisites Verified ✅

- [x] TypeScript compiles (`npm run typecheck` passes)
- [x] Tests run (`npm test` passes - 72 tests passing)
- [x] Git repository is initialized
- [x] Test PRD created (`test-prd.md`)

## How to Test

### Step 1: Convert Test PRD to JSON

```
Load the prd-to-json skill from .cursor/build/autonomous/skills/prd-to-json/ and convert .cursor/build/autonomous/test-prd.md to prd.json
```

**Expected result**: Creates `.cursor/build/autonomous/prd.json` with 3 tasks (all status: "pending")

### Step 2: Verify prd.json

```bash
cat .cursor/build/autonomous/prd.json | jq '.userStories[] | {id, title, status}'
```

**Expected output**:
```json
{
  "id": "task-1",
  "title": "Add getBuildVersion utility function",
  "status": "pending"
}
{
  "id": "task-2",
  "title": "Write tests for getBuildVersion",
  "status": "pending"
}
{
  "id": "task-3",
  "title": "Document the utility",
  "status": "pending"
}
```

### Step 3: Execute the PRD

```
Load the execute-prd skill from .cursor/build/autonomous/skills/execute-prd/ and execute the PRD
```

**Expected behavior**:
1. Orchestrator spawns Task subagent for task-1
2. Subagent implements `getBuildVersion()` in `src/core/utils.ts`
3. Subagent runs typecheck (should pass)
4. Subagent commits with message: `[PRD: build-version-utility] Task task-1: Add getBuildVersion utility function`
5. Orchestrator marks task-1 complete
6. Repeat for task-2 (tests) and task-3 (docs)
7. Orchestrator outputs: `<promise>COMPLETE</promise>`

### Step 4: Verify Results

**Check commits:**
```bash
git log --oneline -3
```

Should show 3 commits (one per task).

**Check files modified:**
```bash
git diff HEAD~3 --name-only
```

Should show:
- `src/core/utils.ts` (new function)
- `test/core/utils.test.ts` (new tests)
- Some AGENTS.md file (documentation)

**Run tests:**
```bash
npm test
```

All tests should pass (including new ones).

**Check progress log:**
```bash
cat .cursor/build/autonomous/progress.txt
```

Should have 3 entries (one per task) with learnings.

**Check archive:**
After completion, check:
```bash
ls -la .cursor/build/autonomous/archive/
```

Should have a directory like `2026-02-06-build-version-utility/` with:
- `prd.json` (completed PRD)
- `progress.txt` (full log)

### Step 5: Test Error Recovery (Optional)

To test retry logic:

1. Manually create a failing task in prd.json with impossible acceptance criteria
2. Run execute-prd
3. Verify subagent retries up to 3 times
4. Verify task is marked "failed" after 3 attempts
5. Verify orchestrator continues to next task

### Step 6: Test Resume (Optional)

To test resume capability:

1. Start execution with multiple tasks
2. Interrupt mid-execution (say "stop" or escape)
3. Say: "Load execute-prd and continue executing the PRD"
4. Verify orchestrator picks up where it left off (reads current state from prd.json)

## Test Results Template

Document your test results:

```markdown
## Test Run: [Date]

### Setup
- Branch: [branch name]
- Starting commit: [sha]

### Execution
- Started: [time]
- Completed: [time]
- Duration: [minutes]

### Results
- ✅ Tasks completed: X/Y
- ❌ Tasks failed: X/Y
- 📝 Commits created: X

### Quality Checks
- [ ] All tests pass
- [ ] Typecheck passes
- [ ] Commits have proper format
- [ ] progress.txt populated
- [ ] Files created/modified as expected

### Issues Encountered
[List any problems and how they were resolved]

### Learnings
[Notes about what worked well or needs improvement]
```

## Cleanup After Testing

```bash
# Remove test prd.json
rm .cursor/build/autonomous/prd.json

# Remove test progress.txt
rm .cursor/build/autonomous/progress.txt

# Optionally reset the test commits
git reset --hard HEAD~3  # If you want to undo test commits
```

## Known Limitations

1. **Subagent context limit**: If a task is too large, subagent might run out of context
   - **Solution**: Split into smaller tasks
   
2. **Parent context accumulation**: After many tasks, parent might need refresh
   - **Solution**: Say "continue executing PRD" to start fresh orchestrator
   
3. **Test dependencies**: If tests depend on uncommitted code, they might fail
   - **Solution**: Ensure each task is truly atomic

## Success Criteria

The test is successful if:
- [x] prd-to-json skill converts markdown to valid JSON
- [x] execute-prd skill spawns subagents correctly
- [x] Each subagent completes its task in fresh context
- [x] Tests run after each task
- [x] Commits created with proper format
- [x] progress.txt accumulated learnings
- [x] prd.json status updated correctly
- [x] Archive created on completion

## Next Steps After Successful Test

1. Document any issues in `.cursor/build/entries/2026-02-06_autonomous-agent-loop.md`
2. Update skills if improvements needed
3. Use the system for real Areté feature development!
4. Consider adding to build memory system for future reference
