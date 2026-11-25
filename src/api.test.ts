import { expect, test, vi } from 'vitest'
import { HttpOperationsApi } from './api'
import type { DramaInput } from './domain'

test('官方与直连运营发送主体头，应用接口由应用归属解析主体', async () => {
  const writes = vi.fn(), remove = vi.fn()
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }))
  const api = new HttpOperationsApi('http://api.example', fetcher, { getItem: () => 'fixture-token', setItem: writes, removeItem: remove })
  api.setSubjectId('9007199254740993')
  api.setApplicationId('101')
  await api.findTikTokPublication('201')
  await api.listTikTokPostbackLogs({ pageSize: 20 })
  await api.directHomepage().getCarousel()
  const headers = fetcher.mock.calls.map(([, init]) => new Headers(init?.headers))
  expect(headers[0].get('x-subject-id')).toBe('9007199254740993')
  expect(headers[0].has('x-application-id')).toBe(false)
  expect(headers[1].get('x-application-id')).toBe('101')
  expect(headers[1].has('x-subject-id')).toBe(false)
  expect(headers[2].get('x-subject-id')).toBe('9007199254740993')
  expect(headers[2].has('x-application-id')).toBe(false)
  api.setSubjectId('')
  expect(remove).toHaveBeenCalled()
  expect(writes).toHaveBeenCalledWith(expect.stringContaining(':subject'), '9007199254740993')
})

test('剧目报表全部范围不携带默认应用头，单应用和分页排序显式传递', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ code: 0, data: { items: [], total: 0 } }), { status: 200 }))
  const api = new HttpOperationsApi('http://api.example', fetcher, { getItem: () => 'fixture', setItem: vi.fn(), removeItem: vi.fn() })
  api.setApplicationId('999')
  api.setSubjectId('6')
  const query = { applicationId: '', range: 'range' as const, from: '2026-10-01', to: '2026-10-01', query: '剧', page: 2, pageSize: 20, sort: 'unlockUsers' as const, direction: 'desc' as const }
  await api.dramaReport(query)
  const url = new URL(String(fetcher.mock.calls[0][0]))
  expect(url.pathname).toBe('/admin/v1/drama-report')
  expect(url.searchParams.get('scope')).toBe('all')
  expect(url.searchParams.get('page')).toBe('2')
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('X-Application-ID')).toBeNull()
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('x-subject-id')).toBe('6')
  await api.dramaReport({ ...query, applicationId: '101' })
  expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('X-Application-ID')).toBe('101')
  expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('x-subject-id')).toBe('6')
  await api.dramaReportEpisodes('215', query)
  expect(String(fetcher.mock.calls[2][0])).toContain('/admin/v1/drama-report/215/episodes?')
})

test('审核申诉与撤回使用运营接口，平台对象标识不转数字', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { id: 'review-job' } }), { status: 200 }))
  const api = new HttpOperationsApi('http://api.example', fetcher, { getItem: () => 'fixture', setItem: vi.fn(), removeItem: vi.fn() })
  const input = { itemType: 2 as const, itemId: '7637437361307027476', reason: '请复核', attachmentUrls: [] }
  await api.appealTikTokReview('drama/1', input)
  await api.withdrawTikTokReview('drama/1')
  expect(fetcher.mock.calls[0][0]).toBe('http://api.example/admin/v1/dramas/drama%2F1/publication/appeal')
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual(input)
  expect(fetcher.mock.calls[1][0]).toBe('http://api.example/admin/v1/dramas/drama%2F1/publication/withdraw')
  expect(fetcher.mock.calls[1][1]!.method).toBe('POST')
})

test.each([null, undefined, []])('短剧各读取和保存入口将空标签 %s 统一为数组', async (tags) => {
  const wireDrama = { id: 'drama-empty-tags', title: '零标签短剧', tags }
  const fetcher = vi.fn<typeof fetch>(async (url, init) => new Response(JSON.stringify({
    data: String(url).includes('/dramas?') && !init?.method ? {items:[wireDrama],total:1} : wireDrama,
  }), { status: 200, headers: { 'content-type': 'application/json' } }))
  const storage = { getItem: () => 'fixture-token', setItem: vi.fn(), removeItem: vi.fn() }
  const api = new HttpOperationsApi('http://api.example', fetcher, storage)
  const input = { title: wireDrama.title, tags: [] } as unknown as DramaInput

  expect((await api.listDramas()).items[0].tags).toEqual([])
  expect((await api.findDrama(wireDrama.id)).tags).toEqual([])
  expect((await api.createDrama(input)).tags).toEqual([])
  expect((await api.updateDrama(wireDrama.id, input)).tags).toEqual([])
})

type XHRResult = { type: 'error' } | { type: 'load', status: number, body: unknown, progress?: { loaded: number, total: number } }

class FakeXMLHttpRequest {
  static results: XHRResult[] = []
  static requests: FakeXMLHttpRequest[] = []

  readonly upload = new EventTarget()
  readonly headers = new Headers()
  responseText = ''
  status = 0
  method = ''
  url = ''
  body: XMLHttpRequestBodyInit | Document | null = null
  private readonly events = new EventTarget()

  constructor() {
    FakeXMLHttpRequest.requests.push(this)
  }

  open(method: string, url: string): void {
    this.method = method
    this.url = url
  }

  setRequestHeader(name: string, value: string): void {
    this.headers.set(name, value)
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    this.events.addEventListener(type, listener)
  }

  send(body: XMLHttpRequestBodyInit | Document | null = null): void {
    this.body = body
    const result = FakeXMLHttpRequest.results.shift()
    queueMicrotask(() => {
      if (!result || result.type === 'error') {
        this.events.dispatchEvent(new Event('error'))
        return
      }
      if (result.progress) {
        this.upload.dispatchEvent(new ProgressEvent('progress', {
          lengthComputable: true,
          loaded: result.progress.loaded,
          total: result.progress.total,
        }))
      }
      this.status = result.status
      this.responseText = JSON.stringify(result.body)
      this.events.dispatchEvent(new Event('load'))
    })
  }
}

test('selected application is not sent on global catalog requests', async () => {
  const values = new Map<string, string>([['drama_admin_token', 'signed-token']])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const fetcher = vi.fn<typeof fetch>(async (url) => new Response(JSON.stringify({ data: String(url).includes("/dramas?") ? {items:[],total:0} : [] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
  const api = new HttpOperationsApi('http://api.example', fetcher, storage)

  api.setApplicationId('app-alpha')
  await api.listDramas()
  await api.listTikTokTags()
  await api.dramaReferenceData()

  expect(fetcher.mock.calls.every(([, init]) => new Headers(init?.headers).get('x-application-id') === null)).toBe(true)
  expect(values.get('drama_admin_application')).toBe('app-alpha')
})

test('campaign API is scoped by the selected application', async () => {
  const values = new Map<string, string>([['drama_admin_token', 'signed-token']])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const campaign = { id: 'campaign-1', applicationId: 'app-id', code: 'tiktok-id', name: 'TikTok ID', status: 'active' }
  const fetcher = vi.fn<typeof fetch>(async (_input, init) => new Response(JSON.stringify({
    data: init?.method ? campaign : [campaign],
  }), { status: init?.method === 'POST' ? 201 : 200, headers: { 'content-type': 'application/json' } }))
  const api = new HttpOperationsApi('http://api.example', fetcher, storage)
  api.setApplicationId('app-id')
  const input = {
    code: 'tiktok-id', name: 'TikTok ID',
    externalCampaignId: '2385', externalAdGroupId: '', externalAdId: '', externalCreativeId: '',
    dramaId: '', episodeId: '', experimentKey: 'hook-a', status: 'active' as const,
  }

  await expect(api.listCampaigns()).resolves.toEqual([campaign])
  await expect(api.createCampaign(input)).resolves.toEqual(campaign)
  await expect(api.updateCampaign('campaign/1', input)).resolves.toEqual(campaign)

  expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
    'http://api.example/admin/v1/campaigns',
    'http://api.example/admin/v1/campaigns',
    'http://api.example/admin/v1/campaigns/campaign%2F1',
  ])
  expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([undefined, 'POST', 'PUT'])
  expect(fetcher.mock.calls.every(([, init]) => new Headers(init?.headers).get('x-application-id') === 'app-id')).toBe(true)
})

test('application monetization API is scoped by the selected TikTok application', async () => {
  const values = new Map<string, string>([['drama_admin_token', 'signed-token']])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const config = {
    applicationId: 'app-id', freeEpisodeCount: 3, episodeUnlockAdUnitCode: 'episode',
    vipStrategy: {
      enabled: true, forceWatchCount: 2, requiredAdCount: 5, delaySeconds: 3,
      adUnitCode: 'vip', title: '', content: '', failureMessage: '',
    },
  }
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: config }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
  const api = new HttpOperationsApi('http://api.example', fetcher, storage)
  api.setApplicationId('app-id')
  const input = {
    freeEpisodeCount: 3, episodeUnlockAdUnitCode: 'episode',
    vipStrategy: {
      enabled: true, forceWatchCount: 2, requiredAdCount: 5, delaySeconds: 3,
      adUnitCode: 'vip', title: '', content: '', failureMessage: '',
    },
  }

  await expect(api.getApplicationMonetization()).resolves.toEqual(config)
  await expect(api.updateApplicationMonetization(input)).resolves.toEqual(config)

  expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
    'http://api.example/admin/v1/application-monetization',
    'http://api.example/admin/v1/application-monetization',
  ])
  expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([undefined, 'PUT'])
  expect(fetcher.mock.calls.every(([, init]) => new Headers(init?.headers).get('x-application-id') === 'app-id')).toBe(true)
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual(input)
})

test('plain-text HTTP errors are reported without leaking a JSON parser error', async () => {
  const storage = {
		getItem: (key: string) => key === 'drama_admin_token' ? 'signed-token' : null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
  }
  const fetcher = vi.fn<typeof fetch>(async () => new Response('404 page not found\n', {
    status: 404,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  }))
  const api = new HttpOperationsApi('http://api.example', fetcher, storage)
  api.setApplicationId('app-id')

  await expect(api.getApplicationMonetization()).rejects.toMatchObject({
    message: '接口不存在或服务版本不匹配（HTTP 404）',
    status: 404,
    code: 'invalid_response',
  })
})

test('application-scoped API rejects requests before fetch when no application is selected', async () => {
  const storage = {
		getItem: (key: string) => key === 'drama_admin_token' ? 'signed-token' : null,
    setItem: vi.fn(),
    removeItem: vi.fn(),
  }
  const fetcher = vi.fn<typeof fetch>()
  const api = new HttpOperationsApi('http://api.example', fetcher, storage)

  await expect(api.getApplicationMonetization()).rejects.toMatchObject({
    status: 0,
    code: 'application_required',
  })
  expect(fetcher).not.toHaveBeenCalled()
})

test('drama reference data is loaded from the authenticated API contract', async () => {
  const values = new Map<string, string>([['drama_admin_token', 'signed-token']])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const catalog = {
    schemaVersion: '2026-07-13',
    sourceUrl: 'https://bytedance.larkoffice.com/wiki/example',
	statuses: [{ value: 'updating', label: '更新中' }],
    languages: [{ value: 'zh', label: '中文' }],
    dramaTypes: [{ value: 4, label: '真人本地化' }],
    tags: [{ id: '21', label: '悬疑推理' }],
  }
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: catalog }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
  const api = new HttpOperationsApi('http://api.example', fetcher, storage)

  await expect(api.dramaReferenceData()).resolves.toEqual(catalog)
  expect(fetcher).toHaveBeenCalledWith(
    'http://api.example/admin/v1/drama-reference-data',
    expect.objectContaining({ headers: expect.any(Headers) }),
  )
  const headers = new Headers(fetcher.mock.calls[0]?.[1]?.headers)
  expect(headers.get('authorization')).toBe('Bearer signed-token')
})

test('官方发布接口分开提交审核、查询结果和确认指定版本上线', async () => {
  const values = new Map<string, string>([['drama_admin_token', 'signed-token']])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const publication = {
    id: 'publication-1', dramaId: 'drama/1', ownerApplicationId: 'owner',
    priority: 'normal', status: 'queued', stage: 'upload_cover', reviewStatus: 0, platformPublishStatus: 0,
    attempts: 0, nextAttemptAt: '2026-09-03T00:00:00Z', createdAt: '2026-09-03T00:00:00Z', updatedAt: '2026-09-03T00:00:00Z',
  }
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: publication }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
  const api = new HttpOperationsApi('http://api.example', fetcher, storage)
  const input = { priority: 'normal' as const }

  await expect(api.submitTikTokPublication('drama/1')).resolves.toEqual(publication)
  await expect(api.submitTikTokReview('drama/1', input)).resolves.toEqual(publication)
  await expect(api.findTikTokPublication('drama/1')).resolves.toEqual(publication)
  await expect(api.refreshTikTokReview('drama/1')).resolves.toEqual(publication)
  await expect(api.publishTikTokPublication('drama/1', 'publication/1')).resolves.toEqual(publication)
  await expect(api.retryTikTokPublication('drama/1')).resolves.toEqual(publication)
  await expect(api.unpublishDrama('drama/1')).resolves.toEqual(publication)

  expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
    'http://api.example/admin/v1/dramas/drama%2F1/publications',
    'http://api.example/admin/v1/dramas/drama%2F1/publication/submit-review',
    'http://api.example/admin/v1/dramas/drama%2F1/publication',
    'http://api.example/admin/v1/dramas/drama%2F1/publication/refresh-review',
    'http://api.example/admin/v1/dramas/drama%2F1/publications/publication%2F1/publish',
    'http://api.example/admin/v1/dramas/drama%2F1/publication/retry',
    'http://api.example/admin/v1/dramas/drama%2F1/unpublish',
  ])
  expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(['POST', 'POST', undefined, 'POST', 'POST', 'POST', 'POST'])
  expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({})
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual(input)
  expect(fetcher.mock.calls.every(([, init]) => new Headers(init?.headers).get('x-application-id') === null)).toBe(true)
})

test('cover upload sends an authenticated multipart request and reports progress', async () => {
  const values = new Map<string, string>([['drama_admin_token', 'signed-token']])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  FakeXMLHttpRequest.requests = []
  FakeXMLHttpRequest.results = [{
    type: 'load',
    status: 201,
    progress: { loaded: 5, total: 10 },
    body: { data: { uploadId: 'asset-cover-1', mid: 'cover-1', id: 'cover-1', url: 'https://cover.example.com/cover-1.png' } },
  }]
  vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
  const api = new HttpOperationsApi('http://api.example', vi.fn<typeof fetch>(), storage)
  api.setApplicationId('app-alpha')
  const file = new File(['cover-image'], 'cover.png', { type: 'image/png' })
  const progress: number[] = []

  await expect(api.uploadCover(file, (value) => progress.push(value))).resolves.toEqual({
    uploadId: 'asset-cover-1',
    mid: 'cover-1',
    id: 'cover-1',
    url: 'https://cover.example.com/cover-1.png',
  })

  const request = FakeXMLHttpRequest.requests[0]
  expect(request.method).toBe('POST')
  expect(request.url).toBe('http://api.example/admin/v1/covers')
  expect(request.headers.get('authorization')).toBe('Bearer signed-token')
  expect(request.headers.get('x-application-id')).toBeNull()
  expect(request.body).toBeInstanceOf(FormData)
  expect((request.body as FormData).get('file')).toBe(file)
  expect(progress).toEqual([50, 100])
  vi.unstubAllGlobals()
})

test('cover upload preserves the API error code', async () => {
  FakeXMLHttpRequest.requests = []
  FakeXMLHttpRequest.results = [{
    type: 'load',
    status: 415,
    body: { code: 500, reason: 'unsupported_media_type', message: '封面格式不支持', data: null },
  }]
  vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
  const api = new HttpOperationsApi('http://api.example', vi.fn<typeof fetch>())

  await expect(api.uploadCover(new File(['bad'], 'cover.txt'), () => {})).rejects.toMatchObject({
    status: 415,
    code: 'unsupported_media_type',
    message: '封面格式不支持',
  })
  vi.unstubAllGlobals()
})

test('client stores login token and sends it as a bearer token', async () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
    const authorization = new Headers(init?.headers).get('authorization')
    if (authorization) {
      return new Response(JSON.stringify({ data: { dramaCount: 0, episodeCount: 0, publishedCount: 0, pendingMediaCount: 0 } }), {
        status: 200, headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(JSON.stringify({ data: {
      token: 'signed-token', user: { id: 'user-1', username: 'admin', nickname: '管理员', status: 'active', isSuper: true, roleIds: [] },
      permissions: ['content.drama.read'], menus: [],
    } }), {
      status: 200, headers: { 'content-type': 'application/json' },
    })
  })
  const api = new HttpOperationsApi('http://api.example', fetcher, storage)

  const session = await api.login('admin', 'password')
  await api.overview()

  expect(values.get('drama_admin_token')).toBe('signed-token')
  expect(session.user.username).toBe('admin')
  expect(api.getSession()?.permissions).toContain('content.drama.read')
  const secondRequest = fetcher.mock.calls[1]
  expect(new Headers(secondRequest[1]?.headers).get('authorization')).toBe('Bearer signed-token')
  // 页面刷新保留服务端返回的导航树。
  const reloaded = new HttpOperationsApi('http://api.example', fetcher, storage)
  expect(reloaded.hasSession()).toBe(true)
  expect(reloaded.getSession()?.user.id).toBe('user-1')
  expect(reloaded.getSession()?.permissions).toEqual(['content.drama.read'])
})

test('client uses session storage by default for the admin token', async () => {
	const sessionValues = new Map<string, string>()
	const localValues = new Map<string, string>()
	const storage = (values: Map<string, string>) => ({
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => { values.set(key, value) },
		removeItem: (key: string) => { values.delete(key) },
	})
	vi.stubGlobal('sessionStorage', storage(sessionValues))
	vi.stubGlobal('localStorage', storage(localValues))
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: {
    token: 'session-token', user: { id: 'user-1', username: 'admin', nickname: '管理员', status: 'active', isSuper: true, roleIds: [] },
    permissions: [], menus: [],
  } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
  const api = new HttpOperationsApi('http://api.example', fetcher)

  await api.login('admin', 'password')

	expect(sessionValues.get('drama_admin_token')).toBe('session-token')
	expect(sessionValues.has('drama_admin_session')).toBe(true)
	expect(localValues.has('drama_admin_token')).toBe(false)
	vi.unstubAllGlobals()
})

test('logout revokes the server session before clearing local credentials', async () => {
  const values = new Map<string, string>([
    ['drama_admin_token', 'signed-token'],
    ['drama_admin_session', JSON.stringify({ user: { id: 'admin-1' }, permissions: [] })],
  ])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const fetcher = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }))
  const api = new HttpOperationsApi('http://api.example', fetcher, storage)

  await api.logout()

  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(String(fetcher.mock.calls[0][0])).toBe('http://api.example/admin/v1/session')
  expect(fetcher.mock.calls[0][1]?.method).toBe('DELETE')
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('authorization')).toBe('Bearer signed-token')
  expect(api.hasSession()).toBe(false)
  expect(values.has('drama_admin_token')).toBe(false)
  expect(values.has('drama_admin_session')).toBe(false)
})

test('logout still clears local credentials when session revocation is unavailable', async () => {
  const values = new Map<string, string>([['drama_admin_token', 'signed-token']])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const api = new HttpOperationsApi('http://api.example', vi.fn<typeof fetch>(async () => {
    throw new TypeError('network unavailable')
  }), storage)

  await expect(api.logout()).resolves.toBeUndefined()
  expect(api.hasSession()).toBe(false)
  expect(values.has('drama_admin_token')).toBe(false)
})

test('会话和应用选择按部署配置命名空间隔离', async () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: {
    token: 'staging-token', user: { id: 'user-1', username: 'admin', nickname: '管理员', status: 'active', isSuper: true, roleIds: [] },
    permissions: [], menus: [],
  } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
  const staging = new HttpOperationsApi(
    'https://api.drama.test',
    fetcher,
    storage,
    'staging:https://api.drama.test',
  )
  const production = new HttpOperationsApi(
    'https://api.drama.test',
    fetcher,
    storage,
    'production:https://api.drama.test',
  )

  await staging.login('admin', 'password')
  staging.setApplicationId('app-staging')

  expect(values.get('drama_admin:staging:https://api.drama.test:token')).toBe('staging-token')
  expect(values.get('drama_admin:staging:https://api.drama.test:application')).toBe('app-staging')
  expect(production.hasSession()).toBe(false)
  expect(production.getApplicationId()).toBe('')
})

test('direct media queue submission returns immediately and batch status is queried by drama', async () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const queuedJob = {
    jobId: 'job-direct-1', episodeId: 'episode-1', fileName: 'episode.mp4', size: 5,
    remoteVid: 'direct-vid-1', status: 'queued', createdAt: '', updatedAt: '',
  }
  const responses = [
    { data: queuedJob },
    { data: { ...queuedJob, status: 'uploading' } },
    { data: [{ ...queuedJob, status: 'processing' }] },
    { data: { ...queuedJob, status: 'queued' } },
  ]
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(responses.shift()), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }))
  const api = new HttpOperationsApi('http://api.example', fetcher, storage)
  const input = { uploadId: 'asset-1', vid: 'direct-vid-1', uploadRequestId: 'request-1', fileName: 'episode.mp4', size: 5 }

  await expect(api.queueDirectEpisodeMedia('episode-1', input)).resolves.toMatchObject({
    jobId: 'job-direct-1', status: 'queued',
  })
  await expect(api.findMediaJob('job-direct-1')).resolves.toMatchObject({ jobId: 'job-direct-1', status: 'uploading' })
  await expect(api.listDramaMediaJobs('drama-1')).resolves.toEqual([
    expect.objectContaining({ jobId: 'job-direct-1', status: 'processing' }),
  ])
  await expect(api.retryMediaJob('job-direct-1')).resolves.toMatchObject({ status: 'queued' })

  expect(fetcher.mock.calls.map(([request]) => String(request))).toEqual([
    'http://api.example/admin/v1/episodes/episode-1/media/direct',
    'http://api.example/admin/v1/media-jobs/job-direct-1',
    'http://api.example/admin/v1/dramas/drama-1/media-jobs',
    'http://api.example/admin/v1/media-jobs/job-direct-1/retry',
  ])
  expect([...values.keys()].some((key) => key.startsWith('drama_media_upload:direct:'))).toBe(false)
})

test('a discarded direct media upload forgets the idempotency key for its scheduled cleanup', async () => {
  const values = new Map<string, string>()
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
    code: 500, reason: 'media_upload_discarded', message: 'An active media job already exists', data: null,
  }), {
    status: 409,
    headers: { 'content-type': 'application/json' },
  }))
  const api = new HttpOperationsApi('http://api.example', fetcher, storage)

  await expect(api.queueDirectEpisodeMedia('episode-1', {
    uploadId: 'asset-conflict', vid: 'direct-vid-conflict', uploadRequestId: 'request-1', fileName: 'episode.mp4', size: 5,
  })).rejects.toMatchObject({ status: 409, code: 'media_upload_discarded' })

  expect([...values.keys()].some((key) => key.startsWith('drama_media_upload:direct:'))).toBe(false)
})

test('reserves managed episode media before direct upload', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: {
    uploadId: 'asset-1',
    authorization: { mode: 'direct', maxFileBytes: 1024, callbackArgs: '{"uploadId":"asset-1"}' },
  } }), { status: 201, headers: { 'content-type': 'application/json' } }))
  const api = new HttpOperationsApi('http://api.example', fetcher)
  const file = new File(['video'], 'episode-1.mp4', { type: 'video/mp4' })

  await expect(api.reserveEpisodeMediaUpload('episode/1', file)).resolves.toMatchObject({
    uploadId: 'asset-1', authorization: { callbackArgs: '{"uploadId":"asset-1"}' },
  })
  expect(String(fetcher.mock.calls[0]?.[0])).toBe('http://api.example/admin/v1/episodes/episode%2F1/media-uploads')
  expect(fetcher.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ fileName: 'episode-1.mp4', size: 5 }))
})

test('refreshes authorization for the original managed upload reservation', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: {
    mode: 'direct', maxFileBytes: 1024, callbackArgs: '{"uploadId":"asset-1"}',
  } }), { status: 200, headers: { 'content-type': 'application/json' } }))
  const api = new HttpOperationsApi('http://api.example', fetcher)

  await expect(api.refreshEpisodeMediaUploadAuthorization('episode/1', 'asset/1')).resolves.toMatchObject({
    mode: 'direct', callbackArgs: '{"uploadId":"asset-1"}',
  })
  expect(String(fetcher.mock.calls[0]?.[0])).toBe('http://api.example/admin/v1/episodes/episode%2F1/media-uploads/asset%2F1/authorization')
})

test('权限树使用 GET 返回节点及角色关联标识', async () => {
  const permissions = [{ id: 'permission-read', name: '查看短剧', code: 'content.drama.read', createdAt: '', updatedAt: '' }]
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: permissions }), { status: 200, headers: { 'content-type': 'application/json' } }))
  const api = new HttpOperationsApi('http://api.example', fetcher)

  await expect(api.listPermissions()).resolves.toEqual(permissions)

  expect(String(fetcher.mock.calls[0]?.[0])).toBe('http://api.example/admin/v1/permissions')
  expect(fetcher.mock.calls[0]?.[1]?.method ?? 'GET').toBe('GET')
  expect(api).not.toHaveProperty('findPlaybackSession')
})

test('角色权限与用户角色分配仍使用业务标识的 PUT 合同', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: {} }), { status: 200 }))
  const api = new HttpOperationsApi('http://api.example', fetcher)

  await api.setRolePermissions('role/ops', ['permission-read', 'permission-publish'])
  await api.setUserRoles('user/operator', ['role/ops'])

  expect(String(fetcher.mock.calls[0]?.[0])).toBe('http://api.example/admin/v1/roles/role%2Fops/permissions')
  expect(fetcher.mock.calls[0]?.[1]?.method).toBe('PUT')
  expect(fetcher.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ permissionIds: ['permission-read', 'permission-publish'] }))
  expect(String(fetcher.mock.calls[1]?.[0])).toBe('http://api.example/admin/v1/users/user%2Foperator/roles')
  expect(fetcher.mock.calls[1]?.[1]?.method).toBe('PUT')
  expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ roleIds: ['role/ops'] }))
})


test('管理员、角色和权限的自增 ID 全程保持字符串精度', async () => {
  const userId = '9007199254740993'
  const roleId = '9007199254740994'
  const permissionId = '9007199254740995'
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    const path = new URL(String(url)).pathname
    let data: unknown = {}
    if (path === '/admin/v1/users' && init?.method === 'POST') data = { id: userId, roleIds: [] }
    if (path === '/admin/v1/roles' && init?.method === 'POST') data = { id: roleId, permissionIds: [] }
    if (path === '/admin/v1/permissions') data = [{ id: permissionId, code: 'content.drama.read' }]
    return new Response(JSON.stringify({ data }), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  const storage = { getItem: () => 'fixture-token', setItem: vi.fn(), removeItem: vi.fn() }
  const api = new HttpOperationsApi('http://api.example', fetcher, storage)
  const user = await api.createUser({ username: 'numeric-user', nickname: '数字主键用户', password: 'local-test-password', status: 'active' })
  const role = await api.createRole({ name: '数字主键角色', code: 'numeric-role', remark: '', status: 'active' })
  const permissions = await api.listPermissions()
  expect(user.id).toBe(userId)
  expect(role.id).toBe(roleId)
  expect(permissions[0].id).toBe(permissionId)
  await api.setUserRoles(user.id, [role.id])
  await api.setRolePermissions(role.id, [permissions[0].id])
  expect(fetcher).toHaveBeenCalledWith(`http://api.example/admin/v1/users/${userId}/roles`, expect.objectContaining({ body: JSON.stringify({ roleIds: [roleId] }) }))
  expect(fetcher).toHaveBeenCalledWith(`http://api.example/admin/v1/roles/${roleId}/permissions`, expect.objectContaining({ body: JSON.stringify({ permissionIds: [permissionId] }) }))
})

test('自定义权限 CRUD 保留完整树字段和大整数主键', async () => {
  const input = { parentId: '9007199254740993', name: '导出', code: 'custom.export', type: 'action' as const, route: '', sortOrder: 7, status: 'active' as const, remark: '自定义业务操作' }
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { ...input, id: '9007199254740994', createdAt: '', updatedAt: '' } }), { status: 200 }))
  const api = new HttpOperationsApi('http://api.example', fetcher)
  await api.createPermission(input)
  await api.updatePermission('9007199254740994', input)
  await api.deletePermission('9007199254740994')
  expect(fetcher.mock.calls.map(([url, options]) => [String(url), options?.method])).toEqual([
    ['http://api.example/admin/v1/permissions', 'POST'],
    ['http://api.example/admin/v1/permissions/9007199254740994', 'PUT'],
    ['http://api.example/admin/v1/permissions/9007199254740994', 'DELETE'],
  ])
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual(input)
})

test('应用策略始终携带明确应用范围，保存不依赖客户端修订', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ code: 0, data: { applicationId: '90071992547409931234', strategy: null, rules: {} } }), { status: 200 }))
  const api = new HttpOperationsApi('http://api.example', fetcher, { getItem: () => null, setItem: () => undefined, removeItem: () => undefined })
  api.setApplicationId('other')
  const input = { document: { schemaVersion: 1, enabled: false, freeEpisodeCount: 2, rules: [] }, rules: {} }
  await api.getApplicationStrategy('90071992547409931234')
  await api.saveApplicationStrategy(input, '90071992547409931234')
  expect(fetcher.mock.calls.every(([url, init]) => String(url).endsWith('/admin/v1/application-strategy') && new Headers(init?.headers).get('x-application-id') === '90071992547409931234')).toBe(true)
  expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual(input)
  expect(api.getApplicationId()).toBe('other')
})

test('回传日志分页固定应用并编码事件、状态和游标筛选', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { items: [], hasMore: false, nextCursor: '', pageSize: 50 } }), { status: 200 }))
  const api = new HttpOperationsApi('http://api.example', fetcher, { getItem: () => 'fixture', setItem: vi.fn(), removeItem: vi.fn() })
  await api.listTikTokPostbackLogs({ pageSize: 50, event: 'minis_ad_show', outcome: 'failure', cursor: 'next/token', scene: 'entry_reward', clientVersion: 'build-42', errorCode: '400', from: '2026-10-19', to: '2026-10-20' }, '9007199254740993')
  const [url, init] = fetcher.mock.calls[0]
  expect(String(url)).toContain('/admin/v1/tiktok-postback-logs?')
  expect(String(url)).toContain('pageSize=50')
  expect(String(url)).toContain('event=minis_ad_show')
  expect(String(url)).toContain('outcome=failure')
  expect(String(url)).toContain('cursor=next%2Ftoken')
  for (const [key, value] of Object.entries({scene: 'entry_reward', clientVersion: 'build-42', errorCode: '400', from: '2026-10-19', to: '2026-10-20'})) expect(new URL(String(url)).searchParams.get(key)).toBe(value)
  expect(new Headers(init?.headers).get('x-application-id')).toBe('9007199254740993')
})

 test('共享推荐接口不携带应用头，未选择应用时也可管理', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({code:0,data:{}}), {status:200}))
  const api = new HttpOperationsApi('http://api.example', fetcher, {getItem:()=> 'fixture',setItem:vi.fn(),removeItem:vi.fn()})
  await api.getCarousel()
  await api.saveCarousel({revision:0,dramaIds:[]})
  await api.carouselTargets('', '')
  api.setApplicationId('102')
  await api.getHotDramas()
  await api.saveHotDramas({revision:0,dramaIds:[]})
  await api.hotDramaTargets('', '')
  await api.rankingCategories()
  await api.categoryRanking('21')
  await api.saveCategoryRanking('21', {revision:0,items:[]})
  await api.rankingTargets('21', '', '')
  expect(fetcher).toHaveBeenCalledTimes(10)
  for (const [,init] of fetcher.mock.calls) expect(new Headers(init?.headers).has('x-application-id')).toBe(false)
 })

 test('快捷投放链接固定使用点击时小程序，不携带客户端集数', async () => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { landingUrl: 'https://www.tiktok.com/minis/example' } }), { status: 200 }))
  const api = new HttpOperationsApi('http://api.example', fetcher, { getItem: () => 'fixture', setItem: vi.fn(), removeItem: vi.fn() })
  await api.ensureDramaCampaign('9007199254740993', '5001')
  expect(fetcher.mock.calls[0][0]).toBe('http://api.example/admin/v1/dramas/9007199254740993/campaign-link')
  expect(fetcher.mock.calls[0][1]?.method).toBe('POST')
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('X-Application-ID')).toBe('5001')
  expect(fetcher.mock.calls[0][1]?.body).toBeUndefined()
 })


test('送审失败重试和审核记录重试都传递重新选择的优先级', async () => {
 const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: { id: '112' } }), { status: 202 }))
 const api = new HttpOperationsApi('http://api.example', fetcher, { getItem: () => 'fixture', setItem: vi.fn(), removeItem: vi.fn() })
 await api.retryTikTokPublication('170', { priority: 'normal' })
 await api.publicationRecordAction('reviews', '112', 'retry', { priority: 'urgent' })
 expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ priority: 'normal' })
 expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string)).toEqual({ priority: 'urgent' })
})

test('所有小程序奖励报表不携带外壳应用头，单应用显式绑定，趋势不接受全部历史', async () => {
 const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: {} }), { status: 200 }))
 const api = new HttpOperationsApi('http://api.example', fetcher, { getItem: () => 'fixture-token', setItem: vi.fn(), removeItem: vi.fn() })
 api.setApplicationId('999')
 const query = { applicationId: '', from: '2026-09-24', to: '2026-09-30', range: 'all' as const }
 await api.rewardAnalysis(query)
 expect(String(fetcher.mock.calls[0][0])).toContain('scope=all')
 expect(new Headers(fetcher.mock.calls[0][1]?.headers).has('x-application-id')).toBe(false)
 fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: [] }), { status: 200 }))
 await api.rewardEpisodes('201', { ...query, applicationId: '101' })
 expect(String(fetcher.mock.calls[1][0])).toContain('/dramas/201/episodes?')
 expect(String(fetcher.mock.calls[1][0])).toContain('scope=application')
 expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('x-application-id')).toBe('101')
 fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: {} }), { status: 200 }))
 await api.rewardTrend('campaign', '9801', query)
 expect(String(fetcher.mock.calls[2][0])).toContain('range=range')
 expect(String(fetcher.mock.calls[2][0])).toContain('dimension=campaign&targetId=9801')
 expect(new Headers(fetcher.mock.calls[2][1]?.headers).has('x-application-id')).toBe(false)
})


test('链接报表全部范围忽略外壳应用，显式传递搜索和分页排序', async () => {
 const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ code: 0, data: { items: [], total: 0 } }), { status: 200 }))
 const api = new HttpOperationsApi('http://api.example', fetcher, { getItem: () => 'fixture', setItem: vi.fn(), removeItem: vi.fn() })
 api.setApplicationId('999')
 const query = { applicationId: '', range: 'range' as const, from: '2026-10-01', to: '2026-10-01', query: '入口', page: 2, pageSize: 50, sort: 'averageRewards' as const, direction: 'asc' as const }
 await api.campaignReport(query)
 const url = new URL(String(fetcher.mock.calls[0][0]))
 expect(url.pathname).toBe('/admin/v1/campaign-report')
 expect(Object.fromEntries(url.searchParams)).toMatchObject({ scope: 'all', query: '入口', page: '2', pageSize: '50', sort: 'averageRewards', direction: 'asc' })
 expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('X-Application-ID')).toBeNull()
 await api.campaignReport({ ...query, applicationId: '101' })
 expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('X-Application-ID')).toBe('101')
 expect(String(fetcher.mock.calls[1][0])).toContain('scope=application')
})


test('单条和批量就绪只传内容标识，官方同步不传共享版本字段',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({code:0,data:{}}),{status:200}))
 const api=new HttpOperationsApi('http://api.example',fetcher,{getItem:()=> 'fixture',setItem:vi.fn(),removeItem:vi.fn()})
 await api.prepareDrama('9007199254740993')
 await api.prepareDramas(['9007199254740993','9007199254740994'])
 await api.submitTikTokPublication('9007199254740993')
 expect(String(fetcher.mock.calls[0][0])).toContain('/9007199254740993/ready')
 expect(String(fetcher.mock.calls[1][0])).toContain('/admin/v1/dramas/ready')
 expect(JSON.parse(fetcher.mock.calls[1][1]?.body as string)).toEqual({dramaIds:['9007199254740993','9007199254740994']})
 expect(String(fetcher.mock.calls[2][0])).toContain('/9007199254740993/publications')
 expect(JSON.parse(fetcher.mock.calls[2][1]?.body as string)).toEqual({})
})

test('内容列表仅传草稿就绪筛选，不依赖渠道版本',async()=>{
 const fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({code:0,data:{items:[],total:0}}),{status:200}))
 const api=new HttpOperationsApi('http://api.example',fetcher,{getItem:()=> 'fixture',setItem:vi.fn(),removeItem:vi.fn()})
 await api.listDramas({page:1,pageSize:20,contentStatus:'ready'})
 const url=new URL(String(fetcher.mock.calls[0][0]))
 expect(url.searchParams.get('contentStatus')).toBe('ready')
 expect(url.searchParams.has('publication')).toBe(false)
})

test('独立官方上下架 API 固定已选版本和失败操作，不传平台版本或草稿', async () => {
 const state={selectedPublicationId:'701',version:1,status:'offline'}
 const fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({code:0,data:state}),{status:200}))
 const api=new HttpOperationsApi('http://api.example',fetcher,{getItem:()=>null,setItem:vi.fn(),removeItem:vi.fn()})
 await expect(api.findTikTokReleaseState('201')).resolves.toEqual(state)
 expect(fetcher.mock.calls[0]?.[0]).toBe('http://api.example/admin/v1/dramas/201/official-release')
 const input={action:'list' as const,selectedPublicationId:'701'}
 await api.changeTikTokRelease('201',input)
 expect(fetcher.mock.calls[1]?.[0]).toBe('http://api.example/admin/v1/dramas/201/official-release')
 expect(fetcher.mock.calls[1]?.[1]).toMatchObject({method:'POST',body:JSON.stringify(input)})
})


test('广告统计固定应用并编码全部筛选和游标', async () => {
 const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ data: {} }), { status: 200 }))
 const api = new HttpOperationsApi('http://api.example', fetcher, { getItem: () => 'fixture', setItem: vi.fn(), removeItem: vi.fn() })
 await api.adAnalytics({ from: '2026-10-20', to: '2026-10-21', pageSize: 20, adType: 'rewarded', adUnitId: 'slot-1', errorCode: '30001', cursor: 'next/token' }, '9007199254740993')
 const [url, init] = fetcher.mock.calls[0]
 expect(String(url)).toContain('/admin/v1/ad-analytics?')
 expect(new URL(String(url)).searchParams.get('cursor')).toBe('next/token')
 expect(new URL(String(url)).searchParams.get('errorCode')).toBe('30001')
 expect(new Headers(init?.headers).get('x-application-id')).toBe('9007199254740993')
})

test.each(['cover', 'proxy'] as const)('%s 上传固定发起时主体，等待续签期间切换也不串空间', async kind => {
  FakeXMLHttpRequest.requests = []
  FakeXMLHttpRequest.results = [{ type: 'load', status: 201, body: { code: 0, data: kind === 'cover' ? { uploadId: 'cover-job', url: 'https://fixture/cover.png' } : { jobId: 'upload-job', status: 'queued' } } }]
  vi.stubGlobal('XMLHttpRequest', FakeXMLHttpRequest)
  try {
    const api = new HttpOperationsApi('http://api.example', vi.fn<typeof fetch>(), { getItem: () => 'fixture-token', setItem: vi.fn(), removeItem: vi.fn() })
    api.setSubjectId('1')
    let resume!: () => void
    vi.spyOn(api, 'maintainSession').mockImplementation(() => new Promise<void>(resolve => { resume = resolve }))
    const file = new File(['fixture'], kind === 'cover' ? 'cover.png' : 'episode.mp4')
    const pending = kind === 'cover' ? api.uploadCover(file, () => {}) : api.uploadEpisodeMediaViaServer('301', '401', file, () => {})
    api.setSubjectId('2')
    resume()
    await pending
    expect(FakeXMLHttpRequest.requests[0].headers.get('x-subject-id')).toBe('1')
    expect(FakeXMLHttpRequest.requests[0].headers.has('x-application-id')).toBe(false)
  } finally { vi.unstubAllGlobals(); vi.restoreAllMocks() }
})

test.each(['drama', 'campaign', 'reward'] as const)('%s 单应用报表等待续签时同时固定主体和应用', async kind => {
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ code: 0, data: {} }), { status: 200 }))
  const api = new HttpOperationsApi('http://api.example', fetcher, { getItem: () => 'fixture-token', setItem: vi.fn(), removeItem: vi.fn() })
  api.setSubjectId('1')
  api.setApplicationId('11')
  let resume!: () => void
  vi.spyOn(api, 'maintainSession').mockImplementation(() => new Promise<void>(resolve => { resume = resolve }))
  try {
    const query = { applicationId: '11', range: 'range' as const, from: '2026-11-01', to: '2026-11-01', query: '', page: 1, pageSize: 20, direction: 'desc' as const }
    const pending = kind === 'drama' ? api.dramaReport({ ...query, sort: 'unlockCount' }) : kind === 'campaign' ? api.campaignReport({ ...query, sort: 'rewardCompletions' }) : api.rewardAnalysis(query)
    api.setSubjectId('2')
    api.setApplicationId('21')
    resume()
    await pending
    const headers = new Headers(fetcher.mock.calls[0][1]?.headers)
    expect(headers.get('x-subject-id')).toBe('1')
    expect(headers.get('x-application-id')).toBe('11')
  } finally { vi.restoreAllMocks() }
})


test('TikTok 标签关联数量发送当前主体，切换应用不改为应用范围', async () => {
 const fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({data:[]}),{status:200}))
 const api=new HttpOperationsApi('http://api.example',fetcher,{getItem:()=> 'fixture-token',setItem:vi.fn(),removeItem:vi.fn()})
 api.setSubjectId('1');api.setApplicationId('11');await api.listTikTokTags()
 api.setSubjectId('2');api.setApplicationId('21');await api.listTikTokTags()
 expect(fetcher.mock.calls).toHaveLength(2)
 for (const [index,id] of ['1','2'].entries()){
  expect(String(fetcher.mock.calls[index][0])).toContain('/admin/v1/tiktok-tags')
  const headers=new Headers(fetcher.mock.calls[index][1]?.headers)
  expect(headers.get('x-subject-id')).toBe(id)
  expect(headers.has('x-application-id')).toBe(false)
 }
})


test('审核开关接口只提交开关字段并固定显式应用，不使用后来切换的应用', async () => {
 const fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({code:0,data:{version:'1.0.0',enabled:false,revision:3}}),{status:200}))
 const api=new HttpOperationsApi('http://api.example',fetcher,{getItem:()=> 'fixture',setItem:vi.fn(),removeItem:vi.fn()})
 api.setApplicationId('999')
 await api.getReviewSettings('101')
 api.setApplicationId('102')
 await api.saveReviewSettings('101',{version:'1.0.1',enabled:true,revision:3})
 expect(fetcher.mock.calls[0][0]).toBe('http://api.example/admin/v1/review-settings')
 expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('X-Application-ID')).toBe('101')
 expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('X-Application-ID')).toBe('101')
 expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toEqual({version:'1.0.1',enabled:true,revision:3})
})

test('审核列表固定页面主体和发布渠道，不使用后续切换的主体或应用头', async () => {
 const fetcher=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({code:0,data:{revision:1,dramaIds:[],dramas:[]}}),{status:200}))
 const api=new HttpOperationsApi('http://api.example',fetcher,{getItem:()=> 'fixture',setItem:vi.fn(),removeItem:vi.fn()})
 api.setApplicationId('101'); api.setSubjectId('999')
 const pending=api.saveReviewWhitelist('direct','1',{revision:0,dramaIds:['201']})
 api.setSubjectId('2'); api.setApplicationId('102')
 await pending
 await api.getReviewWhitelist('official','1')
 await api.reviewWhitelistTargets('direct','1','drama')
 expect(fetcher.mock.calls[0][0]).toBe('http://api.example/admin/v1/direct/review-list')
 expect(fetcher.mock.calls[1][0]).toBe('http://api.example/admin/v1/official/review-list')
 for(const [,init] of fetcher.mock.calls){
  expect(new Headers(init?.headers).get('X-Subject-ID')).toBe('1')
  expect(new Headers(init?.headers).has('X-Application-ID')).toBe(false)
 }
 expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({revision:0,dramaIds:['201']})
})
