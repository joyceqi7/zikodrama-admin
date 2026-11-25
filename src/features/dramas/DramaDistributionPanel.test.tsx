import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { test, expect, vi } from 'vitest'
import type { DramaDistribution, OperationsApi } from '../../api'
import type { Application } from '../../applications'
import { DramaDistributionPanel } from './DramaDistributionPanel'
const row: DramaDistribution = { dramaId: 'drama', applicationId: 'target', ownerApplicationId: 'owner', enabled: true, desiredAuthorized: true, status: 'authorized', attempts: 0, errorCode: '', nextAttemptAt: '' }

// 只提供分发面板使用的应用字段，避免测试依赖其他应用配置。
function application(id: string, status: Application['status'] = 'active', clientKey = 'client-key'): Application {
 return { id, name: id, tiktokAppId: id, status, clientKey } as Application
}

test('没有授权关系时仍从应用目录选择官方目标，保存后读取实际授权结果', async () => {
 const confirmed = { ...row, applicationId: 'new-official' }
 const listDramaDistributions = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([confirmed])
 const setDramaDistribution = vi.fn(async () => undefined)
 const api = { listDramaDistributions, setDramaDistribution } as unknown as OperationsApi
 const onChanged = vi.fn()
 render(<DramaDistributionPanel api={api} dramaId="drama" ownerApplicationId="owner" applications={[
  application('owner'), application('new-official'), application('disabled', 'disabled'), application('missing-key', 'active', ''),
  { ...application('direct'), playbackProvider: 'byteplus_web' },
 ]} canUpdate onChanged={onChanged} />)
 const target = await screen.findByRole('checkbox', { name: '选择 new-official' })
 expect(target).not.toBeChecked()
 expect(target).toBeEnabled()
 expect(screen.queryByRole('checkbox', { name: '选择 owner' })).not.toBeInTheDocument()
 expect(screen.getByRole('checkbox',{name:'选择 direct'})).toBeEnabled()
 expect(screen.getByRole('checkbox', { name: '选择 disabled' })).toBeDisabled()
 expect(screen.getByRole('checkbox', { name: '选择 missing-key' })).toBeDisabled()
 expect(screen.queryByText('正在准备可分发应用')).not.toBeInTheDocument()
 expect(setDramaDistribution).not.toHaveBeenCalled()
 fireEvent.click(target)
 fireEvent.click(screen.getByRole('button', { name: '保存分发设置' }))
 fireEvent.click(await screen.findByRole('button', { name: '保存设置' }))
 await waitFor(() => expect(setDramaDistribution).toHaveBeenCalledExactlyOnceWith('drama', 'new-official', true))
 expect(await screen.findByText('已授权')).toBeInTheDocument()
 expect(onChanged).toHaveBeenCalledOnce()
})

test('已有授权保持不变，新添加的官方应用无需等待后台生成关系', async () => {
 const api = { listDramaDistributions: vi.fn(async () => [row]), setDramaDistribution: vi.fn() } as unknown as OperationsApi
 const props = { api, dramaId: 'drama', ownerApplicationId: 'owner', canUpdate: true, onChanged: vi.fn() }
 const view = render(<DramaDistributionPanel {...props} applications={[application('target')]} />)
 expect(await screen.findByRole('checkbox', { name: '选择 target' })).toBeChecked()
 view.rerender(<DramaDistributionPanel {...props} applications={[application('target'), application('new-official')]} />)
 expect(screen.getByRole('checkbox', { name: '选择 new-official' })).not.toBeChecked()
 expect(screen.getByRole('checkbox', { name: '选择 target' })).toBeChecked()
 expect(api.listDramaDistributions).toHaveBeenCalledOnce()
 expect(api.setDramaDistribution).not.toHaveBeenCalled()
})

test('只有拥有方时明确提示没有其他目标，不伪装持续加载', async () => {
 render(<DramaDistributionPanel api={{ listDramaDistributions: vi.fn(async () => []) } as unknown as OperationsApi} dramaId="drama" ownerApplicationId="owner" applications={[
  application('owner'),
 ]} canUpdate onChanged={vi.fn()} />)
 expect(await screen.findByText('当前主体暂无其他可分发应用')).toBeInTheDocument()
 expect(screen.queryByText('正在加载授权状态')).not.toBeInTheDocument()
 expect(screen.getByRole('button', { name: '保存分发设置' })).toBeDisabled()
})

test('授权状态尚未读取时不能选择，读取失败提示重试且不覆盖已有事实', async () => {
 let reject!: (cause: Error) => void
 const log = vi.spyOn(console, 'error').mockImplementation(() => {})
 try {
  const listDramaDistributions = vi.fn().mockImplementationOnce(() => new Promise<DramaDistribution[]>((_resolve, rejectPromise) => { reject = rejectPromise })).mockResolvedValueOnce([])
  const setDramaDistribution = vi.fn()
  render(<DramaDistributionPanel api={{ listDramaDistributions, setDramaDistribution } as unknown as OperationsApi} dramaId="drama" applications={[application('target')]} canUpdate onChanged={vi.fn()} />)
  expect(screen.getByText('正在加载授权状态')).toBeInTheDocument()
  expect(screen.queryByRole('checkbox', { name: '选择 target' })).not.toBeInTheDocument()
  await act(async () => { reject(new Error('failed token=secret')) })
  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '保存分发设置' })).toBeDisabled()
  expect(screen.queryByText('failed token=secret')).not.toBeInTheDocument()
  expect(log).toHaveBeenCalledWith('load drama distributions failed', { error: 'failed token=[已脱敏]' })
  fireEvent.click(screen.getByRole('button', { name: '刷新状态' }))
  expect(await screen.findByRole('checkbox', { name: '选择 target' })).toBeEnabled()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(setDramaDistribution).not.toHaveBeenCalled()
 } finally { log.mockRestore() }
})

test('全选只加入可用目标，保存时仅提交原本未选的应用', async () => {
 const rows: DramaDistribution[] = [
  { ...row, applicationId: 'owner' },
  { ...row, applicationId: 'first' },
  { ...row, applicationId: 'second', enabled: false, desiredAuthorized: false, status: 'revoked' },
  { ...row, applicationId: 'disabled', enabled: false, desiredAuthorized: false, status: 'revoked' },
 ]
 const api = { listDramaDistributions: vi.fn(async () => rows), setDramaDistribution: vi.fn(async () => undefined) } as unknown as OperationsApi
 render(<DramaDistributionPanel api={api} dramaId="drama" applications={[application('first'), application('second'), application('disabled', 'disabled')]} canUpdate onChanged={vi.fn()} />)
 const selectAll = await screen.findByRole('checkbox', { name: '全选可用应用' })
 expect(screen.getByText('已选 1/2')).toBeInTheDocument()
 expect(screen.getByRole('checkbox', { name: '选择 disabled' })).toBeDisabled()
 fireEvent.click(selectAll)
 expect(screen.getByRole('checkbox', { name: '选择 first' })).toBeChecked()
 expect(screen.getByRole('checkbox', { name: '选择 second' })).toBeChecked()
 expect(screen.getByRole('checkbox', { name: '选择 disabled' })).not.toBeChecked()
 expect(screen.getByText('已选 2/2')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: '保存分发设置' }))
 fireEvent.click(await screen.findByRole('button', { name: '保存设置' }))
 await waitFor(() => expect(api.setDramaDistribution).toHaveBeenCalledWith('drama', 'second', true))
 expect(api.setDramaDistribution).toHaveBeenCalledTimes(1)
})

test('取消全选保留不可操作的既有授权，只撤销可用目标', async () => {
 const rows: DramaDistribution[] = [
  { ...row, applicationId: 'owner' },
  { ...row, applicationId: 'first' },
  { ...row, applicationId: 'second' },
  { ...row, applicationId: 'disabled' },
 ]
 const api = { listDramaDistributions: vi.fn(async () => rows), setDramaDistribution: vi.fn(async () => undefined) } as unknown as OperationsApi
 render(<DramaDistributionPanel api={api} dramaId="drama" applications={[application('first'), application('second'), application('disabled', 'disabled')]} canUpdate onChanged={vi.fn()} />)
 const selectAll = await screen.findByRole('checkbox', { name: '全选可用应用' })
 expect(selectAll).toBeChecked()
 fireEvent.click(selectAll)
 expect(screen.getByRole('checkbox', { name: '选择 first' })).not.toBeChecked()
 expect(screen.getByRole('checkbox', { name: '选择 second' })).not.toBeChecked()
 expect(screen.getByRole('checkbox', { name: '选择 disabled' })).toBeChecked()
 fireEvent.click(screen.getByRole('button', { name: '保存分发设置' }))
 fireEvent.click(await screen.findByRole('button', { name: '保存设置' }))
 await waitFor(() => expect(api.setDramaDistribution).toHaveBeenCalledTimes(2))
 expect(api.setDramaDistribution).toHaveBeenCalledWith('drama', 'first', false)
 expect(api.setDramaDistribution).toHaveBeenCalledWith('drama', 'second', false)
})

test('移出选择并确认后只更新目标应用，不触发重新发布', async () => {
 const api = { listDramaDistributions: vi.fn(async () => [row]), setDramaDistribution: vi.fn(async () => undefined) } as unknown as OperationsApi
 render(<DramaDistributionPanel api={api} dramaId="drama" applications={[]} canUpdate onChanged={vi.fn()} />)
 expect(await screen.findByText('已授权')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: '取消选择' }))
 fireEvent.click(screen.getByRole('button', { name: '保存分发设置' }))
 fireEvent.click(await screen.findByRole('button', { name: '保存设置' }))
 await waitFor(() => expect(api.setDramaDistribution).toHaveBeenCalledWith('drama', 'target', false))
})

test('只读用户能查看失败状态但不能重试或撤权', async () => {
 const api = { listDramaDistributions: vi.fn(async () => [{ ...row, status: 'failed' }]) } as unknown as OperationsApi
 render(<DramaDistributionPanel api={api} dramaId="drama" applications={[]} canUpdate={false} onChanged={vi.fn()} />)
 expect(await screen.findByText('授权失败')).toBeInTheDocument()
 expect(screen.queryByRole('checkbox', { name: '全选可用应用' })).not.toBeInTheDocument()
 expect(screen.queryByRole('button', { name: /重\s*试/ })).not.toBeInTheDocument()
 expect(screen.queryByRole('button', { name: /撤\s*权/ })).not.toBeInTheDocument()
})

test('授权失败按服务端下次重试时间刷新，不再每五秒空查', async () => {
 vi.useFakeTimers()
 vi.setSystemTime(new Date('2026-09-20T00:00:00Z'))
 try {
  const failed = { ...row, status: 'failed', nextAttemptAt: '2026-09-20T00:00:30Z' }
  const listDramaDistributions = vi.fn(async () => [failed])
  const api = { listDramaDistributions } as unknown as OperationsApi
  render(<DramaDistributionPanel api={api} dramaId="drama" applications={[]} canUpdate={false} onChanged={vi.fn()} />)
  await act(async () => undefined)
  expect(listDramaDistributions).toHaveBeenCalledOnce()
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000) })
  expect(listDramaDistributions).toHaveBeenCalledOnce()
  await act(async () => { await vi.advanceTimersByTimeAsync(35_000) })
  expect(listDramaDistributions).toHaveBeenCalledTimes(2)
 } finally {
  vi.useRealTimers()
 }
})


test('只有应用安全摘要时，独立播放器应用也可预授权且不需要读取 Client Key',async()=>{
 const listDramaDistributions=vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{...row,applicationId:'direct'}])
 const setDramaDistribution=vi.fn(async()=>undefined)
 render(<DramaDistributionPanel api={{listDramaDistributions,setDramaDistribution} as unknown as OperationsApi} dramaId="drama" ownerApplicationId="owner" applications={[{id:'direct',subjectId:'1',tiktokAppId:'000123',name:'独立应用',status:'active',playbackProvider:'byteplus_web',clientKeyConfigured:true}]} canUpdate onChanged={vi.fn()} />)
 const target=await screen.findByRole('checkbox',{name:'选择 独立应用'})
 expect(target).toBeEnabled()
 fireEvent.click(target);fireEvent.click(screen.getByRole('button',{name:'保存分发设置'}));fireEvent.click(await screen.findByRole('button',{name:'保存设置'}))
 await waitFor(()=>expect(setDramaDistribution).toHaveBeenCalledWith('drama','direct',true))
 expect(await screen.findByText('已授权')).toBeInTheDocument()
})
