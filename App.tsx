import { useCallback, useEffect, useRef, useState } from 'react'
import { BackdropLayer } from './backdrop/BackdropLayer'
import { Stage } from './desktop/Stage'
import { DesktopIcon } from './desktop/DesktopIcon'
import { Window } from './desktop/Window'
import { Dock } from './desktop/Dock'
import { SystemBar } from './desktop/SystemBar'
import { Boot } from './desktop/Boot'
import { createCursor } from './desktop/cursor'
import { DESKTOP_APPS, APPS, type AppDef } from './apps/registry'
import { AppBody } from './apps/AppBody'
import { useWM, usePointerMeta } from './os/hooks'
import { openApp, closeWindow, focusWindow, type Rect } from './os/windows'
import { PROJECTS } from './data/content'

import './styles/base.css'
import './styles/desktop.css'
import './styles/windows.css'
import './styles/apps.css'
import './styles/mobile.css'

/** Detail windows are titled with the project's real name, not its slug. */
function projectTitle(props?: Record<string, unknown>): string {
  const id = props?.id
  return PROJECTS.find((p) => p.id === id)?.name ?? 'detail'
}

export default function App() {
  const wm = useWM()
  const { kind } = usePointerMeta()
  const [booted, setBooted] = useState(false)
  const dotRef = useRef<HTMLDivElement>(null)
  const ringRef = useRef<HTMLDivElement>(null)

  const coarse = kind === 'coarse'

  // The custom cursor only exists for fine pointers — on touch there is no
  // cursor to replace, and drawing one would be nonsense.
  useEffect(() => {
    if (coarse || !dotRef.current || !ringRef.current) return
    return createCursor(dotRef.current, ringRef.current)
  }, [coarse])

  const launch = useCallback((app: AppDef, origin: Rect) => {
    if (app.external) {
      window.open(app.external, '_blank', 'noopener,noreferrer')
      return
    }
    openApp(app.id, { origin })
  }, [])

  // --- keyboard: the OS should be operable without the mouse ---------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')

      // Ctrl/Cmd + ` — summon the terminal from anywhere. Works while typing.
      if (e.key === '`' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        openApp('terminal')
        return
      }
      if (typing) return

      if (e.key === 'Escape') {
        const top = wm.windows
          .filter((w) => !w.minimized)
          .sort((a, b) => b.z - a.z)[0]
        if (top) {
          const el = document.querySelector<HTMLElement>(`[data-winid="${top.id}"]`)
          if (el) el.dataset.phase = 'closing'
          else closeWindow(top.id)
        }
      }

      // Cycle focus through open windows.
      if (e.key === 'Tab' && wm.windows.length > 1) {
        e.preventDefault()
        const visible = wm.windows.filter((w) => !w.minimized).sort((a, b) => a.z - b.z)
        if (visible.length > 1) focusWindow(visible[0].id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [wm.windows])

  // Stacking order → depth index, so the window nearest the front in Z is the
  // one with focus. Computed once per commit rather than per window.
  const order = [...wm.windows].sort((a, b) => a.z - b.z).map((w) => w.id)
  const minimized = wm.windows.filter((w) => w.minimized)

  return (
    <div className="os" data-cursor={coarse ? 'native' : 'custom'} data-coarse={coarse}>
      <BackdropLayer />

      <Stage>
        <div className="layer layer--icons">
          <div className="desktop">
            {DESKTOP_APPS.map((app, i) => (
              <DesktopIcon key={app.id} app={app} index={i} onOpen={launch} />
            ))}
          </div>
        </div>

        {/* Windows are direct children of the layer — no wrapper. A plain div in
            between would default to transform-style: flat and collapse every
            window onto one plane, destroying the depth ordering. */}
        <div className="layer layer--windows">
          {wm.windows.map((w) => (
            <Window
              key={w.id}
              win={w}
              focused={wm.focus === w.id}
              stackIndex={order.indexOf(w.id)}
              coarse={coarse}
              title={
                w.app === 'project'
                  ? `${APPS.projects.title} — ${projectTitle(w.props)}`
                  : APPS[w.app].title
              }
            >
              <AppBody app={w.app} props={w.props} />
            </Window>
          ))}
        </div>
      </Stage>

      <SystemBar />
      <Dock minimized={minimized} />

      {/* Hint shown only until the first window is opened. */}
      {wm.windows.length === 0 && booted && (
        <p className="hint">
          {coarse ? 'Tap an icon to open it' : 'Open an icon · ⌘` for the terminal'}
        </p>
      )}

      {!coarse && (
        <>
          <div className="cursor-ring" ref={ringRef} aria-hidden="true" />
          <div className="cursor-dot" ref={dotRef} aria-hidden="true" />
        </>
      )}

      {!booted && <Boot onDone={() => setBooted(true)} />}
    </div>
  )
}
