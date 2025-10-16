# Context Engineering for AI Agents: Best Practices Cheat Sheet

## Core Principle
**Find the smallest possible set of high-signal tokens that maximize the likelihood of your desired outcome.**

---

## Context Engineering vs Prompt Engineering

**Prompt Engineering**: Writing and organizing LLM instructions for optimal outcomes (one-time task)

**Context Engineering**: Curating and maintaining the optimal set of tokens during inference across multiple turns (iterative process)

Context engineering manages:
- System instructions
- Tools
- Model Context Protocol (MCP)
- External data
- Message history
- Runtime data retrieval

---

## The Problem: Context Rot

**Key Insight**: LLMs have an "attention budget" that gets depleted as context grows

- Every token attends to every other token (n² relationships)
- As context length increases, model accuracy decreases
- Models have less training experience with longer sequences
- Context must be treated as a finite resource with diminishing marginal returns

---

## System Prompts: Find the "Right Altitude"

### The Goldilocks Zone

**Too Prescriptive** ❌
- Hardcoded if-else logic
- Brittle and fragile
- High maintenance complexity

**Too Vague** ❌
- High-level guidance without concrete signals
- Falsely assumes shared context
- Lacks actionable direction

**Just Right** ✅
- Specific enough to guide behavior effectively
- Flexible enough to provide strong heuristics
- Minimal set of information that fully outlines expected behavior

### Best Practices
- Use simple, direct language
- Organize into distinct sections (`<background_information>`, `<instructions>`, `## Tool guidance`, etc.)
- Use XML tags or Markdown headers for structure
- Start with minimal prompt, add based on failure modes
- Note: Minimal ≠ short (provide sufficient information upfront)

---

## Tools: Minimal and Clear

### Design Principles
- **Self-contained**: Each tool has a single, clear purpose
- **Robust to error**: Handle edge cases gracefully
- **Extremely clear**: Intended use is unambiguous
- **Token-efficient**: Returns relevant information without bloat
- **Descriptive parameters**: Unambiguous input names (e.g., `user_id` not `user`)

### Critical Rule
**If a human engineer can't definitively say which tool to use in a given situation, an AI agent can't be expected to do better.**

### Common Failure Modes to Avoid
- Bloated tool sets covering too much functionality
- Tools with overlapping purposes
- Ambiguous decision points about which tool to use

---

## Examples: Diverse, Not Exhaustive

**Do** ✅
- Curate a set of diverse, canonical examples
- Show expected behavior effectively
- Think "pictures worth a thousand words"

**Don't** ❌
- Stuff in a laundry list of edge cases
- Try to articulate every possible rule
- Overwhelm with exhaustive scenarios

---

## Context Retrieval Strategies

### Just-In-Time Context (Recommended for Agents)
**Approach**: Maintain lightweight identifiers (file paths, queries, links) and dynamically load data at runtime

**Benefits**:
- Avoids context pollution
- Enables progressive disclosure
- Mirrors human cognition (we don't memorize everything)
- Leverages metadata (file names, folder structure, timestamps)
- Agents discover context incrementally

**Trade-offs**:
- Slower than pre-computed retrieval
- Requires proper tool guidance to avoid dead-ends

### Pre-Inference Retrieval (Traditional RAG)
**Approach**: Use embedding-based retrieval to surface context before inference

**When to Use**: Static content that won't change during interaction

### Hybrid Strategy (Best of Both)
**Approach**: Retrieve some data upfront, enable autonomous exploration as needed

**Example**: Claude Code loads CLAUDE.md files upfront, uses glob/grep for just-in-time retrieval

**Rule of Thumb**: "Do the simplest thing that works"

---

## Long-Horizon Tasks: Three Techniques

### 1. Compaction
**What**: Summarize conversation nearing context limit, reinitiate with summary

**Implementation**:
- Pass message history to model for compression
- Preserve critical details (architectural decisions, bugs, implementation)
- Discard redundant outputs
- Continue with compressed context + recently accessed files

**Tuning Process**:
1. **First**: Maximize recall (capture all relevant information)
2. **Then**: Improve precision (eliminate superfluous content)

**Low-Hanging Fruit**: Clear old tool calls and results

**Best For**: Tasks requiring extensive back-and-forth

### 2. Structured Note-Taking (Agentic Memory)
**What**: Agent writes notes persisted outside context window, retrieved later

**Examples**:
- To-do lists
- NOTES.md files
- Game state tracking (Pokémon example: tracking 1,234 steps of training)
- Project progress logs

**Benefits**:
- Persistent memory with minimal overhead
- Maintains critical context across tool calls
- Enables multi-hour coherent strategies

**Best For**: Iterative development with clear milestones

### 3. Sub-Agent Architectures
**What**: Specialized sub-agents handle focused tasks with clean context windows

**How It Works**:
- Main agent coordinates high-level plan
- Sub-agents perform deep technical work
- Sub-agents explore extensively (tens of thousands of tokens)
- Return condensed summaries (1,000-2,000 tokens)

**Benefits**:
- Clear separation of concerns
- Parallel exploration
- Detailed context remains isolated

**Best For**: Complex research and analysis tasks

---

## Quick Decision Framework

| Scenario | Recommended Approach |
|----------|---------------------|
| Static content | Pre-inference retrieval or hybrid |
| Dynamic exploration needed | Just-in-time context |
| Extended back-and-forth | Compaction |
| Iterative development | Structured note-taking |
| Complex research | Sub-agent architectures |
| Rapid model improvement | "Do the simplest thing that works" |

---

## Key Takeaways

1. **Context is finite**: Treat it as a precious resource with an attention budget
2. **Think holistically**: Consider the entire state available to the LLM
3. **Stay minimal**: More context isn't always better
4. **Be iterative**: Context curation happens each time you pass to the model
5. **Design for autonomy**: As models improve, let them act intelligently
6. **Start simple**: Test with minimal setup, add based on failure modes

---

## Anti-Patterns to Avoid

- ❌ Cramming everything into prompts
- ❌ Creating brittle if-else logic
- ❌ Building bloated tool sets
- ❌ Stuffing exhaustive edge cases as examples
- ❌ Assuming larger context windows solve everything
- ❌ Ignoring context pollution over long interactions

---

## Remember

> "Even as models continue to improve, the challenge of maintaining coherence across extended interactions will remain central to building more effective agents."

Context engineering will evolve, but the core principle stays the same: **optimize signal-to-noise ratio in your token budget**.

---

*Based on Anthropic's "Effective context engineering for AI agents" (September 2025)*