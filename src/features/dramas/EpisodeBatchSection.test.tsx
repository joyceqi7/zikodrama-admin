import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { EpisodeBatchSection } from './EpisodeBatchSection'
import type { EpisodeDraft } from './episodeDraft'

test('已同步分集展示 BytePlus VID 和 TikTok Episode ID', () => {
  render(<EpisodeBatchSection albumTitle="测试短剧" value={[{ ...draft(1, 'ready'), vid: 'v-byteplus-1', platformEpisodeId: '7686905694566713364' }]} onChange={vi.fn()} />)
  expect(screen.getByText('BytePlus VID：v-byteplus-1')).toBeInTheDocument()
  expect(screen.getByText('TikTok Episode ID：7686905694566713364')).toBeInTheDocument()
})

test('batch selection fills an existing episode without media instead of appending another episode', () => {
  const existing = draft(1, 'missing')
  const onChange = vi.fn()
  render(<EpisodeBatchSection albumTitle="测试短剧" value={[existing]} onChange={onChange} />)

  const file = new File(['video'], 'episode-01.mp4', { type: 'video/mp4' })
  const control = screen.getByLabelText('选择剧集视频')
  const input = control instanceof HTMLInputElement ? control : control.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('File input not found')
  fireEvent.change(input, { target: { files: [file] } })

  expect(onChange).toHaveBeenCalledTimes(1)
  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({
      clientId: 'episode-1',
      id: 'episode-1',
      number: 1,
      file,
      uploadState: 'waiting',
    }),
  ])
})

test('batch selection naturally orders files and reports ignored duplicates', () => {
  const onChange = vi.fn()
  render(<EpisodeBatchSection albumTitle="测试短剧" value={[]} onChange={onChange} />)

  const episode10 = new File(['10'], 'episode-10.mp4', { type: 'video/mp4', lastModified: 10 })
  const episode2 = new File(['2'], 'episode-2.mp4', { type: 'video/mp4', lastModified: 2 })
  const episode1 = new File(['1'], 'episode-1.mp4', { type: 'video/mp4', lastModified: 1 })
  const duplicate = new File(['2'], 'episode-2.mp4', { type: 'video/mp4', lastModified: 2 })
  selectFiles([episode10, episode2, episode1, duplicate])

  const next = onChange.mock.calls[0]?.[0] as EpisodeDraft[]
  expect(next.map((episode) => episode.file?.name)).toEqual(['episode-1.mp4', 'episode-2.mp4', 'episode-10.mp4'])
  expect(screen.getByRole('alert')).toHaveTextContent('已按文件名排序，忽略 1 个重复文件')
})

test('页面恢复后一次重选多个文件，按原文件名和大小匹配而不占用前面的空位', () => {
  const first = { ...draft(1, 'failed'), expectedFileName: 'EP1.mp4', expectedFileSize: 1 }
  const second = { ...draft(2, 'failed'), expectedFileName: 'EP2.mp4', expectedFileSize: 2 }
  const third = { ...draft(3, 'failed'), expectedFileName: 'EP3.mp4', expectedFileSize: 3 }
  const ready = draft(4, 'ready')
  const onChange = vi.fn()
  render(<EpisodeBatchSection albumTitle="测试短剧" value={[first, second, third, ready]} onChange={onChange} />)

  const file3 = new File(['333'], 'EP3.mp4', { type: 'video/mp4' })
  const wrongFile1 = new File(['wrong'], 'EP1.mp4', { type: 'video/mp4' })
  const file2 = new File(['22'], 'EP2.mp4', { type: 'video/mp4' })
  selectReselectedFiles([file3, wrongFile1, file2])

  const next = onChange.mock.calls[0]?.[0] as EpisodeDraft[]
  expect(onChange).toHaveBeenCalledTimes(1)
  expect(next[0]).toEqual(first)
  expect(next[1]).toMatchObject({ clientId: second.clientId, file: file2, uploadState: 'waiting' })
  expect(next[2]).toMatchObject({ clientId: third.clientId, file: file3, uploadState: 'waiting' })
  expect(next[3]).toEqual(ready)
  expect(screen.getByRole('alert')).toHaveTextContent('已为 2 集重新选择文件；1 个文件未匹配')
})

test('批量重选遇到同名同大小的多个分集时不猜测集序', () => {
  const sameFile = { expectedFileName: 'same.mp4', expectedFileSize: 2 }
  const onChange = vi.fn()
  render(<EpisodeBatchSection albumTitle="测试短剧" value={[
    { ...draft(1, 'failed'), ...sameFile },
    { ...draft(2, 'failed'), ...sameFile },
  ]} onChange={onChange} />)

  selectReselectedFiles([new File(['22'], 'same.mp4', { type: 'video/mp4' })])

  expect(onChange).not.toHaveBeenCalled()
  expect(screen.getByRole('alert')).toHaveTextContent('没有匹配的文件')
})

test('单集上传期间允许批量补选其他分集，但禁止重复提交和调整集序', () => {
  const onChange = vi.fn()
  const onUpload = vi.fn()
  render(<EpisodeBatchSection albumTitle="测试短剧" value={[draft(1, 'uploading'), draft(2, 'failed')]} busy onChange={onChange} onUpload={onUpload} />)

  expect(screen.getByLabelText('重新选择第 2 集视频')).toBeEnabled()
  expect(screen.getByLabelText('编辑第 2 集')).toBeDisabled()

  const file = new File(['video'], 'episode-2.mp4', { type: 'video/mp4' })
  selectFiles([file])

  expect(onChange).toHaveBeenCalledWith([
    expect.objectContaining({ clientId: 'episode-1', uploadState: 'uploading' }),
    expect.objectContaining({ clientId: 'episode-2', file, uploadState: 'waiting' }),
  ])
  expect(onUpload).not.toHaveBeenCalled()
})

test('operator filters a large queue by status and moves an episode directly to a target position', () => {
  const episodes = [draft(1, 'ready'), draft(2, 'failed'), draft(3, 'waiting')]
  const onChange = vi.fn()
  render(<EpisodeBatchSection albumTitle="测试短剧" value={episodes} onChange={onChange} />)

  expect(screen.getByRole('button', { name: '全部 3' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '失败 1' }))
  expect(screen.getByText('测试短剧 Episode 2')).toBeInTheDocument()
  expect(screen.queryByText('测试短剧 Episode 1')).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '全部 3' }))
  fireEvent.click(screen.getByRole('button', { name: '编辑第 3 集' }))
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  expect(screen.queryByText('VID vid-1')).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('spinbutton', { name: '目标集数' }), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))

  const moved = onChange.mock.calls.at(-1)?.[0] as EpisodeDraft[]
  expect(moved.map((episode) => episode.clientId)).toEqual(['episode-3', 'episode-1', 'episode-2'])
  expect(moved.map((episode) => episode.number)).toEqual([1, 2, 3])
  expect(moved.map((episode) => episode.title)).toEqual(['测试短剧 Episode 1', '测试短剧 Episode 2', '测试短剧 Episode 3'])
}, 40_000)

test('large queues render twenty episodes per page by default', () => {
  render(<EpisodeBatchSection albumTitle="测试短剧" value={Array.from({ length: 25 }, (_, index) => draft(index + 1, 'waiting'))} onChange={vi.fn()} />)

  expect(screen.getByText('共 25 集')).toBeInTheDocument()
  expect(screen.getByText('测试短剧 Episode 20')).toBeInTheDocument()
  expect(screen.queryByText('测试短剧 Episode 21')).not.toBeInTheDocument()

  fireEvent.click(screen.getByTitle('Next Page'))
  expect(screen.getByText('测试短剧 Episode 21')).toBeInTheDocument()
})

test('VOD processing is shown as a state without fabricated percentage progress', () => {
  render(<EpisodeBatchSection albumTitle="测试短剧" value={[{ ...draft(1, 'processing'), progress: 100 }]} onChange={vi.fn()} />)

  expect(screen.getAllByText('后台处理中')).toHaveLength(2)
  expect(screen.queryByLabelText('第 1 集上传进度 100%')).not.toBeInTheDocument()
  expect(screen.getByLabelText('批次上传进度 100%')).toBeInTheDocument()
})

function selectFiles(files: File[]) {
  const control = screen.getByLabelText('选择剧集视频')
  const input = control instanceof HTMLInputElement ? control : control.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('File input not found')
  fireEvent.change(input, { target: { files } })
}

function selectReselectedFiles(files: File[]) {
  const button = screen.getByRole('button', { name: '批量重选文件' })
  const input = button.closest('.ant-upload')?.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error('Batch reselection file input not found')
  fireEvent.change(input, { target: { files } })
}

function draft(number: number, uploadState: EpisodeDraft['uploadState']): EpisodeDraft {
  return {
    clientId: `episode-${number}`,
    id: `episode-${number}`,
    number,
    title: `测试短剧 Episode ${number}`,
    description: '',
    posterUrl: '',
    durationSeconds: 0,
    vid: uploadState === 'ready' ? `vid-${number}` : '',
    pendingVid: '',
    pendingUploadRequestId: '',
    uploadState,
    progress: uploadState === 'ready' ? 100 : uploadState === 'failed' ? 30 : 0,
    error: uploadState === 'failed' ? '上传失败' : '',
    autoTitle: true,
  }
}
