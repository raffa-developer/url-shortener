# Project 1 — URL Shortener + Analytics

## The idea

Build a URL shortener where the URL-shortening part is the easy part. The interesting portfolio value comes from what happens after someone clicks the link.

Example:

```text
Long URL:
https://example.com/some/really/long/path?campaign=summer

        ↓

Short URL:
https://yourapp.com/aB72x
```

When someone visits:

```text
https://yourapp.com/aB72x
```

the backend finds the original URL and redirects them.

At the same time, the system records useful analytics such as:

- Total clicks
- Clicks over time
- Countries
- Devices
- Browsers
- Referrers

Example:

```text
Link: aB72x

Total clicks: 1,482

Today: 127
Yesterday: 103

Countries:
Portugal       421
UK             284
USA            219

Devices:
Desktop        62%
Mobile         35%
Tablet          3%

Referrers:
Google         31%
Instagram      24%
Direct         18%
Other          27%
```

---

## Application structure

Build three main parts.

### 1. Dashboard

Show all the user's links:

```text
My Links

┌────────────────────────────────────────────────────────────┐
│ Short URL       Destination             Clicks   Created   │
├────────────────────────────────────────────────────────────┤
│ /aB72x          example.com/product       1,482   Today     │
│ /x91Kd          mysite.com/signup           723   Yesterday │
│ /pQ82z          github.com/project          391   3 days   │
└────────────────────────────────────────────────────────────┘
```

Clicking a link opens its analytics.

### 2. Create URL

Keep the UI simple:

```text
Create Short URL

Destination
┌─────────────────────────────────────────┐
│ https://example.com/my-long-url         │
└─────────────────────────────────────────┘

Custom alias (optional)
┌─────────────────────────────────────────┐
│ summer-sale                             │
└─────────────────────────────────────────┘

Expiration
[ Never ▼ ]

             [ Create URL ]
```

### 3. Analytics

Example:

```text
/aB72x

1,482
Total clicks

          Clicks
150 ┤             ╭─╮
125 ┤        ╭────╯ ╰╮
100 ┤    ╭───╯       ╰──
 75 ┤────╯
    └────────────────────
     Mon Tue Wed Thu Fri
```

Then show countries, devices, and referrers.

---

# Backend architecture

Start simple:

```text
              ┌──────────────┐
              │   Frontend   │
              └──────┬───────┘
                     │
                     ▼
              ┌──────────────┐
              │   API Server │
              └──────┬───────┘
                     │
              ┌──────┴──────┐
              ▼             ▼
        PostgreSQL        Redis
```

Eventually:

```text
                         ┌──────────────┐
                         │   Frontend   │
                         └──────┬───────┘
                                │
                                ▼
                         ┌──────────────┐
                         │   API Server │
                         └──────┬───────┘
                                │
                   ┌────────────┼─────────────┐
                   ▼            ▼             ▼
              PostgreSQL      Redis       Event Queue
                                              │
                                              ▼
                                        Analytics Worker
                                              │
                                              ▼
                                          PostgreSQL
```

This lets the project demonstrate:

- REST API design
- PostgreSQL
- Redis caching
- Event-driven processing
- Background workers
- Rate limiting
- Authentication
- Database indexing
- Asynchronous processing

---

# Redirect flow

A user requests:

```http
GET /aB72x
```

The naive implementation is:

```text
Request
   ↓
PostgreSQL
   ↓
Find URL
   ↓
Redirect
```

This works initially.

But redirects can become very frequent, so add Redis:

```text
Request /aB72x
       ↓
      Redis
       │
    ┌──┴──┐
    │     │
   HIT   MISS
    │     │
    │     ▼
    │ PostgreSQL
    │     │
    │     ▼
    │   Redis
    │
    ▼
 Redirect
```

Use the cache-aside pattern:

1. Look for the short code in Redis.
2. If found, use the cached destination.
3. If not found, query PostgreSQL.
4. Store the result in Redis.
5. Redirect the user.

---

# Analytics should not slow down redirects

One of the most important design decisions is to avoid making analytics processing part of the critical redirect path.

A bad implementation:

```text
1. Find URL
2. Save click
3. Determine country
4. Determine device
5. Update statistics
6. Redirect
```

Instead:

```text
                   ┌──────────────┐
Click ────────────►│ Find URL     │
                   └──────┬───────┘
                          │
                 ┌────────┴────────┐
                 ▼                 ▼
             Redirect          Click Event
                 │                 │
                 ▼                 ▼
              User             Queue
                                   │
                                   ▼
                              Analytics
                                Worker
                                   │
                                   ▼
                              PostgreSQL
```

The redirect happens quickly while analytics processing happens asynchronously.

This gives you a strong architectural talking point:

> "I decoupled redirect latency from analytics processing using asynchronous events."

---

# Click events

A click event could look like:

```json
{
  "linkId": "8f1c...",
  "timestamp": "2026-09-13T15:42:11Z",
  "ip": "...",
  "userAgent": "...",
  "referrer": "https://google.com"
}
```

The analytics worker processes the event and derives information such as:

```text
device = mobile
browser = Chrome
country = Portugal
```

Then it stores the relevant information.

---

# Database design

Keep the initial schema small.

## users

```text
id
email
password_hash
created_at
```

## links

```text
id
user_id
short_code
destination_url
created_at
expires_at
```

## clicks

```text
id
link_id
timestamp
country
device
browser
referrer
```

Later, add aggregated statistics:

## daily_link_stats

```text
link_id
date
click_count
```

This prevents expensive calculations over millions of individual click records every time the dashboard loads.

---

# Generating short codes

Use Base62:

```text
abcdefghijklmnopqrstuvwxyz
ABCDEFGHIJKLMNOPQRSTUVWXYZ
0123456789
```

For example:

```text
aB72x
```

If codes are randomly generated, collisions are possible.

The database should therefore enforce:

```text
UNIQUE(short_code)
```

The flow becomes:

```text
generate code
      ↓
INSERT
      ↓
collision?
 ┌────┴────┐
no         yes
 │          │
 ▼          ▼
done      generate again
```

This is a small but important detail.

---

# Custom aliases

Allow users to create:

```text
yourapp.com/summer-sale
```

instead of:

```text
yourapp.com/aB72x
```

If another user already owns `/summer-sale`, the database uniqueness constraint prevents the collision.

The API should return an appropriate HTTP response such as:

```text
409 Conflict
```

---

# Expiring links

Allow users to choose:

```text
Never
1 hour
1 day
7 days
30 days
Custom
```

When a request arrives:

```text
/aB72x
    ↓
Does it exist?
    ↓
Has it expired?
   / \
 yes  no
  │    │
  ▼    ▼
 410  redirect
```

Use `410 Gone` for expired links if you want to communicate that the resource intentionally no longer exists.

You can also run a background job to clean up expired links.

---

# Rate limiting

Protect the API from abuse.

For example:

```text
100 requests / minute / IP
```

Redis can store counters such as:

```text
rate_limit:user:123
```

with a short expiration.

This demonstrates practical API protection without adding unnecessary complexity.

---

# Authentication and authorization

Implement:

```text
Register
Login
Logout
```

Protect endpoints such as:

```text
/api/links
/api/analytics
```

Users should only be able to access their own links.

For example:

```text
GET /api/links/123/analytics
```

must verify:

```text
link.user_id == authenticated_user.id
```

Do not rely on the frontend for authorization.

---

# Development progression

## V1 — Basic shortener

```text
Create URL
     ↓
Generate code
     ↓
Store in PostgreSQL
     ↓
Redirect
```

No Redis or analytics yet.

## V2 — Authentication

```text
Users
  ↓
Create/manage their links
```

## V3 — Analytics

Record:

```text
timestamp
IP
user agent
referrer
```

Build the analytics dashboard.

## V4 — Redis

Cache:

```text
short_code → destination_url
```

Measure the performance difference.

## V5 — Events

Instead of processing analytics during the redirect:

```text
Redirect
   +
Publish click event
```

Then let a worker process the event.

## V6 — Production features

Add:

- Rate limiting
- Expiration
- Custom aliases
- API keys
- API documentation
- Health checks
- Structured logging
- Error handling
- Docker
- Tests

Then stop adding features.

---

# Portfolio README

The README should tell the engineering story rather than just listing technologies.

Example structure:

```text
URL Shortener & Analytics Platform

Features
────────
✓ URL shortening
✓ Custom aliases
✓ Link expiration
✓ Click analytics
✓ Redis caching
✓ Async analytics processing
✓ Rate limiting
✓ Authentication

Architecture
────────────
[Architecture diagram]

Technical decisions
───────────────────
• Why Redis?
• Why asynchronous analytics?
• How are collisions handled?
• How is rate limiting implemented?
• How is authorization enforced?

Performance
───────────
Redirect latency:
Before Redis: X ms
After Redis:  Y ms

Testing
───────
✓ API tests
✓ Integration tests
✓ Cache tests
✓ Concurrent request tests
```

The important part is to **measure something**.

For example:

```text
                    PostgreSQL    Redis
────────────────────────────────────────
Average latency       18ms         2ms
p95 latency           31ms         5ms
```

The exact numbers should come from your own benchmark rather than being invented.

This demonstrates that you understand *why* you used Redis rather than simply knowing how to connect to it.

---

# stack

## Frontend

- React.js
- TypeScript
- Tailwind CSS

## Backend

- Node.js
- TypeScript
- Fastify or Express

## Database

- PostgreSQL

## Caching

- Redis

## Async processing

- Redis-based queue / message broker

## Infrastructure

- Docker
- Docker Compose

## Testing

- Vitest
- Integration tests

---

# Architecture recommendation

Don't start with microservices.

Use a **modular monolith**:

```text
src/
├── auth/
├── links/
├── redirects/
├── analytics/
├── users/
├── rate-limit/
├── workers/
└── shared/
```

You can run the API and worker as separate processes while keeping the codebase organized:

```text
                 PostgreSQL
                     ▲
                     │
              ┌──────┴──────┐
              │             │
          API Server     Worker
              ▲             ▲
              │             │
           Frontend       Queue
```

This gives you most of the useful architectural lessons without introducing unnecessary distributed-system complexity.

---

# Final target

By the end, you should have:

```text
User
 │
 ▼
React.js Dashboard
 │
 ▼
Node.js API
 │
 ├──────────────► PostgreSQL
 │
 ├──────────────► Redis
 │
 └──────────────► Queue
                       │
                       ▼
                Analytics Worker
                       │
                       ▼
                  PostgreSQL
```

The project is still fundamentally a simple URL shortener, but underneath it demonstrates:

**APIs → authentication → database design → indexing → caching → events → queues → background workers → rate limiting → analytics → performance testing.**

That's what makes it portfolio-worthy.
