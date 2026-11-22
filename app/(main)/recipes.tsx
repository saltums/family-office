import React, { useCallback, useState } from 'react'
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { useHousehold } from '@/hooks/useHousehold'
import { Recipe, RECIPE_CATEGORIES, RECIPE_CATEGORY_COLORS } from '@/lib/types'
import { Colors, Radius, Spacing, tint } from '@/lib/theme'

export default function RecipesScreen() {
  const { userId } = useAuth()
  const { household } = useHousehold(userId)
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [categoryFilter, setCategoryFilter] = useState('')

  useFocusEffect(useCallback(() => {
    if (!household) return
    setLoading(true)
    supabase
      .from('recipes')
      .select('*')
      .eq('household_id', household.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setRecipes((data as Recipe[]) ?? [])
        setLoading(false)
      })
  }, [household]))

  const visible = categoryFilter
    ? recipes.filter(r => r.category === categoryFilter)
    : recipes

  const usedCategories = Array.from(new Set(recipes.map(r => r.category)))

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.navbar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>料理</Text>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.container}>
          {/* カテゴリフィルター */}
          {usedCategories.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.filterRow}
              contentContainerStyle={styles.filterRowContent}
            >
              {['すべて', ...usedCategories].map(cat => {
                const isActive = cat === 'すべて' ? categoryFilter === '' : categoryFilter === cat
                const color = cat === 'すべて' ? Colors.primary : RECIPE_CATEGORY_COLORS[cat as keyof typeof RECIPE_CATEGORY_COLORS]
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.filterChip, isActive && { backgroundColor: tint(color ?? Colors.primary, '22'), borderColor: color ?? Colors.primary }]}
                    onPress={() => setCategoryFilter(cat === 'すべて' ? '' : cat)}
                  >
                    <Text style={[styles.filterChipText, isActive && { color: color ?? Colors.primary }]}>{cat}</Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          )}

          {visible.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>🍳</Text>
              <Text style={styles.emptyTitle}>レシピがありません</Text>
              <Text style={styles.emptySub}>右下の＋から追加できます</Text>
            </View>
          ) : (
            <View style={styles.list}>
              {visible.map(recipe => {
                const catColor = RECIPE_CATEGORY_COLORS[recipe.category] ?? Colors.textMuted
                return (
                  <TouchableOpacity
                    key={recipe.id}
                    style={styles.row}
                    onPress={() => router.push(`/recipe/${recipe.id}` as any)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: tint(catColor, '18') }]}>
                      <Ionicons name="restaurant-outline" size={20} color={catColor} />
                    </View>
                    <View style={styles.rowBody}>
                      <Text style={styles.rowTitle} numberOfLines={1}>{recipe.title}</Text>
                      <View style={styles.rowMeta}>
                        <View style={[styles.catBadge, { backgroundColor: tint(catColor, '18') }]}>
                          <Text style={[styles.catBadgeText, { color: catColor }]}>{recipe.category}</Text>
                        </View>
                        {recipe.url ? (
                          <Text style={styles.rowSub} numberOfLines={1}>🔗 {recipe.url}</Text>
                        ) : recipe.body ? (
                          <Text style={styles.rowSub} numberOfLines={1}>{recipe.body}</Text>
                        ) : null}
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
                  </TouchableOpacity>
                )
              })}
            </View>
          )}
        </ScrollView>
      )}

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/recipe/new' as any)}
        activeOpacity={0.85}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  navbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  navTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: Spacing.md, gap: 12, paddingBottom: 100 },
  filterRow: { marginBottom: 4 },
  filterRowContent: { gap: 8, paddingHorizontal: 0, paddingVertical: 4 },
  filterChip: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  filterChipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  empty: { alignItems: 'center', paddingTop: 80, gap: 8 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textMuted },
  list: { gap: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    padding: 14, borderWidth: 1, borderColor: Colors.border,
  },
  rowIcon: { width: 40, height: 40, borderRadius: Radius.md, alignItems: 'center', justifyContent: 'center' },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: Colors.text },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  catBadge: { borderRadius: Radius.full, paddingHorizontal: 8, paddingVertical: 2 },
  catBadgeText: { fontSize: 11, fontWeight: '700' },
  rowSub: { fontSize: 12, color: Colors.textMuted, flex: 1 },
  fab: {
    position: 'absolute', bottom: 32, right: 24,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: '#F43F5E',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#F43F5E', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8,
    elevation: 8,
  },
})
