# EBAM — Evidence Based Advisor Marketing
## Complete Infrastructure & Technical Guide

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Tech Stack](#2-tech-stack)
3. [AWS Deployment Architecture](#3-aws-deployment-architecture)
4. [Frontend Application](#4-frontend-application)
5. [Chatbot & State Machine](#5-chatbot--state-machine)
6. [API Reference](#6-api-reference)
7. [DynamoDB Tables](#7-dynamodb-tables)
8. [S3 WORM Compliance Store](#8-s3-worm-compliance-store)
9. [Hashing & Signature Algorithm](#9-hashing--signature-algorithm)
10. [Compliance Verification](#10-compliance-verification)
11. [Historical Data Retrieval](#11-historical-data-retrieval)
12. [Data Lifecycle & TTL](#12-data-lifecycle--ttl)
13. [EventBridge Automation](#13-eventbridge-automation)
14. [IAM & Security](#14-iam--security)
15. [Local Development](#15-local-development)
16. [Environment Variables](#16-environment-variables)
17. [CloudTrail Audit Logging](#17-cloudtrail-audit-logging)

---

## 1. Project Overview

**Evidence Based Advisor Marketing (EBAM)** is an AI-powered chatbot platform that helps financial professionals — specifically **financial advisors** and **CPAs** — discover how AI avatar videos can grow their practice.

The chatbot (named **Alex**) engages visitors on the website, educates them about the product, captures their contact information, and routes qualified leads to the sales team.

### Core Business Goals

- Engage financial advisors and CPAs with a conversational AI experience
- Capture lead contact details (name, email, phone) during natural conversation
- Store all lead conversations in a tamper-proof compliance archive
- Provide admin tools to manage chatbot flows, view leads, verify compliance records, and retrieve historical data

### Key Features

| Feature | Description |
|---|---|
| Embeddable chatbot widget | Lightweight JS widget that can be dropped into any website via `<script>` tag |
| Audience-aware flows | Separate conversation flows for advisors vs CPAs |
| LLM-powered responses | Claude (Anthropic) handles open-ended questions; state machine handles structured collection |
| Lead capture | Name, email, phone captured during conversation and saved to DynamoDB |
| WORM compliance archive | All conversations stored in S3 Object Lock (7-year retention) with cryptographic integrity |
| Admin dashboard | React SPA for managing flows, leads, compliance records, and historical data |
| Historical data retrieval | Fetch any day's leads from S3 into a temporary history table for admin review |

---

## 2. Tech Stack

### Backend

| Layer | Technology |
|---|---|
| Language | Python 3.12 |
| Framework | FastAPI |
| Lambda adapter | Mangum (ASGI → Lambda handler) |
| LLM | Anthropic Claude (via `anthropic` Python SDK) |
| Auth | JWT (PyJWT), PBKDF2-HMAC password hashing |
| AWS SDK | boto3 |

### Frontend

| Layer | Technology |
|---|---|
| Framework | React 18 (Vite) |
| Routing | React Router v6 |
| Styling | Inline styles (no CSS framework) |
| Build output | Static SPA deployed to Amplify |
| Widget | Vanilla JS (`widget.js`) — zero dependencies, embeddable anywhere |

### AWS Services

| Service | Role |
|---|---|
| Lambda | Serverless API runtime |
| API Gateway (HTTP API) | API endpoint, custom domain routing |
| Amplify | Frontend hosting + CDN |
| DynamoDB | Primary data store (sessions, messages, leads, config, rate limits) |
| S3 (Object Lock) | WORM compliance archive + CloudTrail audit logs |
| KMS | Encryption (symmetric) + Merkle root signing (RSA-4096 asymmetric) |
| EventBridge | Scheduled automation (daily batch seal, idle session scanner) |
| CloudTrail | AWS API audit trail — every DynamoDB/S3/KMS/Lambda call logged |
| CloudFront | CDN for Amplify frontend |
| VPC + NAT Gateway | Lambda network isolation; private DynamoDB access, internet egress for Anthropic API |
| ACM | TLS certificates for custom domains |

---

## 3. AWS Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│  Internet                                                           │
│                                                                     │
│  https://ebam.buzzybrains.net          https://api.buzzybrains.net │
│          │                                       │                  │
└──────────┼───────────────────────────────────────┼──────────────────┘
           │                                       │
    ┌──────▼──────┐                    ┌───────────▼──────────┐
    │  CloudFront │                    │  API Gateway         │
    │  (Amplify)  │                    │  HTTP API            │
    │             │                    │  l7ha0wuja1          │
    │  React SPA  │                    │  Custom domain:      │
    │  (static)   │                    │  api.buzzybrains.net │
    └─────────────┘                    └──────────┬───────────┘
                                                  │
                                    ┌─────────────▼────────────┐
                                    │  AWS Lambda              │
                                    │  Function: ebam-api      │
                                    │  Runtime: Python 3.12    │
                                    │  Handler: main.handler   │
                                    │  VPC: private subnet     │
                                    └──────┬──────────┬────────┘
                                           │          │
                                ┌──────────▼──┐  ┌───▼──────────────┐
                                │  DynamoDB   │  │  Anthropic API   │
                                │  (via VPC   │  │  (via NAT GW →   │
                                │  Gateway    │  │   Internet)      │
                                │  Endpoint)  │  └──────────────────┘
                                └──────┬──────┘
                                       │
                              ┌────────▼────────┐
                              │  S3 WORM Bucket  │
                              │  (via VPC GW     │
                              │   Endpoint)      │
                              └─────────────────┘

  EventBridge Rules (scheduled):
  ├── ebam-daily-compliance-batch  (cron 23:59 UTC)  → Lambda
  └── ebam-idle-session-scanner   (rate 30 min)      → Lambda
```

### VPC Design

```
VPC
├── Public Subnet
│   └── NAT Gateway (internet egress for Lambda)
└── Private Subnet
    └── Lambda (ebam-api)
        ├── Route to DynamoDB  → VPC Gateway Endpoint (private, no internet)
        ├── Route to S3        → VPC Gateway Endpoint (private, no internet)
        └── Route to internet  → NAT Gateway (for Anthropic API calls)
```

### Custom Domains

| Domain | Points To | Purpose |
|---|---|---|
| `ebam.buzzybrains.net` | CloudFront (Amplify) `d34vs79k6l98t9.cloudfront.net` | Frontend SPA |
| `api.buzzybrains.net` | API Gateway custom domain `d-siocry2lof.execute-api.us-east-1.amazonaws.com` | Backend API |

### Lambda Deployment

Lambda is deployed as a **zip package** containing all Python source files plus dependencies (`server/package/`). Deployment is done via AWS CLI:

```bash
cd server/
zip -r /tmp/ebam-deploy.zip . -x "venv/*" -x "*.pyc" -x "*/__pycache__/*" -x "__pycache__/*"
zip -d /tmp/ebam-deploy.zip ".env" "ebam.db" "lambda.zip" 2>/dev/null || true

# Upload via S3 (zip is ~52 MB — exceeds Lambda's direct upload limit)
aws s3 cp /tmp/ebam-deploy.zip s3://ebam-compliance-leads/deployments/ebam-deploy.zip \
  --profile ebam --region us-east-1 --no-progress
aws lambda update-function-code --function-name ebam-api \
  --s3-bucket ebam-compliance-leads --s3-key deployments/ebam-deploy.zip \
  --profile ebam --region us-east-1
aws lambda wait function-updated --function-name ebam-api --profile ebam --region us-east-1
```

> **Critical:** `package/` must be included — it contains all Python deps (fastapi, anthropic, boto3, etc.). Excluding it causes `No module named 'fastapi'`. Always remove `.env` from the zip (`zip -d`) — it injects `AWS_PROFILE=ebam` which breaks boto3 in Lambda. Lambda env var `PYTHONPATH=/var/task/package` must remain set.

---

## 4. Frontend Application

### React SPA (`web/src/`)

| Page | Route | Description |
|---|---|---|
| Login | `/login` | JWT-based admin login |
| Chat Demo | `/chat` | Embedded chatbot demo |
| Flow Editor | `/admin` | Visual state machine editor for chatbot flows |
| Leads | `/leads` | Real-time lead management with calendar filter |
| Compliance | `/compliance` | S3 WORM records, batch sealing, verification UI |
| History | `/history` | Retrieve historical leads from S3 by date |
| Users | `/users` | Admin user management (admin role only) |

### Embeddable Widget (`web/public/widget.js`)

A self-contained vanilla JS chatbot widget. Embedded via:

```html
<script src="https://ebam.buzzybrains.net/widget.js"></script>
```

**Widget behaviour:**
- Opens as a floating button (bottom-right)
- On open: fetches greeting from `/api/chat/config` and preloads both audience flows in background
- User selects audience (Advisor / CPA) → uses preloaded response (instant, no wait)
- Maintains full conversation with input box + quick-reply option buttons
- **Voice input:** microphone button uses Web Speech API; transcript inserted into text field automatically
- Dark navy/gold theme matching EBAM branding
- **Favicon:** `favicon.png` / `favicon.webp` served from `web/public/` — linked in `index.html`

### Frontend Deployment

Hosted on **AWS Amplify** (app ID `d142ap2pr34amq`, branch `main`). Deployed via manual upload of `dist/` zip:

```bash
cd web && npm run build
# Then upload dist/ to Amplify via create-deployment / start-deployment
```

---

## 5. Chatbot & State Machine

### Conversation Flow

Each audience (advisor/cpa) has a JSON flow definition stored in `server/flows/` or overridden in DynamoDB (`ebam-flow-configs`).

**Default advisor flow:**

```
[start]  → Capture name
    ↓
[ask_email]  → Capture email
    ↓
[choose_topic]  → Quick-reply options (Why use videos? Cost? Compliance? etc.)
    ↓
[llm_chat]  → Free LLM conversation (Claude handles all questions)
    ↓         User can ask anything; "I'd like to get in touch" → end
[end]  → Thank you message, team will reach out within 24 hrs
```

### State Types

| Type | Behaviour |
|---|---|
| `input` | Bot asks a question, captures user response into a named field (`capture: "name"`) |
| `choice` | Bot presents quick-reply options; each maps to a transition |
| `llm` | User message sent to Claude with system prompt; response returned as bot message |
| `end` | Conversation complete; `is_end: true` returned to frontend |

### LLM Integration

- **Model:** Anthropic Claude (configured via `ANTHROPIC_API_KEY`)
- **System prompt:** Audience-specific (advisor vs CPA), injected per message
- **Message history:** Full conversation history sent with every LLM call for context
- **Exit intent detection:** When the flow defines exit options on an LLM state (e.g. "Get in touch"), a dedicated `_match_exit_intent` function fires first — keyword list check (`"get in touch"`, `"contact"`, `"call me"`, etc.) plus a quick YES/NO LLM fallback — so phrases like "I'd like to get in touch" or "please get in touch" transition to the end state without the bot asking again
- **Default prompt:** Per-audience fallback prompt for open-ended responses

### Lead Capture

Name and email are captured via `input`-type states early in the flow. Once both are collected:
- Lead is saved to `ebam-leads` DynamoDB table (`upsert_lead`)
- Session `collected_data` is updated with all captured fields

---

## 6. API Reference

Base URL: `https://api.buzzybrains.net`

All admin endpoints require `Authorization: Bearer <token>` header.

### Auth

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Login with username/password → returns JWT token |
| GET | `/api/auth/users` | List admin users (admin role) |
| POST | `/api/auth/users` | Create admin user |
| PUT | `/api/auth/users/{username}/password` | Reset password |
| DELETE | `/api/auth/users/{username}` | Delete user |

### Chat

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/chat/config` | Get greeting message |
| POST | `/api/chat/start` | Start a new session → returns session_id + first message |
| POST | `/api/chat/message` | Send user message → returns bot response |
| GET | `/api/chat/history/{session_id}` | Get conversation history |

**POST /api/chat/start** request:
```json
{ "audience": "advisor" }
```

**POST /api/chat/message** request:
```json
{ "session_id": "uuid", "user_message": "Hello" }
```

**POST /api/chat/message** response:
```json
{
  "session_id": "uuid",
  "message": "Bot response text",
  "options": ["Option A", "Option B"],
  "is_end": false
}
```

### Leads

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/leads` | List all leads |
| DELETE | `/api/leads/{lead_id}` | Delete a single lead by ID |
| DELETE | `/api/leads/all` | Delete all leads, sessions, messages |

### Admin (Flow & Config)

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/admin/flow/{audience}` | Get flow config for audience |
| POST | `/api/admin/flow/{audience}` | Save flow config |
| DELETE | `/api/admin/flow/{audience}` | Delete flow config (reverts to default) |
| GET | `/api/admin/chatbot-config` | Get active chatbot config (prompts, greeting, allowed origins) |
| PUT | `/api/admin/chatbot-config` | Save chatbot config (also invalidates origin cache) |
| POST | `/api/admin/chatbot-config/reset` | Reset chatbot config to factory defaults |
| GET | `/api/admin/stats` | Get session/lead/message counts |

### Compliance

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/compliance/batch` | Seal today's batch (Merkle tree + KMS sign) |
| GET | `/api/compliance/records` | List compliance records |
| GET | `/api/compliance/batches` | List sealed batches |
| GET | `/api/compliance/batch/{batch_id}` | Get batch detail |
| GET | `/api/compliance/verify/{record_id}` | Full 4-check verification |
| POST | `/api/compliance/scan-idle` | Scan idle sessions, store timeout records |

### History

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/history/available-days` | List S3 days that have lead objects |
| POST | `/api/history/fetch/{date}` | Load a day from S3 into history table |
| GET | `/api/history/dates` | List dates already cached in history table |
| GET | `/api/history/leads` | All records in history table |
| GET | `/api/history/leads/{date}` | Records for a specific date |
| DELETE | `/api/history/leads/{date}` | Delete cached records for a date |
| DELETE | `/api/history/leads` | Delete all history records |

---

## 7. DynamoDB Tables

All tables use **on-demand billing (PAY_PER_REQUEST)**. Region: `us-east-1`.

### ebam-sessions

Tracks the state of each chatbot conversation.

| Attribute | Type | Description |
|---|---|---|
| `session_id` | S (PK) | UUID for the session |
| `user_type` | S | `advisor` or `cpa` |
| `current_state` | S | Current state machine node |
| `previous_state` | S | Previous state (for back-navigation) |
| `collected_data` | M | Map of captured fields (name, email, phone, etc.) |
| `is_complete` | BOOL | True when conversation reached `is_end` |
| `compliance_status` | S | `none` / `complete` / `timeout` |
| `created_at` | S | ISO timestamp |
| `last_activity_at` | S | ISO timestamp of last message |
| `ttl` | N | Unix timestamp — auto-deleted by DynamoDB after 30 days |

### ebam-messages

Individual chat messages within a session.

| Attribute | Type | Description |
|---|---|---|
| `message_id` | S (PK) | UUID |
| `session_id` | S | FK → sessions |
| `role` | S | `user` or `bot` |
| `content` | S | Message text |
| `state_id` | S | State machine node at time of message |
| `created_at` | S | ISO timestamp |
| `ttl` | N | Unix timestamp — auto-deleted after 30 days |

**GSI:** `session_id-created_at-index` — used to query messages by session in chronological order.

### ebam-leads

Captured leads (name + email collected).

| Attribute | Type | Description |
|---|---|---|
| `lead_id` | S (PK) | UUID |
| `session_id` | S | FK → sessions |
| `name` | S | Lead's name |
| `email` | S | Lead's email |
| `user_type` | S | `advisor` or `cpa` |
| `collected_data` | M | All captured fields |
| `created_at` | S | ISO timestamp |
| `ttl` | N | Unix timestamp — auto-deleted after 30 days |

**GSI:** `session_id-index` — used to look up lead by session.

### ebam-compliance-records

One record per lead stored in S3 WORM. Tracks cryptographic chain.

| Attribute | Type | Description |
|---|---|---|
| `record_id` | S (PK) | `REC-YYYY-MM-DD-{uuid}` |
| `batch_id` | S | Date string `YYYY-MM-DD` |
| `session_id` | S | FK → session |
| `record_type` | S | `complete` or `timeout` |
| `s3_key` | S | Path to the S3 object |
| `data_hash` | S | SHA256 of raw S3 object bytes |
| `previous_hash` | S | `record_hash` of the prior record (chain link) |
| `record_hash` | S | SHA256(prev_hash + data_hash + timestamp + record_id) |
| `timestamp` | S | ISO timestamp of record creation |
| `merkle_proof` | L | List of sibling hashes for Merkle verification |
| `merkle_index` | N | Leaf position in the Merkle tree |

**GSI:** `batch_id-index` — used to query all records for a given day.

### ebam-compliance-batches

One record per sealed daily batch.

| Attribute | Type | Description |
|---|---|---|
| `batch_id` | S (PK) | Date `YYYY-MM-DD` |
| `merkle_root` | S | Hex root of the day's Merkle tree |
| `signature` | S | Base64 KMS RSA-4096 signature of merkle_root |
| `record_count` | N | Number of records in this batch |
| `start_record_id` | S | First record of the day |
| `end_record_id` | S | Last record of the day |
| `start_hash` | S | Chain hash of first record |
| `end_hash` | S | Chain hash of last record |
| `created_at` | S | Seal timestamp |
| `anchor_s3_key` | S | S3 key of the batch manifest |
| `status` | S | `sealed` |

### ebam-flow-configs

Custom flow overrides set by admin.

| Attribute | Type | Description |
|---|---|---|
| `name` | S (PK) | `advisor` or `cpa` |
| `flow_json` | M | Full flow state machine as DynamoDB map |
| `updated_at` | S | ISO timestamp |

### ebam-chatbot-config

Active chatbot configuration (greeting, system prompts, LLM prompts).

| Attribute | Type | Description |
|---|---|---|
| `config_id` | S (PK) | Always `active` (single record) |
| `config_json` | M | Full config including greeting, per-audience prompts |
| `updated_at` | S | ISO timestamp |

### ebam-rate-limits

Per-IP message rate limiting counters. Items auto-expire via DynamoDB TTL.

| Attribute | Type | Description |
|---|---|---|
| `rate_key` | S (PK) | `{ip}#{window}` — IP address + time window bucket |
| `count` | N | Number of messages in this window |
| `ttl` | N | Unix timestamp — auto-deleted after 2 rate windows |

TTL attribute name: `ttl` — must be enabled on table creation (`aws dynamodb update-time-to-live`).

Default limits: **20 messages / 60 seconds** per IP (configurable via `CHAT_RATE_LIMIT` and `CHAT_RATE_WINDOW` env vars).

### ebam-admin-users

Admin portal user accounts.

| Attribute | Type | Description |
|---|---|---|
| `username` | S (PK) | Login username |
| `id` | S | UUID |
| `password_hash` | S | `{salt}:{pbkdf2_hex}` |
| `created_at` | S | ISO timestamp |

### ebam-leads-history

Temporary cache of historical lead data fetched from S3 by admin. No TTL — persists until manually deleted.

| Attribute | Type | Description |
|---|---|---|
| `history_id` | S (PK) | UUID |
| `fetch_date` | S | Date of the S3 data (`YYYY-MM-DD`) |
| `session_id` | S | Original session ID |
| `s3_key` | S | Source S3 object key |
| `record_type` | S | `complete` or `timeout` |
| `name` | S | Lead name |
| `email` | S | Lead email |
| `user_type` | S | `advisor` or `cpa` |
| `collected_data` | M | All captured fields |
| `conversation` | L | Full conversation messages |
| `original_created_at` | S | Original session creation timestamp |
| `fetched_at` | S | When admin fetched this record |

**GSI:** `fetch_date-index` — used to query/delete records by date.

---

## 8. S3 WORM Compliance Store

### Bucket: `ebam-compliance-leads`

| Setting | Value |
|---|---|
| Region | `us-east-1` |
| Object Lock | Enabled (bucket-level, versioning on) |
| Lock Mode | **COMPLIANCE** — cannot be overridden even by root (per-object, not bucket default) |
| Retention Period | **7 years (2555 days)** — applied per-object when `COMPLIANCE_LOCK_ENABLED=true` |
| Server-Side Encryption | `aws:kms` using `alias/ebam-s3-encryption` (symmetric KMS key) |

> **Test mode:** Set `COMPLIANCE_LOCK_ENABLED=false` on Lambda to write S3 objects without Object Lock retention. Objects written in test mode can be deleted normally. Production should always use `true`.
>
> **Note on versioning + delete:** Because the bucket uses versioning, `aws s3 rm` adds a delete marker — it does not remove the actual object version. Locked objects remain protected until the retention date (2033) regardless of delete markers.

### Object Layout

```
ebam-compliance-leads/
├── leads/
│   └── YYYY/
│       └── MM/
│           └── DD/
│               ├── {session_id}_complete.json
│               └── {session_id}_timeout.json
└── batches/
    └── YYYY/
        └── MM/
            └── DD/
                └── batch.json
```

### Lead JSON Schema (stored in S3)

```json
{
  "schema_version": "1.0",
  "record_type": "complete",
  "session_id": "9f295a48-e95e-4eae-9bbf-317cc8144790",
  "audience": "advisor",
  "created_at": "2026-03-25T11:20:00Z",
  "completed_at": "2026-03-25T11:23:52Z",
  "lead": {
    "name": "John Smith",
    "email": "john@example.com",
    "phone": null
  },
  "collected_data": {
    "name": "John Smith",
    "email": "john@example.com"
  },
  "conversation": [
    { "role": "bot",  "content": "Hi there! I'm Alex...", "state": "start",     "created_at": "..." },
    { "role": "user", "content": "John Smith",             "state": "start",     "created_at": "..." },
    { "role": "bot",  "content": "Thanks John!...",        "state": "ask_email", "created_at": "..." },
    { "role": "user", "content": "john@example.com",      "state": "ask_email", "created_at": "..." }
  ],
  "metadata": {
    "message_count": 8,
    "is_complete": true,
    "current_state": "end"
  }
}
```

### Trigger Points

| Trigger | When | Record Type |
|---|---|---|
| Conversation complete | `is_end: true` returned by state machine | `complete` |
| Idle session | Session has name+email, incomplete, idle >30 min | `timeout` |

---

## 9. Hashing & Signature Algorithm

### Layer 1 — Data Hash (SHA-256)

Proves the S3 object content has not been modified.

```
data_hash = SHA256(raw_bytes_of_s3_json_object)
```

### Layer 2 — Chain Hash (SHA-256 Linked)

Every record is cryptographically linked to the one before it. Tampering with any record breaks all subsequent hashes.

```
record_hash = SHA256(
    previous_hash      # record_hash of prior record (or GENESIS_HASH for first)
  + data_hash          # SHA256 of this record's S3 bytes
  + timestamp          # ISO timestamp string
  + record_id          # REC-YYYY-MM-DD-{uuid}
)

GENESIS_HASH = "0000...0000"  (64 zeros) — sentinel for the first record of a batch
```

**Chain visualised:**

```
Record 1:  hash_1 = SHA256("0"×64  + data_1 + ts_1 + id_1)
Record 2:  hash_2 = SHA256(hash_1  + data_2 + ts_2 + id_2)
Record 3:  hash_3 = SHA256(hash_2  + data_3 + ts_3 + id_3)
                              ↑
               Changing record 2 invalidates hash_2,
               which breaks hash_3, and all that follow.
```

### Layer 3 — Merkle Tree (daily batch)

Sealing is triggered at **23:59 UTC daily** by EventBridge.

```
All record_hashes for the day → leaf nodes

          merkle_root
         /            \
    h(AB)              h(CD)
    /    \             /    \
  h(A)  h(B)        h(C)  h(D)
   ↑     ↑           ↑     ↑
rec_1  rec_2       rec_3  rec_4

Odd number of leaves → last leaf duplicated:
  [A, B, C]  →  [A, B, C, C]
```

Each record gets a **Merkle proof** — the sibling hashes needed to independently recompute the root. Stored in `ebam-compliance-records.merkle_proof`.

### Layer 4 — KMS RSA-4096 Signature

The Merkle root is signed with an **asymmetric KMS key** after every batch seal.

```
KMS Key:   alias/ebam-merkle-signing  (RSA-4096)
Algorithm: RSASSA_PKCS1_V1_5_SHA_256

signature = KMS.sign(
    KeyId    = "alias/ebam-merkle-signing",
    Message  = merkle_root_hex_string,
    MessageType = "RAW",
    SigningAlgorithm = "RSASSA_PKCS1_V1_5_SHA_256"
)
→ Base64-encoded DER signature stored in ebam-compliance-batches
```

Verification uses `KMS.verify()` with the public key — the private key never leaves AWS KMS.

### KMS Keys Summary

| Key Alias | Type | Purpose |
|---|---|---|
| `alias/ebam-s3-encryption` | Symmetric AES-256 | Encrypt S3 objects at rest |
| `alias/ebam-merkle-signing` | Asymmetric RSA-4096 | Sign Merkle root for batch integrity |

---

## 10. Compliance Verification

Available at `GET /api/compliance/verify/{record_id}` and via the Compliance UI.

Four independent checks are run:

### Check 1 — Data Hash

```
1. Download the S3 object at record.s3_key
2. Compute SHA256(raw_bytes)
3. Compare with stored record.data_hash
→ PASS if equal — proves S3 content unchanged
```

### Check 2 — Record Hash (Chain Integrity)

```
1. Use stored record.previous_hash, data_hash, timestamp, record_id
2. Recompute: SHA256(previous_hash + data_hash + timestamp + record_id)
3. Compare with stored record.record_hash
→ PASS if equal — proves record not tampered and chain intact
```

### Check 3 — Merkle Proof

```
1. Fetch the batch for this record's batch_id
2. Start from record.record_hash (leaf node)
3. Walk up the tree using record.merkle_proof sibling hashes:
   For each step:
     if sibling is on the right: current = SHA256(current + sibling)
     if sibling is on the left:  current = SHA256(sibling + current)
4. Compare final computed root with batch.merkle_root
→ PASS if equal — proves this record is genuinely part of the sealed batch
```

### Check 4 — KMS Signature

```
1. Fetch batch.merkle_root and batch.signature
2. Call KMS.verify(
     KeyId    = "alias/ebam-merkle-signing",
     Message  = merkle_root,
     Signature = base64_decode(signature),
     SigningAlgorithm = "RSASSA_PKCS1_V1_5_SHA_256"
   )
→ PASS if AWS KMS confirms signature valid — proves root was signed by this system
```

### Result

```json
{
  "record_id": "REC-2026-03-25-...",
  "batch_id": "2026-03-25",
  "s3_key": "leads/2026/03/25/..._complete.json",
  "checks": {
    "data_hash":     true,
    "record_hash":   true,
    "merkle_proof":  true,
    "kms_signature": true
  },
  "valid": true
}
```

---

## 11. Historical Data Retrieval

Active DynamoDB data auto-expires after 30 days (TTL). For older data, admin can retrieve from S3 WORM on demand.

### Flow

```
Admin opens History page
       ↓
Calendar shows all dates that have S3 lead objects
  Blue dot  = S3 data exists, not yet cached
  Green dot = already cached in ebam-leads-history
       ↓
Admin clicks a blue-dot date → "Fetch from S3"
       ↓
GET /api/history/available-days   (list S3 prefixes)
POST /api/history/fetch/{date}
  1. List all S3 objects under leads/YYYY/MM/DD/
  2. Download each JSON
  3. Deduplicate by session_id (keep best: complete > timeout > partial)
  4. Insert into ebam-leads-history table
       ↓
Summary table updates: Date | Records | Fetched At
       ↓
Admin clicks a row → drill-down shows individual leads
  Click lead row → detail panel with collected data + full conversation
       ↓
Admin can:
  - Export CSV
  - Delete a specific day's cache (Remove Day)
  - Delete all cached history (Delete All History)
  Data in ebam-leads-history persists until explicitly deleted.
  Original S3 WORM objects are never affected.
```

---

## 12. Data Lifecycle & TTL

| Table | TTL | What Happens After Expiry |
|---|---|---|
| `ebam-sessions` | 30 days | Session deleted from DynamoDB; S3 WORM copy retained |
| `ebam-messages` | 30 days | Messages deleted; conversation preserved in S3 WORM |
| `ebam-leads` | 30 days | Lead deleted from active table; retrievable via History page |
| `ebam-compliance-records` | None | Permanent — compliance metadata kept indefinitely |
| `ebam-compliance-batches` | None | Permanent |
| `ebam-leads-history` | None (manual) | Kept until admin deletes via UI |
| S3 WORM objects | 7 years (Object Lock) | Cannot be deleted — enforced by S3 Object Lock Compliance mode |

---

## 13. EventBridge Automation

### ebam-daily-compliance-batch

Seals the day's compliance batch every night.

| Setting | Value |
|---|---|
| Rule name | `ebam-daily-compliance-batch` |
| Schedule | `cron(59 23 * * ? *)` — 23:59 UTC daily |
| Target | Lambda `ebam-api` |
| Payload | `POST /api/compliance/batch` with `source: "aws.events"` |
| Effect | Builds Merkle tree, KMS signs root, writes batch manifest to S3, back-fills proofs |

### ebam-idle-session-scanner

Catches leads that provided name+email but never completed the conversation.

| Setting | Value |
|---|---|
| Rule name | `ebam-idle-session-scanner` |
| Schedule | `rate(30 minutes)` |
| Target | Lambda `ebam-api` |
| Payload | `POST /api/compliance/scan-idle` with `source: "aws.events"` |
| Effect | Scans sessions idle >30 min with name+email → stores `timeout` compliance record |

### EventBridge + Mangum Routing

**Important:** Mangum (the ASGI adapter) only handles API Gateway event shapes. EventBridge scheduled events have a different format and are silently rejected by Mangum.

The Lambda `handler()` in `main.py` detects EventBridge events at the top (checks `event.source == "aws.events"`) and calls the compliance functions directly — bypassing Mangum and auth middleware — before returning. API Gateway requests fall through to Mangum as normal.

```python
def handler(event, context):
    if _is_eventbridge(event):
        # Route directly to compliance functions
        ...
        return {"statusCode": 200, ...}
    return _mangum(event, context)   # API Gateway path
```

---

## 14. IAM & Security

### Lambda Execution Role: `ebam-lambda-role`

| Policy | Permissions |
|---|---|
| `ebam-dynamodb-policy` | `dynamodb:*` on `arn:aws:dynamodb:us-east-1:288763316615:table/ebam-*` |
| `ebam-compliance-s3` | `s3:PutObject`, `s3:GetObject` on `ebam-compliance-leads/*`; `s3:ListBucket` on `ebam-compliance-leads` |
| `ebam-compliance-kms-encrypt` | `kms:GenerateDataKey`, `kms:Decrypt` on `alias/ebam-s3-encryption` |
| `ebam-compliance-kms-sign` | `kms:Sign`, `kms:Verify` on `alias/ebam-merkle-signing` |
| `AWSLambdaVPCAccessExecutionRole` | ENI management for VPC access |
| `AWSLambdaBasicExecutionRole` | CloudWatch Logs |

### API Authentication

- Admin API endpoints use **JWT Bearer tokens** (HS256, 8-hour expiry)
- Default superadmin: `admin` / password from `ADMIN_PASSWORD` env var (default: `admin`)
- Additional users stored in `ebam-admin-users` DynamoDB with PBKDF2-HMAC-SHA256 hashed passwords (260,000 iterations)
- Public endpoints (chat): no auth required

### CORS

API Gateway and FastAPI middleware both configured to allow:
- `https://ebam.buzzybrains.net`
- `https://main.d142ap2pr34amq.amplifyapp.com`
- `http://localhost:5173` (local dev)
- `http://localhost:3000` (local dev)

Note: CORS headers are advisory for browsers only — they do not block server-to-server requests. The application-level origin check (below) provides enforcement.

### Allowed Origins (Chatbot Widget)

Configurable via the Admin → Chatbot Configuration UI. Stored as `allowed_origins` in `ebam-chatbot-config`.

- If the list is **empty** → all origins are allowed (open mode)
- `*` in the list → all origins explicitly allowed
- Otherwise → exact match on `Origin` header (scheme + host + optional port)
- Requests without an `Origin` header when the list is non-empty → **403 Forbidden**

The allowed-origins list is **cached in memory for 120 seconds** per Lambda instance (TTL configurable via `_ORIGINS_CACHE_TTL`). The cache is invalidated immediately when chatbot config is saved.

Implemented in `server/rate_limit.py` (`is_origin_allowed`, `get_allowed_origins_cached`, `invalidate_origins_cache`). Applied in `POST /api/chat/start` and `POST /api/chat/message`.

### Rate Limiting

Per-IP message rate limiter applied to `POST /api/chat/message`.

- **Default:** 20 messages per 60-second window per IP
- Counter stored in `ebam-rate-limits` DynamoDB table (atomic `update_item` with `if_not_exists`)
- Time window = `floor(unix_time / RATE_WINDOW_SEC)` — new bucket every minute
- TTL auto-expires items after 2 windows (120 seconds)
- On DynamoDB error → **fail open** (allow request) to avoid blocking real users on AWS issues
- Returns HTTP **429** when limit exceeded: `"Too many messages. Please wait a moment before continuing."`
- IP extracted from `X-Forwarded-For` header (first value) or falls back to `request.client.host`

Configurable via env vars: `CHAT_RATE_LIMIT` (default `20`) and `CHAT_RATE_WINDOW` (default `60`).

---

## 15. Local Development

### Backend

```bash
cd server
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Set env vars
export AWS_PROFILE=ebam
export AWS_REGION=us-east-1
export ANTHROPIC_API_KEY=sk-...
export ADMIN_PASSWORD=admin

uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd web
npm install

# For local dev (proxies API to localhost:8000)
npm run dev

# For production build
npm run build
```

### Vite Proxy (local dev)

`vite.config.js` proxies `/api/*` to `http://localhost:8000` so `VITE_API_BASE_URL` can be empty in development.

---

## 16. Environment Variables

### Lambda / Server

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Anthropic Claude API key |
| `AWS_REGION` | Yes | AWS region (default: `us-east-1`) |
| `AWS_EXECUTION_ENV` | Auto | Set by Lambda runtime — switches from AWS profile to IAM role |
| `LAMBDA_TASK_ROOT` | Auto | Set by Lambda runtime |
| `SECRET_KEY` | Recommended | JWT signing secret (default: `ebam-secret-key-change-in-production`) |
| `ADMIN_PASSWORD` | Recommended | Superadmin password (default: `admin`) |
| `KMS_ENCRYPT_KEY_ID` | No | KMS key alias for S3 encryption (default: `alias/ebam-s3-encryption`) |
| `COMPLIANCE_LOCK_ENABLED` | No | `true` (default) — puts S3 Object Lock COMPLIANCE mode on each lead file. Set to `false` in test/dev to write unlocked objects that can be deleted normally. |
| `CHAT_RATE_LIMIT` | No | Max messages per IP per rate window (default: `20`) |
| `CHAT_RATE_WINDOW` | No | Rate window in seconds (default: `60`) |

### Frontend

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | API base URL for production (set in `web/.env.production`). Currently: `https://api.buzzybrains.net` |

---

## 17. CloudTrail Audit Logging

### Trail: `ebam-audit`

Every AWS API call made within the account (DynamoDB reads/writes, S3 PutObject/GetObject, KMS Sign/Verify, Lambda invocations) is captured by CloudTrail and stored in S3.

| Setting | Value |
|---|---|
| Trail name | `ebam-audit` |
| S3 bucket | `ebam-compliance-leads` |
| S3 prefix | `cloudtrail/` |
| Log file validation | **Enabled** — CloudTrail signs each log file; tampering is detectable |
| Region | `us-east-1` (management events) |

### What Gets Logged

- All **DynamoDB** operations (`PutItem`, `GetItem`, `UpdateItem`, `DeleteItem`, `Scan`, `Query`)
- All **S3** operations on `ebam-compliance-leads` (`PutObject`, `GetObject`, `DeleteObject`)
- All **KMS** operations (`Sign`, `Verify`, `GenerateDataKey`, `Decrypt`)
- All **Lambda** invocations (`Invoke`)
- All **IAM / admin** API calls
- All **EventBridge** rule invocations

### Log Location

```
s3://ebam-compliance-leads/cloudtrail/AWSLogs/{account_id}/CloudTrail/us-east-1/YYYY/MM/DD/
```

Files are gzip-compressed JSON, named `{account_id}_CloudTrail_us-east-1_{timestamp}_{random}.json.gz`.

### Querying Logs with Athena

1. Create an Athena table pointing at `s3://ebam-compliance-leads/cloudtrail/`:

```sql
CREATE EXTERNAL TABLE cloudtrail_logs (
    eventVersion STRING,
    userIdentity STRUCT<type:STRING, principalId:STRING, arn:STRING, accountId:STRING>,
    eventTime STRING,
    eventSource STRING,
    eventName STRING,
    awsRegion STRING,
    sourceIPAddress STRING,
    requestParameters STRING,
    responseElements STRING,
    errorCode STRING,
    errorMessage STRING
)
PARTITIONED BY (year STRING, month STRING, day STRING)
ROW FORMAT SERDE 'org.openx.data.jsonserde.JsonSerDe'
LOCATION 's3://ebam-compliance-leads/cloudtrail/AWSLogs/{account_id}/CloudTrail/us-east-1/'
TBLPROPERTIES ('has_encrypted_data'='false');
```

2. Example queries:

```sql
-- All KMS Sign operations (batch seals)
SELECT eventTime, eventName, userIdentity.arn, errorCode
FROM cloudtrail_logs
WHERE eventSource = 'kms.amazonaws.com' AND eventName = 'Sign'
ORDER BY eventTime DESC;

-- All S3 PutObject calls to leads/
SELECT eventTime, requestParameters, sourceIPAddress
FROM cloudtrail_logs
WHERE eventSource = 's3.amazonaws.com'
  AND eventName = 'PutObject'
  AND requestParameters LIKE '%leads/%'
ORDER BY eventTime DESC;

-- Lambda invocations in the last 24 hours
SELECT eventTime, sourceIPAddress, errorCode
FROM cloudtrail_logs
WHERE eventSource = 'lambda.amazonaws.com'
  AND eventName = 'Invoke'
ORDER BY eventTime DESC
LIMIT 100;
```

### Verifying Log Integrity

```bash
aws cloudtrail validate-log-file-integrity \
  --trail-arn arn:aws:cloudtrail:us-east-1:{account_id}:trail/ebam-audit \
  --start-time 2026-01-01T00:00:00Z \
  --profile ebam --region us-east-1
```

---

## AWS Resource Summary

| Resource | ID / Name | Purpose |
|---|---|---|
| Lambda Function | `ebam-api` | All backend logic |
| API Gateway | `l7ha0wuja1` | HTTP API, routes to Lambda |
| Amplify App | `d142ap2pr34amq` | Frontend hosting |
| DynamoDB Tables | `ebam-sessions`, `ebam-messages`, `ebam-leads`, `ebam-flow-configs`, `ebam-chatbot-config`, `ebam-admin-users`, `ebam-compliance-records`, `ebam-compliance-batches`, `ebam-leads-history`, `ebam-rate-limits` | All data storage |
| S3 Bucket | `ebam-compliance-leads` | WORM compliance archive + CloudTrail logs |
| KMS Key | `alias/ebam-s3-encryption` | S3 object encryption |
| KMS Key | `alias/ebam-merkle-signing` | Batch Merkle root signing |
| EventBridge Rule | `ebam-daily-compliance-batch` | Nightly batch seal |
| EventBridge Rule | `ebam-idle-session-scanner` | 30-min idle session check |
| IAM Role | `ebam-lambda-role` | Lambda execution permissions |
| Custom Domain | `ebam.buzzybrains.net` | Frontend |
| Custom Domain | `api.buzzybrains.net` | Backend API |
| CloudTrail Trail | `ebam-audit` | AWS API audit log → `s3://ebam-compliance-leads/cloudtrail/` |
