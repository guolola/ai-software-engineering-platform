// Checks that both fresh and upgraded deployments route OAuth discovery to the API and preserve other metadata.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { ensureMcpDiscovery } from './nginx-mcp-routing.mjs';
test('discovery proxy is narrow and idempotent in fresh and upgraded sites', () => {
  for (const filename of ['nginx-uml-platform.conf', 'nginx-jianglisoftware.com.conf']) {
    const content = readFileSync(new URL(filename, import.meta.url), 'utf8');
    assert.match(content, /oauth-protected-resource\|oauth-authorization-server\|openid-configuration/);
    assert.equal(ensureMcpDiscovery(content), content);
    assert.doesNotMatch(content, /location \/\.well-known\/ \{/);
  }
  const server = 'server {\n    location /api/ { proxy_pass http://127.0.0.1:4001; }\n}';
  const result = ensureMcpDiscovery(server);
  assert.match(result, /proxy_set_header Host \$http_host;/);
  assert.equal(ensureMcpDiscovery(result), result);
});
