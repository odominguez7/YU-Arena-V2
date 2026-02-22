System: YU Arena = shared room where two agents collaborate to recover open capacity; event log is the product.

Architecture

Stack: Express + TS + SQLite + WS + Vite React dashboard.

Entities: Room, Agent, Opportunity, Event (append-only).

Agent roles: Scout creates/proposes; Closer claims/resolves; always narrate via events/messages.

Rules: action endpoints use Idempotency-Key; agents auth via bearer key.
