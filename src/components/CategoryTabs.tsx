import React from 'react'
import { ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native'
import { Category, CATEGORIES } from '@/lib/types'

type Tab = 'すべて' | Category

interface Props {
  selected: Tab
  onSelect: (tab: Tab) => void
}

const TABS: Tab[] = ['すべて', ...CATEGORIES]

export function CategoryTabs({ selected, onSelect }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.container}
    >
      {TABS.map((tab) => (
        <TouchableOpacity
          key={tab}
          style={[styles.tab, selected === tab && styles.tabSelected]}
          onPress={() => onSelect(tab)}
        >
          <Text style={[styles.label, selected === tab && styles.labelSelected]}>{tab}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  tabSelected: {
    backgroundColor: '#3B82F6',
  },
  label: {
    fontSize: 14,
    color: '#6B7280',
    fontWeight: '500',
  },
  labelSelected: {
    color: '#fff',
    fontWeight: '700',
  },
})
