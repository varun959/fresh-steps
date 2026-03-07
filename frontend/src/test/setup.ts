import '@testing-library/jest-dom'

// jsdom doesn't fully implement Web Storage — provide a working mock
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value },
    removeItem: (key: string) => { delete store[key] },
    clear: () => { store = {} },
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock, writable: true })

// jsdom doesn't implement navigator.geolocation — provide a stub so tests can spy on it
const geolocationMock = {
  watchPosition: () => 0,
  clearWatch: () => {},
  getCurrentPosition: () => {},
}
Object.defineProperty(navigator, 'geolocation', { value: geolocationMock, writable: true, configurable: true })
