import { afterEach, expect, test, vi } from 'vitest'
import { identifyUploadFile, matchesUploadFileIdentity } from './uploadFileIdentity'

afterEach(() => vi.unstubAllGlobals())

test('同一文件身份允许复用上传断点，内容变化时拒绝误续传', async () => {
  const original = new File(['same-video-content'], 'episode.mp4', { type: 'video/mp4', lastModified: 1234 })
  const same = new File(['same-video-content'], 'episode.mp4', { type: 'video/mp4', lastModified: 1234 })
  const changed = new File(['other-video-data!'], 'episode.mp4', { type: 'video/mp4', lastModified: 1234 })

  const expected = await identifyUploadFile(original)

  expect(matchesUploadFileIdentity(expected, await identifyUploadFile(same))).toBe(true)
  expect(matchesUploadFileIdentity(expected, await identifyUploadFile(changed))).toBe(false)
})

test('HTTP 页面缺少 Web Crypto 时仍生成与 HTTPS 一致的续传指纹', async () => {
  const original = new File(['same-video-content'], 'episode.mp4', { type: 'video/mp4', lastModified: 1234 })
  const changed = new File(['other-video-data!'], 'episode.mp4', { type: 'video/mp4', lastModified: 1234 })
  const expected = await identifyUploadFile(original)

  vi.stubGlobal('crypto', {})
  const fallback = await identifyUploadFile(original)
  expect(fallback.fingerprint).toBe(expected.fingerprint)
  expect(fallback.fingerprint).toMatch(/^[a-f0-9]{64}$/)
  expect(matchesUploadFileIdentity(expected, fallback)).toBe(true)
  expect(matchesUploadFileIdentity(expected, await identifyUploadFile(changed))).toBe(false)
})
