import { gunzipSync } from 'node:zlib'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, expect, test } from 'vitest'

const root = process.cwd()
const nginxConfig = readFileSync(resolve(root, 'nginx.conf'), 'utf8')
const builder = resolve(root, 'scripts/prepare-static-deployment.mjs')
const fixtures: string[] = []
afterEach(() => fixtures.splice(0).forEach((path) => rmSync(path, { recursive: true, force: true })))

function prepare(mode: string, origin: string) {
  const directory = mkdtempSync(resolve(tmpdir(), 'drama-admin-build-'))
  fixtures.push(directory)
  mkdirSync(resolve(directory, 'dist/assets'), { recursive: true })
  writeFileSync(resolve(directory, 'dist/assets/index-test.js'), 'console.log("加载后台页面");\n'.repeat(100))
  writeFileSync(resolve(directory, 'nginx.conf'), nginxConfig)
  const result = spawnSync(process.execPath, [builder, mode], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, VITE_API_BASE_URL: origin, ADMIN_SERVER_NAME: '', ADMIN_API_PROXY_TARGET: '', RELEASE_ID: 'abc1234-fixture', BUILD_COMMIT: 'abc1234', BUILD_TIMESTAMP: '2026-09-13T00:00:00Z' },
  })
  return { directory, result }
}

test.each(['staging', 'production'])('实际生成 %s 的公开配置、版本及 Nginx 安全策略', (mode) => {
  const { directory, result } = prepare(mode, 'https://api.drama.test/')
  expect(result.status, result.stderr).toBe(0)
  const config = readFileSync(resolve(directory, 'dist/config.js'), 'utf8')
  expect(JSON.parse(config.replace('window.__DRAMA_CONFIG__ = ', ''))).toEqual({ apiBaseUrl: 'https://api.drama.test', deploymentEnvironment: mode })
  expect(JSON.parse(readFileSync(resolve(directory, 'dist/version.json'), 'utf8'))).toEqual({ schemaVersion: 1, releaseId: 'abc1234-fixture', commit: 'abc1234', environment: mode, apiBaseUrl: 'https://api.drama.test', builtAt: '2026-09-13T00:00:00Z' })
  const nginx = readFileSync(resolve(directory, '.deploy/default.conf'), 'utf8')
  // 连接策略按协议放行，官方上传节点域名变化时仍可直传。
  const connectSources = nginx.match(/\bconnect-src\s+([^;]+);/)?.[1].trim().split(/\s+/)
  expect(connectSources).toEqual([
    "'self'",
    'http:',
    'https:',
    'ws:',
    'wss:',
  ])
  expect(nginx).not.toContain('${API_BASE_URL}')
  expect(nginx).toContain("worker-src 'self' blob:")
  // 压缩资源必须可无损还原，并由 Nginx 按客户端能力提供。
  const original = readFileSync(resolve(directory, 'dist/assets/index-test.js'))
  const compressed = readFileSync(resolve(directory, 'dist/assets/index-test.js.gz'))
  expect(gunzipSync(compressed)).toEqual(original)
  expect(compressed.length).toBeLessThan(original.length)
  expect(nginx).toContain('gzip_static on;')
  expect(nginx).toContain('gzip_vary on;')
  // 不需要网关域名或内网地址也能构建，产物只包含容器静态服务配置。
  expect(existsSync(resolve(directory, '.deploy/gateway.conf'))).toBe(false)
  expect(nginx).not.toContain('proxy_pass')
  expect(nginx).not.toContain('${ADMIN_API_PROXY}')
})

test.each(['', 'http://api.drama.test', 'https://api.your-domain.example', 'https://user:secret@api.drama.test', 'https://api.drama.test/admin'])('生产构建拒绝无效或不安全的 API Origin：%s', (origin) => {
  const { result } = prepare('production', origin)
  expect(result.status).not.toBe(0)
})

test('测试环境允许独立内网 API，生产仍独立校验 HTTPS', () => {
  const { result } = prepare('staging', 'http://10.10.25.43:18080')
  expect(result.status, result.stderr).toBe(0)
})
