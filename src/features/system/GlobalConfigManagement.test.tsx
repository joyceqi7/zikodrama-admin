import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { vi, test, expect } from 'vitest'
import type { OperationsApi } from '../../api'
import { GlobalConfigManagement } from './GlobalConfigManagement'

test.each([{name:'桌面',width:1440},{name:'手机',width:390}])('$name视口播放部署参数移除后保留通用配置入口', async ({width}) => {
 vi.stubGlobal('innerWidth', width)
 try {
  const api = { listGlobalConfigs: vi.fn(async () => []) } as unknown as OperationsApi
  render(<GlobalConfigManagement api={api} canUpdate />)
  expect(screen.queryByRole('button', {name:'配置独立 VePlayer'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', {name:/新增配置/}))
  const dialog = within(screen.getByRole('dialog'))
  expect(await dialog.findByLabelText('key')).toBeInTheDocument()
  expect(dialog.queryByLabelText('播放授权有效期（秒）')).not.toBeInTheDocument()
  expect(dialog.queryByLabelText('VOD 应用 ID')).not.toBeInTheDocument()
 } finally { vi.unstubAllGlobals() }
})

test('普通配置可删除，共享媒资仍受保护', async () => {
 const api = { listGlobalConfigs: vi.fn(async () => [{key:'playback.default',value:{}}, {key:'media',value:{}}]), deleteGlobalConfig: vi.fn(async () => {}) } as unknown as OperationsApi
 render(<GlobalConfigManagement api={api} canUpdate />)
 await screen.findByText('playback.default')
 const buttons = screen.getAllByRole('button', {name:/删\s*除/})
 expect(buttons).toHaveLength(1)
 fireEvent.click(buttons[0])
 fireEvent.click(await screen.findByRole('button', {name:'OK'}))
 await waitFor(() => expect(api.deleteGlobalConfig).toHaveBeenCalledWith('playback.default'))
})

test('loads masked media without requiring an application and preserves mask on save', async () => {
 const value = { byteplus_account_id: '', space_name: 'shared-space', access_key_id: '********', secret_access_key: '********', vod_app_id: '001', region: 'ap-southeast-1', max_file_bytes: 1073741824, upload_token_ttl_seconds: 3600, cover_domain: 'https://cover.example.test', processing_timeout_seconds: 900, callback_url: '', callback_private_key: '' }
 const api = { listGlobalConfigs: vi.fn(async () => [{ key: 'media', value }]), saveGlobalConfig: vi.fn(async () => ({ key: 'media', value })) } as unknown as OperationsApi
 render(<GlobalConfigManagement api={api} canUpdate />)
 fireEvent.click(await screen.findByRole('button', { name: /编\s*辑/ }))
 expect(await screen.findByLabelText('Secret Access Key')).toHaveValue('********')
 expect(screen.getByLabelText('共享 VOD 空间名称')).toHaveValue('shared-space')
 expect(screen.queryByRole('textbox', { name: '配置值（JSON 对象）' })).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
 await waitFor(() => expect(api.saveGlobalConfig).toHaveBeenCalledWith('media', value, ''))
 expect(await screen.findByText('VOD 配置已保存，后续操作使用新配置。')).toBeInTheDocument()
})

test('read-only permission hides all mutation actions', async () => {
 const api = { listGlobalConfigs: vi.fn(async () => [{ key: 'media', value: {} }]) } as unknown as OperationsApi
 render(<GlobalConfigManagement api={api} canUpdate={false} />)
 expect(await screen.findByRole('button', { name: /查\s*看/ })).toBeInTheDocument()
 expect(screen.queryByText('新增配置')).not.toBeInTheDocument()
 expect(screen.queryByText('删除')).not.toBeInTheDocument()
})

test('已有自定义配置使用表单编辑并保存备注，列表展示服务端操作记录', async () => {
 const value = { enabled: true, count: 3, title: '公告' }
 const row = { key: 'notice', value, remark: '首页公告', createdAt: '2026-09-13T00:00:00Z', updatedAt: '2026-09-13T01:00:00Z', updatedBy: 'operator' }
 const api = { listGlobalConfigs: vi.fn(async () => [row]), saveGlobalConfig: vi.fn(async () => row) } as unknown as OperationsApi
 render(<GlobalConfigManagement api={api} canUpdate />)
 expect(await screen.findByText('operator')).toBeInTheDocument()
 expect(screen.queryByText('一处管理，所有应用共享')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: /编\s*辑/ }))
 fireEvent.click(screen.getByLabelText('value 第 1 项 值'))
 fireEvent.change(screen.getByLabelText('value 第 2 项 值'), { target: { value: '8' } })
 fireEvent.change(screen.getByLabelText('备注'), { target: { value: '更新公告' } })
 fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
 await waitFor(() => expect(api.saveGlobalConfig).toHaveBeenCalledWith('notice', { ...value, enabled: false, count: 8 }, '更新公告'))
})

test('新增配置无需填写结构文本，保存后再次编辑仍是表单', async () => {
 const rows: {key: string, value: Record<string, unknown>, remark: string}[] = []
 const api = { listGlobalConfigs: vi.fn(async () => [...rows]), saveGlobalConfig: vi.fn(async (key, value, remark) => { const row = {key, value, remark}; rows.push(row); return row }) } as unknown as OperationsApi
 render(<GlobalConfigManagement api={api} canUpdate />)
 fireEvent.click(screen.getByRole('button', { name: '新增配置' }))
 fireEvent.change(screen.getByLabelText('key'), { target: { value: 'notice' } })
 fireEvent.change(screen.getByLabelText('备注'), { target: { value: '公告设置' } })
 fireEvent.click(screen.getByRole('button', { name: '添加配置项' }))
 fireEvent.change(screen.getByLabelText('value 第 1 项 字段名'), { target: { value: 'title' } })
 fireEvent.change(screen.getByLabelText('value 第 1 项 值'), { target: { value: '欢迎观看' } })
 fireEvent.click(screen.getByRole('button', { name: '保存配置' }))
 await waitFor(() => expect(api.saveGlobalConfig).toHaveBeenCalledWith('notice', {title: '欢迎观看'}, '公告设置'))
 fireEvent.click(await screen.findByRole('button', { name: /编\s*辑/ }))
 expect(await screen.findByLabelText('value 第 1 项 值')).toHaveValue('欢迎观看')
 expect(screen.getByLabelText('备注')).toHaveValue('公告设置')
})

test('保存故障保留编辑内容，日志不输出配置值', async () => {
 const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined)
 try {
  const api = { listGlobalConfigs: vi.fn(async () => [{key: 'notice', value: {title: 'sensitive-value'}, remark: ''}]), saveGlobalConfig: vi.fn(async () => { throw new Error('timeout token=raw-sensitive-error') }) } as unknown as OperationsApi
  render(<GlobalConfigManagement api={api} canUpdate />)
  fireEvent.click(await screen.findByRole('button', {name: /^编\s*辑$/}))
  fireEvent.click(screen.getByRole('button', {name: '保存配置'}))
  expect(await screen.findByText('操作失败，请稍后重试')).toBeInTheDocument()
  expect(screen.getByLabelText('value 第 1 项 值')).toHaveValue('sensitive-value')
  expect(logger).toHaveBeenCalledWith('global configuration operation failed', expect.objectContaining({operation: 'save', message: 'timeout token=[已脱敏]'}))
  expect(JSON.stringify(logger.mock.calls)).not.toContain('sensitive')
 } finally { logger.mockRestore() }
})

test('通用配置字段校验失败记录原因，修正后保存且不输出配置值', async () => {
 const logger = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
 try {
  const row = {key: 'notice', value: {title: 'private-title'}, remark: ''}
  const api = { listGlobalConfigs: vi.fn(async () => [row]), saveGlobalConfig: vi.fn(async () => row) } as unknown as OperationsApi
  render(<GlobalConfigManagement api={api} canUpdate />)
  fireEvent.click(await screen.findByRole('button', {name: /^编\s*辑$/}))
  fireEvent.click(screen.getByRole('button', {name: '添加配置项'}))
  fireEvent.change(screen.getByLabelText('value 第 2 项 字段名'), {target: {value: 'title'}})
  fireEvent.change(screen.getByLabelText('value 第 2 项 值'), {target: {value: 'private-subtitle'}})
  fireEvent.click(screen.getByRole('button', {name: '保存配置'}))
  expect(await screen.findByText('第 2 项的字段名为空或重复，请修改。')).toBeInTheDocument()
  expect(api.saveGlobalConfig).not.toHaveBeenCalled()
  expect(logger).toHaveBeenCalledWith('global configuration validation rejected', {error: '第 2 项的字段名为空或重复，请修改。'})
  expect(JSON.stringify(logger.mock.calls)).not.toContain('private')
  logger.mockClear()
  fireEvent.change(screen.getByLabelText('value 第 2 项 字段名'), {target: {value: 'subtitle'}})
  fireEvent.click(screen.getByRole('button', {name: '保存配置'}))
  await waitFor(() => expect(api.saveGlobalConfig).toHaveBeenCalledWith('notice', {title: 'private-title', subtitle: 'private-subtitle'}, ''))
  expect(logger).not.toHaveBeenCalled()
 } finally { logger.mockRestore() }
})
