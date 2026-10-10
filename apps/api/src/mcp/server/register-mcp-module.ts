// Assembles the separately gated MCP module using injected platform identity and PostgreSQL services.
import type { FastifyInstance } from "fastify";
import type { AuthStore } from "../../auth/in-memory-auth-store.js";
import type { Queryable } from "../../db/transactions.js";
import { loadMcpConfig, type McpConfig } from "../auth/mcp-config.js";
import { createMcpAccess } from "../auth/mcp-access.js";
import { createOAuthProvider } from "../auth/oauth-provider.js";
import { createInMemoryMcpStore, type McpStore } from "../records/mcp-store.js";
import { createPostgresMcpStore } from "../records/postgres-mcp-store.js";
import { registerMcpRoutes } from "../../routes/mcp/register-mcp-routes.js";
import { registerAdminMcpRoutes } from "../../routes/admin/register-admin-mcp-routes.js";
export async function registerMcpModule(input: {
  app: FastifyInstance;
  authStore: AuthStore;
  pool: Queryable | null;
  production: boolean;
  config?: McpConfig | null;
  store?: McpStore;
}) {
  const config =
    input.config === undefined
      ? loadMcpConfig(process.env, input.production)
      : input.config;
  const store = input.store ?? (input.pool ? createPostgresMcpStore(input.pool) : createInMemoryMcpStore());
  // Keep historical governance available after external MCP is disabled, using the same shared store.
  registerAdminMcpRoutes(input.app, { authStore: input.authStore, store, enabled: Boolean(config) });
  if (!config) {
    input.app.get("/api/mcp/connections", async () => ({ enabled: false }));
    return null;
  }
  if (input.production && !input.pool)
    throw new Error("MCP requires shared PostgreSQL persistence in production");
  const provider = createOAuthProvider(config, store, input.authStore);
  const access = createMcpAccess(input.authStore, store, config, provider);
  await registerMcpRoutes(input.app, access, provider);
  return { store, provider, access };
}
