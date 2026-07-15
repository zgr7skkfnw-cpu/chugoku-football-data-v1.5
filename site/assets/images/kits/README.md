# University kit icons

2026年度中国大学サッカーリーグ1部の登録色と、提供された各大学の実物写真を基準にしたフラットSVGです。写真の複製や完全な縫製図ではなく、FotMob、Flashscore、Sofascoreのように試合UIでチームを識別するため、肩・袖・切替・ラインを24〜48px向けに簡略化しています。参照写真そのものはリポジトリへ保存していません。

## ファイル構成

各チームのディレクトリにFP用の次の2ファイルがあります。GKユニフォームは管理対象に含めません。

- `home.svg`: FP正
- `away.svg`: FP副

| チーム | ディレクトリ | FP正の特徴 | FP副の特徴 | 略称 |
| --- | --- | --- | --- | --- |
| IPU・環太平洋大学 | `ipu/` | 青、紺袖、密集した白V字水玉 | 白、黒ピンストライプ | IPU |
| 広島経済大学 | `hiroshima-keizai/` | 赤、ワインレッド袖 | 白無地 | HUE |
| 福山大学 | `fukuyama/` | 青、上向きシェブロン | 白、黒い肩3本線 | FU |
| 広島大学 | `hiroshima/` | 紫、白い肩3本線 | 白、黒い肩3本線 | HU |
| 広島文化学園大学 | `hiroshima-bunka-gakuen/` | 深い青の無地 | 白、青クルーネック | HBG |
| 周南公立大学 | `shunan-public/` | 赤無地 | 白無地 | SU |
| 広島修道大学 | `hiroshima-shudo/` | 青、白い肩1本・細い脇線 | 白、青い肩1本・細い脇線 | HSU |
| 福山平成大学 | `fukuyama-heisei/` | 青、黒い脇、工字つなぎ | 白、青い脇、白・濃灰市松 | FHU |
| 川崎医療福祉大学 | `kawasaki-medical-welfare/` | 濃緑・緑の横縞 | 白、黒い直線4本 | KUMW |
| 山口大学 | `yamaguchi/` | 黒上・緑下のV字切替 | 黒上・白下のV字切替 | YU |

## 色と模様の変更

各SVGの先頭に次のCSSカスタムプロパティがあります。

- `--kit-primary`: 身頃の基本色
- `--kit-secondary`: 袖、肩、脇などの濃色
- `--kit-accent`: ストライプや切り替えの色
- `--kit-trim`: 襟・袖口の線色
- `--kit-text`: 中央略称の文字色
- `--kit-text-stroke`: 中央略称の縁取り色

形状は共通の48×48 viewBoxで、写真風の陰影や小さな文字・スポンサーは使用していません。SVGをインライン化する場合は、各ファイル固有のgradient/clipPath IDを維持してください。

通常は画像として読み込み、CSSで必要な表示サイズを指定します。

```html
<img src="assets/images/kits/fukuyama/home.svg" width="32" height="32" alt="福山大学 FP正ユニフォーム">
```
