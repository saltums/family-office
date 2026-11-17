// デザイントークン: 柔らかく見やすいスマホUI
export const Colors = {
  primary: '#4F8EF7',       // 柔らかいブルー
  primaryLight: '#EBF2FF',
  danger: '#F87171',
  dangerLight: '#FEF2F2',
  warning: '#FBBF24',
  warningLight: '#FFFBEB',
  success: '#34D399',
  successLight: '#ECFDF5',

  bg: '#F7F8FC',            // 温かみのある薄いグレー
  card: '#FFFFFF',
  border: '#E5E7EB',
  borderFocus: '#4F8EF7',

  text: '#1F2937',          // ほぼ黒
  textSecondary: '#6B7280',
  textMuted: '#9CA3AF',
  placeholder: '#BFC6D0',
}

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
}

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  full: 999,
}

export const Font = {
  regular: '400' as const,
  medium: '500' as const,
  semiBold: '600' as const,
  bold: '700' as const,
  extraBold: '800' as const,
}

// 最低タップ領域 (Apple HIG: 44pt)
export const MIN_TAP = 44
