# イヤーピース比較サイト

GitHub Pages で公開する静的サイト。誰でも閲覧でき、更新できるのはリポジトリの持ち主だけ。
PC・Android・iPhone のブラウザで見られる（ホーム画面に追加するとアプリ風に起動）。

## ファイル構成

| パス | 内容 |
|---|---|
| `data/earpieces.json` | イヤーピースのデータ（ここだけ編集すれば更新できる） |
| `index.html` / `app.js` / `quiz.js` | 一覧ページ（絞り込み・好みから探す） |
| `compare.html` / `compare.js` | 比較ページ |
| `common.js` / `style.css` | 共通処理（詳細・レーダー・シルエット・お気に入り）とデザイン |
| `sw.js` | オフライン用（ホーム画面に追加したとき前回の内容を表示） |

価格・在庫・販売店の画像やレビュー評価は、販売店の規約上転載できないため載せない（購入先はリンクのみ）。一覧は寸法から描いたイラストで表示する。AliExpress で扱っている製品だけ、詳細画面に AliExpress の商品画像を先方の CDN から直接表示する。

## イヤーピースの追加

`data/earpieces.json` の `items` に1件追加する。

```json
{
  "id": "spinfit-cp100plus",
  "name": "CP100+",
  "brand": "SpinFit",
  "material": "シリコン",
  "profile": "dome",
  "images": [{ "url": "https://ae-pic-a1.aliexpress-media.com/...", "source": "AliExpress", "page": "https://www.aliexpress.com/item/..." }],
  "price": null,
  "nozzleFit": "4.5〜5.5mm",
  "sizes": [
    { "size": "M", "capDiameter": 12.2, "height": 9.7, "boreDiameter": 4.0 }
  ],
  "dimSource": "メーカー公称",
  "features": ["特徴1", "特徴2"],
  "soundChange": "音の変化の説明",
  "goodFor": "向いている人",
  "scores": { "bass": 3, "mid": 3, "treble": 3, "stage": 3, "isolation": 3, "comfort": 3 },
  "sources": [ { "label": "購入先：販売店名", "url": "https://..." }, { "label": "出典名", "url": "https://..." } ]
}
```

- `id` は英数字とハイフンで、他と重複しないもの（比較URLに使う）
- `images` は任意。`[{ "url": 画像URL, "source": "AliExpress", "page": 商品ページURL }]` の形で並べる。AliExpress の商品画像だけを入れる。一覧のカードはいつもイラストで、詳細画面ではイラストの後に写真を並べる。画像はコピーせず元サイトから直接読み込むので、読み込めない写真は表示しない
- `price` は常に `null`（価格は載せない）。購入先は `sources` に `label` が「購入先：」で始まるリンクとして入れる
- `profile`（シルエットの形状タイプ）：`dome`（一般的な傘型）/ `tapered`（側面が立った形）/ `bell`（ホーン型の広い開口部）/ `flat`（上面が平らな台形）/ `straight`（円筒形）/ `sphere`（球に近い形）/ `double`（二段形状）

**サイズの項目（単位はすべて mm）**

| 項目 | 意味 | 必須 |
|---|---|---|
| `capDiameter` | 傘の直径（いちばん太い所） | ○ |
| `height` | 全体の高さ | ○ |
| `boreDiameter` | 軸の内径 | 任意 |
| `openingDiameter` | 先端の開口部の径（ホーン型など） | 任意 |
| `capHeight` | 傘部分だけの高さ（軸と違う場合） | 任意 |
| `stemHeight` | 軸の長さ（傘より長い・短い場合） | 任意 |
| `upperDiameter` | 二段形状の上段の径 | 任意 |
| `minorDiameter` | 楕円形の傘の短軸（`capDiameter` は長軸） | 任意 |

- 寸法が分からない項目は書かなくてよい（`sizes` にサイズ名だけ、または空配列でも可）。傘径と高さの両方があるサイズだけシルエットを描く
- `outline`（任意）：側面の輪郭。`[[上端からの位置0〜1, 半幅/最大半幅], ...]` を上から下へ13点。図面から読み取った値を入れると、寸法の数値どおりに伸縮して描く。無い場合は `profile` の模式形
- `outlineSource`（任意）：輪郭の出典の説明
- `scores` は分からなければ `null`（レーダーチャートに出さない）

- `scores` は付属イヤーピースを 3 とした 1〜5 の相対評価（0.5 刻みも可）。初期値は暫定の目安なので、試聴したら書き換える

## 公開手順（初回のみ）

1. GitHub で新しいリポジトリを作る（Public）
2. このフォルダの中身を push する
3. リポジトリの Settings → Pages → Branch を `main` / `(root)` にして Save
4. 数分後に `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開される

以後は JSON や画像を編集して push するだけで反映される。

## ローカルで確認

```bash
python -m http.server 8765
```

ブラウザで http://localhost:8765 を開く（ファイルを直接開くと JSON を読めないためサーバーが必要）。

## 権利・注意

- コード・文章・データの著作権は SchallXD に帰属し、無断転載・転用は禁止（詳細は `LICENSE`）。
- 製品写真は AliExpress の商品画像を直接表示するだけで、リポジトリには含めない。写真をダウンロードして同梱・再配布しない。負荷に配慮が必要な国内サイトの画像は直接表示しない。
- 掲載内容は保証しない旨をサイトのフッターに表示している。
