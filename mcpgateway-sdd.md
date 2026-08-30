Here is the restructured, parallel-agent-ready SDD. You can copy each block below and paste it directly into your AI coding agents (e.g., Cursor, Devin, or custom agent swarms) to execute development simultaneously.

Track 0 must be provided to ALL agents as their base context.

---

### Track 0: The Shared Master Contracts

**Instructions for the Human:** Provide this entire block as the foundational system prompt or context file for ALL parallel agents. It defines the immutable boundaries.

```markdown
# MASTER SYSTEM CONTRACTS

## 1. Redis Cache Schema
- **Tools Routing Map:**
  - Key: `mcp:routing:tools` (Redis Hash)
  - Hash Field: `{tool_name}` (string, e.g., "git_pull")
  - Hash Value: `{downstream_base_url}` (string, e.g., "http://github-mcp:8080")
- **Aggregated Tools List:**
  - Key: `mcp:cache:tools_list` (Redis String)
  - Value: JSON String matching MCP `tools/list` response format.
- **Pub/Sub Channel:**
  - Channel: `mcp:events:cache_invalidate`
  - Message payload: "REFRESH_ALL"

## 2. Kafka Audit Schema
- **Topic:** `mcp.audit.events`
- **JSON Payload Format:**
```json
{
  "traceId": "string (UUID)",
  "clientId": "string",
  "toolName": "string",
  "executionTimeMs": "integer",
  "statusCode": "integer",
  "requestPayload": "string (Raw JSON-RPC request)",
  "responsePayload": "string (Raw JSON-RPC response)"
}

```

## 3. PostgreSQL DDL (Schema)

```sql
CREATE TABLE mcp_server (
    id UUID PRIMARY KEY,
    server_name VARCHAR(100) NOT NULL UNIQUE,
    base_url VARCHAR(255) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'
);
CREATE TABLE mcp_tool (
    id UUID PRIMARY KEY,
    server_id UUID NOT NULL REFERENCES mcp_server(id),
    tool_name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT
);
CREATE TABLE audit_log_metadata (
    trace_id UUID PRIMARY KEY,
    client_id VARCHAR(100) NOT NULL,
    tool_name VARCHAR(100) NOT NULL,
    server_id UUID NOT NULL,
    execution_time_ms INTEGER NOT NULL,
    http_status_code INTEGER NOT NULL,
    s3_payload_arn VARCHAR(512) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

```

## 4. OpenAPI Specification (Control Plane)

```yaml
openapi: 3.0.3
info:
  title: MCP Control Plane
  version: 1.0.0
paths:
  /v1/registry/servers/sync:
    put:
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties:
                server_name: { type: string }
                base_url: { type: string }
                tools:
                  type: array
                  items:
                    type: object
                    properties:
                      name: { type: string }
                      description: { type: string }
      responses:
        '200':
          description: Success

```

```

---

### Track 1: Control Plane Agent Prompt
**Instructions for the Agent:**

```text
You are a backend Java engineer building the Control Plane for an MCP Gateway.
Stack: Java 21, Spring Boot 3.3, MyBatis, PostgreSQL, Redis.

Your task:
1. Implement the REST Controller for `PUT /v1/registry/servers/sync` matching the OpenAPI spec in Track 0.
2. Implement MyBatis mappers to upsert the `mcp_server` and `mcp_tool` tables provided in the DDL.
3. When a sync occurs, you MUST update Redis exactly as specified in the Redis Schema Contract:
   - Perform an `HSET` on `mcp:routing:tools` for every tool.
   - Re-build the aggregated `tools/list` JSON and `SET` it to `mcp:cache:tools_list`.
   - Fire a message to the Pub/Sub channel `mcp:events:cache_invalidate`.
4. Create a background `@Scheduled` task that runs every 15 seconds to ping the `base_url + "/health"` of all ACTIVE servers. If it fails 3 times, mark the server INACTIVE in DB and evict its tools from Redis.

```

---

### Track 2: Data Plane Agent Prompt (The Proxy)

**Instructions for the Agent:**

```text
You are a high-performance backend Java engineer building a stateless Data Plane Gateway.
Stack: Java 21 (Virtual Threads Enabled), Spring Boot 3.3 (WebMVC), Spring Kafka.

Your task:
1. Ensure application.yml contains `spring.threads.virtual.enabled: true`.
2. Build a `@RestController` mapped to `POST /mcp`.
3. Proxy Logic (O(1) Header Routing):
   - Extract the HTTP headers `Mcp-Method` and `Mcp-Name`.
   - If `Mcp-Method` is `tools/list`, return the exact String value found in Redis key `mcp:cache:tools_list` with a `Cache-Control: max-age=3600` header.
   - If `Mcp-Method` is `tools/call`, lookup `Mcp-Name` in the Redis Hash `mcp:routing:tools` to get the target URL.
   - Use Spring `RestClient` to forward the raw JSON POST body to the target URL.
4. Audit Dispatch:
   - After the RestClient returns, asynchronously construct a JSON payload matching the "Kafka Audit Schema" from Track 0.
   - Publish it to the `mcp.audit.events` topic using `KafkaTemplate`. Do not block the HTTP response thread.

```

---

### Track 3: Audit Worker Agent Prompt

**Instructions for the Agent:**

```text
You are a data processing engineer building an asynchronous Audit Worker.
Stack: Java 21, Spring Boot 3.3, Spring Kafka, AWS S3 SDK, Spring JDBC.

Your task:
1. Create a `@KafkaListener` subscribed to the `mcp.audit.events` topic.
2. The incoming message matches the "Kafka Audit Schema" from Track 0.
3. Desensitize the payload: Parse the `requestPayload` and `responsePayload` JSON strings. Apply a regex to mask any strings resembling credit cards or SSNs with "****".
4. Upload the masked JSON payload to AWS S3:
   - Bucket: `mcp-audit-logs`
   - Key: `yyyy/MM/dd/{traceId}.json`
5. Capture the S3 ARN, and insert a metadata record into the `audit_log_metadata` PostgreSQL table using the DDL provided in Track 0. Use `JdbcTemplate` for the insert.

```

---

### Track 4: Admin UI Agent Prompt

**Instructions for the Agent:**

```text
You are a Frontend React Engineer building an internal Admin Dashboard.
Stack: React 18, Tailwind CSS, React Router, Vite.

Your task:
1. Scaffold a React dashboard with a side navigation bar containing: "Servers" and "Audit Logs".
2. Build an API client that interfaces with the OpenAPI spec in Track 0.
3. Servers View: Create a Data Table fetching from `GET /v1/registry/servers`. Display columns for Server Name, Base URL, and Status.
4. Audit Logs View: Create a Data Table fetching from `GET /v1/audit/logs`. Display Trace ID, Client ID, Tool Name, and Latency.
5. Provide a "View Payload" button on the Audit Log table rows that fetches the S3 ARN content via `GET /v1/audit/logs/{trace_id}/payload` and displays the raw JSON in a read-only code modal.
6. Do NOT invent your own styling rules; use standard Tailwind utility classes (e.g., bg-slate-900, text-white, p-4).

```