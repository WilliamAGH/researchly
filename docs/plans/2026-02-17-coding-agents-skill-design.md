# Coding Agents Skill — Design Doc

**Date**: 2026-02-17
**Status**: Approved

## Problem

Symlinks between coding agent config directories are unreliable — many consumers
(Codex, Kilo, some Windsurf features) don't resolve symlinks and need real files.
The current setup uses chained symlinks (Kilo → OpenCode → Claude) that break
silently. Renames (e.g., `dependency-compliance` → `dependencies`) leave stale
targets everywhere.

## Solution

A Claude Code skill (`coding-agents`) containing:

1. **SKILL.md** — synonym mapping table across agents + usage/update instructions
2. **mapping.json** — machine-readable source→target definitions
3. **sync-agents.sh** — copies real files from canonical sources to all targets

## Canonical Sources (one-way out)

| Source                                   | Owns                                               |
| ---------------------------------------- | -------------------------------------------------- |
| `~/.claude/commands/*.md`                | Slash commands                                     |
| `~/.claude/skills/*/` (non-symlink dirs) | Skills with SKILL.md + references                  |
| `~/.agents/skills/*/`                    | Cross-agent skills (synced TO Claude + all others) |

## Targets

| Agent       | Commands dir                            | Skills dir                    | Verified                 |
| ----------- | --------------------------------------- | ----------------------------- | ------------------------ |
| Claude Code | `~/.claude/commands/`                   | `~/.claude/skills/`           | Disk ls                  |
| Codex       | `~/.codex/prompts/`                     | `~/.codex/skills/`            | Disk ls, symlink targets |
| OpenCode    | `~/.config/opencode/command/`           | `~/.config/opencode/skills/`  | Disk ls, symlink targets |
| Kilo        | `~/.config/kilo/command/`               | `~/.config/kilo/skills/`      | Disk ls, symlink targets |
| Windsurf    | `~/.codeium/windsurf/global_workflows/` | `~/.codeium/windsurf/skills/` | Disk ls, symlink targets |

## Sync Behavior

- **Direction**: Claude + .agents → all others (one-way)
- **Trigger**: Shell script, invoked manually or via Claude Code PostToolUse hook
- **Scope**: Markdown content only (commands, skills). MCP configs excluded.
- **Stale cleanup**: Removes symlinks in target dirs, removes old-name files on rename
- **Native-only preservation**: Files in targets not originating from canonical sources
  are left untouched (tracked via managed-files manifest)

## Decisions

- Approach A (flat-copy with mapping.json) chosen over adapter pattern
- Both Claude Code (`~/.claude/`) and `~/.agents/` serve as canonical sources
- `~/.agents/` syncs TO Claude and all other targets
- Claude Code syncs its native content to all targets (except `~/.agents/`, which is also a source)
- MCP config sync excluded (formats differ too much per agent)
