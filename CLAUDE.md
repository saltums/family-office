# Family Office 開発ガイド

このファイルは、このリポジトリで作業する AI（Claude Code / Muse）と開発者のための共通ガイドです。
作業を始める前にこのファイルと、関係する `docs/` の設計書を読んでください。

## アプリの概要

- 家族（世帯）単位で使う家計・生活管理アプリ「Family Office」
- 期限のある記録（保険・契約・身分証など）、TODO、書類、日記、お金（贈答の記録）、レシピ、パスワード、家族の誕生日や出来事などを一元管理する
- Web 版は部屋のモニタ用ダッシュボード表示も持つ

## 技術構成

- Expo SDK 51 / React Native 0.74 / React 18 / TypeScript
- ルーティングは expo-router（ファイルベース、`app/` 配下）
- バックエンドは Supabase（DB / Auth）。クライアントは `src/lib/supabase.ts`
- Web 版は GitHub Pages にデプロイ（`.github/workflows/pages.yml`、baseUrl は `/family-office`、出力は single）
- モバイルのビルドは EAS（`eas.json`）
- 依存パッケージへのパッチは `patches/`（patch-package、postinstall で適用）

## ディレクトリ

- `app/` — 画面（expo-router）。`(main)` がメイン画面群、`(auth)` が認証、`dashboard.tsx` がダッシュボード
- `src/lib/` — `supabase.ts`（クライアント）、`types.ts`（型の正）、`theme.ts`（色など）、`version.ts`（バージョンと変更履歴）
- `src/hooks/` — 認証や世帯情報のフック
- `src/components/` — 共通コンポーネント
- `docs/` — 機能ごとの設計書。設計判断はここに残す

## データモデルの要点

型定義は `src/lib/types.ts` が正です。主要テーブル:

- `households` / `household_members` — 世帯とメンバー。全データは `household_id` で世帯に紐づく
- `records` — 期限・タスク（`expiration_date`、カテゴリ、完了状態）
- `family_members` — 家族情報（誕生日を含む）
- `knowledge_items` — 知識ベース。`category` が `person` / `event` のものは `metadata` に `birth_date` / `event_date` を持つ
- その他: 書類（documents）、日記、写真、お金、レシピ、パスワード、カードなど

## カレンダーの現状

- `app/(main)/calendar.tsx` は「予定」専用テーブルを持たない
- `records` の期限・TODO、`family_members` と知識ベースの誕生日、知識ベースの出来事を、日付（YYYY-MM-DD）単位で集約して表示する
- 時刻の概念はない。時刻を持つ外部データを扱う場合は、先に設計書で決めること

## 作業の約束事

- 設計に影響する決定をしたら、コードと同じ変更の中で `docs/` の設計書を更新する。経緯はコミットメッセージだけに残さない
- バージョン表記は `src/lib/version.ts` の履歴とコミットメッセージ（例: `v0.9.93`）で管理する既存の運用に合わせる
- コミットメッセージは日本語で、変更内容を箇条書きにする既存のスタイルに合わせる
- 秘密情報をリポジトリに入れない。クライアント用は `EXPO_PUBLIC_` の公開値のみ（`.env.example` 参照）。サーバー側の秘密は Supabase Edge Function の secrets で持つ（既存例: pCloud、LINE）

## Google カレンダー連携

設計書は `docs/google-calendar.md`。現在は設計段階で、コードは未実装です。
連携に触る作業では、実装前に必ず設計書の「決めたこと」と「未決事項」を確認してください。
