import React from 'react'
import { Stack, useLocalSearchParams } from 'expo-router'
import { Colors } from '@/lib/theme'
import RecordForm from '@/components/RecordForm'
import { Category } from '@/lib/types'

export default function NewRecordScreen() {
  const { defaultCategory } = useLocalSearchParams<{ defaultCategory?: string }>()
  return (
    <>
      <Stack.Screen options={{ title: defaultCategory === 'タスク' ? 'タスク追加' : '新規追加', headerTintColor: Colors.primary }} />
      <RecordForm mode="create" defaultCategory={defaultCategory as Category | undefined} />
    </>
  )
}
