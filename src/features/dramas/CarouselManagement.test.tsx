import { ConfigProvider } from 'antd'
import type { ReactElement } from 'react'
import { fireEvent, render as renderBase, screen, waitFor, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { OperationsApi } from '../../api'
import type { CarouselConfig, CarouselView } from '../../homepage'
import { CarouselManagement } from './CarouselManagement'

// 测试关闭组件过渡，断言业务状态而非动画计时。
const render = (ui: ReactElement) => renderBase(<ConfigProvider theme={{ token: { motion: false } }}>{ui}</ConfigProvider>)

const dramas = [{ id: '1', title: 'First Drama', coverUrl: '/one.jpg' }, { id: '2', title: 'Second Drama', coverUrl: '/two.jpg' }]
function fixture() {
  let stored: CarouselView = { revision: 1, dramaIds: ['1', '2'], dramas }
  const api = {
    getCarousel: vi.fn(async () => stored),
    carouselTargets: vi.fn(async () => ({ items: dramas })),
    saveCarousel: vi.fn(async (input: CarouselConfig) => {
      stored = { ...input, revision: input.revision + 1, dramas: dramas.filter(drama => input.dramaIds.includes(drama.id)) }
      return stored
    }),
  } as unknown as OperationsApi
  return api
}

it('调整顺序和移除后读回保存结果，每个请求固定当前应用', async () => {
  const api = fixture(), notify = vi.fn()
  render(<CarouselManagement api={api} canUpdate notify={notify} />)
  fireEvent.click(await screen.findByRole('button', { name: '下移第 1 部' }))
  await waitFor(() => expect(api.saveCarousel).toHaveBeenCalledWith(expect.objectContaining({ revision: 1, dramaIds: ['2', '1'] })))
  await waitFor(() => expect(notify).toHaveBeenCalledWith('轮播已保存'))
  const rows = screen.getAllByRole('row')
  expect(rows[1]).toHaveTextContent('Second Drama')
  fireEvent.click(within(rows[1]).getByRole('button', { name: /删除/ }))
  await waitFor(() => expect(api.saveCarousel).toHaveBeenCalledWith(expect.objectContaining({ revision: 2, dramaIds: ['1'] })))
  await waitFor(() => expect(screen.queryByText('Second Drama')).not.toBeInTheDocument())
});

it('只读用户只能查看，不能加入、排序或移除', async () => {
  render(<CarouselManagement api={fixture()} canUpdate={false} notify={vi.fn()} />)
  await screen.findAllByText('First Drama')
  expect(screen.queryByRole('button', { name: /添加轮播|删除|编辑/ })).not.toBeInTheDocument()
});

it('保存故障保留旧顺序，显示统一提示并记录错误原因', async () => {
  const api = fixture(), notify = vi.fn()
  vi.mocked(api.saveCarousel).mockRejectedValue(new Error('redis connection refused'))
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    render(<CarouselManagement api={api} canUpdate notify={notify} />)
    fireEvent.click(await screen.findByRole('button', { name: '下移第 1 部' }))
    await screen.findByRole('button', { name: '重新加载' })
    expect(screen.getAllByRole('row')[1]).toHaveTextContent('First Drama')
    expect(notify).not.toHaveBeenCalled()
    expect(JSON.stringify(log.mock.calls)).toContain('redis connection refused')
    expect(screen.queryByText('redis connection refused')).not.toBeInTheDocument()
  } finally { log.mockRestore() }
});


it('编辑标题和展示状态通过弹窗保存，取消不写入', async () => {
 const api=fixture()
 render(<CarouselManagement api={api} canUpdate notify={vi.fn()} />)
 fireEvent.click((await screen.findAllByRole('button',{name:'编辑'}))[0])
 const dialog=screen.getByRole('dialog')
 fireEvent.change(within(dialog).getByRole('textbox',{name:'轮播标题'}),{target:{value:'首页特别推荐'}})
 fireEvent.click(within(dialog).getByRole('switch',{name:'轮播展示状态'}))
 fireEvent.click(within(dialog).getByRole('button',{name:'确定'}))
 await waitFor(()=>expect(api.saveCarousel).toHaveBeenCalledWith(expect.objectContaining({items:expect.arrayContaining([expect.objectContaining({dramaId:'1',title:'首页特别推荐',visible:false})])})))
 await waitFor(()=>expect(dialog).not.toBeVisible())
 fireEvent.click(screen.getByRole('button',{name:'添加轮播'}))
 fireEvent.click(within(screen.getByRole('dialog')).getByRole('button',{name:'取消'}))
 expect(api.saveCarousel).toHaveBeenCalledTimes(1)
})

it('人工热播使用独立接口，支持排序、标题、隐藏和移除', async () => {
 const api=fixture()
 api.getHotDramas=vi.fn(async()=>({revision:0,dramaIds:['1','2'],dramas}))
 api.hotDramaTargets=vi.fn(async()=>({items:dramas}))
 api.saveHotDramas=vi.fn(async(input)=>({...input,revision:input.revision+1,dramas}))
 render(<CarouselManagement kind="hot" api={api} canUpdate notify={vi.fn()} />)
 fireEvent.click(await screen.findByRole('button',{name:'下移第 1 部'}))
 await waitFor(()=>expect(api.saveHotDramas).toHaveBeenCalledWith(expect.objectContaining({dramaIds:['2','1']})))
 expect(api.getCarousel).not.toHaveBeenCalled()
 expect(api.saveCarousel).not.toHaveBeenCalled()
 fireEvent.click(screen.getAllByRole('button',{name:'编辑'})[0])
 const dialog=screen.getByRole('dialog')
 fireEvent.change(within(dialog).getByRole('textbox',{name:'热播标题'}),{target:{value:'人工推荐'}})
 fireEvent.click(within(dialog).getByRole('switch',{name:'热播展示状态'}))
 fireEvent.click(within(dialog).getByRole('button',{name:'确定'}))
 await waitFor(()=>expect(api.saveHotDramas).toHaveBeenLastCalledWith(expect.objectContaining({items:expect.arrayContaining([expect.objectContaining({dramaId:'2',title:'人工推荐',visible:false})])})))
 await waitFor(()=>expect(dialog).not.toBeVisible())
 fireEvent.click(screen.getAllByRole('button',{name:/移除/})[0])
 await waitFor(()=>expect(api.saveHotDramas).toHaveBeenLastCalledWith(expect.objectContaining({dramaIds:['1']})))
})

it.each(['carousel', 'hot'] as const)('通过分栏弹窗搜索并批量添加 %s，原有顺序和配置保持不变', async (kind) => {
  const api = fixture()
  const existing = { dramaId: '1', title: '已有标题', visible: false, createdAt: '2026-11-01' }
  const candidates = [...dramas, { id: '3', title: 'Third Drama', coverUrl: '' }]
  const get = vi.fn(async () => ({ revision: 7, dramaIds: ['1'], dramas: [dramas[0]], items: [existing] }))
  const targets = vi.fn(async () => ({ items: candidates }))
  const save = vi.fn(async (input: CarouselConfig) => ({ ...input, revision: 8, dramas: candidates }))
  if (kind === 'hot') {
    api.getHotDramas = get
    api.hotDramaTargets = targets
    api.saveHotDramas = save
  } else {
    api.getCarousel = get
    api.carouselTargets = targets
    api.saveCarousel = save
  }
  render(<CarouselManagement api={api} kind={kind} canUpdate notify={vi.fn()} />)
  const add = await screen.findByRole('button', { name: kind === 'hot' ? '添加热播' : '添加轮播' })
  await waitFor(() => expect(add).toBeEnabled())
  fireEvent.click(add)
  const dialog = within(await screen.findByRole('dialog'))
  await dialog.findByRole('checkbox', { name: '选择 Second Drama' })
  expect(dialog.getByText('First Drama')).toBeInTheDocument()
  expect(dialog.queryByRole('checkbox', { name: '选择 First Drama' })).not.toBeInTheDocument()
  fireEvent.change(dialog.getByRole('searchbox', { name: '搜索已上线短剧' }), { target: { value: 'Drama' } })
  fireEvent.click(dialog.getByRole('button', { name: /搜\s*索/ }))
  await waitFor(() => expect(targets).toHaveBeenLastCalledWith('Drama', ''))
  fireEvent.click(await dialog.findByRole('checkbox', { name: '选择 Second Drama' }))
  fireEvent.click(dialog.getByRole('checkbox', { name: '选择 Third Drama' }))
  fireEvent.click(dialog.getByRole('button', { name: '添加所选（2）' }))
  await waitFor(() => expect(save).toHaveBeenCalledExactlyOnceWith({ revision: 7, dramaIds: ['1', '2', '3'], items: [
    existing,
    { dramaId: '2', title: '', visible: true, createdAt: '' },
    { dramaId: '3', title: '', visible: true, createdAt: '' },
  ] }))
})
