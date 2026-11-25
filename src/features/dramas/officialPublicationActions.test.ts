import { expect, test } from 'vitest'
import type { TikTokPublication } from '../../domain'
import {
  officialPublicationActions,
  sameOfficialTask,
} from './officialPublicationActions'

const all = { canSync: true, canReview: true, canRelease: true }
const row = { publishStatus: 'ready' as const }
const task = {
  id: '701',
  status: 'online',
  stage: 'done',
  currentContentChanged: false,
  reviewStatus: 2,
  priority: 'normal',
} as TikTokPublication
const actions = (
  p: TikTokPublication | null,
  permissions = all,
  onlineVersion?: number,
) =>
  officialPublicationActions({ ...row, onlineVersion }, p, permissions).map(
    (value) => value.kind,
  )

test('旧上下架失败沿用已选版本按钮，确认事实不被历史失败再次覆盖', () => {
  for (const stage of ['list_album', 'delist_album'] as const) {
    for (const status of ['online', 'offline']) {
      expect(officialPublicationActions({ ...row, officialRelease: { selectedPublicationId: task.id, version: 1, status } }, { ...task, status: 'failed', stage }, all).map(value => value.kind)).toEqual([status === 'online' ? 'offline' : 'relist'])
    }
  }
})

test('草稿可直接同步，旧线上版本仍可独立下线', () => {
  expect(actions(null)).toEqual(['sync'])
  expect(
    officialPublicationActions({ publishStatus: 'draft' }, null, all),
  ).toEqual([expect.objectContaining({kind:'sync'})])
  expect(actions({ ...task, currentContentChanged: true }, all, 1)).toEqual([
    'sync',
    'offline',
  ])
  expect(actions(task, all, 1)).toEqual(['offline'])
})

test.each([
  ['queued', 'register_videos', 0, []],
  ['processing', 'update_album', 0, []],
  ['synced', 'await_submit_review', 0, ['review']],
  ['under_review', 'poll_review', 1, ['query', 'withdraw']],
  ['under_review', 'poll_appeal', 5, ['query', 'withdraw']],
  ['approved', 'await_publish', 2, ['query', 'publish']],
  ['rejected', 'poll_review', 3, ['appeal']],
  ['rejected', 'poll_appeal', 7, ['appeal']],
  ['rejected', 'poll_review', 4, ['sync']],
  ['offline', 'done', 2, []],
] as const)(
  '%s / %s 只提供当前步骤的动作',
  (status, stage, reviewStatus, expected) => {
    expect(actions({ ...task, status, stage, reviewStatus })).toEqual(expected)
  },
)

test('新内容需重新同步，不对旧同步快照继续送审', () => {
  expect(
    actions({
      ...task,
      status: 'synced',
      stage: 'await_submit_review',
      currentContentChanged: true,
    }),
  ).toEqual(['sync'])
  expect(
    actions({
      ...task,
      status: 'rejected',
      reviewStatus: 3,
      currentContentChanged: true,
    }),
  ).toEqual(['sync'])
  expect(
    actions({ ...task, status: 'failed', errorCode: 'content_changed' }),
  ).toEqual(['sync'])
})

test.each(['set_online_version', 'list_album', 'delist_album'] as const)(
  '新版草稿修改不放弃 %s 的上线或下线失败任务',
  (stage) => {
    const p = {
      ...task,
      status: 'failed' as const,
      stage,
      currentContentChanged: true,
    }
    expect(
      actions(p, { canSync: false, canReview: false, canRelease: true }, 1),
    ).toContain('retry')
    expect(actions(p)).not.toContain('sync')
    if (stage === 'delist_album')
      expect(actions(p, all, 1)).not.toContain('offline')
  },
)

test('审核重试仅在未受理时允许重选优先级，其他恢复按精确权限', () => {
  const p = {
    ...task,
    status: 'failed' as const,
    stage: 'submit_review' as const,
  }
  expect(actions(p)).toEqual(['review'])
  expect(actions(p, { ...all, canReview: false })).toEqual([])
  expect(
    actions({ ...p, stage: 'register_videos' }, { ...all, canSync: false }),
  ).toEqual([])
  expect(actions({ ...p, stage: 'appeal_review' })).toEqual(['retry'])
  expect(actions({ ...p, stage: 'poll_review' })).toEqual(['query'])
  expect(
    actions({ ...p, stage: 'update_album', errorCode: 'api_rejected' }),
  ).toEqual([])
})

test.each([
  'create_album',
  'submit_review',
  'set_online_version',
  'list_album',
  'delist_album',
] as const)('%s 写入未知不能重新同步、重试写入或上线', (stage) => {
  const kinds = actions({
    ...task,
    status: 'failed',
    stage,
    errorCode: 'external_write_uncertain',
    currentContentChanged: true,
  })
  expect(kinds).toEqual(stage === 'submit_review' ? ['query'] : [])
})

test('版本更新未知允许人工恢复，首次同步仍只核对，权限不能越级', () => {
  const p = {
    ...task,
    status: 'failed' as const,
    stage: 'update_album' as const,
    errorCode: 'external_write_uncertain',
    platformVersion: 1,
    currentContentChanged: true,
  }
  expect(actions(p)).toEqual(['retry'])
  expect(officialPublicationActions(row, p, all)[0].label).toBe('恢复同步')
  expect(officialPublicationActions(row, { ...p, platformVersion: 0 }, all)[0].label).toBe('核对同步结果')
  expect(actions(p, { ...all, canSync: false })).toEqual([])
})

test('只读角色没有写入动作，当前线上与新审核任务不会混为一体', () => {
  expect(
    actions(task, { canSync: false, canReview: false, canRelease: false }, 1),
  ).toEqual([])
  expect(
    actions({ ...task, status: 'under_review', stage: 'poll_review' }, all, 1),
  ).not.toContain('offline')
})

test('旧列表、旧任务或变更的官方版本不能用于确认', () => {
  expect(sameOfficialTask(undefined, null)).toBe(true)
  expect(sameOfficialTask(undefined, task)).toBe(false)
  expect(sameOfficialTask({ ...task, id: undefined }, task)).toBe(false)
  expect(sameOfficialTask(task, { ...task, id: '702' })).toBe(false)
  expect(sameOfficialTask(task, { ...task, currentContentChanged: true })).toBe(
    false,
  )
  expect(
    sameOfficialTask(
      { ...task, platformVersion: 2 },
      { ...task, platformVersion: 3 },
    ),
  ).toBe(false)
  expect(sameOfficialTask(task, { ...task })).toBe(true)
})

test('旧版本仍在线时，未知官方写入不提供新的下线命令', () => {
  const p = {
    ...task,
    status: 'failed' as const,
    stage: 'set_online_version' as const,
    errorCode: 'external_write_uncertain',
  }
  expect(actions(p, all, 1)).toEqual([])
})


test('已选 V1 的上下架独立于最新 V2 同步和审核', () => {
 for (const status of ['queued','processing','under_review','approved','failed'] as const) {
  const p={...task,status,stage:'poll_review' as const}
  const release={selectedPublicationId:'700',version:1,status:'online'}
  expect(officialPublicationActions({...row,officialRelease:release},p,all).map(a=>a.kind)).toContain('offline')
  expect(officialPublicationActions({...row,publishStatus:'draft',officialRelease:{...release,status:'offline'}},p,all).map(a=>a.kind)).toContain('relist')
 }
})

test('新草稿已修改时仍可明确上线已审核 V2，下线只受独立任务门禁', () => {
 const p={...task,status:'approved' as const,stage:'await_publish' as const,currentContentChanged:true}
 const release={selectedPublicationId:'700',version:1,status:'online'}
 expect(officialPublicationActions({...row,officialRelease:release},p,all).map(a=>a.kind)).toEqual(['sync','publish','offline'])


})
