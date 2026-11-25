import { gzipSync } from 'node:zlib'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadEnv } from 'vite'

const supportedModes = new Set(['staging', 'production'])
const mode = process.argv[2]

if (!supportedModes.has(mode)) {
  throw new Error('构建环境必须是 staging 或 production')
}

const projectRoot = process.cwd()
const values = loadEnv(mode, projectRoot, 'VITE_')
const apiBaseUrl = normalizeApiOrigin(values.VITE_API_BASE_URL, mode)
const deploymentDirectory = resolve(projectRoot, '.deploy')
const publicConfigPath = resolve(projectRoot, 'dist/config.js')
const nginxTemplatePath = resolve(projectRoot, 'nginx.conf')
const nginxConfigPath = resolve(deploymentDirectory, 'default.conf')
const releaseId = process.env.RELEASE_ID || 'local'
if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(releaseId)) {
  throw new Error('RELEASE_ID 必须是最多 128 位的版本标识')
}
const commit = process.env.BUILD_COMMIT || process.env.CI_COMMIT_SHA || 'local'
if (commit !== 'local' && !/^[a-f0-9]{7,64}$/i.test(commit)) throw new Error('BUILD_COMMIT 必须是 Git 提交标识')
const builtAt = process.env.BUILD_TIMESTAMP || new Date().toISOString()
if (!Number.isFinite(Date.parse(builtAt))) throw new Error('BUILD_TIMESTAMP 必须是有效时间')

await mkdir(deploymentDirectory, { recursive: true })
await writeFile(publicConfigPath, `window.__DRAMA_CONFIG__ = ${JSON.stringify({
  apiBaseUrl,
  deploymentEnvironment: mode,
}, null, 2)}\n`)

const nginxTemplate = await readFile(nginxTemplatePath, 'utf8')
// 容器只提供静态页面；域名、证书及同源 API 转发统一由 drama-nginx 维护。
await writeFile(nginxConfigPath, nginxTemplate)
// 镜像与公开版本文件共用标识，部署检查不能只验证 Nginx 存活。
await writeFile(resolve(projectRoot, 'dist/version.json'), `${JSON.stringify({
  schemaVersion: 1,
  releaseId,
  commit,
  environment: mode,
  apiBaseUrl,
  builtAt,
}, null, 2)}\n`)

// 构建时预压缩静态资源，减少公网传输量并避免服务器逐次压缩消耗 CPU。
const assetsDirectory = resolve(projectRoot, 'dist/assets')
for (const entry of await readdir(assetsDirectory, { withFileTypes: true })) {
  if (!entry.isFile() || !/\.(js|css|svg|json)$/.test(entry.name)) continue
  const assetPath = resolve(assetsDirectory, entry.name)
  const original = await readFile(assetPath)
  const compressed = gzipSync(original, { level: 9 })
  if (compressed.length < original.length) await writeFile(`${assetPath}.gz`, compressed)
}

console.log(`Prepared ${mode} static deployment for ${apiBaseUrl}`)

function normalizeApiOrigin(input, deploymentMode) {
  const value = input?.trim()
  if (!value) throw new Error(`.env.${deploymentMode} 缺少 VITE_API_BASE_URL`)

  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error(`.env.${deploymentMode} 的 VITE_API_BASE_URL 不是有效 URL`)
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
    throw new Error(`.env.${deploymentMode} 的 VITE_API_BASE_URL 必须是单一 HTTP 或 HTTPS Origin`)
  }

  if (deploymentMode === 'production' && parsed.protocol !== 'https:') {
    throw new Error('.env.production 的 VITE_API_BASE_URL 必须使用 HTTPS')
  }

  if (/(replace_with|your-domain|\.example(?:\.|[/:]|$)|localhost|127\.0\.0\.1|\[::1\])/i.test(parsed.origin)) {
    throw new Error(`.env.${deploymentMode} 的 VITE_API_BASE_URL 不能使用本机或占位地址`)
  }

  return parsed.origin
}
