import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { ApiError, type OperationsApi } from '../../api'
import type { Drama, DramaListItem, DramaListQuery, Overview } from '../../domain'
import { toUserMessage as errorMessage } from '../../userMessage'
import { reportDramaFailure } from './dramaEditorErrors'
import type { Notify } from '../../shared/notify'

type DramaEditorState = { mode: 'create' } | { mode: 'edit'; drama: Drama; allowPreReviewEdit?: boolean }
const emptyOverview: Overview = {
  dramaCount: 0,
  episodeCount: 0,
  publishedCount: 0,
	pendingMediaCount: 0,
	mediaCleanupCount: 0,
}


// useDramaCatalog 管理短剧工作区状态，目录摘要与按需查询的详情分别保存。
export function useDramaCatalog(api: OperationsApi, notify: Notify, setAuthenticated: Dispatch<SetStateAction<boolean>>) {
  const [, setOverview] = useState(emptyOverview)
  const [dramas, setDramas] = useState<DramaListItem[]>([])
  const [catalogQuery, setCatalogQuery] = useState<DramaListQuery>({page:1,pageSize:20})
  const [catalogTotal, setCatalogTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  // 最新目录请求独占结果与错误处理，旧上线响应不能覆盖后发的下架查询。
  const catalogRequestVersion = useRef(0)
  // 每次主体切换或登出均作废旧保存和删除回调，往返同一主体也不能重新激活旧页面。
  const catalogScopeVersion = useRef(0)
  const scopeVersion = catalogScopeVersion.current
  const [dramaEditor, setDramaEditorState] = useState<DramaEditorState | null>(null)
  const editorRequestVersion = useRef(0)
  const setDramaEditor: Dispatch<SetStateAction<DramaEditorState | null>> = useCallback((value) => {
    editorRequestVersion.current += 1
    setDramaEditorState(value)
  }, [])
  const load = useCallback(async () => {
    const version = ++catalogRequestVersion.current
    setLoading(true)
    try {
      const [nextOverview, nextDramas] = await Promise.all([api.overview(), api.listDramas(catalogQuery)])
      if (version !== catalogRequestVersion.current) return false
      setOverview(nextOverview)
      setDramas(nextDramas.items)
      setCatalogTotal(nextDramas.total)
      return true
    } catch (error) {
      if (version !== catalogRequestVersion.current) return false
      if (error instanceof ApiError && error.status === 401) {
        void api.logout()
        setAuthenticated(false)
      } else {
        notify(errorMessage(error), 'error')
      }
      return false
    } finally {
      if (version === catalogRequestVersion.current) setLoading(false)
    }
  }, [api, notify, catalogQuery, setAuthenticated])

  const openDrama = useCallback(async (drama: { id: string }) => {
    const version = ++editorRequestVersion.current
    try {
      // 编辑区独立于渠道审核；读取最新草稿即可，不依赖 TK 查询可用性。
      const detail = await api.findDrama(drama.id)
      if (version !== editorRequestVersion.current) return false
      setDramaEditorState({ mode: 'edit', drama: detail })
      return true
    } catch (error) {
      if (version !== editorRequestVersion.current) return false
      notify(reportDramaFailure('open drama editor failed', error), 'error')
      return false
    }
  }, [api, notify])

  // updateDrama 仅接收当前主体代次的保存结果；返回 false 时调用方也不能跳转旧详情。
  const updateDrama = (drama: Drama): boolean => {
    if (scopeVersion !== catalogScopeVersion.current) return false
    setDramaEditor((current) => (current?.mode === 'create' ? current : { mode: 'edit', drama }))
    setDramas((current) => (current.some((item) => item.id === drama.id) ? current.map((item) => (item.id === drama.id ? { ...item, ...toListItem(drama) } : item)) : [toListItem(drama), ...current]))
    return true
  }

  // deleteDrama 删除当前主体草稿；失败继续拒绝，返回 false 时调用方不得导航当前主体的页面。
  const deleteDrama = async (drama: Pick<Drama, 'id'>): Promise<boolean> => {
    try {
      await api.deleteDrama(drama.id)
      // 已发出的主体内删除可以完成，但旧主体回调不能关闭新编辑器或另发目录请求。
      if (scopeVersion !== catalogScopeVersion.current) return false
      setDramaEditor(null)
      notify('剧目已删除')
      await load()
      // 列表刷新也是异步边界；刷新期间切换主体后，旧页面同样失去导航资格。
      return scopeVersion === catalogScopeVersion.current
    } catch (error) {
      notify(errorMessage(error), 'error')
      throw error
    }
  }

  // resetCatalog 使登出或主体切换前的请求失效，清空旧发布摘要与编辑状态。
  const resetCatalog = useCallback(() => {
    catalogScopeVersion.current += 1
    catalogRequestVersion.current += 1
    setDramaEditor(null)
    setDramas([])
    setCatalogTotal(0)
  }, [setDramaEditor])
  return { dramas, catalogQuery, setCatalogQuery, catalogTotal, loading, dramaEditor, setDramaEditor, load, openDrama, updateDrama, deleteDrama, resetCatalog }
}

// toListItem 在保存后只更新当前列表摘要，不把分集保留在列表状态中。
function toListItem(drama: Drama): DramaListItem {
 const {id,title,coverUrl,status,year,tags,publishStatus,onlineVersion,assignee,operationDueAt}=drama
 return {id,title,coverUrl,status,year,tags,publishStatus,onlineVersion,assignee,operationDueAt,episodeCount:drama.episodes.length,readyEpisodeCount:drama.episodes.filter((episode)=>episode.mediaStatus==='ready').length}
}
