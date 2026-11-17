import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Household } from '@/lib/types'

export function useHousehold(userId: string | null) {
  const [household, setHousehold] = useState<Household | null>(null)
  const [loading, setLoading] = useState(true)
  // どのユーザーの世帯を読み込んだか(ログイン直後に「世帯なし」と一瞬判定されないように)
  const [fetchedFor, setFetchedFor] = useState<string | null | undefined>(undefined)

  const fetch = useCallback(async () => {
    if (!userId) {
      setHousehold(null)
      setFetchedFor(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data } = await supabase
      .from('household_members')
      .select('household_id, households(*)')
      .eq('user_id', userId)
      .single()
    if (data?.household_id) {
      // PostgREST returns single object for many-to-one, but guard against array
      const rawHH = data?.households
      const hh = (Array.isArray(rawHH) ? rawHH[0] : rawHH) as Household | null
      if (hh) {
        // Always override id with data.household_id — the authoritative FK value
        setHousehold({ ...hh, id: data.household_id })
      }
    } else {
      setHousehold(null)
    }
    setFetchedFor(userId)
    setLoading(false)
  }, [userId])

  useEffect(() => { fetch() }, [fetch])

  return { household, loading: loading || fetchedFor !== userId, refresh: fetch }
}
