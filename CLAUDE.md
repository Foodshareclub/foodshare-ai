# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Next.js application providing AI-powered code review for GitHub pull requests. Features a dashboard UI and API endpoints for automated PR reviews using Groq LLM.

## Commands

```bash
# Development
npm install              # Install dependencies
npm run dev              # Start dev server (http://localhost:3000)
npm run build            # Build for production
npm run lint             # Run ESLint

# Docker (production)
docker compose up -d --build    # Build and run
docker compose down             # Stop
docker logs foodshare-ai        # View logs
```

## Architecture

```
src/
├── app/
│   ├── api/                    # API Routes
│   │   ├── chat/route.ts       # Direct LLM chat
│   │   ├── health/route.ts     # Health check
│   │   ├── repos/route.ts      # List repositories
│   │   ├── pulls/route.ts      # List pull requests
│   │   ├── review/route.ts     # Trigger code review
│   │   └── webhook/github/route.ts  # GitHub webhook
│   └── dashboard/              # Dashboard UI pages
├── lib/
│   ├── llm/
│   │   ├── groq.ts             # Groq client with retry logic
│   │   ├── ollama.ts           # Ollama client (self-hosted)
│   │   └── index.ts            # LLM provider abstraction
│   ├── review/
│   │   ├── analyzer.ts         # Diff parsing and prioritization
│   │   ├── prompts.ts          # Review prompt templates
│   │   └── models.ts           # TypeScript types and enums
│   ├── github.ts               # GitHub API client
│   └── review.ts               # Review orchestration
└── components/ui/              # shadcn/ui components
```

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/health` | GET | None | Health check |
| `/api/chat` | POST | - | Direct LLM chat: `{prompt}` → `{response}` |
| `/api/repos` | GET | - | List repos: `?org=name` |
| `/api/pulls` | GET | - | List PRs: `?owner=x&repo=y` |
| `/api/review` | POST | - | Review PR: `{owner, repo, pr_number, post?}` |
| `/api/webhook/github` | POST | Sig | GitHub webhook for auto-review |

## Environment Variables

```env
# LLM Provider
LLM_PROVIDER=groq              # groq | ollama
GROQ_API_KEY=gsk_xxx           # Required for Groq
GROQ_MODEL=llama-3.1-8b-instant
GROQ_REVIEW_MODEL=llama-3.3-70b-versatile  # Optional larger model

# Ollama (self-hosted alternative)
OLLAMA_HOST=http://localhost:11434
OLLAMA_MODEL=llama3.2:3b

# GitHub
GITHUB_TOKEN=ghp_xxx           # Required
GITHUB_WEBHOOK_SECRET=xxx      # Optional, for webhook verification
```

## Key Features

- **Code Review**: Analyzes PR diffs for security, bugs, and performance issues
- **Smart Diff Handling**: Filters lock files, prioritizes source code, truncates large diffs
- **Rate Limit Handling**: Exponential backoff retry for Groq API limits
- **Category-specific Prompts**: Security, Bug, Performance focus areas
- **Dashboard UI**: Browse repos, view PRs, trigger reviews, configure settings
