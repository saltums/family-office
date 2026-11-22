import React, { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  Alert, ActivityIndicator, ScrollView, KeyboardAvoidingView,
  Platform, Share, Linking, Clipboard,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { router, useLocalSearchParams } from 'expo-router'
import { supabase } from '@/lib/supabase'
import { Recipe, RECIPE_CATEGORIES, RECIPE_CATEGORY_COLORS, RecipeCategory } from '@/lib/types'
import { Colors, Radius, Spacing, tint } from '@/lib/theme'

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [recipe, setRecipe] = useState<Recipe | null>(null)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState<RecipeCategory>('その他')
  const [url, setUrl] = useState('')
  const [body, setBody] = useState('')
  const [memo, setMemo] = useState('')
  const [mode, setMode] = useState<'url' | 'text'>('url')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('recipes').select('*').eq('id', id).single().then(({ data }) => {
      if (data) {
        const d = data as Recipe
        setRecipe(d)
        setTitle(d.title)
        setCategory(d.category)
        setUrl(d.url ?? '')
        setBody(d.body ?? '')
        setMemo(d.memo ?? '')
        setMode(d.url ? 'url' : 'text')
      }
      setLoading(false)
    })
  }, [id])

  async function saveEdit() {
    if (!title.trim()) { Alert.alert('入力エラー', '料理名を入力してください'); return }
    setSaving(true)
    try {
      const { error } = await supabase.from('recipes').update({
        title: title.trim(),
        category,
        url: mode === 'url' ? url.trim() || null : null,
        body: mode === 'text' ? body.trim() || null : null,
        memo: memo.trim() || null,
        updated_at: new Date().toISOString(),
      }).eq('id', id)
      if (error) throw error
      setRecipe(prev => prev ? { ...prev, title: title.trim(), category, url: mode === 'url' ? url.trim() || null : null, body: mode === 'text' ? body.trim() || null : null, memo: memo.trim() || null } : null)
      setEditing(false)
    } catch (e: any) {
      Alert.alert('保存エラー', e.message)
    } finally {
      setSaving(false)
    }
  }

  function confirmDelete() {
    Alert.alert('削除', `「${recipe?.title}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          await supabase.from('recipes').delete().eq('id', id)
          router.back()
        },
      },
    ])
  }

  function copyContent() {
    if (!recipe) return
    const text = recipe.url ?? recipe.body ?? ''
    Clipboard.setString(text)
    Alert.alert('コピーしました')
  }

  async function shareRecipe() {
    if (!recipe) return
    const content = recipe.url
      ? `【レシピ】\n${recipe.title}\n${recipe.url}`
      : `【レシピ】\n${recipe.title}\n${recipe.body ?? ''}`
    await Share.share({ message: content })
  }

  function openUrl() {
    if (recipe?.url) Linking.openURL(recipe.url)
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><ActivityIndicator color={Colors.primary} /></View>
      </SafeAreaView>
    )
  }

  if (!recipe) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><Text>データが見つかりません</Text></View>
      </SafeAreaView>
    )
  }

  const catColor = RECIPE_CATEGORY_COLORS[recipe.category] ?? Colors.textMuted

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <View style={styles.navbar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.navTitle} numberOfLines={1}>{editing ? '編集' : recipe.title}</Text>
          {editing ? (
            <TouchableOpacity
              style={[styles.saveBtn, saving && { opacity: 0.5 }]}
              onPress={saveEdit}
              disabled={saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveBtnText}>保存</Text>}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={() => setEditing(true)} hitSlop={8}>
              <Ionicons name="pencil-outline" size={22} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {editing ? (
            <>
              <View style={styles.card}>
                <Text style={styles.label}>料理名</Text>
                <TextInput style={styles.input} value={title} onChangeText={setTitle} autoFocus={false} />
              </View>

              <View style={styles.card}>
                <Text style={styles.label}>カテゴリ</Text>
                <View style={styles.chipGrid}>
                  {RECIPE_CATEGORIES.map(cat => {
                    const color = RECIPE_CATEGORY_COLORS[cat]
                    const active = category === cat
                    return (
                      <TouchableOpacity
                        key={cat}
                        style={[styles.chip, active && { backgroundColor: tint(color, '22'), borderColor: color }]}
                        onPress={() => setCategory(cat)}
                      >
                        <Text style={[styles.chipText, active && { color }]}>{cat}</Text>
                      </TouchableOpacity>
                    )
                  })}
                </View>
              </View>

              <View style={styles.card}>
                <View style={styles.modeToggle}>
                  <TouchableOpacity
                    style={[styles.modeBtn, mode === 'url' && styles.modeBtnActive]}
                    onPress={() => setMode('url')}
                  >
                    <Ionicons name="link-outline" size={16} color={mode === 'url' ? '#fff' : Colors.textMuted} />
                    <Text style={[styles.modeBtnText, mode === 'url' && styles.modeBtnTextActive]}>URL</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeBtn, mode === 'text' && styles.modeBtnActive]}
                    onPress={() => setMode('text')}
                  >
                    <Ionicons name="document-text-outline" size={16} color={mode === 'text' ? '#fff' : Colors.textMuted} />
                    <Text style={[styles.modeBtnText, mode === 'text' && styles.modeBtnTextActive]}>テキスト</Text>
                  </TouchableOpacity>
                </View>

                {mode === 'url' ? (
                  <>
                    <Text style={[styles.label, { marginTop: 14 }]}>URL</Text>
                    <TextInput style={styles.input} value={url} onChangeText={setUrl} keyboardType="url" autoCapitalize="none" autoCorrect={false} />
                  </>
                ) : (
                  <>
                    <Text style={[styles.label, { marginTop: 14 }]}>レシピ内容</Text>
                    <TextInput style={[styles.input, styles.inputMulti]} value={body} onChangeText={setBody} multiline textAlignVertical="top" />
                  </>
                )}
              </View>

              <View style={styles.card}>
                <Text style={styles.label}>メモ</Text>
                <TextInput style={[styles.input, styles.inputMulti]} value={memo} onChangeText={setMemo} multiline textAlignVertical="top" />
              </View>
            </>
          ) : (
            <>
              {/* ヘッダーカード */}
              <View style={styles.mainCard}>
                <View style={styles.mainCardHeader}>
                  <View style={[styles.recipeIcon, { backgroundColor: tint(catColor, '18') }]}>
                    <Ionicons name="restaurant-outline" size={22} color={catColor} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recipeTitle}>{recipe.title}</Text>
                    <View style={[styles.catBadge, { backgroundColor: tint(catColor, '18') }]}>
                      <Text style={[styles.catBadgeText, { color: catColor }]}>{recipe.category}</Text>
                    </View>
                  </View>
                </View>

                {/* URL */}
                {recipe.url && (
                  <View style={styles.contentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>URL</Text>
                      <TouchableOpacity onPress={openUrl} activeOpacity={0.7}>
                        <Text style={styles.urlText} numberOfLines={2}>{recipe.url}</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity onPress={copyContent} style={styles.iconBtn} hitSlop={8}>
                      <Ionicons name="copy-outline" size={20} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                )}

                {/* テキスト */}
                {recipe.body && (
                  <View style={styles.contentRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>レシピ</Text>
                      <Text style={styles.bodyText}>{recipe.body}</Text>
                    </View>
                    <TouchableOpacity onPress={copyContent} style={styles.iconBtn} hitSlop={8}>
                      <Ionicons name="copy-outline" size={20} color={Colors.primary} />
                    </TouchableOpacity>
                  </View>
                )}

                {/* メモ */}
                {recipe.memo && (
                  <View style={[styles.contentRow, { borderTopWidth: 1, borderTopColor: Colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.fieldLabel}>メモ</Text>
                      <Text style={styles.bodyText}>{recipe.memo}</Text>
                    </View>
                  </View>
                )}
              </View>

              {/* シェアボタン */}
              <TouchableOpacity style={styles.shareBtn} onPress={shareRecipe} activeOpacity={0.85}>
                <Ionicons name="share-social-outline" size={20} color="#fff" />
                <Text style={styles.shareBtnText}>「今晩これ作ってほしい」と送る</Text>
              </TouchableOpacity>

              {recipe.url && (
                <TouchableOpacity style={styles.openUrlBtn} onPress={openUrl} activeOpacity={0.85}>
                  <Ionicons name="open-outline" size={18} color={Colors.primary} />
                  <Text style={styles.openUrlText}>ブラウザで開く</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
                <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                <Text style={styles.deleteBtnText}>削除</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  navTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  saveBtn: { backgroundColor: '#F43F5E', borderRadius: Radius.full, paddingHorizontal: 16, paddingVertical: 6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  container: { padding: Spacing.md, gap: 12, paddingBottom: 60 },
  mainCard: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    borderWidth: 1, borderColor: Colors.border, overflow: 'hidden',
  },
  mainCardHeader: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    padding: Spacing.md,
  },
  recipeIcon: {
    width: 44, height: 44, borderRadius: Radius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  recipeTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 6 },
  catBadge: { alignSelf: 'flex-start', borderRadius: Radius.full, paddingHorizontal: 10, paddingVertical: 3 },
  catBadgeText: { fontSize: 12, fontWeight: '700' },
  contentRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    paddingHorizontal: Spacing.md, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  fieldLabel: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  urlText: { fontSize: 14, color: Colors.primary, textDecorationLine: 'underline', lineHeight: 20 },
  bodyText: { fontSize: 15, color: Colors.text, lineHeight: 22 },
  iconBtn: { padding: 4, marginTop: 14 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#F43F5E', borderRadius: Radius.lg, paddingVertical: 14,
    shadowColor: '#F43F5E', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 6,
    elevation: 5,
  },
  shareBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  openUrlBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1.5, borderColor: Colors.primary, borderRadius: Radius.lg, paddingVertical: 12,
  },
  openUrlText: { color: Colors.primary, fontWeight: '600', fontSize: 14 },
  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1, borderColor: Colors.danger, borderRadius: Radius.md, paddingVertical: 12, marginTop: 8,
  },
  deleteBtnText: { color: Colors.danger, fontWeight: '600', fontSize: 14 },
  // 編集モード
  card: {
    backgroundColor: Colors.card, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
  },
  label: { fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { fontSize: 16, color: Colors.text, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  inputMulti: { minHeight: 100, lineHeight: 22 },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1.5, borderColor: Colors.border, borderRadius: Radius.full,
    paddingHorizontal: 14, paddingVertical: 6,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },
  modeToggle: {
    flexDirection: 'row', backgroundColor: Colors.bg,
    borderRadius: Radius.md, padding: 3, gap: 3,
  },
  modeBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8, borderRadius: Radius.sm,
  },
  modeBtnActive: { backgroundColor: '#F43F5E' },
  modeBtnText: { fontSize: 14, fontWeight: '600', color: Colors.textMuted },
  modeBtnTextActive: { color: '#fff' },
})
