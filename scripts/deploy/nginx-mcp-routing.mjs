// Adds OAuth discovery proxying to the selected API server block without capturing unrelated well-known paths.
export const mcpDiscoveryLocation = `location ~ ^/\\.well-known/(oauth-protected-resource|oauth-authorization-server|openid-configuration)(/|$) {
        proxy_pass http://127.0.0.1:4001;
        proxy_http_version 1.1;
        proxy_set_header Host $http_host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_cache off;
    }`;
export function ensureMcpDiscovery(server) {
  if (server.includes('oauth-protected-resource|oauth-authorization-server|openid-configuration')) return server;
  const index = server.indexOf('location /api/ {');
  if (index < 0) throw new Error('Cannot add MCP discovery without a known API proxy');
  return `${server.slice(0, index)}${mcpDiscoveryLocation}\n\n    ${server.slice(index)}`;
}
