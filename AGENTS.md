# xrift-avatar-pose-control

- README.md、docs/EXPERIMENTS.md、docs/NEXT_THREAD.md、docs/STATUS.mdを先に読む。
- N02の採用基準はdocs/specs/N02_NORMAL_FLIGHT_V1.mdとspecs/n02-normal-flight.v1.json。設定と14秒コースは共有profileを参照する。挙動を変える時はprofile版・再現結果・前後差分を更新する。
- 他姿勢の探索はdocs/experiments/pose-patterns-2026-10-25.mdとsrc/pose-patterns.mjs。候補の数値passを見た目や実機の採用へ読み替えない。screen・continuous・自作骨格・実VRM・目視の件数を分け、stressに含まれるstandardを重複加算しない。
- このリポジトリ内だけを編集し、元のプロペラ実験や公開XRiftアイテムへの反映は別の依頼として扱う。
- 私有VRM・認証情報・配布権限が不明な素材はコミットしない。VRMはデモのローカルファイル選択から読み込む。
- 自作骨格のテスト、ローカル実VRM、PC実XRift、Quest、他者視点を区別して結果を書く。
- カメラや入力の所有権を奪わない。XRiftのアバター本体取得APIが存在すると仮定しない。
- 変更後はnpm run verify。見え方を変えたらローカルデモを撮影して確認。
- 実験ごとに入力条件・前後の計測・判断・未確認事項をdocsへ残す。
- ライセンスは未設定（UNLICENSED）。公開閲覧できることを再配布許諾と扱わない。
