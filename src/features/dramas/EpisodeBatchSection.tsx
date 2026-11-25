import { Alert, Button, Drawer, Dropdown, Flex, Form, Grid, InputNumber, Progress, Space, Table, Tag, Typography, Upload, type MenuProps, type TableColumnsType } from 'antd'
import { ArrowDown, ArrowUp, CloudUpload, MoreHorizontal, Pencil, RefreshCcw, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { canResumeDirectConfirmation, hasMediaWorkToSubmit, type EpisodeDraft } from './episodeDraft'
import { filterEpisodeQueue, moveEpisodeToPosition, prepareEpisodeFiles, summarizeEpisodeQueue, type EpisodeQueueFilter } from './episodeUploadQueue'

interface EpisodeBatchSectionProps {
  // albumTitle 用于新分集的默认标题。
  albumTitle: string
  // value 是当前分集清单及每集独立的上传状态。
  value: EpisodeDraft[]
  // disabled 在缺少编辑权限或内容锁定时禁止修改分集。
  disabled?: boolean
  // busy 表示保存或上传正在执行；禁止重复提交和调整集序，但允许预先补选未完成的本地文件。
  busy?: boolean
  // uploadDisabled 表示当前用户缺少媒资上传权限。
  uploadDisabled?: boolean
  // frozenThrough 本次处理中不可调整的前缀集数；后续新增分集可以独立准备。
  frozenThrough?: number
  // onChange 仅更新待保存的分集清单，不立即上传文件。
  onChange: (value: EpisodeDraft[]) => void
  // onUpload 按稳定临时标识上传或重试一集，不处理其他分集。
  onUpload?: (clientId: string) => void
}

const acceptedVideoTypes = 'video/*,.mp4,.mov,.mkv,.avi,.flv,.mpeg,.mts,.m4s,.wmv,.rm,.rmvb'

// EpisodeBatchSection 支持核对集序、独立选择文件和单集重试，并区分传输与处理状态。
export function EpisodeBatchSection({ albumTitle, value, disabled, busy, uploadDisabled, frozenThrough = 0, onChange, onUpload }: EpisodeBatchSectionProps) {
  const screens = Grid.useBreakpoint()
  const mediaDisabled = disabled || uploadDisabled
  const structureDisabled = disabled || busy
  const synchronizedAlbumTitle = useRef<string | null>(null)
  const [editingClientId, setEditingClientId] = useState('')
  const [editingPosition, setEditingPosition] = useState(1)
  const [filter, setFilter] = useState<EpisodeQueueFilter>('all')
  const [selectionNotice, setSelectionNotice] = useState('')
  const editingEpisode = useMemo(() => value.find((episode) => episode.clientId === editingClientId), [editingClientId, value])
  const editingIndex = editingEpisode ? value.findIndex((episode) => episode.clientId === editingEpisode.clientId) : -1
  const summary = useMemo(() => summarizeEpisodeQueue(value), [value])
  const filteredEpisodes = useMemo(() => filterEpisodeQueue(value, filter), [filter, value])
  const uploading = value.some((episode) => episode.uploadState === 'uploading')
  const processing = value.some((episode) => episode.uploadState === 'processing')
  const ready = summary.total > 0 && summary.ready === summary.total
  const reselectableEpisodes = value.filter((episode) => episode.number > frozenThrough
    && ['missing', 'failed'].includes(episode.uploadState)
    && !episode.file && !episode.vid && !episode.pendingVid
    && episode.expectedFileName && !hasMediaWorkToSubmit([episode]))

  useEffect(() => {
    if (synchronizedAlbumTitle.current === albumTitle) return
    synchronizedAlbumTitle.current = albumTitle
    if (!value.some((episode, index) => episode.number > frozenThrough && episode.autoTitle && episode.title !== defaultTitle(albumTitle, index + 1))) return
    onChange(value.map((episode, index) => episode.number > frozenThrough && episode.autoTitle ? { ...episode, title: defaultTitle(albumTitle, index + 1) } : episode))
  }, [albumTitle, frozenThrough, onChange, value])

  const appendFiles = (files: File[]) => {
    if (mediaDisabled || files.length === 0) return
    const prepared = prepareEpisodeFiles(files, value.flatMap((episode) => episode.file ? [episode.file] : []))
    setSelectionNotice(prepared.duplicateCount > 0
      ? `已按文件名排序，忽略 ${prepared.duplicateCount} 个重复文件`
      : prepared.files.length > 1 ? '已按文件名中的数字自然排序' : '')
    if (prepared.files.length === 0) return
    const next = [...value]
    for (const file of prepared.files) {
      const emptyEpisodeIndex = next.findIndex((episode) => (
        episode.number > frozenThrough && ['missing', 'failed'].includes(episode.uploadState) && !episode.file && !episode.vid && !episode.pendingVid
      ))
      if (emptyEpisodeIndex >= 0) {
        next[emptyEpisodeIndex] = withSelectedFile(next[emptyEpisodeIndex], file)
        continue
      }
      const number = next.length + 1
      next.push({
        clientId: createClientId(), number, title: defaultTitle(albumTitle, number), description: "", posterUrl: "", durationSeconds: 0,
        vid: '', file, expectedFileName: file.name, expectedFileSize: file.size, pendingVid: '', pendingUploadId: '', pendingUploadRequestId: '', uploadState: 'waiting', progress: 0, error: '', autoTitle: true,
      })
    }
    onChange(next)
  }

  const reselectFiles = (files: File[]) => {
    if (mediaDisabled || files.length === 0) return
    const prepared = prepareEpisodeFiles(files, value.flatMap((episode) => episode.file ? [episode.file] : []))
    const next = [...value]
    let matched = 0
    // 恢复时只按原文件名和大小匹配；同名同大小对应多集时再用修改时间消歧，不能按集序猜测。
    for (const file of prepared.files) {
      const candidates = reselectableEpisodes.filter((episode) => !next.find((item) => item.clientId === episode.clientId)?.file
        && episode.expectedFileName === file.name
        && (episode.expectedFileSize === undefined || episode.expectedFileSize === file.size))
      const exactTime = candidates.filter((episode) => episode.expectedFileLastModified === file.lastModified)
      const target = candidates.length === 1 ? candidates[0] : exactTime.length === 1 ? exactTime[0] : undefined
      if (!target) continue
      const index = next.findIndex((episode) => episode.clientId === target.clientId)
      next[index] = withSelectedFile(next[index], file)
      matched += 1
    }
    if (matched > 0) onChange(next)
    const unmatched = prepared.files.length - matched
    setSelectionNotice(matched > 0
      ? `已为 ${matched} 集重新选择文件${unmatched > 0 ? `；${unmatched} 个文件未匹配，请核对原文件名和大小` : ''}${prepared.duplicateCount > 0 ? `；忽略 ${prepared.duplicateCount} 个重复文件` : ''}`
      : `没有匹配的文件。请核对原文件名和大小，或在对应分集重新选择${prepared.duplicateCount > 0 ? `；忽略 ${prepared.duplicateCount} 个重复文件` : ''}`)
  }

  const patch = (clientId: string, patchValue: Partial<EpisodeDraft>) => {
    onChange(value.map((episode) => episode.clientId === clientId ? { ...episode, ...patchValue } : episode))
  }

  const replace = (episode: EpisodeDraft, file: File) => {
    if (episode.number <= frozenThrough || mediaDisabled) return
    patch(episode.clientId, withSelectedFile(episode, file))
  }

  const move = (index: number, offset: number) => {
    const target = index + offset
    if (structureDisabled || index < frozenThrough || target < frozenThrough || target >= value.length) return
    onChange(moveEpisodeToPosition(value, value[index].clientId, target + 1, albumTitle))
  }

  const remove = (clientId: string) => {
    if (structureDisabled || value.find(episode => episode.clientId === clientId)!.number <= frozenThrough) return
    onChange(resequence(value.filter((episode) => episode.clientId !== clientId), albumTitle))
    if (editingClientId === clientId) setEditingClientId('')
  }

  const openEdit = (episode: EpisodeDraft) => {
    if (structureDisabled || episode.number <= frozenThrough) return
    setEditingClientId(episode.clientId)
    setEditingPosition(episode.number)
  }

  const closeEdit = () => {
    setEditingClientId('')
    setEditingPosition(1)
  }


  const saveEdit = () => {
    if (!editingEpisode || structureDisabled || editingEpisode.number <= frozenThrough || editingPosition <= frozenThrough) return
    onChange(moveEpisodeToPosition(value, editingEpisode.clientId, editingPosition, albumTitle))
    closeEdit()
  }

  const episodeMenu = (episode: EpisodeDraft, index: number): MenuProps => ({
    items: [
      { key: 'up', icon: <ArrowUp size={14} />, label: '上移', disabled: structureDisabled || index <= frozenThrough },
      { key: 'down', icon: <ArrowDown size={14} />, label: '下移', disabled: structureDisabled || index === value.length - 1 },
      { type: 'divider' },
      { key: 'delete', icon: <Trash2 size={14} />, label: '删除', danger: true, disabled: structureDisabled },
    ],
    onClick: ({ key }) => {
      if (key === 'up') move(index, -1)
      if (key === 'down') move(index, 1)
      if (key === 'delete') remove(episode.clientId)
    },
  })

  const batchStatus = uploading ? '上传中' : processing ? '后台处理中' : summary.failed > 0 ? `${summary.failed} 集失败` : ready ? '已就绪' : '等待上传'
  const batchStatusColor = uploading || processing ? 'processing' : summary.failed > 0 ? 'error' : ready ? 'success' : undefined
  const columns: TableColumnsType<EpisodeDraft> = [
    {
      title: '集数',
      key: 'number',
      width: 72,
      render: (_, episode) => <Typography.Text strong>{episode.number}</Typography.Text>,
    },
    {
      title: '视频',
      key: 'content',
      render: (_, episode) => (
        <Flex vertical gap={3}>
          <Space size="small" wrap>
            <Typography.Text strong>{episode.title}</Typography.Text>
            {(episode.file || episode.expectedFileSize) && <Typography.Text type="secondary">{formatBytes(episode.file?.size || episode.expectedFileSize || 0)}</Typography.Text>}
          </Space>
          <Typography.Text type="secondary" ellipsis>{episode.file?.name || episode.expectedFileName || (episode.vid ? '视频已上传' : '待选择视频')}</Typography.Text>
          {episode.vid && <Typography.Text className="episode-media-id" type="secondary" copyable={{ text: episode.vid }} ellipsis={{ tooltip: episode.vid }}>BytePlus VID：{episode.vid}</Typography.Text>}
          <Typography.Text className="episode-media-id" type="secondary" copyable={episode.platformEpisodeId ? { text: episode.platformEpisodeId } : undefined} ellipsis={episode.platformEpisodeId ? { tooltip: episode.platformEpisodeId } : undefined}>
            TikTok Episode ID：{episode.platformEpisodeId || '同步到 TikTok 后生成'}
          </Typography.Text>
        </Flex>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 160,
      render: (_, episode) => (
        <Flex vertical gap={4}>
          <Flex><Tag color={statusColor(episode)}>{statusLabel(episode)}</Tag></Flex>
          {episode.uploadState === 'uploading' && (
            <Progress size="small" percent={episode.progress} aria-label={`第 ${episode.number} 集上传进度 ${episode.progress}%`} />
          )}
          {episode.error && <Typography.Text type="danger">{episode.error}</Typography.Text>}
        </Flex>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 220,
      // 窄屏允许整表横向滚动，固定操作列会遮住视频名称和状态。
      fixed: screens.md ? 'right' : undefined,
      render: (_, episode) => {
        const index = value.findIndex((item) => item.clientId === episode.clientId)
        if (episode.number <= frozenThrough) return <Typography.Text type="secondary">本批已冻结</Typography.Text>
        return (
          <Space wrap>
            {!uploadDisabled && onUpload && hasMediaWorkToSubmit([episode]) && <Button size="small" disabled={structureDisabled} onClick={() => onUpload(episode.clientId)} aria-label={`${episode.uploadState === 'failed' ? '重试' : '上传'}第 ${episode.number} 集`}>{canResumeDirectConfirmation(episode) ? '继续确认' : episode.uploadState === 'failed' ? '重试' : '上传'}</Button>}
            {!uploadDisabled && ['missing', 'failed'].includes(episode.uploadState) && !hasMediaWorkToSubmit([episode]) && <Upload accept={acceptedVideoTypes} showUploadList={false} disabled={mediaDisabled} beforeUpload={(file) => { replace(episode, file as unknown as File); return Upload.LIST_IGNORE }}><Button size="small" disabled={mediaDisabled} aria-label={`重新选择第 ${episode.number} 集视频`}>重新选文件</Button></Upload>}
            <Button size="small" icon={<Pencil size={15} />} disabled={structureDisabled} aria-label={`编辑第 ${episode.number} 集`} onClick={() => openEdit(episode)}>调整</Button>
            <Dropdown menu={episodeMenu(episode, index)} trigger={['click']}>
              <Button size="small" icon={<MoreHorizontal size={15} />} disabled={structureDisabled} aria-label={`第 ${episode.number} 集操作`}>操作</Button>
            </Dropdown>
          </Space>
        )
      },
    },
  ]

  return (
    <>
      <section aria-labelledby="episode-upload-title">
        <Flex vertical gap="middle">
          <Flex align="flex-start" justify="space-between" gap="middle" wrap>
            <Flex vertical gap={2}>
              <Typography.Text id="episode-upload-title" strong>视频上传 · {summary.total}</Typography.Text>
              <Typography.Text type="secondary">选文件后先核对集序，再开始上传；缺文件的分集可稍后补充。</Typography.Text>
            </Flex>
            <Tag color={batchStatusColor}>{batchStatus}</Tag>
          </Flex>
          {reselectableEpisodes.length > 0 && (
            <Flex align="center" justify="space-between" gap="small" wrap>
              <Typography.Text type="secondary">{reselectableEpisodes.length} 集可批量重选原文件；按文件名和大小匹配，未匹配的文件不会改动分集。</Typography.Text>
              <Upload
                multiple
                accept={acceptedVideoTypes}
                showUploadList={false}
                disabled={mediaDisabled}
                beforeUpload={(file, fileList) => {
                  if (file.uid === fileList[0]?.uid) reselectFiles(fileList.map((item) => item as unknown as File))
                  return Upload.LIST_IGNORE
                }}
              >
                <Button icon={<RefreshCcw size={15} />} disabled={mediaDisabled} aria-label="批量重选文件">批量重选文件（{reselectableEpisodes.length} 集）</Button>
              </Upload>
            </Flex>
          )}
          <Upload.Dragger
            multiple
            accept={acceptedVideoTypes}
            showUploadList={false}
            disabled={mediaDisabled}
            aria-label="选择剧集视频"
            beforeUpload={(file, fileList) => {
              if (file.uid === fileList[0]?.uid) appendFiles(fileList.map((item) => item as unknown as File))
              return false
            }}
          >
            <Flex vertical align="center" gap="small">
              <CloudUpload size={28} />
              <Typography.Text strong>选择剧集视频</Typography.Text>
              <Typography.Text type="secondary">新增视频可一次选择多个；按文件名数字排序并依次补充未完成分集</Typography.Text>
            </Flex>
          </Upload.Dragger>
          {selectionNotice && <Alert role="alert" type="info" showIcon title={selectionNotice} closable onClose={() => setSelectionNotice('')} />}

          <Flex justify="space-between" align="center" gap="small" wrap>
            <Flex role="group" aria-label="剧集状态筛选" gap="small" wrap>
              <FilterButton active={filter === 'all'} label={`全部 ${summary.total}`} onClick={() => setFilter('all')} />
              <FilterButton active={filter === 'pending'} label={`待处理 ${summary.pending}`} onClick={() => setFilter('pending')} />
              <FilterButton active={filter === 'active'} label={`处理中 ${summary.active}`} onClick={() => setFilter('active')} />
              <FilterButton active={filter === 'failed'} label={`失败 ${summary.failed}`} onClick={() => setFilter('failed')} />
              <FilterButton active={filter === 'ready'} label={`已完成 ${summary.ready}`} onClick={() => setFilter('ready')} />
            </Flex>
            <Typography.Text type="secondary">{summary.ready}/{summary.total} 已完成</Typography.Text>
          </Flex>

          {summary.total > 0 && <Progress percent={summary.progress} aria-label={`批次上传进度 ${summary.progress}%`} />}

          <Table<EpisodeDraft>
            columns={columns}
            dataSource={filteredEpisodes}
            rowKey="clientId"
            size="small"
            scroll={{ x: 620 }}
            locale={{ emptyText: filter === 'all' ? '尚未添加剧集视频' : '当前筛选没有剧集' }}
            pagination={{
              defaultPageSize: 20,
              pageSizeOptions: [20, 50, 100],
              showSizeChanger: true,
              showTotal: (total) => `共 ${total} 集`,
            }}
          />
        </Flex>
      </section>

      {editingEpisode && (
        <Drawer
          title="调整剧集"
          aria-label="调整剧集"
          open
          size="default"
          onClose={closeEdit}
          extra={<Button type="primary" aria-label="保存" disabled={structureDisabled} onClick={saveEdit}>保存</Button>}
        >
          <Form layout="vertical" variant="filled">
            <Form.Item label="集数位置" required>
              <Flex vertical gap={4}>
                <InputNumber
                  min={frozenThrough + 1}
                  max={value.length}
                  value={editingPosition}
                  disabled={structureDisabled}
                  aria-label="目标集数"
                  onChange={(next) => setEditingPosition(next ?? editingEpisode.number)}
                />
                <Typography.Text type="secondary">输入目标集数，保存后自动重排其他剧集。</Typography.Text>
              </Flex>
            </Form.Item>
            <Form.Item label="视频文件" required>
              <Flex vertical gap="small">
                <Typography.Text strong>{editingEpisode.file?.name || editingEpisode.expectedFileName || (editingEpisode.vid ? '视频已上传' : '待选择视频')}</Typography.Text>
                <Typography.Text type="secondary">{statusLabel(editingEpisode)}</Typography.Text>
                <Upload
                  accept={acceptedVideoTypes}
                  showUploadList={false}
                  disabled={mediaDisabled}
                  beforeUpload={(file) => {
                    replace(editingEpisode, file as unknown as File)
                    return Upload.LIST_IGNORE
                  }}
                >
                  <Button icon={<RefreshCcw size={15} />} disabled={mediaDisabled} aria-label={`替换第 ${editingIndex + 1} 集视频`}>重新选择视频</Button>
                </Upload>
              </Flex>
            </Form.Item>
          </Form>
        </Drawer>
      )}
    </>
  )
}

function resequence(value: EpisodeDraft[], albumTitle: string): EpisodeDraft[] {
  return value.map((episode, index) => ({ ...episode, number: index + 1, title: episode.autoTitle ? defaultTitle(albumTitle, index + 1) : episode.title }))
}


function FilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return <Button size="small" type={active ? 'primary' : 'default'} aria-pressed={active} onClick={onClick}>{label}</Button>
}

function defaultTitle(albumTitle: string, number: number): string {
  return `${albumTitle.trim() || '短剧'} Episode ${number}`
}

function statusLabel(episode: EpisodeDraft): string {
  switch (episode.uploadState) {
    case 'waiting': return '等待上传'
    case 'uploading': return `上传中 ${episode.progress}%`
    case 'processing': return '后台处理中'
    case 'ready': return '已就绪'
    case 'failed': return episode.mediaJobId ? '处理失败' : episode.pendingVid ? '确认失败' : '上传失败'
    default: return '待选择'
  }
}

function statusColor(episode: EpisodeDraft): string | undefined {
  if (episode.uploadState === 'ready') return 'success'
  if (episode.uploadState === 'failed') return 'error'
  if (episode.uploadState === 'uploading' || episode.uploadState === 'processing') return 'processing'
  return undefined
}

function createClientId(): string {
  return crypto.randomUUID?.() || `episode-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function withSelectedFile(episode: EpisodeDraft, file: File): EpisodeDraft {
  const sameFile = Boolean(episode.pendingUploadId)
    && episode.expectedFileName === file.name
    && episode.expectedFileSize === file.size
    && episode.expectedFileLastModified === file.lastModified
    && episode.expectedFileType === file.type
  return {
    ...episode,
    file,
    expectedFileName: file.name,
    expectedFileSize: file.size,
    expectedFileLastModified: file.lastModified,
    expectedFileType: file.type,
    expectedFileFingerprint: sameFile ? episode.expectedFileFingerprint : undefined,
    pendingVid: '',
    // 基础身份一致时暂留原预留；上传前还会用内容摘要完成最终核对。
    pendingUploadId: sameFile ? episode.pendingUploadId : '',
    pendingUploadRequestId: '',
    mediaJobId: undefined,
    uploadState: 'waiting',
    progress: 0,
    error: '',
  }
}

function formatBytes(value: number): string {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`
  return `${(value / 1024 ** 2).toFixed(1)} MB`
}
