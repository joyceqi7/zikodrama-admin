import { expect, test, vi } from 'vitest'
import { HttpOperationsApi } from './api'

function fixture(seconds: number) {
  const token = `header.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + seconds }))}.signature`
  const values = new Map([['drama_admin_token', token]])
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  return { token, values, storage }
}

test('并发请求只续期一次，随后使用新 JWT', async () => {
  const { storage, values } = fixture(240)
  const next = fixture(7200).token
  const fetcher = vi.fn<typeof fetch>(async (url) => new Response(JSON.stringify({ data: String(url).endsWith('/refresh') ? { token: next, user: { id: '1' }, permissions: [], menus: [] } : [] })))
  const api = new HttpOperationsApi('', fetcher, storage)
  await Promise.all([api.listRoles(), api.listUsers()])
  expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith('/refresh'))).toHaveLength(1)
  expect(values.get('drama_admin_token')).toBe(next)
  for (const [, init] of fetcher.mock.calls.slice(1)) expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${next}`)
})

test.each([401, 403, 500])('普通接口 HTTP %i 仅在认证失败时清除会话', async (status) => {
  const { storage } = fixture(7200)
  const api = new HttpOperationsApi('', async () => new Response('', { status }), storage)
  const expired = vi.fn()
  api.onSessionExpired(expired)
  await expect(api.listUsers()).rejects.toThrow()
  expect(expired).toHaveBeenCalledTimes(status === 401 ? 1 : 0)
  expect(api.hasSession()).toBe(status !== 401)
})

test('已过期凭据直接回到登录态，不发送续期', async () => {
  const { storage } = fixture(-1)
  const fetcher = vi.fn<typeof fetch>()
  const api = new HttpOperationsApi('', fetcher, storage)
  const expired = vi.fn()
  api.onSessionExpired(expired)
  await expect(api.maintainSession()).rejects.toThrow('登录已失效')
  expect(expired).toHaveBeenCalledOnce()
  expect(fetcher).not.toHaveBeenCalled()
})

test('退出期间返回的续期结果不能恢复登录', async () => {
  const { storage } = fixture(120)
  let finish!: (response: Response) => void
  const api = new HttpOperationsApi('', async (url) => String(url).endsWith('/refresh') ? new Promise<Response>((resolve) => { finish = resolve }) : new Response(null, { status: 204 }), storage)
  const renewal = api.maintainSession()
  await api.logout()
  finish(new Response(JSON.stringify({ data: { token: fixture(7200).token, user: { id: '1' }, permissions: [], menus: [] } })))
  await renewal
  expect(api.hasSession()).toBe(false)
})

test('旧账号 me 响应不能覆盖退出后新账号的缓存', async () => {
  const { storage } = fixture(7200)
  let finishMe!: (response: Response) => void
  const session = (id: string) => ({ user: { id }, permissions: [], menus: [] })
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    if (String(url).endsWith('/me')) return new Promise<Response>((resolve) => { finishMe = resolve })
    if (init?.method === 'DELETE') return new Response(null, { status: 204 })
    return new Response(JSON.stringify({ data: { token: 'new-token', ...session('B') } }))
  })
  const api = new HttpOperationsApi('', fetcher, storage)
  const old = api.me()
  await vi.waitFor(() => expect(finishMe).toBeTypeOf('function'))
  await api.logout()
  await api.login('B', 'password')
  finishMe(new Response(JSON.stringify({ data: session('A') })))
  await expect(old).rejects.toMatchObject({ code: 'session_changed' })
  expect(api.getSession()?.user.id).toBe('B')
})

test('会话续签期间切换主体不会把旧主体的推荐保存到新主体', async () => {
  const {storage}=fixture(120)
  let finish!:(response:Response)=>void
  const fetcher=vi.fn<typeof fetch>(async url=>String(url).endsWith('/refresh')?new Promise<Response>(resolve=>{finish=resolve}):new Response(JSON.stringify({data:{revision:2,dramaIds:[],dramas:[]}})))
  const api=new HttpOperationsApi('',fetcher,storage)
  api.setSubjectId('1')
  const oldSave=api.directHomepage().saveCarousel({revision:1,dramaIds:[]})
  await vi.waitFor(()=>expect(finish).toBeTypeOf('function'))
  api.setSubjectId('2')
  finish(new Response(JSON.stringify({data:{token:fixture(7200).token,user:{id:'1'},permissions:[],menus:[]}})))
  await oldSave
  await api.directHomepage().getHotDramas()
  const writes=fetcher.mock.calls.filter(([url])=>String(url).includes('/direct/'))
  expect(new Headers(writes[0][1]?.headers).get('x-subject-id')).toBe('1')
  expect(new Headers(writes[1][1]?.headers).get('x-subject-id')).toBe('2')
})
