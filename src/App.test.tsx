import { render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import type { OperationsApi } from './api'
import type { DirectMediaUploader } from './media/byteplusUploader'

const { consoleProps, runtimeConfig } = vi.hoisted(() => ({
  consoleProps: vi.fn(),
  runtimeConfig: vi.fn(),
}))

vi.mock('./app/OperationsConsole', () => ({
  OperationsConsole: (props: unknown) => {
    consoleProps(props)
    return <div>运营后台</div>
  },
}))

vi.mock('./runtimeConfig', () => ({
  currentRuntimeConfig: runtimeConfig,
}))

import App from './App'

beforeEach(() => {
  consoleProps.mockClear()
  runtimeConfig.mockReset()
  runtimeConfig.mockReturnValue({
    apiBaseUrl: 'https://api.example.test',
    deploymentEnvironment: 'staging',
    storageNamespace: 'staging:https://api.example.test',
  })
})

test('注入 API 时直接装配运营后台并透传上传器', () => {
  const api = {} as OperationsApi
  const directUploader = vi.fn() as unknown as DirectMediaUploader

  render(<App api={api} directUploader={directUploader} />)

  expect(screen.getByText('运营后台')).toBeInTheDocument()
  expect(consoleProps).toHaveBeenCalledWith(expect.objectContaining({ api, directUploader }))
  expect(runtimeConfig).not.toHaveBeenCalled()
})

test('未注入 API 时使用运行配置创建后台客户端', () => {
  render(<App />)

  expect(screen.getByText('运营后台')).toBeInTheDocument()
  expect(runtimeConfig).toHaveBeenCalledOnce()
  expect(consoleProps).toHaveBeenCalledWith(expect.objectContaining({ api: expect.any(Object) }))
})

test('运行配置无效时显示部署错误且不装配后台', () => {
  runtimeConfig.mockImplementation(() => { throw new Error('invalid runtime config') })

  render(<App />)

  expect(screen.getByText('后台部署配置无效')).toBeInTheDocument()
  expect(screen.getByText('无法读取后台运行时配置。')).toBeInTheDocument()
  expect(consoleProps).not.toHaveBeenCalled()
})
