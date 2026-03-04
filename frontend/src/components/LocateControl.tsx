import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'

export function LocateControl() {
  const map = useMap()

  useEffect(() => {
    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control')
    const btn = L.DomUtil.create('a', '', container) as HTMLAnchorElement
    btn.href = '#'
    btn.title = 'My location'
    btn.style.cssText =
      'display:flex;align-items:center;justify-content:center;width:26px;height:26px;'
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
      <circle cx="12" cy="12" r="4"/>
      <line x1="12" y1="2" x2="12" y2="6"/>
      <line x1="12" y1="18" x2="12" y2="22"/>
      <line x1="2" y1="12" x2="6" y2="12"/>
      <line x1="18" y1="12" x2="22" y2="12"/>
    </svg>`

    // Prevent map click from firing when button is clicked
    L.DomEvent.disableClickPropagation(container)

    btn.addEventListener('click', (e) => {
      e.preventDefault()
      btn.style.opacity = '0.5'
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          map.setView([pos.coords.latitude, pos.coords.longitude], 17)
          btn.style.opacity = '1'
        },
        () => { btn.style.opacity = '1' },
        { enableHighAccuracy: true, timeout: 10_000 }
      )
    })

    const topLeft = map.getContainer().querySelector<HTMLElement>('.leaflet-top.leaflet-left')
    topLeft?.appendChild(container)

    return () => { container.remove() }
  }, [map])

  return null
}
