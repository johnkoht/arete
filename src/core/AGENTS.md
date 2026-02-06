# Core Utilities - Agent Documentation

This file documents core utility functions for AI agents working in the Areté codebase.

## getBuildVersion()

### Purpose

Returns the current build version of Areté by reading the `version` field from `package.json`.

**When to use:**
- Displaying version information in CLI output
- Logging version numbers for debugging
- Version checks or comparisons
- Help/about commands that show build information

**When NOT to use:**
- For semantic version comparisons (use a semver library instead)
- For reading other package.json fields (read the file directly)

### Signature

```typescript
function getBuildVersion(): string
```

**Returns:** Version string in semver format (e.g., "0.1.0")

### Usage Examples

#### Basic Usage

```typescript
import { getBuildVersion } from './core/utils.js';

const version = getBuildVersion();
console.log(`Areté v${version}`);
// Output: Areté v0.1.0
```

#### In CLI Commands

```typescript
import { getBuildVersion, header } from './core/utils.js';

export function handleVersionCommand() {
  header('Areté Version Information');
  const version = getBuildVersion();
  console.log(`Version: ${version}`);
}
```

#### With Other Utilities

```typescript
import { getBuildVersion, info } from './core/utils.js';

export function init() {
  const version = getBuildVersion();
  info(`Starting Areté v${version}...`);
  // ... rest of initialization
}
```

### Implementation Details

- Reads from `package.json` located two directories up from `src/core/utils.ts`
- Uses `fs.readFileSync` (synchronous) - acceptable for CLI startup
- Parses JSON and extracts the `version` field
- No caching - reads from disk each time (minimal overhead for CLI usage)

### Error Handling

The function will throw if:
- `package.json` cannot be found or read
- `package.json` contains invalid JSON
- The `version` field is missing

These are all considered unrecoverable errors for a CLI tool, so throwing is appropriate.

### Testing

Tests are located in `test/core/utils.test.ts` and verify:
- Function returns a non-empty string
- Version matches semver format (x.y.z)
- Version has major.minor.patch components

Run tests with: `npm test`

### Related Functions

Other utility functions in `src/core/utils.ts`:
- `output()` - Format and display output (human or JSON)
- `success()`, `error()`, `warn()`, `info()` - Colored status messages
- `header()`, `section()` - Format section headers
- `listItem()` - Format list items with bullets
- `formatPath()` - Format file paths for display

All utilities are exported individually and in a default export object.
