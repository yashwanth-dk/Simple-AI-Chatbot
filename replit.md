# Simple AI Chatbot

A lightweight chat app for asking questions and getting live, streamed answers from OpenAI.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- Required secret: `OPENAI_API_KEY` — used server-side for chat completions
- Chat history is kept in the browser and is not persisted to a database.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/simple-ai-chatbot/src/App.tsx` — chat UI and browser-side message state
- `artifacts/api-server/src/routes/chat.ts` — validated, streamed OpenAI chat endpoint
- `lib/api-spec/openapi.yaml` — API contract source of truth

## Architecture decisions

- Chat replies stream to the browser as server-sent events.
- The OpenAI key is only used by the API server; it is never sent to the browser.
- Conversations are temporary and cleared by Start over or a page reload.

## Product

The app supports a single chat, suggested starter questions, streaming replies, retries, stopping a reply, and starting a fresh conversation.

## User preferences

No additional preferences recorded.

## Gotchas

- The chat endpoint accepts at most 30 messages per request; the client should keep requests within that limit.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
