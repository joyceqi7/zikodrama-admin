export type DeploymentEnvironment = 'local' | 'staging' | 'production'

export interface RuntimeConfigSource {
  apiBaseUrl?: string
  deploymentEnvironment?: string
}

export interface RuntimeConfig {
  apiBaseUrl: string
  deploymentEnvironment: DeploymentEnvironment
  storageNamespace: string
}

const placeholder = /(replace_with|your-domain|\.example(?:\.|[/:]|$)|localhost|127\.0\.0\.1|\[::1\])/i

export class RuntimeConfigError extends Error {}

export function currentRuntimeConfig(): RuntimeConfig {
  return resolveRuntimeConfig(
    window.__DRAMA_CONFIG__,
    import.meta.env.DEV,
    import.meta.env.VITE_API_BASE_URL,
  )
}

export function resolveRuntimeConfig(
  source: RuntimeConfigSource | undefined,
  isDevelopment: boolean,
  developmentApiBaseUrl = '',
): RuntimeConfig {
  const deploymentEnvironment = normalizeEnvironment(
    source?.deploymentEnvironment || (isDevelopment ? 'local' : ''),
  )
  const apiBaseUrl = normalizeOrigin(
    source?.apiBaseUrl || (deploymentEnvironment === 'local' ? developmentApiBaseUrl || 'http://localhost:8080' : ''),
  )

  if (deploymentEnvironment !== 'local' && placeholder.test(apiBaseUrl)) {
    throw new RuntimeConfigError('预发布和生产环境必须配置非本机、非占位的 API 地址。')
  }
  if (deploymentEnvironment === 'production' && new URL(apiBaseUrl).protocol !== 'https:') {
    throw new RuntimeConfigError('生产环境必须配置 HTTPS API 地址。')
  }

  return {
    apiBaseUrl,
    deploymentEnvironment,
    storageNamespace: `${deploymentEnvironment}:${apiBaseUrl}`,
  }
}

function normalizeEnvironment(input: string): DeploymentEnvironment {
  const value = text(input).toLowerCase()
  if (value === 'local' || value === 'staging' || value === 'production') return value
  throw new RuntimeConfigError('部署环境必须是 local、staging 或 production。')
}

function normalizeOrigin(input: string): string {
  const value = text(input)
  if (!value) throw new RuntimeConfigError('未配置后台 API 地址。')
  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    throw new RuntimeConfigError('后台 API 地址必须是完整 Origin。')
  }
  if (
    (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') ||
    !parsed.hostname ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== '/' && parsed.pathname !== '') ||
    parsed.search ||
    parsed.hash
  ) {
    throw new RuntimeConfigError('后台 API 地址必须是单一 HTTP 或 HTTPS Origin。')
  }
  return parsed.origin
}

function text(input: string | undefined): string {
  return input?.trim() || ''
}
