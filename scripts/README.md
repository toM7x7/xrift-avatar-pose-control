# ブラウザでデモを確認する

## 他の乗り姿勢の大量SIM

`npm run replay:patterns`：自作骨格3体格×324条件×24フレームを固定dtで確認し、ignoredの`artifacts/pose-pattern-fixtures.json`へ記録します。実VRMやブラウザは不要です。

実VRMは`/patterns.html`のファイル選択で複数体を読み込んでから、Playwright CLIの`run-code --filename=scripts/simulate-pose-patterns.js`を実行します。モデル名や絶対パスをスクリプトへ埋めません。既定はstress540を1sampleでscreen→各候補の基本＋厳しい条件を最大36件選んで24frame確認→基本2方向＋代表3方向を撮影。匿名モデルと世代・頂点診断を照合し、取り違えを拒否します。全数JSON・画像はignoredの`local-assets/pattern-sim-2026-10-25/`以下とCLI結果へ保持します。

`scripts/summarize-pose-patterns.mjs`は全数JSONとfixture／独立観察の記録から、公開可能な匿名集計だけを出します。元名・作者・画像・各アバターの関節座標は公開集計に含めません。詳細は`docs/experiments/pose-patterns-2026-10-25.md`を参照してください。

## N02の採用再現と既存ブラウザ実験

採用N02のブラウザ不要な再現は `npm run replay:n02`。設定正本 `specs/n02-normal-flight.v1.json` を読み、固定dt1/120秒・自作骨格で校正と全身loopを実行し、`artifacts/n02-normal-flight-v1.json`へ入力・設定・SHA256・数値・限界を記録します。`--output`を変えて比較する時は `npm run replay:n02 -- --output artifacts/n02-repeat.json`。実VRM受入・実XRiftの確認は別です。

先にnpm run devでlocalhostを起動します。Playwright CLIが使える環境で、リポジトリを作業ディレクトリとして実行します。

```sh
npx --yes --package @playwright/cli playwright-cli -s=pose-lab open http://127.0.0.1:5228/
npx --yes --package @playwright/cli playwright-cli -s=pose-lab run-code --filename=scripts/check-demo.js
```

既定の自作骨格だけを検証します。ブラウザやChromeが未導入ならPlaywright CLIの公式手順で導入してください。私有VRMの読込はファイル選択から手動で行い、ファイル名・画像の公開範囲を確認します。スクリーンショットはdocs/screenshotsへ出力します。

N02/U02の観測には `run-code --filename=scripts/check-selected-poses.js`、自作骨格の比較撮影には `run-code --filename=scripts/capture-selected-poses.js` を使います。後者は修正版v3名の画像9枚を保存します。新しい改訂の撮影ではファイル名の版を上げ、比較元を残してください。Playwright CLIが既にローカルへ導入されている場合は、そのCLIを直接使うとnpm registryへ接続せずに実行できます。

実VRMは画面のファイル選択で複数選んだ後、`run-code --filename=scripts/check-local-vrms.js`で比較できます。モデル名はスクリプトへ固定せず、選択順を匿名IDにして、私有画像をGit対象外のlocal-assets/へ保存します。入力の骨・skin調査は `node scripts/inspect-local-vrms.mjs`、有効weightの調査は続けて `node scripts/inspect-local-vrm-weights.mjs`。どちらもローカルJSONのみを作ります。

N02走行ループは `run-code --filename=scripts/check-ride-balance.js`。固定足・首胸腰の分散、発進／制動／旋回／停止／pause、小さな見回し、決定論的な運動条件を10ケースで観測します。旧check-selected-posesはN02の頭優先モードを明示して22条件を回帰し、新しい支持優先の走行と区別します。

上下の連動は `run-code --filename=scripts/check-vertical-ride.js`。自作骨格で上下4状態・停止復帰・低／負荷重・胸腰膝・斜行・追従オフのカメラ・自動コース・解除を14条件で観測します。実VRMは画面から選んで別に撮影し、自作の成功を実VRMの合格へ置き換えません。詳細は `docs/experiments/n02-vertical-ride-2026-10-25.md`。

傾斜ONは `run-code --filename=scripts/check-tilted-ride.js`。自作14条件で支持Q・足裏normal/gap・頭worldup・COM法線高・任意yaw・連続コース・解除を検査。旧上下14／水平10／姿勢22を回帰する時は、先にN02を選び、cloudTiltをOFF→driveReset→pauseにして水平条件を明示します。詳細は `docs/experiments/n02-tilted-ride-2026-10-25.md`。
