# xrift-avatar-pose-control

- README.md、docs/EXPERIMENTS.md、docs/NEXT_THREAD.md、docs/STATUS.mdを先に読む。
- N02の採用基準はdocs/specs/N02_NORMAL_FLIGHT_V1.mdとspecs/n02-normal-flight.v1.json。設定と14秒コースは共有profileを参照する。挙動を変える時はprofile版・再現結果・前後差分を更新する。
- 全身の動作（構える・溜める・放つ等のキーとタイムライン）を作る・直す・アイテムへ渡すときは`.claude/skills/authored-pose/SKILL.md`の手順に従う。
- XRiftの上で動かすもの（アイテムへ渡す動作、乗り姿勢、持ち物、カメラに関わるもの）は、作り始める前に公式（`@xrift/world-components`のGrabbable・Seat・Vehicle・useViewpoint）の今の仕様を確かめる。手順は同じSKILL.mdの「最初に：公式の今の仕様を確かめる」。この仕組みは公式の約束ではなく本体のふるまいに乗っており、公式が変わるとビルドは通ったまま実機で壊れる。
- 他姿勢の探索はdocs/experiments/pose-patterns-2026-10-25.mdとsrc/pose-patterns.mjs。候補の数値passを見た目や実機の採用へ読み替えない。screen・continuous・自作骨格・実VRM・目視の件数を分け、stressに含まれるstandardを重複加算しない。
- このリポジトリ内だけを編集し、元のプロペラ実験や公開XRiftアイテムへの反映は別の依頼として扱う。
- 私有VRM・認証情報・配布権限が不明な素材はコミットしない。VRMはデモのローカルファイル選択から読み込む。
- 自作骨格のテスト、ローカル実VRM、PC実XRift、Quest、他者視点を区別して結果を書く。
- カメラや入力の所有権を奪わない。XRiftのアバター本体取得APIが存在すると仮定しない。
- 変更後はnpm run verify。見え方を変えたらローカルデモを撮影して確認。
- 実験ごとに入力条件・前後の計測・判断・未確認事項をdocsへ残す。
- ライセンスはMIT（LICENSE、Copyright (c) 2026 toM7x7。2026-11-05に所有者が選定）。依存パッケージは各ライセンスに従う。package.jsonのprivate:trueはnpm公開を防ぐためで、ライセンスとは別。私有VRM・私有画像はライセンスの対象外で、引き続きコミットしない。
