import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { DramaDistribution, OperationsApi } from '../../api'
import type { Application } from '../../applications'
import type { DramaListItem } from '../../domain'
import { DramaAuthorizationDrawer } from './DramaAuthorizationDrawer'

const drama = { id: '215', title: '授权示例', onlineVersion: 1, ownerApplicationId: '1' } as DramaListItem
const apps = [{ id: '1', name: '发布小程序' }, { id: '2', name: '目标小程序' }] as Application[]
const row = { dramaId: '215', applicationId: '2', ownerApplicationId: '1', enabled: true, desiredAuthorized: true, status: 'authorized' } as DramaDistribution

test('按需读取明细，发布方单独展示且不列入其他授权', async () => {
  const listDramaDistributions = vi.fn(async () => [row, { ...row, applicationId: '1' }])
  const onRefresh = vi.fn()
  render(<DramaAuthorizationDrawer api={{ listDramaDistributions } as unknown as OperationsApi} drama={drama} applications={apps} onClose={vi.fn()} onRefresh={onRefresh} />)
  expect(await screen.findByText('目标小程序')).toBeInTheDocument()
  expect(screen.getByText('发布方：发布小程序')).toBeInTheDocument()
  expect(screen.getByText('已授权')).toBeInTheDocument()
  expect(listDramaDistributions).toHaveBeenCalledWith('215')
  await waitFor(() => expect(screen.getByRole('button', { name: '刷新授权状态' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '刷新授权状态' }))
  await waitFor(() => expect(listDramaDistributions).toHaveBeenCalledTimes(2))
  expect(onRefresh).toHaveBeenCalledOnce()
})

test('已撤权的历史成功状态不显示为已授权', async () => {
  render(<DramaAuthorizationDrawer api={{ listDramaDistributions: vi.fn(async () => [{ ...row, enabled: false, desiredAuthorized: false }]) } as unknown as OperationsApi} drama={drama} applications={apps} onClose={vi.fn()} onRefresh={vi.fn()} />)
  expect(await screen.findByText('撤权处理中')).toBeInTheDocument()
  expect(screen.queryByText('已授权')).not.toBeInTheDocument()
})

test('加载失败经过统一诊断和友好提示，支持重试', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const listDramaDistributions = vi.fn().mockRejectedValueOnce(new Error('secret token=abc')).mockResolvedValueOnce([])
    render(<DramaAuthorizationDrawer api={{ listDramaDistributions } as unknown as OperationsApi} drama={drama} applications={apps} onClose={vi.fn()} onRefresh={vi.fn()} />)
    fireEvent.click(await screen.findByRole('button', { name: '重试加载授权明细' }))
    expect(await screen.findByText('暂无其他小程序授权记录')).toBeInTheDocument()
    expect(log).toHaveBeenCalledWith('load drama authorization details failed', { error: 'secret token=[已脱敏]' })
    expect(screen.queryByText('secret token=abc')).not.toBeInTheDocument()
  } finally { log.mockRestore() }
})


test('拥有授权权限时展开现有分发选择，保存仅更新目标授权', async () => {
  const listDramaDistributions = vi.fn(async () => [row])
  const setDramaDistribution = vi.fn(async () => undefined)
  const onRefresh = vi.fn()
  render(<DramaAuthorizationDrawer api={{ listDramaDistributions, setDramaDistribution } as unknown as OperationsApi} drama={drama} applications={apps.map(app => ({ ...app, status: 'active', clientKey: 'local-key' }))} canUpdate onClose={vi.fn()} onRefresh={onRefresh} />)
  fireEvent.click(await screen.findByRole('button', { name: '取消选择' }))
  fireEvent.click(screen.getByRole('button', { name: '保存分发设置' }))
  fireEvent.click(await screen.findByRole('button', { name: '保存设置' }))
  await waitFor(() => expect(setDramaDistribution).toHaveBeenCalledExactlyOnceWith('215', '2', false))
  expect(onRefresh).toHaveBeenCalledOnce()
})

test('首次授权通过短剧拥有方排除自动可用应用，未建关系的官方应用可选', async () => {
  const listDramaDistributions = vi.fn(async () => [])
  render(<DramaAuthorizationDrawer api={{ listDramaDistributions } as unknown as OperationsApi} drama={drama} applications={apps.map(app => ({ ...app, status: 'active', clientKey: 'local-key' }))} canUpdate onClose={vi.fn()} onRefresh={vi.fn()} />)
  expect(await screen.findByRole('checkbox', { name: '选择 目标小程序' })).toBeEnabled()
  expect(screen.queryByRole('checkbox', { name: '选择 发布小程序' })).not.toBeInTheDocument()
})
