// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { Beret } from './Beret'

Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

it('mounts and switches state where IntersectionObserver and matchMedia do not exist', async () => {
  // like some embedded webviews; test setups that polyfill them must not hide the bug
  vi.stubGlobal('IntersectionObserver', undefined)
  vi.stubGlobal('matchMedia', undefined)

  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  await act(async () => root.render(<Beret state="thinking" title="Thinking" />))
  expect(host.querySelector('svg[role="img"]')?.getAttribute('aria-label')).toBe('Thinking')
  // thinking draws its three pulsing dots
  expect(host.querySelectorAll('svg > circle').length).toBeGreaterThan(0)

  await act(async () => root.render(<Beret state="alert" title="Alert" />))
  expect(host.querySelector('svg')?.getAttribute('aria-label')).toBe('Alert')
  await act(async () => root.unmount())
})
