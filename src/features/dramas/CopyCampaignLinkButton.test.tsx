import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import { CopyCampaignLinkButton } from './CopyCampaignLinkButton'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
const link = { landingUrl: 'https://www.tiktok.com/minis/test-link' }
function setup(ensureDramaCampaign = vi.fn().mockResolvedValue(link)) {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  vi.stubGlobal('ClipboardItem', undefined)
  const notify = vi.fn()
  const props = { api: { ensureDramaCampaign } as unknown as OperationsApi, dramaId: '5008', applicationId: '5001', online: true, notify }
  const view = render(<CopyCampaignLinkButton key="5001" {...props} />)
  return { ...view, props, writeText, notify, ensureDramaCampaign }
}

test('一次点击获取或生成第一集官方链接后复制，不打开配置表单', async () => {
  const { ensureDramaCampaign, writeText, notify } = setup()
  fireEvent.click(screen.getByRole('button', { name: '复制投放链接' }))
  await waitFor(() => expect(notify).toHaveBeenCalledWith('投放链接已复制'))
  expect(ensureDramaCampaign).toHaveBeenCalledWith('5008', '5001')
  expect(writeText).toHaveBeenCalledWith(link.landingUrl)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('等待期间重复点击不重复生成，切换小程序后旧结果不能复制', async () => {
  let finish!: (value: typeof link) => void
  const pending = new Promise<typeof link>(resolve => { finish = resolve })
  const { ensureDramaCampaign, writeText, rerender, props, notify } = setup(vi.fn().mockReturnValue(pending))
  const log = vi.spyOn(console, 'warn').mockImplementation(() => {})
  fireEvent.click(screen.getByRole('button'))
  fireEvent.click(screen.getByRole('button'))
  expect(ensureDramaCampaign).toHaveBeenCalledTimes(1)
  rerender(<CopyCampaignLinkButton key="5002" {...props} applicationId="5002" />)
  finish(link)
  await waitFor(() => expect(log).toHaveBeenCalled())
  expect(writeText).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

test('服务端失败有脱敏日志且不写剪贴板，重试仍可复制', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  const api = vi.fn().mockRejectedValueOnce(new Error('upstream timeout token=private-token')).mockResolvedValue(link)
  const { writeText, notify } = setup(api)
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.any(String), 'error'))
  expect(log).toHaveBeenCalledWith('获取投放链接失败', { error: 'upstream timeout token=[已脱敏]' })
  expect(writeText).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(link.landingUrl))
})

test('没有当前小程序或未上线时禁用按钮', () => {
  const { props, rerender, ensureDramaCampaign } = setup()
  rerender(<CopyCampaignLinkButton {...props} applicationId="" />)
  expect(screen.getByRole('button')).toBeDisabled()
  rerender(<CopyCampaignLinkButton {...props} online={false} />)
  expect(screen.getByRole('button')).toBeDisabled()
  expect(ensureDramaCampaign).not.toHaveBeenCalled()
})

test('支持异步 ClipboardItem 的浏览器在点击时启动复制', async () => {
  const { notify } = setup()
  const write = vi.fn(async (items: Array<{ values: Record<string, Promise<Blob>> }>) => {
    expect(await items[0].values['text/plain']).toBeInstanceOf(Blob)
  })
  vi.stubGlobal('ClipboardItem', class { values: Record<string, Promise<Blob>>; constructor(values: Record<string, Promise<Blob>>) { this.values = values } })
  vi.stubGlobal('navigator', { clipboard: { write } })
  fireEvent.click(screen.getByRole('button'))
  expect(write).toHaveBeenCalledTimes(1)
  await waitFor(() => expect(notify).toHaveBeenCalledWith('投放链接已复制'))
})

test('剪贴板拒绝时显示失败而不误报已复制', async () => {
  const { writeText, notify } = setup()
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  writeText.mockRejectedValue(new Error('clipboard denied'))
  fireEvent.click(screen.getByRole('button'))
  await waitFor(() => expect(notify).toHaveBeenCalledWith(expect.any(String), 'error'))
  expect(log).toHaveBeenCalledWith('复制投放链接失败', { error: 'clipboard denied' })
  expect(notify).not.toHaveBeenCalledWith('投放链接已复制')
})

test('HTTP 环境没有 Clipboard API 时仍获取链接并尝试兼容复制', async () => {
  const { ensureDramaCampaign, notify } = setup()
  vi.stubGlobal('navigator', {})
  const exec = vi.fn(() => true)
  Object.defineProperty(document, 'execCommand', { configurable: true, value: exec })
  try {
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(notify).toHaveBeenCalledWith('投放链接已复制'))
    expect(ensureDramaCampaign).toHaveBeenCalledOnce()
    expect(exec).toHaveBeenCalledWith('copy')
  } finally { Reflect.deleteProperty(document, 'execCommand') }
})

test('自动复制不可用时显示完整链接，重试不再调用生成接口', async () => {
  const { ensureDramaCampaign, notify } = setup()
  vi.stubGlobal('navigator', {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  fireEvent.click(screen.getByRole('button'))
  expect(await screen.findByRole('textbox', { name: '投放链接' })).toHaveValue(link.landingUrl)
  fireEvent.click(screen.getByRole('button', { name: '再次复制' }))
  await waitFor(() => expect(notify).toHaveBeenCalledTimes(2))
  expect(ensureDramaCampaign).toHaveBeenCalledOnce()
})

test.each([false, new Error('copy denied token=private-token')])('兼容复制失败保留链接、清理临时输入框且记录脱敏原因：%s', async failure => {
  const { notify } = setup()
  vi.stubGlobal('navigator', {})
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  Object.defineProperty(document, 'execCommand', { configurable: true, value: () => {
    if (failure instanceof Error) throw failure
    return failure
  } })
  try {
    fireEvent.click(screen.getByRole('button'))
    expect(await screen.findByRole('textbox', { name: '投放链接' })).toHaveValue(link.landingUrl)
    expect(notify).not.toHaveBeenCalledWith('投放链接已复制')
    expect(document.querySelector('textarea[style*="position: fixed"]')).toBeNull()
    if (failure instanceof Error) expect(error).toHaveBeenCalledWith('兼容复制投放链接失败', { error: 'copy denied token=[已脱敏]' })
    else expect(warn).toHaveBeenCalledWith('兼容复制投放链接失败', { error: 'Browser rejected copy command' })
  } finally { Reflect.deleteProperty(document, 'execCommand') }
})
