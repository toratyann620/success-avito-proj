# AVITO 外部Ollama（Google Colab）対応 要件定義書
## Google Colab経由でのマルチモデルテスト基盤の実装

**文書バージョン**: 1.0
**作成日**: 2026-06-23
**対象プロジェクト**: AVITO（success-avito-proj）
**改修担当**: Antigravity（一次実装）→ Claude Code（ブラッシュアップ）

---

## 0. この文書の読み方（実装AIへの最重要指示）

> **この要件定義書は「契約書」です。記載された範囲のみを実装し、記載のない変更を一切行わないこと。**

### 0.1 絶対厳守の禁止事項（DO NOT）

以下は**絶対に変更してはいけないファイル**です。

| # | 禁止対象 | 理由 |
|---|---------|------|
| 1 | `app/api/routers/output.py` | 完成済み |
| 2 | `app/api/routers/documents.py` | 完成済み |
| 3 | `app/api/routers/sources.py` | 完成済み |
| 4 | `app/api/routers/voice.py` | 完成済み |
| 5 | `app/api/routers/chat.py` | 完成済み |
| 6 | `app/api/services/rag_engine.py` | 完成済み |
| 7 | `app/api/services/vector_engine.py` | 完成済み |
| 8 | `step2/` 配下すべて | NL2SQL・二重防御 |
| 9 | `llm_client.py` の `_is_claude_model()` / `_chat_claude()` / `_generate_claude()` | Claude API実装済み。触ると壊れる |
| 10 | `settings.py` の `_get_claude_models()` / Claude関連バリデーション | Claude API実装済み |
| 11 | `page.tsx` の `☁️ claude-` 警告UI | 実装済み |

### 0.2 本改修のスコープ（DO）

**外部Ollama（Google Colab）対応のみ。** 具体的には以下の7ファイルのみ変更する。

| ファイル | 変更内容 |
|---------|---------|
| `app/api/services/llm_client.py` | `remote/` プレフィックス対応を追加 |
| `app/api/routers/settings.py` | 外部OllamaのURL管理APIを追加 |
| `app/frontend/src/app/page.tsx` | 外部OllamaのURL設定UIを追加 |
| `app/api/requirements.txt` | 変更なし（追加ライブラリ不要） |
| `.env.example` | 新規環境変数2つを追記 |
| `docker-compose.yml` | 新規環境変数2つのマッピングを追記 |
| `docs/Colab_Ollama_セットアップ手順.md` | 新規作成 |
| `docs/外部Ollama_実装ログ.md` | 新規作成（Antigravity記録用） |

### 0.3 判断に迷ったら

本書に記載のないファイルは**絶対に変更しない**。迷ったらログに記録して保留する。

---

## 1. 改修の目的

### 1.1 現状

AVITOのLLMバックエンドは以下の2種類が対応済み:
- ローカルOllama（`gemma3:4b` 等）
- Claude API（`claude-haiku-4-5` 等）

### 1.2 追加するもの

**外部Ollama（Google Colab）対応**を追加する。

Google ColabのGPU上でOllamaを起動し、ngrokでURLを公開することで、M1 16GBでは動かせない大型モデル（`gemma3:12b`、`qwen2.5:72b` 等）をAVITOから使えるようにする。

### 1.3 接続の仕組み

```
AVITO（Mac）
    ↓ HTTP（OLLAMA_REMOTE_URL経由）
ngrok公開URL（例: https://xxxx.ngrok-free.app）
    ↓ トンネル
Google Colab（Ollama + gemma3:12b等）
```

---

## 2. モデル名の命名規則（重要）

**モデル名のプレフィックスでバックエンドを判定する。**

| モデル名のパターン | バックエンド | 接続先 |
|---|---|---|
| `claude-` で始まる | Claude API | Anthropic API（実装済み） |
| `remote/` で始まる | 外部Ollama | `OLLAMA_REMOTE_URL` |
| それ以外 | ローカルOllama | `OLLAMA_BASE_URL`（既存） |

例:
- `gemma3:4b` → ローカルOllama（既存）
- `claude-haiku-4-5` → Claude API（実装済み）
- `remote/gemma3:12b` → 外部Ollama（今回追加）★
- `remote/qwen2.5:72b` → 外部Ollama（今回追加）★

---

## 3. llm_client.py の変更内容

### 3.1 追加するメソッド（3つ）

以下を `LLMClient` クラスに追加する。**既存メソッドは一切変更しない。**

```python
def _is_remote_ollama(self) -> bool:
    """モデル名が 'remote/' で始まる場合、外部Ollamaを使用する"""
    return self.model.startswith("remote/")

def _get_actual_model_name(self) -> str:
    """'remote/' プレフィックスを除去して実際のモデル名を返す
    例: 'remote/gemma3:12b' → 'gemma3:12b'
    """
    if self._is_remote_ollama():
        return self.model[len("remote/"):]
    return self.model

def _get_ollama_url(self) -> str:
    """接続先OllamaのURLを返す
    remote/モデルの場合: OLLAMA_REMOTE_URL
    それ以外: self.base_url（既存のOLLAMA_BASE_URL）
    """
    if self._is_remote_ollama():
        url = os.getenv("OLLAMA_REMOTE_URL", "")
        if not url:
            raise ValueError(
                "外部OllamaのURLが設定されていません。"
                "設定画面で OLLAMA_REMOTE_URL を設定してください。"
            )
        return url.rstrip("/")
    return self.base_url
```

### 3.2 変更するメソッド（2つ）

**`chat()` メソッド**: 既存の `if self._is_claude_model():` の分岐に、`elif self._is_remote_ollama():` を追加する。

```python
async def chat(self, messages: list[dict], system_prompt: str = None) -> str:
    if self._is_claude_model():
        return await self._chat_claude(messages, system_prompt)  # 既存・変更しない
    else:
        # ローカル・外部両方をこの1つのOllama処理で対応
        # _get_ollama_url()と_get_actual_model_name()を使って接続先を切り替える
        return await self._chat_ollama_with_url(
            messages,
            system_prompt,
            base_url=self._get_ollama_url(),
            model=self._get_actual_model_name(),
        )
```

**`generate()` メソッド**: 同様に外部Ollamaに対応させる。

```python
async def generate(self, prompt: str, timeout: int = None) -> str:
    if self._is_claude_model():
        return await self._generate_claude(prompt)  # 既存・変更しない
    else:
        return await self._generate_ollama_with_url(
            prompt,
            base_url=self._get_ollama_url(),
            model=self._get_actual_model_name(),
            timeout=timeout,
        )
```

### 3.3 追加する内部メソッド（2つ）

現在の `_chat_ollama()` と同等だが、`base_url` と `model` を引数で受け取れるバージョンを追加する。

> **重要**: 現在の `_chat_ollama()` が存在する場合はそのまま残す。新たに `_chat_ollama_with_url()` を追加する形にする。既存の `chat()` が `_chat_ollama()` を呼んでいる場合は、`_chat_ollama_with_url(base_url=self.base_url, model=self.model)` に置き換える。

```python
async def _chat_ollama_with_url(
    self,
    messages: list[dict],
    system_prompt: str = None,
    base_url: str = None,
    model: str = None,
) -> str:
    """base_urlとmodelを引数で受け取るOllamaチャット処理
    ローカル・外部Ollama両方で使う共通処理
    """
    _base_url = base_url or self.base_url
    _model = model or self.model
    _timeout = int(os.getenv("OLLAMA_REMOTE_TIMEOUT", "300")) \
               if self._is_remote_ollama() \
               else self.timeout
    # 以下は現在の _chat_ollama() または chat() の中のOllama処理と同じ実装
    # （既存コードをそのままコピーして base_url と model を引数に差し替える）
```

```python
async def _generate_ollama_with_url(
    self,
    prompt: str,
    base_url: str = None,
    model: str = None,
    timeout: int = None,
) -> str:
    """base_urlとmodelを引数で受け取るOllama generate処理"""
    _base_url = base_url or self.base_url
    _model = model or self.model
    _timeout = timeout or (
        int(os.getenv("OLLAMA_REMOTE_TIMEOUT", "300"))
        if self._is_remote_ollama()
        else self.timeout
    )
    # 以下は現在の generate() の中のOllama処理と同じ実装
```

### 3.4 タイムアウトの設計

| バックエンド | タイムアウト値 | 環境変数 |
|---|---|---|
| ローカルOllama | `OLLAMA_TIMEOUT`（既存） | 現行通り |
| 外部Ollama（Colab） | `OLLAMA_REMOTE_TIMEOUT`（新規） | デフォルト300秒 |
| Claude API | anthropicライブラリのデフォルト | 既存通り |

---

## 4. settings.py の変更内容

### 4.1 `_fetch_available_models()` への追加

既存の関数に外部Ollamaのモデル取得を**追記**する（既存のOllama/Claude取得処理は変更しない）。

```python
# 既存のローカルOllama取得処理の後に追記
remote_url = os.getenv("OLLAMA_REMOTE_URL", "")
if remote_url:
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(
                f"{remote_url.rstrip('/')}/api/tags",
                headers={"ngrok-skip-browser-warning": "true"},
            )
            for m in res.json().get("models", []):
                models.append(f"remote/{m['name']}")
    except Exception as e:
        logger.warning(f"外部Ollama ({remote_url}) への接続に失敗: {e}")
```

> **注意**: ngrokのURLにアクセスする際、`ngrok-skip-browser-warning: true` ヘッダーが必要。これがないとngrokの警告ページが返る。

### 4.2 `PATCH /api/settings/model` のバリデーション追加

既存のバリデーションに `remote/` モデルのチェックを追加する。

```python
# 既存のclaude-バリデーションの後に追記
elif request.model.startswith("remote/"):
    if not os.getenv("OLLAMA_REMOTE_URL", ""):
        raise HTTPException(
            status_code=400,
            detail="外部OllamaのURLが設定されていません。設定画面でURLを入力してください。",
        )
```

### 4.3 新規エンドポイント: `GET /api/settings/remote-url`

```python
@router.get("/remote-url")
async def get_remote_url():
    """外部OllamaのURLと接続状態を返す"""
    url = os.getenv("OLLAMA_REMOTE_URL", "")
    connected = False
    if url:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                res = await client.get(
                    f"{url.rstrip('/')}/api/tags",
                    headers={"ngrok-skip-browser-warning": "true"},
                )
                connected = res.status_code == 200
        except Exception:
            connected = False
    return {"url": url, "connected": connected}
```

### 4.4 新規エンドポイント: `PATCH /api/settings/remote-url`

```python
class RemoteUrlRequest(BaseModel):
    url: str

@router.patch("/remote-url")
async def update_remote_url(request: RemoteUrlRequest):
    """外部OllamaのURLを保存してリアルタイム反映する"""
    url = request.url.strip()

    # URLの形式検証
    if url and not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(
            status_code=400,
            detail="URLは http:// または https:// で始まる必要があります",
        )

    # DBに保存
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('ollama_remote_url', ?)",
        (url,),
    )
    conn.commit()
    conn.close()

    # リアルタイム反映
    os.environ["OLLAMA_REMOTE_URL"] = url

    logger.info(f"外部OllamaのURLを設定しました: {url}")
    return {"url": url, "message": "外部OllamaのURLを設定しました"}
```

### 4.5 起動時のDB読み込み

APIサーバー起動時に `settings` テーブルから `ollama_remote_url` を読み込んで環境変数に反映する処理を `main.py` の `lifespan` または `settings.py` の初期化部分に追加する。

```python
# main.py の lifespan 内、または settings.py のモジュールレベルに追加
def _load_remote_url_from_db():
    try:
        conn = sqlite3.connect(DB_PATH)
        row = conn.execute(
            "SELECT value FROM settings WHERE key='ollama_remote_url'"
        ).fetchone()
        conn.close()
        if row and row[0]:
            os.environ["OLLAMA_REMOTE_URL"] = row[0]
    except Exception:
        pass
```

---

## 5. page.tsx の変更内容

### 5.1 外部OllamaのURL設定欄（設定モーダル）

既存の設定モーダル（SettingsModal）に以下を追加する。**既存の自動検索PATH設定・モデル切替UIは変更しない。**

追加場所: モデル切替セクションの直下

```
【外部Ollama（Google Colab等）】
URL入力欄: [https://xxxx.ngrok-free.app          ]
[接続確認] ボタン → 押すと GET /api/settings/remote-url を呼ぶ
                → 成功: "✅ 接続成功（モデル一覧を再取得）"
                → 失敗: "❌ 接続失敗（URLを確認してください）"
[保存] ボタン → PATCH /api/settings/remote-url を呼ぶ
              → 保存後、モデルドロップダウンを再取得
```

### 5.2 モデルドロップダウンの表示改善

既存の `☁️ claude-（外部API）` に加えて、`remote/` モデルの表示を追加する。

```typescript
// 既存のclaude-表示の後に追加
const formatModelName = (model: string): string => {
    if (model.startsWith("claude-")) {
        return `☁️ ${model}（Claude API）`;
    } else if (model.startsWith("remote/")) {
        return `🌐 ${model.replace("remote/", "")}（Colab）`;
    }
    return `💻 ${model}（ローカル）`;
};
```

### 5.3 警告表示

`remote/` モデル選択時に警告を追加する（既存のclaude-警告と同様の形式）。

```
⚠️ チャット内容が外部サーバー（Google Colab）に送信されます
```

---

## 6. 環境変数の追加

### 6.1 .env.example への追記

```ini
# ===== 外部Ollama（Google Colab等）=====
# ngrokで公開したOllamaのURL（例: https://xxxx.ngrok-free.app）
OLLAMA_REMOTE_URL=
# 外部Ollamaのタイムアウト（秒）。Colab+大型モデルは長めに設定
OLLAMA_REMOTE_TIMEOUT=300
```

### 6.2 docker-compose.yml への追記

apiサービスの `environment` に追記:

```yaml
- OLLAMA_REMOTE_URL=${OLLAMA_REMOTE_URL:-}
- OLLAMA_REMOTE_TIMEOUT=${OLLAMA_REMOTE_TIMEOUT:-300}
```

---

## 7. Google Colab セットアップ手順書

`docs/Colab_Ollama_セットアップ手順.md` を新規作成する。

```markdown
# Google ColabでOllamaを起動してAVITOに接続する手順

## 必要なもの
- Googleアカウント（Google Colabの無料枠で可）
- ngrokアカウント（無料: https://ngrok.com）→ ダッシュボードでAuthTokenを取得

## Colabで実行するコード（順番に実行）

### セル1: Ollamaインストールと起動
\`\`\`python
!curl -fsSL https://ollama.com/install.sh | sh
import subprocess, time
subprocess.Popen(["ollama", "serve"])
time.sleep(3)
print("Ollama起動完了")
\`\`\`

### セル2: モデルのダウンロード（1つ選んで実行）
\`\`\`python
# ★ 推奨: 品質と速度のバランスが良い
!ollama pull gemma3:12b      # 約8GB / T4 GPUで動作

# 他の選択肢
# !ollama pull gemma3:4b     # 約3.3GB / 軽量・高速
# !ollama pull gemma4:12b    # 約8GB / 最新モデル
# !ollama pull qwen2.5:7b    # 約4.7GB / 日本語+数値処理に強い
# !ollama pull qwen2.5:14b   # 約9GB / 高精度
# !ollama pull qwen2.5:72b   # 約41GB / 最高精度（Colab Pro+推奨）
\`\`\`

### セル3: ngrokでURLを公開
\`\`\`python
!pip install pyngrok -q
from pyngrok import ngrok
ngrok.set_auth_token("ここにngrokのAuthTokenを貼る")
tunnel = ngrok.connect(11434, "http")
print(f"\\n✅ 外部OllamaのURL: {tunnel.public_url}")
print("↑ このURLをAVITOの設定画面に入力してください")
\`\`\`

## AVITOへの設定方法

1. 上記で表示されたURL（例: `https://xxxx.ngrok-free.app`）をコピー
2. AVITOを開き、左パネル下部の「設定」をクリック
3. 「外部Ollama URL」欄にURLを貼り付ける
4. 「接続確認」ボタンを押して「✅ 接続成功」と表示されることを確認
5. 「保存」ボタンを押す
6. モデルドロップダウンに「🌐 gemma3:12b（Colab）」が表示される
7. 選択して「切り替える」を押す

## 注意事項

- Colabの**無料セッションは最大12時間**で自動終了します
- セッション終了後はURLが変わるため、再度セル3を実行して新しいURLを設定画面に入力してください
- モデルは**セッションごとに再ダウンロード**が必要です（セル2を再実行）
- T4 GPUは**セッションごとの利用時間に上限**があります（無料枠は週数時間程度）
- より長時間・大型モデルを使う場合はColab Proの契約を検討してください
```

---

## 8. 実装ログの記録形式

`docs/外部Ollama_実装ログ.md` を新規作成し、以下の形式で記録する。

```markdown
# 外部Ollama（Google Colab）対応 実装ログ（Antigravity記録）

## [日時] ステップN: <タイトル>
### 変更ファイル
- path/to/file（変更種別）
### 変更内容
- 具体的に何をどう変えたか
### 判断・選択
- 要件定義書のどの項に対応するか
- 迷った点・独自判断
### 禁止事項チェック
- 禁止対象ファイルを変更していないか
```

---

## 9. 受け入れ基準

| # | テスト | 期待結果 |
|---|--------|---------|
| 1 | `docker compose build api` | エラーなし |
| 2 | `docker compose up -d api` | healthy |
| 3 | `GET /api/settings/remote-url` | `{"url":"","connected":false}` |
| 4 | `PATCH /api/settings/remote-url` でngrok URLを設定 | `{"url":"https://...","message":"設定しました"}` |
| 5 | `GET /api/settings/remote-url` | `{"url":"https://...","connected":true}` |
| 6 | `GET /api/settings/model` | `remote/gemma3:12b` 等が一覧に出る |
| 7 | `remote/gemma3:12b` に切り替えてチャット送信 | Colabのgemma3:12bで回答が返る |
| 8 | ローカルOllamaに戻す | 従来通り動作する |
| 9 | Claude APIに切り替える | 従来通り動作する（既存機能の非破壊確認） |
| 10 | 設定画面にURL入力欄が表示される | 接続確認・保存ができる |

---

## 10. 成果物チェックリスト

```
□ app/api/services/llm_client.py
  □ _is_remote_ollama() 追加
  □ _get_actual_model_name() 追加
  □ _get_ollama_url() 追加
  □ _chat_ollama_with_url() 追加
  □ _generate_ollama_with_url() 追加
  □ chat() / generate() が remote/ を正しく処理する

□ app/api/routers/settings.py
  □ _fetch_available_models() に外部Ollama取得を追加
  □ PATCH /api/settings/model に remote/ バリデーション追加
  □ GET /api/settings/remote-url 追加
  □ PATCH /api/settings/remote-url 追加
  □ 起動時のDB読み込み追加

□ app/frontend/src/app/page.tsx
  □ URL設定欄（入力・接続確認・保存）追加
  □ モデル表示改善（🌐 Colab / ☁️ Claude API / 💻 ローカル）
  □ remote/ 選択時の警告表示追加

□ .env.example
  □ OLLAMA_REMOTE_URL 追加
  □ OLLAMA_REMOTE_TIMEOUT 追加

□ docker-compose.yml
  □ OLLAMA_REMOTE_URL マッピング追加
  □ OLLAMA_REMOTE_TIMEOUT マッピング追加

□ docs/Colab_Ollama_セットアップ手順.md 新規作成
□ docs/外部Ollama_実装ログ.md 新規作成（記録しながら進める）
□ CLAUDE.md 更新
□ 受け入れ基準 10項目クリア
```

---

**以上。この要件定義書の範囲を厳守すること。記載外の改修は行わないこと。**
