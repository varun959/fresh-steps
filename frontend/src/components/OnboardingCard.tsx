import { useState } from 'react'

const STORAGE_KEY = 'fresh-steps-onboarded'

export function OnboardingCard() {
  const [visible, setVisible] = useState(() => !localStorage.getItem(STORAGE_KEY))

  if (!visible) return null

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  return (
    <div
      style={{ zIndex: 2000 }}
      className="absolute inset-0 flex items-center justify-center bg-black/40 px-6"
    >
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
        <h2 className="text-lg font-bold text-gray-900 mb-1">Welcome to Fresh Steps</h2>
        <p className="text-sm text-gray-500 mb-4">Explore every street in your city.</p>

        <ul className="space-y-3 mb-5">
          <li className="flex gap-3 text-sm">
            <span className="mt-0.5 h-3 w-3 rounded-full bg-red-500 shrink-0 mt-1" />
            <span><span className="font-semibold text-gray-800">Red roads</span> are unwalked. Yellow is one side done. Green means fully covered.</span>
          </li>
          <li className="flex gap-3 text-sm">
            <span className="text-green-600 shrink-0 font-bold">→</span>
            <span><span className="font-semibold text-gray-800">Plan a Walk</span> suggests routes that maximise fresh streets from any start point.</span>
          </li>
          <li className="flex gap-3 text-sm">
            <span className="text-green-600 shrink-0 font-bold">→</span>
            <span><span className="font-semibold text-gray-800">Start Walk</span> records your GPS path and updates the map when you finish — no planning needed.</span>
          </li>
        </ul>

        <button
          onClick={dismiss}
          className="w-full bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold py-2.5 rounded-xl transition-colors"
        >
          Got it
        </button>
      </div>
    </div>
  )
}
