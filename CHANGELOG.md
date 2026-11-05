# Changelog

## 全身の動作（authored actions）と charge-wave — 2026-11-05

- `src/authoring/`：体の意図で書くキー（骨盤・背骨の配分・鎖骨・足・両手の組・指）、肘の回り込みを探す腕IK（手首・前腕の可動域、皮膚の当たり、連続性）、地面に固定する足と骨盤の自動上下、両手の接触を保つ寄せ、指の曲げと開き。
- タイムライン：中間キー、片足ずつの踏み替えと体重移動、円柱座標の手の移動、キー間の関節空間の計画、反動と震え。
- 品質：全フレーム検査（`evaluateAction`）、両手の組の向きのフィット（`fitPairAxes`）、`npm run review:charge-wave`／`fit:charge-wave`。
- 詳細な自作骨格（指・鎖骨・上胸・つま先）、Pose Studio（`/studio.html`）、`scripts/studio-capture.mjs`。
- `attachPoseDriver`の`preset:'authored'`。既存のプリセット・N02 1.0.0は変更なし。

## 骨格の役割推定 — 2026-11-05

- `resolveRoles`（名前の流派の表＋骨格の形、three 非依存）、`inferHumanoidBones`／`inferHumanoidRigs`（three の骨格から `prepareHumanoidRig` 用の明示の役割表）、`selectRiderRigWithInference`（`./xrift`、名前で読めないときだけ座席近くを推定）を追加。
- 名前と形の食い違い・左右不明・検査不合格は当てずに理由を返す。合成骨格・fixture・ローカル実VRM3体で検証。
- 呼んだときだけ動く入口で、`inspectHumanoidRigs`／`selectRiderRig`・N02 1.0.0 の profile・タグ・採用再現は不変（replay の数値一致を確認）。

## MITライセンス — 2026-11-05

- 所有者の選定により`LICENSE`（MIT、Copyright (c) 2026 toM7x7）を追加し、package.jsonのlicenseをUNLICENSEDからMITへ変更。
- `private: true`はnpm公開を防ぐため維持。N02 profile・タグ・挙動の変更はない。

## 多姿勢の探索候補 — 2026-10-25

- 手元VRMの比較画面`patterns.html`、7系統・18候補と通常324／境界込み540条件を追加。
- 腰支持の椅子座り・またがり・横座りを実装。頭Qと骨長を保ち、足・手・運ぶ側の手の未達を分けて計測。
- 親palette欠落時の伏せ姿勢のworld/local誤復元を修正。顔・指・衣服・scaleを保持。
- 実験画面は変形後のskin範囲から構図を決め、skinの古い描画範囲による消失を避ける。
- 私有素材不要の972条件・23,328フレーム再現と、実VRMの二段階SIM／独立目視／匿名集計を追加。

候補は未採用。N02通常飛行1.0.0のprofile・タグを維持し、採用再現の数値一致を確認。npm／XRiftへの配布を意味しない。

## N02 normal flight profile 1.0.0 — 2026-10-25

ユーザーが採用した、傾く筋斗雲と胸腰脚の通常飛行を再現基準として固定。

- 推力・上下動・pitch/bank、支持面の足裏IK、頭の入力世界向き保持を結合。
- 機械可読profileを正本にし、デモの設定と14秒コースを共有。
- 自作骨格・固定dtで校正から解除まで回すCPU replayと判定条件を追加。
- 完成した筋斗雲モデルのスレッドへ渡す仕様・接続境界・引継ぎ文を追加。
- N02/U02の段階的な実験、private VRMを除外した証拠、既存回帰を同梱。

採用範囲はローカル通常飛行。実XRift・Quest・他者同期・回転点加速度・全身接触物理・宙返り・背面の完成を示す版ではない。packageはprivate / UNLICENSEDを維持。
