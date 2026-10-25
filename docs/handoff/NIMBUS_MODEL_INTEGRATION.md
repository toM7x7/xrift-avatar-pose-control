# 筋斗雲モデルのスレッドへ渡す情報

## そのまま貼る文

```text
このスレッドで作成済みの筋斗雲モデル／ライドitemへ、採用済みのN02通常飛行を統合してください。モデル構築は済んでいるので、その成果を保持して接続を進めてください。

Repo: https://github.com/toM7x7/xrift-avatar-pose-control
基準タグ: n02-normal-flight-v1.0.0
ローカル: D:\personal_dev\XRift\lab\xrift-avatar-pose-control
採用profile: n02-normal-flight / 1.0.0

最初にAGENTS.md、docs/specs/N02_NORMAL_FLIGHT_V1.md、specs/n02-normal-flight.v1.json、docs/experiments/n02-tilted-ride-2026-10-25.md、docs/handoff/NIMBUS_MODEL_INTEGRATION.mdを読んでください。

採用動作は、上昇下降pitch・旋回bank、足裏の支持面追従、胸腰と左右脚の連動、通常時の頭の入力世界向き保持です。14秒コースと固定dtのreplayがあります。まずnpm ci → npm run verify → npm run replay:n02で基準を再現してください。

完成モデルの接触面中心・前方・法線・単位をsupportFrameへ対応させ、同じ世界frameを雲と足へ渡してください。quaternionはxyzw、世界+Y上/+Z前/+X右。移動の計算・同期を所有する側は一つにし、yawや移動を二重適用しないでください。頭へ雲のpitch/bankを加えないでください。

実XRiftのアバター本体取得・姿勢適用・他者同期は未検証です。ホストの正しいraw rigを取得する経路を確認してから、搭乗→N02→上昇/旋回/下降→制動→降車で元へ戻るところまで進めてください。PC本人/他者、Quest、複数itemは分けて観察し、前後の入力・数値・画像・未達を残してください。

今回の採用はローカル再現基準です。宙返り/背面、回転点の慣性力、全身接触物理、衝突は追加段階。私有VRM/画像は持ち出さず、ライセンスはUNLICENSEDのまま。公開・アップロードの前に、完成モデルと接続結果を確認できる状態へ仕上げてください。
```

## 実装の入口

| 用途 | 場所 |
|---|---|
| 採用設定と再現コース | `specs/n02-normal-flight.v1.json` |
| 共有profile helper | `src/n02-profile.mjs`／型宣言 |
| 推力・姿勢・荷重の縮約モデル | `src/ride-dynamics.mjs`／型宣言 |
| humanoid準備・描画時driver | `src/index.mjs`／型宣言 |
| 傾斜支持面のN02姿勢 | `src/nimbus-pose.mjs`／型宣言 |
| CPUでの校正→運動→姿勢→feedback | `scripts/replay-n02-profile.mjs` |
| ブラウザでの接続例 | `demo/main.mjs` |
| 足裏の描画頂点診断 | `demo/skin-diagnostics.mjs` |
| 所有者選択の補助 | `src/adapters/xrift.mjs`（ホスト慣習、公開API保証ではない） |

package exportはESMのコアと`./xrift`。同じ所有者のローカルitemから参照する場合はfile依存やソース接続を選び、タグ／SHAを記録する。Three.jsのpeer範囲は`>=0.183.1 <0.184.0`。XRiftホストと同一のThree.jsを使えるか確認し、別コピーを混ぜて成立済みにしない。デモ専用three-vrmローダーや診断コードを、そのまま配布itemへ入れる必要はない。

筋斗雲モデルのプロジェクトパスやasset名は、この資料では推測して固定しない。引継ぎ先スレッドで現在の成果物と既存item IDを確認する。既存の`items/nimbus-cloud`へ自動的に差し替えない。

## 基準状態と未確認

ユーザーは2026-10-25に現状仕様を採用した。N02 profile 1.0.0はローカル通常飛行の基準で、U02肩車の採用基準ではない。最初のコア切り出し以後のN02/U02実験コードも履歴として同梱する。

実VRM2体の傾斜ON/OFF計96枚、独立目視10枚、傾斜ブラウザ14条件と従来14／10／22回帰の記録がある。VRM本体・モデル名対応・私有画像はGitへ含まれないので、cloneだけで同じ実VRMを得られるとは扱わない。代わりに固定dtの自作骨格replayでコードと設定の接続を再現する。

実XRift／Quest／他者同期、追跡と厳密支持の両立、回転点の加速度、全身接触力・摩擦・衝突、宙返り・背面は未確認または未実装。モデルを持つことと、配布itemの接続受入は別に記録する。

## 今回のリポジトリ更新の確認

profile共有化後の確認結果：

- `npm run verify`：119テスト・型・build成功。[ログ](../experiments/n02-adoption-verify-2026-10-25.txt)
- `npm run replay:n02`：1740フレーム／16checkpoint、受入基準成功。[数値記録](../experiments/n02-adoption-replay-2026-10-25.json)、[実行要約](../experiments/n02-adoption-replay-2026-10-25.txt)
- 同環境の再実行で、入力・校正・checkpoint・判定・極値・限界・終端の数値が一致。
- デモの傾斜14条件も共有設定へ接続後に成功、ページ例外・非GET通信0。[ブラウザ結果](../experiments/n02-adoption-browser-2026-10-25.json)
- CPUの最大膝は100度の表現上限内。希望膝との差は`fixed-support-changes-crouch`として記録し、全ての目標を達成したとは扱わない。
- 実VRM96枚は採用前の根拠を保持。今回の共有化で私有VRMを新たに配布・試験したことにはしない。

Gitタグは上記ソース・設定・仕様・検証を含むcommitに付け、リポジトリ更新時にremoteと照合する。引継ぎ先でタグのSHAを記録してから作業する。
