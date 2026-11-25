import { expect, test, vi } from 'vitest'
import { HttpOperationsApi } from './api'
import type { ConsumerUserPage } from './consumerUsers'

test('观众列表请求携带明确应用和分页，主键不会丢失精度', async () => {
  const data: ConsumerUserPage = { items: [{ id: '9007199254740993', applicationId: '102', identityType: 'tiktok', createdAt: '2026-09-15T08:00:00Z' }], hasMore: false, nextCursor: '', pageSize: 50 }
  const fetcher = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ code: 0, data })))
  const api = new HttpOperationsApi('http://api.example', fetcher, { getItem: () => 'fixture', setItem: vi.fn(), removeItem: vi.fn() })
  const result = await api.listConsumerUsers({ cursor: 'next-token', pageSize: 50, userId: '9007199254740993' }, '102')
  const url = new URL(String(fetcher.mock.calls[0][0]))
  expect(url.origin + url.pathname).toBe('http://api.example/admin/v1/consumer-users')
  expect(Object.fromEntries(url.searchParams)).toEqual({ pageSize: '50', cursor: 'next-token', userId: '9007199254740993' })
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('x-application-id')).toBe('102')
  expect(result).toEqual(data)
})
