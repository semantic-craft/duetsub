import {
  configPermissionOrigin,
  type TranslationConfig,
} from './config';

export interface HostPermissionPort {
  contains(permissions: { origins: string[] }): Promise<boolean>;
  request(permissions: { origins: string[] }): Promise<boolean>;
}

export function hasEndpointPermission(
  permissions: HostPermissionPort,
  config: TranslationConfig,
): Promise<boolean> {
  return permissions.contains({
    origins: [configPermissionOrigin(config)],
  });
}

export async function requestEndpointPermission(
  permissions: HostPermissionPort,
  config: TranslationConfig,
): Promise<boolean> {
  if (await hasEndpointPermission(permissions, config)) return true;
  return permissions.request({
    origins: [configPermissionOrigin(config)],
  });
}
