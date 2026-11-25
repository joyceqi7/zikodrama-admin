import { expect, test } from 'vitest'
import { RuntimeConfigError, resolveRuntimeConfig } from './runtimeConfig'

test('开发环境允许本机 API 回退并生成稳定会话分区', () => {
  expect(resolveRuntimeConfig({}, true, 'http://localhost:8080')).toMatchObject({
    apiBaseUrl: 'http://localhost:8080',
    deploymentEnvironment: 'local',
    storageNamespace: 'local:http://localhost:8080',
  })
})

test('预发布和生产环境拒绝缺失、本机或占位配置', () => {
  expect(() => resolveRuntimeConfig({}, false)).toThrow(RuntimeConfigError)
  expect(() => resolveRuntimeConfig({
    apiBaseUrl: 'http://localhost:18081',
    deploymentEnvironment: 'staging',
  }, false)).toThrow(RuntimeConfigError)
  expect(() => resolveRuntimeConfig({
    apiBaseUrl: 'https://api.example.com',
    deploymentEnvironment: 'production',
  }, false)).toThrow(RuntimeConfigError)
})

test('预发布配置规范化 API Origin 并隔离会话分区', () => {
  const config = resolveRuntimeConfig({
    apiBaseUrl: 'https://staging-api.drama.test/',
    deploymentEnvironment: 'staging',
  }, false)

  expect(config).toEqual({
    apiBaseUrl: 'https://staging-api.drama.test',
    deploymentEnvironment: 'staging',
    storageNamespace: 'staging:https://staging-api.drama.test',
  })
})

test('生产环境拒绝 HTTP API', () => {
  expect(() => resolveRuntimeConfig({
    apiBaseUrl: 'http://service.linpbin.top',
    deploymentEnvironment: 'production',
  }, false)).toThrow(RuntimeConfigError)
})
