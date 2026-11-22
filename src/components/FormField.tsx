import React from 'react'
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native'
import { Colors } from '@/lib/theme'

interface Props extends TextInputProps {
  label: string
  required?: boolean
  hint?: string
}

export function FormField({ label, required, hint, style, ...props }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        style={[styles.input, style]}
        placeholderTextColor="#9CA3AF"
        {...props}
      />
      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 6,
  },
  required: {
    color: '#EF4444',
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: Colors.text,
    backgroundColor: Colors.card,
  },
  hint: {
    fontSize: 12,
    color: Colors.textMuted,
    marginTop: 4,
  },
})
