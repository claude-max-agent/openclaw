# OpenClaw Phase 3 運用ガイド

Admin専用カスタム版OpenClawの安全な運用ガイド。
トレーディングBot暴走事故の再発防止を主目的とする。

## セットアップ手順

### 1. 環境準備

```bash
# リポジトリをクローン
git clone git@github.com:claude-max-agent/openclaw.git
cd openclaw

# 依存関係インストール
npm install

# ビルド
npm run build
```

### 2. 設定ファイル

Admin環境（RTX 3050 8GB VRAM）向けの推奨設定:

```yaml
# ~/.config/openclaw/config.yaml
models:
  default: ollama/llama3.2 # ローカルLLM優先
  fallback: claude-3-5-sonnet # 自前APIキー使用


# 不要なプロバイダは無効化済み（Phase 1で対応）
```

### 3. セーフティモジュール

セーフティモジュールはゲートウェイ起動時に自動的に有効化される。追加設定は不要。

#### 構成

| モジュール        | 役割                                   | デフォルト設定          |
| ----------------- | -------------------------------------- | ----------------------- |
| trading-filter    | トレーディング関連ログの検出・ブロック | 閾値: 30点              |
| context-isolation | trading/非tradingセッション間の分離    | strict                  |
| rate-limiter      | 外部API呼び出し上限                    | 30回/分, 500回/時       |
| kill-switch       | 異常検出時の自動停止                   | 60 API/分, 20エラー/5分 |

## 安全な運用ルール

### 基本原則

1. **OpenClawとトレーディングBotは完全分離して運用する**
   - 同一セッションでの混在禁止
   - ログ出力先を分離する
   - tmuxの別ペインで実行する場合、入出力の混線に注意

2. **自前APIキーのみを使用する**
   - 共有キー系プロバイダは無効化済み（Phase 1対応）
   - Ollama（ローカル）を優先利用

3. **レート制限を超えない**
   - 短時間での大量API呼び出しは自動ブロックされる
   - ブロック時はログを確認し原因を特定する

### セッション命名規則

トレーディング関連セッションには以下のプレフィックスを使用する:

- `crypto-*` (例: crypto-bot, crypto-analysis)
- `trading-*` (例: trading-bot, trading-signals)
- `trade-*`
- `bot-*`
- `hyperliquid-*`
- `exchange-*`

これらのプレフィックスを持つセッションは自動的に分離対象となる。

### やってはいけないこと

- トレーディングBotのログをOpenClawのセッションにパイプしない
- crypto-bot関連のコマンドをOpenClawセッション内で実行しない
- キルスイッチ発動中に手動リセットして再開しない（原因特定を優先）

## 暴走検知・対応フロー

### 検知レベル

| レベル               | 条件                                      | 自動対応                 |
| -------------------- | ----------------------------------------- | ------------------------ |
| **L1: 警告**         | トレーディングキーワード検出（閾値未満）  | ログ出力のみ             |
| **L2: ブロック**     | 閾値超過 or レート制限                    | 該当リクエストをブロック |
| **L3: キルスイッチ** | 大量API呼び出し/エラー/トレーディング検出 | 全操作停止               |

### L2: リクエストブロック時

1. ログを確認する

   ```bash
   # ゲートウェイログに [safety] プレフィックスで記録される
   grep '\[safety\]' ~/.local/share/openclaw/logs/gateway.log
   ```

2. 原因を特定する
   - `trading-filter`: トレーディング関連コンテンツが入力に含まれている
   - `rate-limiter`: API呼び出し頻度が高すぎる
   - `context-isolation`: セッション間のコンテキスト漏洩

3. 原因を除去して再試行する

### L3: キルスイッチ発動時

**重要: キルスイッチ発動時は全操作が停止する。手動リセットが必要。**

#### 対応手順

1. **落ち着いて状況を確認する**

   ```bash
   # キルスイッチの発動理由がログに記録される
   grep 'kill-switch triggered' ~/.local/share/openclaw/logs/gateway.log
   ```

2. **発動原因を特定する**
   - `API call rate exceeded`: 短時間に大量のAPI呼び出し → プロセスの暴走を疑う
   - `Error rate exceeded`: 繰り返しエラー → 設定ミスまたは外部サービス障害
   - `Trading content detected`: トレーディングログの流入 → ログパイプラインを確認

3. **原因を除去する**
   - 暴走プロセスがあれば停止する
   - ログパイプラインの混線を修正する
   - 設定を確認・修正する

4. **OpenClawを再起動する**（キルスイッチは起動時にリセットされる）

   ```bash
   # プロセスを停止
   pkill -f openclaw

   # 再起動
   openclaw gateway
   ```

### 以前の暴走事象と再発防止

#### 事象

- crypto-botのトレーディングログがOpenClawの入力に流入
- OpenClawがそのログを基にアクションを実行（暴走）

#### 原因

- セッション/コンテキストの分離不足

#### 再発防止（Phase 2/3で実装済み）

1. **trading-filter**: トレーディング関連キーワード46個＋高リスクパターン6個で自動検出
2. **context-isolation**: trading/非tradingセッション間のコンテキスト共有をブロック
3. **rate-limiter**: API呼び出し上限で被害を最小化
4. **kill-switch**: 異常検出時に自動停止（手動リセットまで復旧しない）

## トラブルシューティング

### OpenClawが起動しない

```bash
# Node.js 22+ が必要
node --version

# 依存関係の再インストール
rm -rf node_modules && npm install

# ビルド
npm run build
```

### セーフティモジュールが誤検知する

通常の会話でトレーディング関連キーワードが含まれる場合、誤ブロックされる可能性がある。
閾値30点なので、キーワード3個以上（各10点）またはパターン2個以上（各25点）で発動する。

対処:

- 一般的な会話では通常発動しない（3個以上のトレーディング用語が同時に出現する必要がある）
- 必要に応じて閾値を調整する（`src/safety/gateway-integration.ts` の `tradingFilterThreshold`）

### キルスイッチが頻繁に発動する

デフォルト設定（60 API/分, 20エラー/5分）で頻繁に発動する場合:

1. 正常な使用パターンでの発動か確認する
2. 必要に応じて `src/safety/gateway-integration.ts` の閾値を調整する
3. 外部サービスの障害でエラーが増加していないか確認する
