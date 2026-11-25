import { act, renderHook } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ApiError, type OperationsApi } from '../../api'
import type { Drama } from '../../domain'
import { useDramaCatalog } from './useDramaCatalog'

test('编辑详情加载失败保留诊断信息、脱敏凭据且不打开空页面', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const notify = vi.fn()
    const api = { findDrama: vi.fn().mockRejectedValue(new Error('lookup unavailable token=fixture-secret')) } as unknown as OperationsApi
    const { result } = renderHook(() => useDramaCatalog(api, notify, vi.fn()))
    await act(async () => result.current.openDrama({ id: 'drama-a' }))
    expect(log).toHaveBeenCalledWith('open drama editor failed', { error: 'lookup unavailable token=[已脱敏]' })
    expect(JSON.stringify(log.mock.calls)).not.toContain('fixture-secret')
    expect(notify).toHaveBeenCalledWith(expect.any(String), 'error')
    expect(result.current.dramaEditor).toBeNull()
  } finally { log.mockRestore() }
})

test('编辑详情加载成功不误报错误，退出后晚到的详情不能重新打开页面', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    let resolve!: (value: Drama) => void
    const pending = new Promise<Drama>((done) => { resolve = done })
    const api = { findDrama: vi.fn(() => pending) } as unknown as OperationsApi
    const { result } = renderHook(() => useDramaCatalog(api, vi.fn(), vi.fn()))
    let opening!: Promise<boolean>
    act(() => { opening = result.current.openDrama({ id: 'drama-a' }) })
    act(() => result.current.setDramaEditor(null))
    await act(async () => { resolve({ id: 'drama-a' } as Drama); await opening })
    expect(result.current.dramaEditor).toBeNull()
    expect(log).not.toHaveBeenCalled()
  } finally { log.mockRestore() }
})

test('编辑深链接独立读取草稿，不查询渠道审核任务', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const api = {
      findDrama: vi.fn(async () => ({ id: 'drama-a', publishStatus: 'publishing' } as Drama)),
      findTikTokPublication: vi.fn(async () => ({ status: 'failed', stage: 'update_album', errorCode: 'api_rejected' })),
    } as unknown as OperationsApi
    const { result } = renderHook(() => useDramaCatalog(api, vi.fn(), vi.fn()))
    await act(async () => result.current.openDrama({ id: 'drama-a' }))
    expect(result.current.dramaEditor).toMatchObject({ mode: 'edit', drama: {id:'drama-a'} })
    expect(log).not.toHaveBeenCalled()
  } finally { log.mockRestore() }
})

test('渠道查询故障不影响打开编辑草稿', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const notify = vi.fn()
    const api = {
      findDrama: vi.fn(async () => ({ id: 'drama-a', publishStatus: 'draft' } as Drama)),
      findTikTokPublication: vi.fn().mockRejectedValueOnce(new ApiError('not found', 404)).mockRejectedValueOnce(new Error('lookup unavailable token=fixture-secret')),
    } as unknown as OperationsApi
    const { result } = renderHook(() => useDramaCatalog(api, notify, vi.fn()))
    await act(async () => result.current.openDrama({ id: 'drama-a' }))
    expect(result.current.dramaEditor).toMatchObject({ mode: 'edit', drama: {id:'drama-a'} })
    expect(log).not.toHaveBeenCalled()
    await act(async () => result.current.openDrama({ id: 'drama-a' }))
    expect(api.findTikTokPublication).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).not.toContain('fixture-secret')
    expect(notify).not.toHaveBeenCalled()
  } finally { log.mockRestore() }
})

test('保存详情聚合时保留列表专用的创建人及最新操作人字段', async () => {
  const api = {
    overview: vi.fn(async () => ({ dramaCount: 1, episodeCount: 0, publishedCount: 0, pendingMediaCount: 0 })),
    listDramas: vi.fn(async () => ({ total: 1, items: [{ id: '1', title: '旧标题', tags: [], createdById: '101', createdByName: '创建者', updatedById: '102', updatedByName: '编辑者' }] })),
  } as unknown as OperationsApi
  const { result } = renderHook(() => useDramaCatalog(api, vi.fn(), vi.fn()))
  await act(async () => result.current.load())
  act(() => result.current.updateDrama({ id: '1', title: '修改后', tags: [], episodes: [] } as unknown as Drama))
  expect(result.current.dramas[0]).toMatchObject({ title: '修改后', createdById: '101', createdByName: '创建者', updatedById: '102', updatedByName: '编辑者' })
})

test('主体往返或登出后，旧保存回调不能重新打开编辑器、污染目录或作废当前详情读取', async () => {
  let finish!: (drama: Drama) => void
  const api = { findDrama: vi.fn(() => new Promise<Drama>(resolve => { finish = resolve })) } as unknown as OperationsApi
  const notify = vi.fn(), log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const { result } = renderHook(() => useDramaCatalog(api, notify, vi.fn()))
    const oldSaved = result.current.updateDrama
    // 两次切换代表 A→B→A，不能仅用主体字符串相等判断旧回调有效。
    act(() => result.current.resetCatalog())
    act(() => result.current.resetCatalog())
    let opening!: Promise<boolean>
    act(() => { opening = result.current.openDrama({ id: '201' }) })
    act(() => expect(oldSaved({ id: '201', title: '迟到快照', tags: [], episodes: [] } as unknown as Drama)).toBe(false))
    expect(result.current.dramaEditor).toBeNull()
    expect(result.current.dramas).toEqual([])
    await act(async () => { finish({ id: '201', title: '当前读取' } as Drama); expect(await opening).toBe(true) })
    expect(result.current.dramaEditor).toMatchObject({ drama: { title: '当前读取' } })
    act(() => expect(result.current.updateDrama({ id: '201', title: '当前保存', tags: [], episodes: [] } as unknown as Drama)).toBe(true))
    expect(result.current.dramaEditor).toMatchObject({ drama: { title: '当前保存' } })
    expect(result.current.dramas[0].title).toBe('当前保存')
    expect(notify).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  } finally { log.mockRestore() }
})

test.each([{ label: '切换主体或登出', resets: 1 }, { label: '主体 A→B→A', resets: 2 }])('$label后旧删除不刷新目录、不提示成功，也不作废当前详情读取', async ({ resets }) => {
  let finishDelete!: () => void, finishRead!: (drama: Drama) => void
  const list = vi.fn(async () => ({ items: [{ id: '202', title: '当前主体列表' }], total: 1 }))
  const api = {
    deleteDrama: vi.fn(() => new Promise<void>(resolve => { finishDelete = resolve })),
    findDrama: vi.fn(() => new Promise<Drama>(resolve => { finishRead = resolve })),
    overview: vi.fn(async () => ({})), listDramas: list,
  } as unknown as OperationsApi
  const notify = vi.fn(), log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const { result } = renderHook(() => useDramaCatalog(api, notify, vi.fn()))
    let deleting!: Promise<unknown>, opening!: Promise<boolean>
    act(() => { deleting = result.current.deleteDrama({ id: '201' }) })
    for (let index = 0; index < resets; index += 1) act(() => result.current.resetCatalog())
    await act(async () => { await result.current.load() })
    act(() => { opening = result.current.openDrama({ id: '202' }) })
    await act(async () => { finishDelete(); expect(await deleting).toBe(false) })
    expect(list).toHaveBeenCalledTimes(1)
    expect(result.current.dramas).toMatchObject([{ id: '202', title: '当前主体列表' }])
    await act(async () => { finishRead({ id: '202', title: '当前主体详情' } as Drama); expect(await opening).toBe(true) })
    expect(result.current.dramaEditor).toMatchObject({ drama: { id: '202', title: '当前主体详情' } })
    expect(notify).not.toHaveBeenCalled()
    expect(log).not.toHaveBeenCalled()
  } finally { log.mockRestore() }
})

test('删除成功后的刷新期间切换主体，旧刷新不覆盖新目录且返回禁止导航', async () => {
  let finishRefresh!: (page: { items: { id: string; title: string }[]; total: number }) => void
  const list = vi.fn()
    .mockImplementationOnce(() => new Promise(resolve => { finishRefresh = resolve }))
    .mockResolvedValue({ items: [{ id: '202', title: '新主体列表' }], total: 1 })
  const api = { deleteDrama: vi.fn(async () => undefined), overview: async () => ({}), listDramas: list } as unknown as OperationsApi
  const notify = vi.fn()
  const { result } = renderHook(() => useDramaCatalog(api, notify, vi.fn()))
  let deleting!: Promise<unknown>
  await act(async () => { deleting = result.current.deleteDrama({ id: '201' }) })
  expect(list).toHaveBeenCalledOnce()
  act(() => result.current.resetCatalog())
  await act(async () => { await result.current.load() })
  act(() => result.current.setDramaEditor({ mode: 'edit', drama: { id: '202', title: '新主体正在编辑' } as Drama }))
  await act(async () => { finishRefresh({ items: [{ id: '201', title: '旧主体刷新' }], total: 1 }); expect(await deleting).toBe(false) })
  expect(result.current.dramas).toMatchObject([{ id: '202', title: '新主体列表' }])
  expect(result.current.dramaEditor).toMatchObject({ drama: { id: '202', title: '新主体正在编辑' } })
  expect(notify).toHaveBeenCalledExactlyOnceWith('剧目已删除')
})

test('当前主体删除正常清空编辑器、刷新目录并允许导航，失败仍向调用方传播', async () => {
  const error = new Error('delete database unavailable')
  const remove = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(error)
  const list = vi.fn(async () => ({ items: [], total: 0 }))
  const api = { deleteDrama: remove, overview: async () => ({}), listDramas: list } as unknown as OperationsApi
  const notify = vi.fn(), log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    const { result } = renderHook(() => useDramaCatalog(api, notify, vi.fn()))
    act(() => result.current.setDramaEditor({ mode: 'edit', drama: { id: '201' } as Drama }))
    await act(async () => { expect(await result.current.deleteDrama({ id: '201' })).toBe(true) })
    expect(result.current.dramaEditor).toBeNull()
    expect(list).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenCalledExactlyOnceWith('剧目已删除')
    expect(log).not.toHaveBeenCalled()
    act(() => result.current.setDramaEditor({ mode: 'edit', drama: { id: '202' } as Drama }))
    // 失败仍交给调用页面记录诊断并保留确认框，不能改成成功或过期结果。
    await act(async () => { await expect(result.current.deleteDrama({ id: '202' })).rejects.toBe(error) })
    expect(result.current.dramaEditor).toMatchObject({ drama: { id: '202' } })
    expect(list).toHaveBeenCalledOnce()
    expect(notify).toHaveBeenLastCalledWith(expect.any(String), 'error')
  } finally { log.mockRestore() }
})
