import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import type { PublicationRecord } from '../../publicationRecords'
import { publicationRecordActions } from '../../publicationRecords'
import { PublicationRecordsPage } from './PublicationRecordsPage'

const row = { id: '9007199254740993', dramaId: '201', title: '测试审核版本', status: 'approved', current: true, taskStatus: 'approved', taskStage: 'await_publish', actorId: '', createdAt: '2026-09-17T01:00:00Z', updatedAt: '2026-09-17T01:00:00Z', publication: { status: 'approved', platformVersion: 2 } } as PublicationRecord

test('历史记录及已经上线的审核通过记录不能重复上线', () => {
  expect(publicationRecordActions('reviews', { ...row, current: false })).toEqual([])
  expect(publicationRecordActions('reviews', { ...row, taskStatus: 'online', taskStage: 'done' })).toEqual([])
  expect(publicationRecordActions('reviews', row)).toEqual(['publish'])
})

test('记录页不提供已申诉项目入口，但允许处理其他尚未申诉的被拒项目', () => {
  const rejected = { ...row, status: 'rejected', taskStatus: 'rejected', taskStage: 'poll_appeal', publication: { ...row.publication, status: 'rejected', reviewStatus: 3, platformAlbumId: '100', episodeIdsBySequence: { '1': '101' }, reviewItems: { '100': 2, '101': 7 } } } as PublicationRecord
  expect(publicationRecordActions('reviews', rejected)).toEqual([])
  rejected.publication.reviewItems!['101'] = 3
  expect(publicationRecordActions('reviews', rejected)).toEqual(['appeal'])
})

test('版本更新结果未知时允许安全查询原版本并展示底层分类', async () => {
  const uncertain = {
    ...row,
    status: 'failed',
    taskStatus: 'failed',
    taskStage: 'update_album',
    publication: {
      ...row.publication,
      status: 'failed',
      stage: 'update_album',
      platformAlbumId: '7685608308176193557',
      errorCode: 'external_write_uncertain',
      diagnosticCode: 'network_error',
    },
  } as PublicationRecord
  expect(publicationRecordActions('reviews', uncertain)).toEqual(['retry'])
  const api = { listPublicationRecords: vi.fn(async () => ({ items: [uncertain], total: 1 })) } as unknown as OperationsApi
  render(<PublicationRecordsPage api={api} kind="reviews" />)
  fireEvent.click(await screen.findByRole('button', { name: /详\s*情/ }))
  expect(screen.getByText('network_error')).toBeInTheDocument()
})

test('只读管理员保留详情，无状态变更按钮', async () => {
  const api = { listPublicationRecords: vi.fn(async () => ({ items: [row], total: 1 })) } as unknown as OperationsApi
  render(<PublicationRecordsPage api={api} kind="reviews" />)
  expect(await screen.findByText('测试审核版本')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /上\s*线/ })).not.toBeInTheDocument()
})

test('较早的记录请求晚到时不能覆盖刷新后的状态', async () => {
  let resolveOld!: (value: { items: PublicationRecord[]; total: number }) => void
  const old = new Promise<{ items: PublicationRecord[]; total: number }>(resolve => { resolveOld = resolve })
  const api = { listPublicationRecords: vi.fn().mockReturnValueOnce(old).mockResolvedValue({ items: [{ ...row, title: '最新结果' }], total: 1 }) } as unknown as OperationsApi
  const { rerender } = render(<PublicationRecordsPage api={api} kind="reviews" />)
  rerender(<PublicationRecordsPage api={api} kind="releases" />)
  expect(await screen.findByText('最新结果')).toBeInTheDocument()
  await act(async () => { resolveOld({ items: [{ ...row, title: '过期结果' }], total: 1 }) })
  expect(screen.queryByText('过期结果')).not.toBeInTheDocument()
})

test('记录读取失败展示友好提示并记录脱敏诊断', async () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const api = { listPublicationRecords: vi.fn().mockRejectedValue(new Error('storage unavailable token=private')) } as unknown as OperationsApi
    render(<PublicationRecordsPage api={api} kind="reviews" />)
    await waitFor(() => expect(log).toHaveBeenCalledWith('load publication records failed', { error: 'storage unavailable token=[已脱敏]' }))
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/token=private/)).not.toBeInTheDocument()
  } finally { log.mockRestore() }
})

test('记录以实际送审时间及固定集数展示，不展示分页推算的当前流程', async () => {
  const item = { ...row, publication: { ...row.publication, submittedAt: '2026-09-21T02:00:00Z', contentSummary: { episodeNumbers: [1, 2, 3], previousEpisodeNumbers: [1] } } }
  const onOpenOfficial = vi.fn()
  const api = { listPublicationRecords: vi.fn(async () => ({ items: [item], total: 1 })) } as unknown as OperationsApi
  render(<PublicationRecordsPage api={api} dramaId="201" kind="reviews" onOpenOfficial={onOpenOfficial} />)
  expect(await screen.findByText('更新剧集 · 新增第 2–3 集，共 2 集')).toBeInTheDocument()
  expect(screen.getByText(new Date(item.publication.submittedAt).toLocaleString('zh-CN', { hour12: false }))).toBeInTheDocument()
  expect(screen.queryByText('同步 TikTok')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '官方发布' }))
  expect(onOpenOfficial).toHaveBeenCalledWith('201')
})

test('历史上线记录不加载或修改当前应用分发', async () => {
  const api = { listPublicationRecords: vi.fn(async () => ({ items: [{ ...row, current: false, status: 'online', publication: { ...row.publication, onlineAt: '2026-09-21T02:00:00Z' } }], total: 1 })), listDramaDistributions: vi.fn() } as unknown as OperationsApi
  render(<PublicationRecordsPage api={api} kind="releases" />)
  fireEvent.click(await screen.findByRole('button', { name: /详\s*情/ }))
  expect(screen.getByText('这是历史版本，仅供查看。')).toBeInTheDocument()
  expect(screen.queryByText('选择分发应用')).not.toBeInTheDocument()
  expect(api.listDramaDistributions).not.toHaveBeenCalled()
})


test.each(['reviews', 'releases'] as const)('%s 记录全部只读，最新通过、审核中、拒绝、失败与线上记录也不提供写操作', async kind => {
 const states = [
   row,
   { ...row, id: '2', status: 'under_review', taskStatus: 'under_review', taskStage: 'poll_review' },
   { ...row, id: '3', status: 'rejected', taskStatus: 'rejected', taskStage: 'poll_appeal', publication: { ...row.publication, reviewStatus: 3, platformAlbumId: '100', reviewItems: { '100': 3 } } },
   { ...row, id: '4', status: 'failed', taskStatus: 'failed', taskStage: 'submit_review', publication: { ...row.publication, errorCode: 'urgent_review_quota_exceeded' } },
   { ...row, id: '5', status: 'online', taskStatus: 'online', taskStage: 'done' },
 ] as PublicationRecord[]
 const api = { listPublicationRecords: vi.fn(async () => ({ items: states, total: states.length })), publicationRecordAction: vi.fn() } as unknown as OperationsApi
 render(<PublicationRecordsPage api={api} kind={kind} dramaId="201" />)
 await waitFor(() => expect(screen.getAllByRole('button', { name: /详\s*情/ })).toHaveLength(5))
 expect(screen.queryByRole('button', { name: /查询审核|撤回审核|申\s*诉|上\s*线|重\s*试|下\s*架/ })).not.toBeInTheDocument()
 expect(api.listPublicationRecords).toHaveBeenCalledWith(kind, { page: 1, pageSize: 20, status: undefined, dramaId: '201' })
 expect(api.publicationRecordAction).not.toHaveBeenCalled()
})

test('详情保留拒绝意见和最近申诉，不透传平台异常；历史读取不调用官方查询', async () => {
 const rejected = { ...row, status: 'rejected', current: false, publication: { ...row.publication,
   episodeIdsBySequence: { '2': '101' }, reviewFailReasons: ['Episode(101): Please revise cover'],
   errorCode: 'external_write_uncertain', errorMessage: 'upstream secret token=private',
   appeal: { itemType: 2 as const, itemId: '101', reason: '已提交证明，请复核', attachmentUrls: ['https://evidence.example/file'] },
 } }
 const api = { listPublicationRecords: vi.fn(async () => ({ items: [rejected], total: 1 })), refreshTikTokReview: vi.fn() } as unknown as OperationsApi
 render(<PublicationRecordsPage api={api} kind="reviews" />)
 fireEvent.click(await screen.findByRole('button', { name: /详\s*情/ }))
 expect(screen.getByText('第 2 集')).toBeInTheDocument()
 expect(screen.getByText('Please revise cover')).toBeInTheDocument()
 expect(screen.getByText('最近一次申诉')).toBeInTheDocument()
 expect(screen.getByText('已提交证明，请复核')).toBeInTheDocument()
 expect(screen.getByText('1 条')).toBeInTheDocument()
 expect(screen.queryByText(/token=private/)).not.toBeInTheDocument()
 expect(api.refreshTikTokReview).not.toHaveBeenCalled()
})
