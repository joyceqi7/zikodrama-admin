import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import type { Drama, DramaListItem, TikTokPublication } from '../../domain'
import { OfficialPublicationDetailsDrawer } from './OfficialPublicationDetailsDrawer'

const row = {
  id: '201',
  title: '官方剧',
  onlineVersion: 1,
  publishStatus: 'draft',
} as DramaListItem
const task = {
  id: '701',
  dramaId: '201',
  ownerApplicationId: '101',
  status: 'under_review',
  stage: 'poll_review',
  reviewStatus: 1,
  currentContentChanged: false,
} as TikTokPublication
const props = {
  row,
  publication: task,
  applications: [],
  loading: false,
  error: '',
  onClose: vi.fn(),
  onRefresh: vi.fn(),
}

test('连载更新同时显示真实线上范围和冻结新增范围，不使用草稿集数冒充', () => {
  const drama = {
    episodes: [],
    onlineEpisodeNumbers: Array.from({ length: 11 }, (_, i) => i + 1),
  } as unknown as Drama
  render(
    <OfficialPublicationDetailsDrawer
      {...props}
      drama={drama}
      publication={{
        ...task,
        contentSummary: {
          episodeNumbers: Array.from({ length: 40 }, (_, i) => i + 1),
          previousEpisodeNumbers: drama.onlineEpisodeNumbers!,
        },
      }}
    />,
  )
  expect(screen.getByText('当前已上线 · V1')).toBeInTheDocument()
  expect(screen.getByText('已上线 11 集 · 第 1–11 集')).toBeInTheDocument()
  expect(
    screen.getByText('更新剧集 · 新增第 12–40 集，共 29 集'),
  ).toBeInTheDocument()
  expect(
    screen.queryByRole('button', { name: '确认上线' }),
  ).not.toBeInTheDocument()
})

test('历史范围未知时明确未知，不从当前草稿补造范围', () => {
  render(<OfficialPublicationDetailsDrawer {...props} />)
  expect(screen.getByText('本次内容范围未记录')).toBeInTheDocument()
  expect(screen.queryByText(/已上线.*集/)).not.toBeInTheDocument()
})

test('审核意见按平台集 ID 映射到真实集数与标题', () => {
  const drama = {
    episodes: [
      {
        number: 3,
        title: 'Episode 3',
        platformEpisodeId: '7686905694566713364',
      },
    ],
  } as Drama
  render(
    <OfficialPublicationDetailsDrawer
      {...props}
      drama={drama}
      publication={{
        ...task,
        status: 'rejected',
        reviewStatus: 3,
        episodeIdsBySequence: { 3: '7686905694566713364' },
        reviewFailReasons: [
          'Episode (7686905694566713364): Episode Video: policy reason',
        ],
      }}
    />,
  )
  expect(screen.getByText('第 3 集 · Episode 3')).toBeInTheDocument()
  expect(
    screen.getByText('TikTok Episode ID：7686905694566713364'),
  ).toBeInTheDocument()
  expect(screen.getByText('Episode Video: policy reason')).toBeInTheDocument()
})

test('历史下线失败提示推荐移除，原始平台错误不可展示', () => {
  render(
    <OfficialPublicationDetailsDrawer
      {...props}
      publication={{
        ...task,
        status: 'failed',
        stage: 'delist_album',
        errorCode: 'publication_in_recommendations',
        errorMessage: 'private token=secret',
      }}
    />,
  )
  expect(
    screen.getByText(
      '请先从官方轮播或热播中移除该短剧，再重试下线；当前线上内容保持不变。',
    ),
  ).toBeInTheDocument()
  expect(screen.queryByText('private token=secret')).not.toBeInTheDocument()
})

test('申诉单项通过与整个版本通过分别展示，保留其他意见', () => {
  render(
    <OfficialPublicationDetailsDrawer
      {...props}
      publication={{
        ...task,
        status: 'rejected',
        reviewStatus: 3,
        appeal: { itemId: '102', itemType: 2, reason: '请复核' },
        reviewItems: { 102: 6, 103: 3 },
      }}
    />,
  )
  expect(
    screen.getByText(
      '本次申诉项目已通过，当前版本仍有其他被拒项目，请继续处理审核意见。',
    ),
  ).toBeInTheDocument()
})

test('转码进度区分已完成集与检查时间，技术编号按需展开', () => {
  render(
    <OfficialPublicationDetailsDrawer
      {...props}
      publication={{
        ...task,
        status: 'failed',
        stage: 'transcode_videos',
        errorCode: 'transcode_stalled',
        transcodes: [
          {
            taskId: 'task-private',
            vids: ['a', 'b', 'c'],
            completedVids: ['a', 'b'],
            ready: false,
            startedAt: '2026-09-05T12:00:00Z',
            lastProgressAt: '2026-09-05T12:15:00Z',
            lastCheckedAt: '2026-09-05T12:40:00Z',
          },
        ],
      }}
    />,
  )
  const progress = screen.getByRole('region', { name: '分集处理进度' })
  expect(within(progress).getByText('2 / 3 集')).toBeInTheDocument()
  expect(
    within(progress).getByText('等待时长：40 分钟（截至最近检查）'),
  ).toBeInTheDocument()
  expect(screen.queryByText('任务编号：701')).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('处理详情与诊断'))
  expect(screen.getByText('任务编号：701')).toBeInTheDocument()
})
