import { useEffect, useState } from 'react'
import { getAuthStore, subscribeAuthStore } from '@/lib/authStore'

export function useAuthStore() {
  const [auth, setAuth] = useState(getAuthStore)

  useEffect(() => {
    // マウント時に最新値を同期（_layout解決済みの場合は即取得）
    setAuth(getAuthStore())
    return subscribeAuthStore(() => setAuth(getAuthStore()))
  }, [])

  return auth
}
