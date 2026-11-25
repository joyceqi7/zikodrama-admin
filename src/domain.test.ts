import { expect, test } from 'vitest'
import { dramaToInput, type Drama } from './domain'

test('drama editor preserves the single stored content copy', () => {
  const drama: Drama = {
    id: 'drama-1',
    title: 'Legacy primary title',
    description: 'Legacy primary description',
    coverUrl: 'https://example.test/cover.jpg',
    tags: ['悬疑推理'],
    status: 'updating',
    year: 2026,
    language: 'zh',
    dramaType: 4,
    tagIds: [],
	publishStatus: 'draft',
    episodes: [],
  }

  expect(dramaToInput(drama)).toMatchObject({
    title: 'Legacy primary title',
    description: 'Legacy primary description',
    tagIds: [],
  })
})
