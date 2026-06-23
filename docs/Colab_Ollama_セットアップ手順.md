# Google ColabでOllamaを起動してAVITOに接続する手順

## 必要なもの
- Googleアカウント（Google Colabの無料枠で可）
- ngrokアカウント（無料: https://ngrok.com）→ ダッシュボードでAuthTokenを取得

## Colabで実行するコード（順番に実行）

### セル1: Ollamaインストールと起動
```python
!curl -fsSL https://ollama.com/install.sh | sh
import subprocess, time
subprocess.Popen(["ollama", "serve"])
time.sleep(3)
print("Ollama起動完了")
```

### セル2: モデルのダウンロード（1つ選んで実行）
```python
# ★ 推奨: 品質と速度のバランスが良い
!ollama pull gemma3:12b      # 約8GB / T4 GPUで動作

# 他の選択肢
# !ollama pull gemma3:4b     # 約3.3GB / 軽量・高速
# !ollama pull gemma4:12b    # 約8GB / 最新モデル
# !ollama pull qwen2.5:7b    # 約4.7GB / 日本語+数値処理に強い
# !ollama pull qwen2.5:14b   # 約9GB / 高精度
# !ollama pull qwen2.5:72b   # 約41GB / 最高精度（Colab Pro+推奨）
```

### セル3: ngrokでURLを公開
```python
!pip install pyngrok -q
from pyngrok import ngrok
ngrok.set_auth_token("ここにngrokのAuthTokenを貼る")
tunnel = ngrok.connect(11434, "http")
print(f"\n✅ 外部OllamaのURL: {tunnel.public_url}")
print("↑ このURLをAVITOの設定画面に入力してください")
```

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
