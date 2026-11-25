import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Grid } from 'antd'
import { afterEach, expect, test, vi } from 'vitest'
import type { DramaListItem } from '../../domain'
import { ApiError, type OperationsApi } from '../../api'
import { Dashboard } from './Dashboard'

afterEach(() => vi.restoreAllMocks())
const drama: DramaListItem = { id: '9007199254740993', title: '测试短剧', coverUrl: '/cover.jpg', tags: [], status: 'completed', year: 2026, publishStatus: 'draft', episodeCount: 25, readyEpisodeCount: 25, directPublication: { revision:0,status:'unpublished',version:0,pendingChanges:false,enabledApplications:3 } }
function setup(items = [drama], permissions = ['operations.direct_publication.read','operations.direct_publication.publish','operations.direct_publication.offline'], overrides = {} as Partial<OperationsApi>) {
 const api = { getSubjectId:()=> '1', directRequest: vi.fn(async()=>({status:'succeeded'})), prepareDrama:vi.fn(), ...overrides } as unknown as OperationsApi
 const props = { api, can: (code:string)=>permissions.includes(code), canEdit: true, dramas: items, query: {page:1,pageSize:20}, total: items.length, onQueryChange: vi.fn(), loading: false, canCreate: false, onCreate: vi.fn(), onRefresh: vi.fn(), onSelect: vi.fn(), canDelete: true, onDelete: vi.fn(async()=>{}), notify: vi.fn(), onOfficialPublication:vi.fn() }
 return { ...props, ...render(<Dashboard {...props} />) }
}
test('草稿可直接直连上线，官方入口只导航，不再确认就绪',async()=>{
 const ctx=setup()
 expect(screen.queryByRole('columnheader',{name:'内容状态'})).not.toBeInTheDocument()
 expect(screen.getByRole('columnheader',{name:'直连状态'})).toBeInTheDocument()
 expect(screen.getByRole('columnheader',{name:'官方发布进度'})).toBeInTheDocument()
 expect(screen.queryByText('确认就绪')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'官方发布'}))
 expect(ctx.onOfficialPublication).toHaveBeenCalledExactlyOnceWith(drama)
 expect(ctx.api.directRequest).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'上线 测试短剧'}))
 await waitFor(()=>expect(ctx.onRefresh).toHaveBeenCalledOnce())
 expect(ctx.api.directRequest).toHaveBeenCalledWith(`/admin/v1/direct/dramas/${drama.id}/publication/operations`,expect.objectContaining({method:'POST',body:expect.any(String)}))
 const command=JSON.parse(vi.mocked(ctx.api.directRequest!).mock.calls[0][1]!.body as string)
 expect(command).toMatchObject({kind:'publish',expectedRevision:0})
 expect(ctx.api.prepareDrama).not.toHaveBeenCalled()
})
test('已有直连版本显示发布更新和下线，官方审核中不阻断直连动作',()=>{
 setup([{...drama,deleteBlocked:true,directPublication:{...drama.directPublication!,status:'published',version:1,revision:3,pendingChanges:true},officialRelease:{selectedPublicationId:'702',version:1,status:'online'},publication:{id:'703',platformVersion:2,currentContentChanged:true,priority:'normal',status:'under_review',stage:'poll_review',reviewStatus:1}}])
 expect(screen.getByRole('button',{name:'发布更新 测试短剧'})).toBeEnabled()
 expect(screen.getByRole('button',{name:'下线 测试短剧'})).toBeEnabled()
 expect(screen.getByText('有未发布修改')).toBeInTheDocument()
 expect(screen.getByText('等待 TikTok 审核')).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'删除 测试短剧'})).toBeDisabled()
})
test('重新上线原版本不要求新草稿媒资就绪',async()=>{
 const ctx=setup([{...drama,readyEpisodeCount:0,directPublication:{...drama.directPublication!,status:'offline',version:1,revision:2,pendingChanges:true}}])
 fireEvent.click(screen.getByRole('button',{name:'重新上线 V1 测试短剧'}))
 await waitFor(()=>expect(ctx.onRefresh).toHaveBeenCalledOnce())
 expect(JSON.parse(vi.mocked(ctx.api.directRequest!).mock.calls[0][1]!.body as string)).toMatchObject({kind:'relist',expectedRevision:2})
})
test('未知结果重试复用幂等命令，操作失败只弹友好提示且释放按钮门禁',async()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{})
 const directRequest=vi.fn().mockRejectedValueOnce(new Error('network unavailable token=private-value')).mockResolvedValueOnce({status:'succeeded'})
 const ctx=setup([drama],undefined,{directRequest} as unknown as OperationsApi)
 fireEvent.click(screen.getByRole('button',{name:'上线 测试短剧'}))
 await waitFor(()=>expect(ctx.notify).toHaveBeenCalledWith(expect.any(String),'error'))
 expect(ctx.onRefresh).not.toHaveBeenCalled()
 expect(screen.queryByRole('alert')).not.toBeInTheDocument()
 await waitFor(()=>expect(screen.getByRole('button',{name:'上线 测试短剧'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'上线 测试短剧'}))
 await waitFor(()=>expect(ctx.onRefresh).toHaveBeenCalledOnce())
 expect(directRequest.mock.calls[0][1].body).toBe(directRequest.mock.calls[1][1].body)
 expect(JSON.stringify(log.mock.calls)).not.toContain('private-value')
})
test('批量上线逐条处理，只保留失败项，重试不会再发布成功项',async()=>{
 vi.spyOn(console,'error').mockImplementation(()=>{})
 const directRequest=vi.fn().mockResolvedValueOnce({status:'succeeded'}).mockRejectedValueOnce(new ApiError('not ready',409,'content_not_ready')).mockResolvedValue({status:'succeeded'})
 const ctx=setup([drama,{...drama,id:'902',title:'第二部'},{...drama,id:'903',title:'已上线',directPublication:{...drama.directPublication!,status:'published',version:1}}],undefined,{directRequest} as unknown as OperationsApi)
 expect(screen.getByRole('checkbox',{name:'选择 已上线'})).toBeDisabled()
 fireEvent.click(screen.getByRole('checkbox',{name:'选择 测试短剧'}));fireEvent.click(screen.getByRole('checkbox',{name:'选择 第二部'}))
 fireEvent.click(screen.getByRole('button',{name:'批量上线（2）'}))
 await waitFor(()=>expect(ctx.notify).toHaveBeenCalledWith('已上线 1 部，1 部失败；请补齐短剧名称、简介、封面和全部分集视频后再发布，失败项可重试','error'))
 expect(screen.getByRole('checkbox',{name:'选择 测试短剧'})).not.toBeChecked()
 expect(screen.getByRole('checkbox',{name:'选择 第二部'})).toBeChecked()
 await waitFor(()=>expect(screen.getByRole('button',{name:'批量上线（1）'})).toBeEnabled())
 fireEvent.click(screen.getByRole('button',{name:'批量上线（1）'}))
 await waitFor(()=>expect(directRequest).toHaveBeenCalledTimes(3))
 expect(directRequest.mock.calls[2][0]).toContain('/902/')
})
test('编辑权限不会授予直连发布权限',()=>{
 const ctx=setup([drama],[])
 expect(screen.queryByRole('button',{name:'上线 测试短剧'})).not.toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'批量上线'})).not.toBeInTheDocument()
 expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
 ctx.rerender(<Dashboard {...ctx} canEdit={false} onOfficialPublication={undefined} />)
 expect(screen.getByRole('button',{name:'查看 测试短剧'})).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'官方发布'})).not.toBeInTheDocument()
})
test('历史 ready 内容与草稿一样直接上线，不重复执行准备动作',async()=>{
 const ctx=setup([{...drama,publishStatus:'ready'}])
 fireEvent.click(screen.getByRole('button',{name:'上线 测试短剧'}))
 await waitFor(()=>expect(ctx.onRefresh).toHaveBeenCalledOnce())
 expect(ctx.api.prepareDrama).not.toHaveBeenCalled()
 expect(screen.queryByText('待上线')).not.toBeInTheDocument()
})
test('移动端保留两渠道状态、单条上线与批量上线',async()=>{
 vi.spyOn(Grid,'useBreakpoint').mockReturnValue({xs:true,md:false})
 const ctx=setup()
 expect(screen.getByRole('region',{name:'短剧列表'})).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'上线 测试短剧'})).toBeInTheDocument()
 fireEvent.click(screen.getByRole('checkbox',{name:'选择 测试短剧'}));fireEvent.click(screen.getByRole('button',{name:'批量上线（1）'}))
 await waitFor(()=>expect(ctx.onRefresh).toHaveBeenCalledOnce())
})
test('直连筛选送到服务器，换页清理上一页选择',()=>{
 const ctx=setup()
 fireEvent.mouseDown(screen.getByRole('combobox',{name:'直连状态筛选'}))
 fireEvent.click(screen.getByText('已下线',{selector:'.ant-select-item-option-content'}));fireEvent.click(screen.getByRole('button',{name:'查询'}))
 expect(ctx.onQueryChange).toHaveBeenCalledWith({page:1,pageSize:20,query:'',contentStatus:undefined,directStatus:'offline'})
 fireEvent.click(screen.getByRole('checkbox',{name:'选择 测试短剧'}))
 ctx.rerender(<Dashboard {...ctx} dramas={[{...drama,id:'902',title:'第二页'}]} query={{page:2,pageSize:20}} />)
 expect(screen.getByRole('button',{name:'批量上线'})).toBeDisabled()
})
test('媒资不完整时保留草稿并提示完善内容，不设置就绪状态',async()=>{
 vi.spyOn(console,'error').mockImplementation(()=>{})
 const ctx=setup([drama],undefined,{directRequest:vi.fn().mockRejectedValue(new ApiError('not ready',409,'content_not_ready'))} as unknown as OperationsApi)
 fireEvent.click(screen.getByRole('button',{name:'上线 测试短剧'}))
 await waitFor(()=>expect(ctx.notify).toHaveBeenCalledWith('请补齐短剧名称、简介、封面和全部分集视频后再发布','error'))
 expect(ctx.onRefresh).not.toHaveBeenCalled()
})
test('删除引用保护仍生效，不因取消内容状态而绕过',async()=>{
 const ctx=setup()
 fireEvent.click(screen.getByRole('button',{name:'删除 测试短剧'}));fireEvent.click(await screen.findByRole('button',{name:'确认删除'}))
 await waitFor(()=>expect(ctx.onDelete).toHaveBeenCalledExactlyOnceWith(drama))
 ctx.rerender(<Dashboard {...ctx} dramas={[{...drama,deleteBlocked:true}]} />)
 expect(screen.getByRole('button',{name:'删除 测试短剧'})).toBeDisabled()
})

test('读取发布修订期间切换主体，不发送旧主体的上线命令',async()=>{
 let subject='1',finish!:(value:unknown)=>void
 const directRequest=vi.fn(()=>new Promise<unknown>(resolve=>{finish=resolve}))
 const ctx=setup([{...drama,directPublication:undefined}],undefined,{getSubjectId:()=>subject,directRequest} as unknown as OperationsApi)
 fireEvent.click(screen.getByRole('button',{name:'上线 测试短剧'}))
 await waitFor(()=>expect(directRequest).toHaveBeenCalledTimes(1))
 subject='2'
 finish({publication:{revision:0}})
 await waitFor(()=>expect(screen.getByRole('button',{name:'上线 测试短剧'})).toBeEnabled())
 expect(directRequest).toHaveBeenCalledTimes(1)
 expect(ctx.onRefresh).not.toHaveBeenCalled()
 expect(ctx.notify).not.toHaveBeenCalled()
})

test('批量上线在主体切换后停止余下剧目，不把后续操作带入新主体',async()=>{
 let subject='1',finish!:(value:unknown)=>void
 const directRequest=vi.fn(()=>new Promise<unknown>(resolve=>{finish=resolve}))
 const ctx=setup([drama,{...drama,id:'902',title:'第二部'}],undefined,{getSubjectId:()=>subject,directRequest} as unknown as OperationsApi)
 fireEvent.click(screen.getByRole('checkbox',{name:'选择 测试短剧'}))
 fireEvent.click(screen.getByRole('checkbox',{name:'选择 第二部'}))
 fireEvent.click(screen.getByRole('button',{name:'批量上线（2）'}))
 await waitFor(()=>expect(directRequest).toHaveBeenCalledTimes(1))
 subject='2';finish({status:'succeeded'})
 await waitFor(()=>expect(ctx.onRefresh).toHaveBeenCalledOnce())
 expect(directRequest).toHaveBeenCalledTimes(1)
 expect(screen.getByRole('checkbox',{name:'选择 第二部'})).toBeChecked()
})
