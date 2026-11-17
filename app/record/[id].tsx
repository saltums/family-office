import React from 'react'
import { Stack, useLocalSearchParams } from 'expo-router'
import { Colors } from '@/lib/theme'
import RecordForm from '@/components/RecordForm'

export default function EditRecordScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return (
    <>
      <Stack.Screen options={{ title: '編集', headerTintColor: Colors.primary }} />
      <RecordForm mode="edit" recordId={id} />
    </>
  )
}
