# Database Architecture

Claude-Mem uses SQLite 3 with the better-sqlite3 native module for persistent storage and FTS5 for full-text search.

## Database Location

- **Current**: `~/.claude-mem/claude-mem.db`

**Note**: Despite the README claiming v4.0.0+ moved the database to `${CLAUDE_PLUGIN_ROOT}/data/`, the actual implementation still uses `~/.claude-mem/`.

## Database Implementation

**Primary Implementation**: better-sqlite3 (native SQLite module)
- Used by: SessionStore and SessionSearch
- Format: Synchronous API with better performance
- **Note**: Database.ts (using bun:sqlite) is legacy code

## Core Tables

### 1. sdk_sessions

Tracks active and completed sessions.

```sql
CREATE TABLE sdk_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sdk_session_id TEXT UNIQUE NOT NULL,
  claude_session_id TEXT,
  project TEXT NOT NULL,
  prompt_counter INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  created_at_epoch INTEGER NOT NULL,
  completed_at TEXT,
  completed_at_epoch INTEGER,
  last_activity_at TEXT,
  last_activity_epoch INTEGER
);
```

**Indexes**:
- `idx_sdk_sessions_claude_session` on `claude_session_id`
- `idx_sdk_sessions_project` on `project`
- `idx_sdk_sessions_status` on `status`
- `idx_sdk_sessions_created_at` on `created_at_epoch DESC`

### 2. observations

Individual tool executions with hierarchical structure.

```sql
CREATE TABLE observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  sdk_session_id TEXT NOT NULL,
  claude_session_id TEXT,
  project TEXT NOT NULL,
  prompt_number INTEGER,
  tool_name TEXT NOT NULL,
  correlation_id TEXT,

  -- Hierarchical fields
  title TEXT,
  subtitle TEXT,
  narrative TEXT,
  text TEXT,
  facts TEXT,
  concepts TEXT,
  type TEXT,
  files_read TEXT,
  files_modified TEXT,

  created_at TEXT NOT NULL,
  created_at_epoch INTEGER NOT NULL,

  FOREIGN KEY (sdk_session_id) REFERENCES sdk_sessions(sdk_session_id)
);
```

**Observation Types**:
- `decision` - Architectural or design decisions
- `bugfix` - Bug fixes and corrections
- `feature` - New features or capabilities
- `refactor` - Code refactoring and cleanup
- `discovery` - Learnings about the codebase
- `change` - General changes and modifications

**Indexes**:
- `idx_observations_session` on `session_id`
- `idx_observations_sdk_session` on `sdk_session_id`
- `idx_observations_project` on `project`
- `idx_observations_tool_name` on `tool_name`
- `idx_observations_created_at` on `created_at_epoch DESC`
- `idx_observations_type` on `type`

### 3. session_summaries

AI-generated session summaries (multiple per session).

```sql
CREATE TABLE session_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sdk_session_id TEXT NOT NULL,
  claude_session_id TEXT,
  project TEXT NOT NULL,
  prompt_number INTEGER,

  -- Summary fields
  request TEXT,
  investigated TEXT,
  learned TEXT,
  completed TEXT,
  next_steps TEXT,
  notes TEXT,

  created_at TEXT NOT NULL,
  created_at_epoch INTEGER NOT NULL,

  FOREIGN KEY (sdk_session_id) REFERENCES sdk_sessions(sdk_session_id)
);
```

**Indexes**:
- `idx_session_summaries_sdk_session` on `sdk_session_id`
- `idx_session_summaries_project` on `project`
- `idx_session_summaries_created_at` on `created_at_epoch DESC`

### 4. user_prompts

Raw user prompts with FTS5 search (as of v4.2.0).

```sql
CREATE TABLE user_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sdk_session_id TEXT NOT NULL,
  claude_session_id TEXT,
  project TEXT NOT NULL,
  prompt_number INTEGER,
  prompt_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_at_epoch INTEGER NOT NULL,

  FOREIGN KEY (sdk_session_id) REFERENCES sdk_sessions(sdk_session_id)
);
```

**Indexes**:
- `idx_user_prompts_sdk_session` on `sdk_session_id`
- `idx_user_prompts_project` on `project`
- `idx_user_prompts_created_at` on `created_at_epoch DESC`

### Legacy Tables

- **sessions**: Legacy session tracking (v3.x)
- **memories**: Legacy compressed memory chunks (v3.x)
- **overviews**: Legacy session summaries (v3.x)

## FTS5 Full-Text Search

SQLite FTS5 (Full-Text Search) virtual tables enable fast full-text search across observations, summaries, and user prompts.

### FTS5 Virtual Tables

#### observations_fts

```sql
CREATE VIRTUAL TABLE observations_fts USING fts5(
  title,
  subtitle,
  narrative,
  text,
  facts,
  concepts,
  content='observations',
  content_rowid='id'
);
```

#### session_summaries_fts

```sql
CREATE VIRTUAL TABLE session_summaries_fts USING fts5(
  request,
  investigated,
  learned,
  completed,
  next_steps,
  notes,
  content='session_summaries',
  content_rowid='id'
);
```

#### user_prompts_fts

```sql
CREATE VIRTUAL TABLE user_prompts_fts USING fts5(
  prompt_text,
  content='user_prompts',
  content_rowid='id'
);
```

### Automatic Synchronization

FTS5 tables stay in sync via triggers:

```sql
-- Insert trigger example
CREATE TRIGGER observations_ai AFTER INSERT ON observations BEGIN
  INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
  VALUES (new.id, new.title, new.subtitle, new.narrative, new.text, new.facts, new.concepts);
END;

-- Update trigger example
CREATE TRIGGER observations_au AFTER UPDATE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, text, facts, concepts)
  VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.text, old.facts, old.concepts);
  INSERT INTO observations_fts(rowid, title, subtitle, narrative, text, facts, concepts)
  VALUES (new.id, new.title, new.subtitle, new.narrative, new.text, new.facts, new.concepts);
END;

-- Delete trigger example
CREATE TRIGGER observations_ad AFTER DELETE ON observations BEGIN
  INSERT INTO observations_fts(observations_fts, rowid, title, subtitle, narrative, text, facts, concepts)
  VALUES('delete', old.id, old.title, old.subtitle, old.narrative, old.text, old.facts, old.concepts);
END;
```

### FTS5 Query Syntax

FTS5 supports rich query syntax:

- **Simple**: `"error handling"`
- **AND**: `"error" AND "handling"`
- **OR**: `"bug" OR "fix"`
- **NOT**: `"bug" NOT "feature"`
- **Phrase**: `"'exact phrase'"`
- **Column**: `title:"authentication"`

### Security

As of v4.2.3, all FTS5 queries are properly escaped to prevent SQL injection:
- Double quotes are escaped: `query.replace(/"/g, '""')`
- Comprehensive test suite with 332 injection attack tests

## Database Classes

### SessionStore

CRUD operations for sessions, observations, summaries, and user prompts.

**Location**: `src/services/sqlite/SessionStore.ts`

**Methods**:
- `createSession()`
- `getSession()`
- `updateSession()`
- `createObservation()`
- `getObservations()`
- `createSummary()`
- `getSummaries()`
- `createUserPrompt()`

### SessionSearch

FTS5 full-text search with 8 specialized search methods.

**Location**: `src/services/sqlite/SessionSearch.ts`

**Methods**:
- `searchObservations()` - Full-text search across observations
- `searchSessions()` - Full-text search across summaries
- `searchUserPrompts()` - Full-text search across user prompts
- `findByConcept()` - Find by concept tags
- `findByFile()` - Find by file references
- `findByType()` - Find by observation type
- `getRecentContext()` - Get recent session context
- `advancedSearch()` - Combined filters

## Migrations

Database schema is managed via migrations in `src/services/sqlite/migrations.ts`.

**Migration History**:
- Migration 001: Initial schema (sessions, memories, overviews, diagnostics, transcript_events)
- Migration 002: Hierarchical memory fields (title, subtitle, facts, concepts, files_touched)
- Migration 003: SDK sessions and observations
- Migration 004: Session summaries
- Migration 005: Multi-prompt sessions (prompt_counter, prompt_number)
- Migration 006: FTS5 virtual tables and triggers
- Migration 007-010: Various improvements and user prompts table

## Performance Considerations

- **Indexes**: All foreign keys and frequently queried columns are indexed
- **FTS5**: Full-text search is significantly faster than LIKE queries
- **Triggers**: Automatic synchronization has minimal overhead
- **Connection Pooling**: better-sqlite3 reuses connections efficiently
- **Synchronous API**: better-sqlite3 uses synchronous API for better performance

## Troubleshooting

See [Troubleshooting - Database Issues](../troubleshooting.md#database-issues) for common problems and solutions.
