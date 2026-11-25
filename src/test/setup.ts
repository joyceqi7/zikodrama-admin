import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

configure({ asyncUtilTimeout: 5_000 })

Object.defineProperty(window, 'matchMedia', {
  configurable: true,
  value: (query: string): MediaQueryList => ({
    matches: mediaQueryMatches(query),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
})

function mediaQueryMatches(query: string): boolean {
  const minWidth = query.match(/min-width:\s*(\d+)px/)
  const maxWidth = query.match(/max-width:\s*(\d+)px/)
  if (minWidth && window.innerWidth < Number(minWidth[1])) return false
  if (maxWidth && window.innerWidth > Number(maxWidth[1])) return false
  return true
}

class TestResizeObserver implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: TestResizeObserver,
})

Object.defineProperty(URL, 'createObjectURL', {
  configurable: true,
  value: vi.fn((file: File) => `blob:test-${file.name}`),
})

Object.defineProperty(URL, 'revokeObjectURL', {
  configurable: true,
  value: vi.fn(() => undefined),
})

const getComputedStyle = window.getComputedStyle.bind(window)
Object.defineProperty(window, 'getComputedStyle', {
  configurable: true,
  value: (element: Element) => getComputedStyle(element),
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
