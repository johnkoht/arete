# Test PRD: Add Build Version Utility

## Goal

Add a simple utility function to demonstrate and test the autonomous agent loop system.

## Background

This is a test PRD to validate the autonomous execution system. We'll add a small utility function, write tests, and update documentation.

## User Stories

### Task 1: Add getBuildVersion utility function

Create a new utility function that returns the current build version from package.json.

**Description:**
Add a function `getBuildVersion(): string` to `src/core/utils.ts` that reads the version from package.json and returns it.

**Acceptance Criteria:**
- Function exists in src/core/utils.ts
- Function reads version from package.json
- Function is exported
- Function has proper TypeScript types
- Typecheck passes (npm run typecheck)

### Task 2: Write tests for getBuildVersion

Create comprehensive tests for the getBuildVersion utility.

**Description:**
Add tests to `test/core/utils.test.ts` that verify the function returns the correct version and handles edge cases.

**Acceptance Criteria:**
- Test file test/core/utils.test.ts includes tests for getBuildVersion
- Tests verify function returns a string
- Tests verify format matches semver (x.y.z)
- All tests pass (npm test)
- Typecheck passes (npm run typecheck)

### Task 3: Document the utility

Add documentation about getBuildVersion to an AGENTS.md file.

**Description:**
Update or create an AGENTS.md file to document when and how to use the getBuildVersion utility.

**Acceptance Criteria:**
- AGENTS.md updated with getBuildVersion documentation
- Includes usage example
- Explains purpose of the function
- Follows markdown formatting conventions
