import { describe, expect, it, vi } from 'vitest';

import {
  hasEndpointPermission,
  requestEndpointPermission,
  type HostPermissionPort,
} from '../src/mt/permissions';

const config = {
  provider: 'local' as const,
  baseUrl: 'http://localhost:11434/v1',
  apiKey: '',
  model: 'qwen',
  webSearchEnabled: false,
};

describe('translation endpoint permissions', () => {
  it('checks only the configured endpoint origin', async () => {
    const permissions = port(true);

    await expect(hasEndpointPermission(permissions, config)).resolves.toBe(true);
    expect(permissions.contains).toHaveBeenCalledWith({
      origins: ['http://localhost/*'],
    });
  });

  it('does not prompt when the endpoint is already authorized', async () => {
    const permissions = port(true);

    await expect(requestEndpointPermission(permissions, config)).resolves.toBe(true);
    expect(permissions.request).not.toHaveBeenCalled();
  });

  it('requests the endpoint only after an explicit caller action', async () => {
    const permissions = port(false, true);

    await expect(requestEndpointPermission(permissions, config)).resolves.toBe(true);
    expect(permissions.request).toHaveBeenCalledWith({
      origins: ['http://localhost/*'],
    });
  });
});

function port(
  contains: boolean,
  request = false,
): HostPermissionPort {
  return {
    contains: vi.fn().mockResolvedValue(contains),
    request: vi.fn().mockResolvedValue(request),
  };
}
