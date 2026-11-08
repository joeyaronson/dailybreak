import { useEffect, useMemo, useState } from 'react'
import { generateDailyGame, getLocalDateKey, millisecondsUntilMidnight } from '../lib/daily'

export function useDailyGame() {
  const [dateKey, setDateKey] = useState(() => getLocalDateKey())

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const refresh = () => {
      const now = new Date()
      setDateKey(getLocalDateKey(now))
      clearTimeout(timeout)
      // Also recheck for clock/timezone changes while the page stays open.
      timeout = setTimeout(refresh, Math.min(millisecondsUntilMidnight(now) + 50, 60_000))
    }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      clearTimeout(timeout)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [])

  return useMemo(() => generateDailyGame(dateKey), [dateKey])
}
