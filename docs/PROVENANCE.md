# 来歴と配布範囲

2026-10-25、ユーザー指定の2つの空GitHubリポジトリへ、頭上プロペラ実験v9から機能を分離した。元のローカル実験・公開アイテムは変更していない。

- 元: head-propeller-ride（2026-10-23 v9）。姿勢処理の一部は同じ所有者の鳥人間ワールドのpose-labから派生。
- この作業で作成したデモ・ラッパーと、既存の検証用骨格・姿勢コードを使用。私有VRM、XRiftのホスト配信コード、認証情報、元ワールドの美術素材は含めない。
- three / three-vrm / Vite等はnpmの依存として参照し、再配布物をソースへコピーしていない。各依存のライセンスは各パッケージに従う。
- 2026-11-05、所有者がMITを選定し、[LICENSE](../LICENSE)（Copyright (c) 2026 toM7x7）を追加。package.jsonのlicenseをMITへ変更した。private:trueはnpm公開を防ぐために残し、npm公開・XRift配布を意味しない。それ以前の記録にある「UNLICENSED」は当時の状態。
- 既存のremote-playerマーカーはホストの慣習で、保証されたアバター取得APIではない。明示的に頭／humanoid mapを渡す経路を優先し、曖昧な対象へ適用しない。

同日、N02通常飛行profile 1.0.0をユーザーの採用基準として追加。概念画像はimage_genによる想像図、公開screenshotsは自作の検証骨格。実VRMのモデル本体・元ファイル名対応・画像はignoredの私有領域へ残し、GitHubには含めない。profileの採用やGitタグはコードのライセンス変更・npm公開・XRift配布を意味しない。

同日、他姿勢の探索へ腰支持IK・候補catalog・大量SIMを追加。`src/vendor/render-pose.mjs`の伏せ姿勢初期化を、親palette欠落に対応するworld回転へ局所修正した。source-manifestは切り出し時の来歴を保持し、今回の実行source hashは実験集計へ別記する。比較シートを含む実VRMの画像と全数ログは私有領域のみ。公開する実験結果は自作骨格と匿名の数値集計であり、VRM作者・元ファイル名・私有画像を含めない。

2026-11-05、骨格の役割推定（`src/role-inference.mjs`・`src/humanoid-inference.mjs`）を追加。同じ所有者のXRift作業領域の筋斗雲アイテム（items/nimbus-cloud、2026-10-27）で書いたものを移した。第三者のコードは含まない。検証の合成骨格は自作、実VRMの結果は匿名IDの数値だけで、VRM本体・原ファイル名・画像は含めない。

2026-11-11、実行時の改善で `src/vendor/render-pose.mjs`・`src/vendor/torso-support.mjs` を変更（ワールド行列の読み取りを `src/world.mjs` 経由に、`captureBones` に使い回しの引数、`roleOf` に名前ごとの保持）。結果は変えていない。source-manifest は切り出し時のハッシュのまま。

2026-11-05、MITライセンスを追加（上記）。リポジトリ内のコード・文書・自作骨格の画像・image_genの想像図が対象で、依存パッケージ（three / three-vrm / Vite等）は各ライセンスに従う。私有VRM・元ファイル名対応・私有画像はこれまで通りGitHubに含めない。
