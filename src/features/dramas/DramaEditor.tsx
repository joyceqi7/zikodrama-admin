import { Alert, Button, Col, Empty, Flex, Form, Image, Progress, Row, Space, Tabs, Typography, Upload, type UploadFile } from 'antd'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ApiError, type OperationsApi } from '../../api'
import { dramaToInput, emptyDramaInput, permissionCodes, type Drama, type DramaInput, type DramaMetadataReference, type MediaJob } from '../../domain'
import { createBytePlusUploader, DirectUploadError, type DirectMediaUploader } from '../../media/byteplusUploader'
import { toUserMessage, UserFacingError } from '../../userMessage'
import { ConfirmDialog } from '../../components/Modal'
import { DramaBasicFields } from './DramaBasicFields'
import { EpisodeBatchSection } from './EpisodeBatchSection'
import { canResumeDirectConfirmation, episodeDraftsFromEpisodes, hasMediaWorkToSubmit, isSupportedMediaFileName, mediaJobPatch, mergeEpisodeMediaJobs, reconcileEpisodeDraft, shouldRetryMediaJob, type EpisodeDraft } from './episodeDraft'
import { patchEpisodeAtIndex } from './episodeUploadQueue'
import { PageHeader, PageStack } from '../../components/PageHeader'
import { clearUploadBatch, createUploadBatchId, patchUploadBatchAfterTransfer, persistUploadBatch, restoreUploadBatch } from './uploadBatchPersistence'
import { reportDramaFailure } from './dramaEditorErrors'
import { identifyUploadFile, matchesUploadFileIdentity } from './uploadFileIdentity'

interface DramaEditorProps {
  // api 提供内容草稿保存与媒资任务。
  api: OperationsApi
  // initial 是进入编辑页时的草稿快照；新建时为空。
  initial?: Drama | null
  // userId 是本地上传批次隔离使用的管理员字符串标识。
  userId: string
  // can 检查当前会话拥有的操作权限。
  can: (permission: string) => boolean
  // onClose 返回目录，不取消已经进入服务端的处理任务。
  onClose: () => void
  // onSaved 通知目录更新已保存的草稿。
  onSaved: (drama: Drama) => void
  // onDelete 删除可编辑且未上线的短剧，失败时拒绝 Promise。
  onDelete: (drama: Drama) => Promise<void>
  // notify 展示统一的操作结果。
  notify: (message: string, tone?: 'success' | 'error') => void
  // directUploader 使用服务端临时授权将文件直传 VOD。
  directUploader?: DirectMediaUploader
}

type EditorStep = 0 | 1
type CoverUploadState = 'idle' | 'waiting' | 'uploading' | 'ready' | 'failed'

const defaultDirectUploader = createBytePlusUploader()
const maxCoverBytes = 10 * 1024 * 1024

// DramaEditor 将草稿保存与分集上传分开，保留成功媒资并支持单集恢复。
export function DramaEditor({ api, initial, userId, can, onClose, onSaved, onDelete, notify, directUploader = defaultDirectUploader }: DramaEditorProps) {
  const initialInput = initial ? dramaToInput(initial) : emptyDramaInput()
  const [recoveredBatch] = useState(() => {
    if (!initial?.id) return null
    const storage = browserLocalStorage()
    return storage ? restoreUploadBatch(storage, userId, initial.id, episodeDraftsFromEpisodes(initial.episodes)) : null
  })
  const [input, setInput] = useState<DramaInput>(initialInput)
  const [episodes, setEpisodes] = useState<EpisodeDraft[]>(() => recoveredBatch?.episodes ?? episodeDraftsFromEpisodes(initial?.episodes ?? []))
  const [uploadBatchId] = useState(() => recoveredBatch?.batchId ?? createUploadBatchId())
  const [metadata, setMetadata] = useState<DramaMetadataReference>()
  const [metadataLoading, setMetadataLoading] = useState(true)
  const [metadataError, setMetadataError] = useState('')
  const [step, setStep] = useState<EditorStep>(0)
  const [working, setWorking] = useState(false)
  const [workKind, setWorkKind] = useState<'save' | 'upload'>('save')
  // 同步锁防止重复点击在 React 更新前启动第二个保存或上传批次。
  const workLock = useRef(false)
  const lastSavedInput = useRef(initial ? draftSignature(initialInput, episodeDraftsFromEpisodes(initial.episodes)) : '')
  const [draftSaved, setDraftSaved] = useState(Boolean(initial))
  const [busyAction, setBusyAction] = useState('')
  const [formError, setFormError] = useState('')
  const [savedDramaId, setSavedDramaId] = useState(initial?.id ?? '')
  const [serverDrama, setServerDrama] = useState<Drama | null>(initial ?? null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [coverFile, setCoverFile] = useState<File>()
  const [coverPreviewUrl, setCoverPreviewUrl] = useState('')
  const [coverProgress, setCoverProgress] = useState(0)
  const [coverState, setCoverState] = useState<CoverUploadState>('idle')
  const [coverError, setCoverError] = useState('')
  const [mediaPollVersion, setMediaPollVersion] = useState(0)
  const [awaitingMediaCompletion, setAwaitingMediaCompletion] = useState(false)
  const completionNotified = useRef(false)
  const canUpload = can(permissionCodes.mediaUpload)

  useEffect(() => {
    if (!recoveredBatch) return
    notify(recoveredBatch.interruptedCount > 0
      ? `已恢复上次上传批次；${recoveredBatch.interruptedCount} 个本地文件需重新选择`
      : '已恢复上次上传批次，正在同步服务端处理状态')
  }, [notify, recoveredBatch])

  useEffect(() => () => {
    if (coverPreviewUrl.startsWith('blob:')) URL.revokeObjectURL(coverPreviewUrl)
  }, [coverPreviewUrl])

  useEffect(() => {
    let active = true
    setMetadataLoading(true)
    setMetadataError('')
    api.dramaReferenceData()
      .then((result) => {
        if (active) setMetadata(result)
      })
      .catch((error) => {
        reportDramaFailure('load drama metadata failed', error)
        if (active) setMetadataError(errorMessage(error))
      })
      .finally(() => {
        if (active) setMetadataLoading(false)
      })
    return () => {
      active = false
    }
  }, [api])

  const mediaDramaId = savedDramaId || initial?.id || ''
  useEffect(() => {
    if (!mediaDramaId) return
    const storage = browserLocalStorage()
    if (storage) persistUploadBatch(storage, userId, mediaDramaId, uploadBatchId, episodes)
  }, [episodes, mediaDramaId, uploadBatchId, userId])

  useEffect(() => {
    if (!mediaDramaId || !canUpload) return
    let active = true
    let timer = 0
    const refresh = async () => {
      try {
        const jobs = await api.listDramaMediaJobs(mediaDramaId)
        if (!active) return
        setEpisodes((current) => mergeEpisodeMediaJobs(current, jobs))
        if (jobs.some((job) => isActiveMediaJob(job))) {
          setAwaitingMediaCompletion(true)
          timer = window.setTimeout(refresh, 3000)
        }
      } catch (error) {
        reportDramaFailure('refresh drama media jobs failed', error)
        if (active) timer = window.setTimeout(refresh, 5000)
      }
    }
    void refresh()
    return () => {
      active = false
      window.clearTimeout(timer)
    }
  }, [api, canUpload, mediaDramaId, mediaPollVersion])

  const published = Boolean(serverDrama?.onlineVersion)
  const frozenThrough = 0
  const creating = !initial && !savedDramaId
  const canWrite = creating ? can(permissionCodes.dramaCreate) : can(permissionCodes.dramaUpdate)
  const coverEditable = canWrite && canUpload && !working
  const mediaReady = episodes.length > 0 && episodes.every((episode) => episode.uploadState === 'ready' && episode.vid)
  const processingEpisodeCount = episodes.filter((episode) => episode.uploadState === 'processing').length
  const uploadCandidates = episodes.filter((episode) => episode.number > frozenThrough && hasMediaWorkToSubmit([episode]))
  const missingFileCount = episodes.filter((episode) => ['missing', 'failed'].includes(episode.uploadState) && !hasMediaWorkToSubmit([episode])).length
  const activeCoverUrl = coverPreviewUrl || input.coverUrl
  const coverFileList = useMemo<UploadFile[]>(() => activeCoverUrl ? [{
      uid: 'drama-cover',
      name: coverFile?.name || '短剧封面',
      status: 'done',
      url: activeCoverUrl,
      thumbUrl: activeCoverUrl,
    }] : [], [activeCoverUrl, coverFile?.name])

  useEffect(() => {
    if (step !== 1 || !awaitingMediaCompletion || !mediaReady) return
    setAwaitingMediaCompletion(false)
    if (!completionNotified.current) {
      completionNotified.current = true
      notify('剧目、封面与分集视频已保存')
    }
    if (mediaDramaId) {
      void api.findDrama(mediaDramaId).then((refreshed) => {
        setServerDrama(refreshed)
        onSaved(refreshed)
      }).catch((error) => reportDramaFailure('refresh completed drama failed', error))
    }
  }, [api, awaitingMediaCompletion, mediaDramaId, mediaReady, notify, onSaved, step])

  const patch = <K extends keyof DramaInput>(key: K, value: DramaInput[K]) => {
    setDraftSaved(false)
    setInput((current) => ({ ...current, [key]: value }))
  }


  const selectCover = (file: File) => {
    const error = coverValidationError(file)
    if (error) {
      setCoverError(error)
      setCoverState('failed')
      return
    }
    const preview = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : ''
    setCoverFile(file)
    setDraftSaved(false)
    setCoverPreviewUrl(preview)
    setCoverProgress(0)
    setCoverError('')
    setCoverState('waiting')
    setFormError('')
  }

  const removeCover = () => {
    setCoverFile(undefined)
    setCoverPreviewUrl('')
    setCoverProgress(0)
    setCoverError('')
    setCoverState('idle')
    patch('coverUrl', '')
    return true
  }

  // persistDraft 只保存资料和分集清单；文件传输由独立入口控制。
  // 相同内容的重试复用已保存 ID，避免重复保存以及重复消费封面登记。
  const persistDraft = async (): Promise<{ drama: Drama; drafts: EpisodeDraft[] } | null> => {
    const validationError = validateDraft(input, episodes, coverFile)
    if (validationError) {
      setFormError(validationError)
      return null
    }
    if (serverDrama && !coverFile && draftSignature(input, episodes) === lastSavedInput.current) {
      setDraftSaved(true)
      return { drama: serverDrama, drafts: episodes }
    }
    let source = input
    let operation = 'save drama draft failed'
    try {
      if (coverFile) {
        operation = 'upload drama cover failed'
        setCoverState('uploading')
        setCoverProgress(0)
        setCoverError('')
        const cover = await api.uploadCover(coverFile, setCoverProgress)
        source = { ...input, coverUrl: cover.url, coverUploadId: cover.uploadId }
        setInput(source)
        setCoverFile(undefined)
        setCoverState('ready')
        setCoverProgress(100)
      }
      operation = 'save drama draft failed'
      const aggregateInput = buildAggregateInput(source, episodes)
      const drama = savedDramaId
        ? await api.updateDrama(savedDramaId, aggregateInput)
        : await api.createDrama(aggregateInput)
      const byNumber = new Map(drama.episodes.map((episode) => [episode.number, episode]))
      const drafts = episodes.map((episode, index) => {
        const persisted = byNumber.get(index + 1)
        return persisted ? reconcileEpisodeDraft({ ...episode, number: index + 1 }, persisted) : episode
      })
      // 封面登记仅消费一次。视频成功与否不改变这里的保存结果。
      const savedInput = { ...source, coverUploadId: undefined }
      setInput(savedInput)
      setSavedDramaId(drama.id)
      setServerDrama(drama)
      setEpisodes(drafts)
      lastSavedInput.current = draftSignature(savedInput, drafts)
      setDraftSaved(true)
      onSaved(drama)
      return { drama, drafts }
    } catch (error) {
      const message = reportDramaFailure(operation, error)
      if (operation === 'upload drama cover failed') {
        setCoverState('failed')
        setCoverError(message)
      }
      setFormError(message)
      notify(message, 'error')
      return null
    }
  }

  const saveDraft = async (continueToUploads = false) => {
    if (workLock.current) return
    if (!canWrite) {
      if (continueToUploads && initial) setStep(1)
      return
    }
    if (coverFile && !canUpload) return
    workLock.current = true
    setWorking(true)
    setWorkKind('save')
    setFormError('')
    try {
      const saved = await persistDraft()
      if (!saved) return
      notify('草稿已保存，视频可稍后上传')
      if (continueToUploads) setStep(1)
    } finally {
      workLock.current = false
      setWorking(false)
    }
  }

  // startUploads 仅提交有文件、待确认结果或可重试服务端任务的分集。
  // 单集入口按稳定 clientId 选取，不要求其他失败分集重新选择文件。
  const startUploads = async (clientId?: string) => {
    if (!canWrite || !canUpload || workLock.current) return
    const targets = uploadCandidates.filter((episode) => !clientId || episode.clientId === clientId)
    if (targets.length === 0) return
    if (targets.some((episode) => episode.file && (!isSupportedMediaFileName(episode.file.name) || episode.file.size === 0))) {
      setFormError('视频格式不支持或文件为空，请选择有效的 MP4、MOV、MKV 等视频文件')
      return
    }
    workLock.current = true
    setWorking(true)
    setWorkKind('upload')
    setFormError('')
    completionNotified.current = false
    try {
      const saved = await persistDraft()
      if (!saved) return
      // 先建立可恢复批次，再启动 SDK；页面快速切换时异步完成回调仍有持久化目标。
      const batchStorage = browserLocalStorage()
      if (batchStorage) persistUploadBatch(batchStorage, userId, saved.drama.id, uploadBatchId, saved.drafts)
      const targetIds = new Set(targets.map((episode) => episode.clientId))
      const uploads = saved.drafts.filter((episode) => targetIds.has(episode.clientId))
      const updateEpisode = (id: string, patchValue: Partial<EpisodeDraft>) => {
        // 并发上传和服务端轮询都只更新对应分集，不能覆盖其他分集的新状态。
        setEpisodes((current) => patchEpisodeAtIndex(current, current.findIndex((episode) => episode.clientId === id), patchValue))
      }
      let failureCount = 0
      let submittedJobCount = 0
      // 已选分集互不依赖，全部同时启动；每集的 SDK 任务独立保留上传进度和失败结果。
      await Promise.all(uploads.map(async (episode) => {
        let uploadID = episode.pendingUploadId ?? ''
        try {
          if (!episode.id) throw new UserFacingError('分集尚未保存，请重新保存草稿后上传')
          if (shouldRetryMediaJob(episode)) {
            const job = await api.retryMediaJob(episode.mediaJobId!)
            updateEpisode(episode.clientId, mediaJobPatch(episode, job))
            submittedJobCount += 1
            return
          }
          const file = episode.file
          if (!file && !canResumeDirectConfirmation(episode)) return
          updateEpisode(episode.clientId, { uploadState: 'uploading', progress: 0, error: '' })
          const queueDirectUpload = async (uploadId: string, result: { vid: string; uploadRequestId: string }) => {
            // VOD 已接收文件后就释放浏览器文件引用，确认失败只重试确认。
            const storage = browserLocalStorage()
            if (storage) patchUploadBatchAfterTransfer(storage, userId, saved.drama.id, uploadBatchId, episode, {
              pendingUploadId: uploadId, pendingVid: result.vid, pendingUploadRequestId: result.uploadRequestId,
              uploadState: 'uploading', progress: 100, error: '',
            })
            updateEpisode(episode.clientId, { file: undefined, pendingUploadId: uploadId, pendingVid: result.vid, pendingUploadRequestId: result.uploadRequestId })
            const fileName = file?.name || episode.expectedFileName
            const size = file?.size || episode.expectedFileSize
            if (!fileName || !size) throw new UserFacingError('待确认视频缺少原文件信息，请重新选择文件')
            try {
              // 页面切换后回调仍会继续；账号变更时不得借用新会话确认旧账号任务。
              if (typeof api.getSession === 'function' && api.getSession()?.user.id !== userId) {
                throw new UserFacingError('管理员账号已变化，上传结果已保留，请切回原账号后继续确认')
              }
              const job = await api.queueDirectEpisodeMedia(episode.id!, { uploadId, vid: result.vid, uploadRequestId: result.uploadRequestId, fileName, size })
              if (storage) patchUploadBatchAfterTransfer(storage, userId, saved.drama.id, uploadBatchId, episode, {
                mediaJobId: job.jobId, uploadState: 'processing', progress: 100, error: '',
              })
              updateEpisode(episode.clientId, { ...mediaJobPatch(episode, job), file: undefined })
              submittedJobCount += 1
            } catch (error) {
              if (error instanceof ApiError && error.code === 'media_upload_discarded') {
                updateEpisode(episode.clientId, { file, pendingUploadId: '', pendingVid: '', pendingUploadRequestId: '' })
              } else if (storage) {
                patchUploadBatchAfterTransfer(storage, userId, saved.drama.id, uploadBatchId, episode, {
                  uploadState: 'failed', error: '视频已上传，点击此分集的继续确认即可恢复',
                })
              }
              // 交给单集边界统一记录，保持原异常及重试语义。
              throw error
            }
          }
          if (episode.pendingVid) {
            if (!episode.pendingUploadId) throw new UserFacingError('待确认视频缺少媒资登记，请重新选择文件')
            await queueDirectUpload(episode.pendingUploadId, { vid: episode.pendingVid, uploadRequestId: episode.pendingUploadRequestId })
          } else {
            if (!file) throw new UserFacingError('浏览器无法恢复本地文件，请重新选择后重试')
            const identity = await identifyUploadFile(file)
            const resumeExisting = Boolean(episode.pendingUploadId) && matchesUploadFileIdentity({
              name: episode.expectedFileName,
              size: episode.expectedFileSize,
              lastModified: episode.expectedFileLastModified,
              type: episode.expectedFileType,
              fingerprint: episode.expectedFileFingerprint,
            }, identity)
            let authorization
            if (resumeExisting) {
              uploadID = episode.pendingUploadId!
              try {
                authorization = await api.refreshEpisodeMediaUploadAuthorization(episode.id, uploadID)
              } catch (error) {
                if (!(error instanceof ApiError) || error.status !== 409 || error.code !== 'state_conflict') throw error
                // 历史预留可能已进入后台处理；先读取原任务，避免重复上传或覆盖仍在处理的媒资。
                const job = await api.findMediaJob(uploadID)
                if (job.jobId !== uploadID || job.episodeId !== episode.id || job.fileName !== file.name || job.size !== file.size) throw error
                if (job.status === 'failed' && !job.remoteVid && job.error !== 'upload superseded') {
                  // 文件未形成远端 VID，原任务不能再续发授权，只为同一文件创建新的预留。
                  const reservation = await api.reserveEpisodeMediaUpload(episode.id, file)
                  uploadID = reservation.uploadId
                  authorization = reservation.authorization
                } else if (job.status !== 'reserved' && job.error !== 'upload superseded') {
                  updateEpisode(episode.clientId, mediaJobPatch(episode, job))
                  if (job.status !== 'failed') submittedJobCount += 1
                  return
                } else {
                  throw error
                }
              }
            } else {
              const reservation = await api.reserveEpisodeMediaUpload(episode.id, file)
              uploadID = reservation.uploadId
              authorization = reservation.authorization
            }
            updateEpisode(episode.clientId, {
              pendingUploadId: uploadID,
              expectedFileName: identity.name,
              expectedFileSize: identity.size,
              expectedFileLastModified: identity.lastModified,
              expectedFileType: identity.type,
              expectedFileFingerprint: identity.fingerprint,
            })
            // 失败保留原文件与预留信息供重试；不将视频流转交业务服务器。
            const result = await directUploader.upload(file, authorization, userId, (progress) => {
              updateEpisode(episode.clientId, { uploadState: 'uploading', progress: Math.min(100, Math.round(progress)) })
            })
            await queueDirectUpload(uploadID, result)
          }
        } catch (error) {
          failureCount += 1
          if (error instanceof DirectUploadError && episode.id && uploadID) {
            void api.reportDirectUploadDiagnostic(episode.id, uploadID, error.diagnostic).catch((diagnosticError) => {
              reportDramaFailure('report direct media upload diagnostic failed', diagnosticError)
            })
          }
          const message = reportDramaFailure('upload episode media failed', error)
          updateEpisode(episode.clientId, { uploadState: 'failed', error: message })
        }
      }))
      if (submittedJobCount > 0) {
        setAwaitingMediaCompletion(true)
        setMediaPollVersion((current) => current + 1)
      }
      if (failureCount > 0) {
        setFormError(`草稿已保存；${failureCount} 集上传或处理提交失败，可在对应分集重试`)
        notify(`${failureCount} 集未成功提交，请查看分集状态`, 'error')
      } else if (submittedJobCount > 0) {
        notify(`${submittedJobCount} 集已提交处理，请查看分集状态`)
      }
    } catch (error) {
      setFormError(reportDramaFailure('submit episode upload batch failed', error))
    } finally {
      workLock.current = false
      setWorking(false)
    }
  }

  const canDeleteDraft = Boolean(serverDrama && !published && can(permissionCodes.dramaDelete))

  const headerActions = <>
    {canDeleteDraft && <Button danger icon={<Trash2 size={17} />} disabled={working} onClick={() => setConfirmDelete(true)} aria-label="删除短剧">删除草稿</Button>}
  </>

  return (
    <section aria-label={`${input.title || '新建短剧'} 编辑页`} data-ui="drama-editor">
      <PageStack gap="large">
        <PageHeader
          title={serverDrama ? "编辑短剧" : "新增短剧"}
          eyebrow={serverDrama ? input.title : "先保存基本资料，再上传分集视频"}
          onBack={onClose}
          backLabel="返回短剧列表"
          actions={headerActions}
          divider={false}
        />
        <Tabs activeKey={String(step)} onChange={(value) => setStep(Number(value) as EditorStep)} items={[
          { key: '0', label: '基础信息', disabled: working },
          { key: '1', label: `分集视频${episodes.length ? `（${episodes.length}）` : ''}`, disabled: working || !serverDrama },
        ]} />
        {metadataError && <Alert type="error" showIcon title={`短剧元数据加载失败：${metadataError}`} />}
        {formError && <Alert type="error" showIcon title={formError} role="alert" />}

        {step === 0 && (
          <Form layout="vertical" variant="outlined" onFinish={() => void saveDraft(true)} disabled={working || (!canWrite && Boolean(initial))}>
            <PageStack gap="large">
              <DramaBasicFields input={input} onChange={patch} metadata={metadata} loading={metadataLoading} cover={
                <Flex id="cover-upload" vertical>
                        <Form.Item label="封面图" required extra="建议 9:16 竖图。JPG、PNG 或 WebP，最大 10 MB。">
                          {coverEditable ? (
                            <Upload
                              aria-label="上传短剧封面"
                              accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                              listType="picture-card"
                              fileList={coverFileList}
                              isImageUrl={() => true}
                              maxCount={1}
                              beforeUpload={(file) => {
                                selectCover(file as unknown as File)
                                return Upload.LIST_IGNORE
                              }}
                              onRemove={removeCover}
                              onPreview={(file) => {
                                if (file.url) window.open(file.url, '_blank', 'noopener,noreferrer')
                              }}
                              showUploadList={{ showPreviewIcon: true, showRemoveIcon: true, showDownloadIcon: false }}
                            >
                              {coverFileList.length === 0 && <Flex vertical align="center" gap="small"><Plus size={18} /><Typography.Text>上传</Typography.Text></Flex>}
                            </Upload>
                          ) : activeCoverUrl ? (
                            <Image width={144} src={activeCoverUrl} alt={`${input.title || '短剧'}封面`} />
                          ) : (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="未上传封面" />
                          )}
                        </Form.Item>
                        {coverFile && <Typography.Text>{coverFile.name} · {formatBytes(coverFile.size)}</Typography.Text>}
                        {coverState === 'uploading' && <Progress percent={coverProgress} aria-label={`封面上传进度 ${coverProgress}%`} />}
                        {coverError && <Alert type="error" showIcon title={coverError} />}
                      </Flex>
              } />
              <Flex justify="space-between" align="center" gap="middle" wrap data-ui="editor-actions">
                <Typography.Text type="secondary" role="status">{draftSaved ? '草稿已保存' : '修改尚未保存'}</Typography.Text>
                <Space wrap>
                  {canWrite && <Button aria-label="保存草稿" size="large" disabled={working || (Boolean(coverFile) && !canUpload)} loading={working && workKind === 'save'} onClick={() => void saveDraft()}>保存草稿</Button>}
                  <Button aria-label={canWrite ? '保存并继续' : '查看分集'} type="primary" htmlType="submit" size="large" disabled={working} loading={working && workKind === 'save'}>{canWrite ? '保存并继续' : '查看分集'}</Button>
                </Space>
              </Flex>
            </PageStack>
          </Form>
        )}

        {step === 1 && (
          <Row justify="center">
            <Col xs={24} xl={20}>
              <PageStack gap="large">
                {recoveredBatch && <Alert type="info" showIcon title="已恢复上次上传进度" description="已提交的任务会继续同步；需要本地文件的分集可使用下方「批量重选文件」，系统按原文件名和大小匹配。" />}
                {working && workKind === 'upload' && <Alert type="info" showIcon title="文件上传中，可以切换后台页面" description="请保持当前浏览器标签页打开；页头可随时查看全局上传进度。" />}
                {!working && processingEpisodeCount > 0 && <Alert type="info" showIcon title={`${processingEpisodeCount} 集已上传，正在后台处理`} description="这些分集可以离开页面后继续处理；其他未上传的本地文件仍需保留在当前页面。" />}
                {missingFileCount > 0 && <Alert type="warning" showIcon title={`${missingFileCount} 集待选择视频，不影响其他分集上传`} />}
                {mediaReady && <Alert type="success" showIcon title="全部视频已就绪" description="返回短剧列表可直接上线直连内容，或进入官方发布流程。" />}
                <EpisodeBatchSection albumTitle={input.title} value={episodes} frozenThrough={frozenThrough} onChange={(next) => { setEpisodes(next); setDraftSaved(draftSignature(input, next) === lastSavedInput.current) }} disabled={!canWrite || (working && workKind !== 'upload')} busy={working} uploadDisabled={!canUpload} onUpload={(clientId) => void startUploads(clientId)} />
                <Flex justify="space-between" align="center" gap="middle" wrap data-ui="editor-actions">
                  <Typography.Text type="secondary" role="status">{draftSaved ? '草稿已保存' : '分集清单有未保存的修改'}</Typography.Text>
                  <Space wrap>
                    <Button size="large" disabled={working} onClick={() => setStep(0)}>基础信息</Button>
                    {canWrite && <Button size="large" disabled={working} onClick={() => void saveDraft()}>保存草稿</Button>}
                    {canWrite && canUpload && <Button aria-label={`开始上传（${uploadCandidates.length} 集）`} type="primary" size="large" loading={working && workKind === 'upload'} disabled={working || uploadCandidates.length === 0} onClick={() => void startUploads()}>开始上传（{uploadCandidates.length} 集）</Button>}
                    {!mediaReady && <Button size="large" onClick={onClose}>返回列表</Button>}
                  </Space>
                </Flex>
              </PageStack>
            </Col>
          </Row>
        )}

      </PageStack>

      {confirmDelete && serverDrama && <ConfirmDialog title="删除短剧" message={`确认永久删除“${serverDrama.title}”及其全部分集？`} busy={busyAction === 'delete'} onClose={() => setConfirmDelete(false)} onConfirm={async () => {
        setBusyAction('delete')
        try {
          await onDelete(serverDrama)
          const storage = browserLocalStorage()
          if (storage) clearUploadBatch(storage, userId, serverDrama.id)
        } catch (error) {
          // 删除失败保留确认框和草稿，不把事件回调的拒绝变成未处理异常。
          setFormError(reportDramaFailure('delete drama draft failed', error))
        } finally {
          setBusyAction('')
        }
      }} />}
    </section>
  )
}

function buildAggregateInput(input: DramaInput, episodes: EpisodeDraft[]): DramaInput {
  const title = input.title.trim()
  const description = input.description.trim()

  return {
    ...input,
    title,
    description,
    tagIds: [...input.tagIds],
    episodes: episodes.map((episode, index) => {
      const episodeTitle = episode.title.trim()
      const episodeDescription = episode.description.trim()
      return {
        id: episode.id,
        number: index + 1,
        title: episodeTitle,
        description: episodeDescription,
        posterUrl: episode.posterUrl,
        durationSeconds: episode.durationSeconds,
      }
    }),
  }
}
function validateDraft(input: DramaInput, episodes: EpisodeDraft[], coverFile?: File): string {
  if (!input.title.trim()) return '请填写剧名'
  if (!input.description.trim()) return '请填写短剧简介'
  if (!input.coverUrl.trim() && !coverFile) return '请上传短剧封面'
  if (coverFile) {
    const coverError = coverValidationError(coverFile)
    if (coverError) return coverError
  }
  if (episodes.some((episode) => !episode.title.trim())) return '每一集都需要标题'
  return ''
}

function browserLocalStorage(): Storage | null {
  try {
    return window.localStorage
  } catch (error) {
    reportDramaFailure('access upload batch storage failed', error)
    return null
  }
}

function coverValidationError(file: File): string {
  const extension = file.name.toLowerCase().match(/\.(jpe?g|png|webp)$/)
  const supportedType = file.type === '' || ['image/jpeg', 'image/png', 'image/webp'].includes(file.type.toLowerCase())
  if (!extension || !supportedType) return '封面格式不支持，请选择 JPG、PNG 或 WebP 图片'
  if (file.size <= 0 || file.size > maxCoverBytes) return '封面大小必须在 1 B 至 10 MB 之间'
  return ''
}

function isActiveMediaJob(job: MediaJob): boolean {
  return job.status === 'uploading' || job.status === 'queued' || job.status === 'running' || job.status === 'processing'
}

function formatBytes(value: number): string {
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}

function errorMessage(error: unknown): string {
  return toUserMessage(error)
}

// draftSignature 只比较可保存的内容；临时凭据、文件进度和已消费的封面登记不参与比较。
function draftSignature(input: DramaInput, episodes: EpisodeDraft[]): string {
  const aggregate = buildAggregateInput(input, episodes)
  return JSON.stringify({ ...aggregate, coverUploadId: undefined })
}
