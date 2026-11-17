import React, { createContext, useContext } from 'react'
import { Household } from '@/lib/types'

interface AuthContextValue {
  userId: string | null
  household: Household | null
}

export const AuthContext = createContext<AuthContextValue>({ userId: null, household: null })

export function useAuthContext() {
  return useContext(AuthContext)
}
