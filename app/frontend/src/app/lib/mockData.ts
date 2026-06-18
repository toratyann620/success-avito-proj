// 型定義
export type UserRole = "admin" | "user";

export type FileType = "excel" | "word" | "powerpoint" | null;

export interface FileChip {
  type: FileType;
  filename: string;
  size: string;
  downloadUrl: string;
}

// 思考フェーズ（プロンプト種別ごとに異なるフェーズを定義）
export interface ThinkingPhase {
  label: string;
  durationMs: number;
}

export const THINKING_PHASES: Record<string, ThinkingPhase[]> = {
  excel: [
    { label: "社内DBを検索中...", durationMs: 900 },
    { label: "前回の見積情報を照合中...", durationMs: 900 },
    { label: "Excelフォーマットを適用中...", durationMs: 800 },
    { label: "ファイルを生成中...", durationMs: 700 },
  ],
  word: [
    { label: "業務ログを収集中...", durationMs: 1000 },
    { label: "担当者レポートを要約中...", durationMs: 1000 },
    { label: "標準フォーマットに整形中...", durationMs: 800 },
    { label: "Wordドキュメントを生成中...", durationMs: 700 },
  ],
  pptx: [
    { label: "類似案件をRAG検索中...", durationMs: 1000 },
    { label: "市場動向データを分析中...", durationMs: 1100 },
    { label: "スライド構成を最適化中...", durationMs: 900 },
    { label: "PowerPointを生成中...", durationMs: 800 },
  ],
  strengths: [
    { label: "社内ナレッジを横断検索中...", durationMs: 1200 },
    { label: "847件のドキュメントを分析中...", durationMs: 1000 },
    { label: "強みと課題を抽出中...", durationMs: 800 },
  ],
  finance_admin: [
    { label: "決算資料へのアクセスを認証中...", durationMs: 800 },
    { label: "機密DBから財務データを取得中...", durationMs: 1200 },
    { label: "営業利益推移を集計中...", durationMs: 900 },
  ],
  finance_user: [
    { label: "権限を確認中...", durationMs: 800 },
    { label: "アクセスポリシーを照合中...", durationMs: 600 },
  ],
  default: [
    { label: "社内ナレッジを検索中...", durationMs: 1000 },
    { label: "関連情報を分析中...", durationMs: 900 },
  ],
};

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  fileChip?: FileChip;
  richContent?: RichContent;
  htmlContent?: string;         // Claude生成ダッシュボードHTML
  attachedFileName?: string;    // アップロードしたファイル名
  isRestricted?: boolean;
  thinkingKey?: string;
  timestamp: Date;
}

export interface RichContent {
  type: "bullets" | "table" | "chart";
  data: BulletItem[] | TableData | ChartData;
}

export interface BulletItem {
  label: string;
  items: string[];
  icon: string;
}

export interface TableData {
  headers: string[];
  rows: string[][];
  summary: string;
}

export interface ChartData {
  labels: string[];
  values: number[];
  unit: string;
}

export interface HistoryItem {
  id: string;
  title: string;
  timestamp: Date;
}

// =====================================
// モック応答データ
// =====================================

export function getMockResponse(
  prompt: string,
  role: UserRole
): Omit<Message, "id" | "timestamp" | "role"> {
  const trimmed = prompt.trim();

  // 1. Excel見積書（初回作成）
  if (trimmed.includes("A商品") && trimmed.includes("見積書") && !trimmed.includes("宛名") && !trimmed.includes("利益")) {
    return {
      content:
        "※過去の見積書をもとに作成いたしました。\n\nこちらが見積書のプレビューです。内容をご確認いただき、修正があればお申し付けください。",
      richContent: {
        type: "table",
        data: {
          headers: ["No", "商品コード", "内容", "単価", "数量", "金額"],
          rows: [
            ["1", "作業", "A商品（システム導入作業）", "¥50,000", "2", "¥100,000"],
            ["", "", "", "", "小計", "¥100,000"],
            ["", "", "", "", "消費税(10%)", "¥10,000"],
            ["", "", "", "", "合計", "¥110,000"],
          ],
          summary: "宛名：合同会社サクセスナレッジ 御中（仮） / 有効期限：発行日より2週間",
        } as TableData,
      },
      fileChip: {
        type: "excel",
        filename: "見積書_A商品.xlsx",
        size: "38 KB",
        downloadUrl: "/api/download/excel?product=A商品（システム導入作業）&price=50000&qty=2",
      },
      thinkingKey: "excel",
    };
  }

  // 1-2. Excel見積書（修正）
  if (trimmed.includes("宛名") && trimmed.includes("サンプル会社") && trimmed.includes("今月末")) {
    return {
      content:
        "承知いたしました。宛名を「株式会社サンプル 御中」、有効期限を「今月末日」に修正いたしました。\n\nこちらの内容でよろしければ、ダウンロードしてご利用ください。",
      richContent: {
        type: "table",
        data: {
          headers: ["No", "商品コード", "内容", "単価", "数量", "金額"],
          rows: [
            ["1", "作業", "A商品（システム導入作業）", "¥50,000", "2", "¥100,000"],
            ["", "", "", "", "小計", "¥100,000"],
            ["", "", "", "", "消費税(10%)", "¥10,000"],
            ["", "", "", "", "合計", "¥110,000"],
          ],
          summary: "宛名：株式会社サンプル 御中 / 有効期限：今月末日",
        } as TableData,
      },
      fileChip: {
        type: "excel",
        filename: "見積書_A商品_サンプル会社.xlsx",
        size: "38 KB",
        downloadUrl: "/api/download/excel?product=A商品（システム導入作業）&price=50000&qty=2&customer=株式会社サンプル 御中&expiry=今月末日",
      },
      thinkingKey: "excel",
    };
  }

  // 1-3. Excel見積書（利益とリソースの確認）
  if (trimmed.includes("受注") && trimmed.includes("利益")) {
    return {
      content:
        "仕入れ台帳と社内リソース状況を参照しました。\n\nA商品（システム導入作業）の原価（外注費等含む）はだいたい **¥40,000 / 人日** となっております。今回のご提案価格（¥50,000）で2人日の受注となった場合、以下のようになります。\n\n- **売上高： ¥100,000**\n- **原　価： ¥80,000**\n- **粗利益： ¥20,000 （粗利率 20%）**\n\nまた、現在のエンジニア稼働枠を確認したところ、今月末までの工数に空きがあるため、**工期には問題ございません**。物品等の在庫確認も不要な役務提供となりますので、作業内容に問題なければこのまま受注を進めていただけます。",
      thinkingKey: "default",
    };
  }

  // 1-4. Excel見積書（最終確定とダウンロード）
  if (trimmed.includes("わかりました") && trimmed.includes("問題ありません")) {
    return {
      content:
        "承知いたしました。内容が確定しましたので、最終版の見積書ファイルを出力いたしました。\n\n下記よりダウンロードしてお客様へご提出ください。その他にご不明な点や追加のご要望がございましたら、いつでもお知らせください。",
      fileChip: {
        type: "excel",
        filename: "見積書_A商品_確定版.xlsx",
        size: "38 KB",
        downloadUrl: "/api/download/excel?product=A商品（システム導入作業）&price=50000&qty=2",
      },
      thinkingKey: "excel",
    };
  }

  // 2. Word進捗報告書
  if (trimmed.includes("進捗報告書") && trimmed.includes("Word")) {
    return {
      content:
        "各担当者の **直近2週間の業務ログ** を収集・要約し、標準フォーマットの進捗報告書 (Word) をドラフトしました。\n\n未完了タスク **3件** の警告フラグも自動挿入しています。ご確認ください。",
      fileChip: {
        type: "word",
        filename: "プロジェクト進捗報告書_2025年4月.docx",
        size: "68 KB",
        downloadUrl: "/api/download/word",
      },
      thinkingKey: "word",
    };
  }

  // 3. PowerPoint提案書
  if (trimmed.includes("提案書") && trimmed.includes("PowerPoint")) {
    return {
      content:
        "過去の **類似案件の成功事例** と市場動向をRAG検索し、全 **10スライド** の構成案を含む提案書 (PPTX) を作成しました。\n\n構成：① エグゼクティブサマリー ② 市場分析 ③ 課題定義 ④ ソリューション提案 ⑤ 導入事例 ⑥ ロードマップ ⑦ 投資対効果 ⑧ リスク分析 ⑨ 実施体制 ⑩ 次のステップ",
      fileChip: {
        type: "powerpoint",
        filename: "新製品提案書_v1.pptx",
        size: "2.3 MB",
        downloadUrl: "/api/download/pptx",
      },
      thinkingKey: "pptx",
    };
  }

  // 4. 強みと課題
  if (trimmed.includes("強み") && trimmed.includes("課題")) {
    return {
      thinkingKey: "strengths",
      content:
        "社内ナレッジ **847件** を横断検索した結果、以下の分析を生成しました。",
      richContent: {
        type: "bullets",
        data: [
          {
            icon: "✅",
            label: "当社の強み",
            items: [
              "独自特許技術による製品差別化（特許登録 14件）",
              "顧客継続率 94%・業界トップクラスのサポート品質",
              "アジア圏への販路拡大（7ヶ国展開、前年比+23%）",
              "ISO 9001 / ISO 27001 取得による品質・セキュリティ基盤",
              "平均開発リードタイム 18日（業界平均比 -40%）",
            ],
          },
          {
            icon: "⚠️",
            label: "主な課題",
            items: [
              "新規顧客獲得コスト (CAC) が前年比 +15% で上昇傾向",
              "エンジニア採用難により開発キャパシティが逼迫",
              "北米・欧州市場への本格参入が未着手",
              "レガシーシステムの技術的負債が残存（移行計画策定中）",
            ],
          },
        ] as BulletItem[],
      },
    };
  }

  // 5. 営業利益の推移 - 権限制御
  if (trimmed.includes("営業利益") || trimmed.includes("決算")) {
    if (role === "admin") {
      return {
        thinkingKey: "finance_admin",
        content:
          "**2025年度の営業利益は5,700万円**、前年比 **106%** の成長を達成しました。直近3ヶ年の推移は以下の通りです。",
        richContent: {
          type: "table",
          data: {
            headers: ["年度", "売上高", "営業利益", "営業利益率", "前年比"],
            rows: [
              ["2023年度", "¥8.2億", "¥4,100万", "5.0%", "—"],
              ["2024年度", "¥9.5億", "¥5,375万", "5.7%", "+131%"],
              ["2025年度", "¥10.8億", "¥5,700万", "5.3%", "+106%"],
            ],
            summary:
              "※ 出典：経営企画部 決算資料 (2025年3月期) / 機密ランク A",
          } as TableData,
        },
      };
    } else {
      return {
        thinkingKey: "finance_user",
        content:
          "申し訳ありませんが、お客様の権限では **決算情報などの機密データ** へのアクセスは制限されています。\n\nこの情報を閲覧するには、管理者への承認申請が必要です。",
        isRestricted: true,
      };
    }
  }

  // デフォルト応答
  return {
    content: `「${trimmed}」について、社内ナレッジベースを検索しています...\n\n関連ドキュメントが **${Math.floor(Math.random() * 50) + 10}件** 見つかりました。より具体的なご質問をいただくと、精度の高い回答を提供できます。`,
  };
}

// デモ用履歴データ
export const initialHistory: HistoryItem[] = [
  { id: "h1", title: "A部品の見積書作成", timestamp: new Date(Date.now() - 3600000) },
  { id: "h2", title: "Q1営業レポート分析", timestamp: new Date(Date.now() - 86400000) },
  { id: "h3", title: "新製品ロードマップ提案", timestamp: new Date(Date.now() - 172800000) },
  { id: "h4", title: "競合他社比較レポート", timestamp: new Date(Date.now() - 259200000) },
  { id: "h5", title: "採用計画 2025年度版", timestamp: new Date(Date.now() - 345600000) },
];

// クイックプロンプト
export const quickPrompts = [
  { label: "📊 Excel見積書", prompt: "A商品の見積書を作成して" },
  { label: "📈 営業利益推移", prompt: "直近の決算資料から、営業利益の推移を教えて" },
  { label: "📋 PDF分析", prompt: "損益比較表PDFを分析して。月別グラフ・費用リスク評価・戦略提言・費用シミュレーターを作成してください。" },
  { label: "🔍 強みと課題", prompt: "当社の強みと課題を社内ナレッジから分析して" },
];
