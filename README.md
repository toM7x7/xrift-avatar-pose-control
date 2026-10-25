# XRift Avatar Pose Control

rideで特殊な乗り物へ搭乗するときのアバター姿勢を調整する、Three.jsベースの実験用コアです。頭上プロペラv9と鳥人間の調査・不具合再現を起点に分離しました。

## 採用基準：N02 通常飛行 1.0.0

2026-10-25に、傾く筋斗雲と胸腰脚の追従をローカル再現の基準として採用しました。基準タグは `n02-normal-flight-v1.0.0`。設定JSONをデモと固定dtの再現runnerが共有します。

- [採用仕様・座標・校正・適用／解除・判定](docs/specs/N02_NORMAL_FLIGHT_V1.md)
- [機械可読profile](specs/n02-normal-flight.v1.json)
- [完成した筋斗雲モデルのスレッドへ渡す文](docs/handoff/NIMBUS_MODEL_INTEGRATION.md)

clone後は `npm ci` → `npm run verify` → `npm run replay:n02`。replayは私有VRM・ブラウザなしで校正→14秒飛行→0.5秒の停止観測を再現し、`artifacts/n02-normal-flight-v1.json`へ設定と結果を保存します。実XRift／Quest／他者同期の完成とは区別します。

## 他の乗り姿勢を探す

`npm run dev`後、[パターン比較画面](http://127.0.0.1:5228/patterns.html)で手元のVRMを読み込めます。18候補・7系統を比較し、支持の傾斜・見回し・幅・腰高・腕の役割などを変えて探索します。椅子座り／またがり／横座りの腰支持IKを追加しました。

- [大量SIMの結果・見た目・残る限界](docs/experiments/pose-patterns-2026-10-25.md)
- [候補catalogと条件生成](src/pose-patterns.mjs)：通常324、境界条件込み540。stressは通常条件を含みます。
- [腰支持の実験契約](docs/specs/SUPPORTED_SEAT_EXPERIMENT_V1.md)

`npm run replay:patterns`は私有素材なしで自作骨格3体格の972条件・23,328フレームを再現します。実VRMは全条件の一次screen→基本／厳しい条件の24フレーム確認→代表画像の目視で探索します。新候補は未採用であり、N02の採用タグとprofileは維持します。`pass`は数値screenのみ、`unsupported`は見える足の判定対象外で、全身姿勢の失敗を一括して意味しません。

## 起動

```sh
npm ci
npm run dev
```

Node.js 22以上。http://127.0.0.1:5228/ を開きます。初期表示はN02筋斗雲サーフ姿勢で、U02肩車、元の座り姿勢、直立／ホバリング／旧ボード／伏せ姿勢を比較できます。乗り物は仮形状で、搭乗・頭・手の入力はデモが模擬しています。実XRiftのSeatそのものを起動するデモではありません。

![N02姿勢デモ](docs/screenshots/n02-orbit-v3-2026-10-25.png)

N02は足幅・しゃがみ、U02は肩支持優先／頭保持・運ぶ側の体格・模擬移動を調整できます。運ぶ側の両手をすねへ合わせ、正面／側面／背面から観察できます。確認範囲と未達は[N02/U02の実験記録](docs/experiments/selected-poses-2026-10-25.md)を参照してください。

N02は胸・腰・足の向きを分担し、首だけが90度ねじれない斜めの構えへ改訂しました。「前進」「左右」「制動」または「発進→旋回→制動を試す」で、力・加速度から重心・荷重・左右膝が連動します。足は雲へ固定。一時停止と複数視点で比較できます。[走行と全身バランスの実験記録](docs/experiments/n02-ride-loop-2026-10-25.md)を参照してください。

[縦横無尽な筋斗雲飛行の企画](docs/plans/nimbus-3d-flight-posture-plan-v1.md)から、上下の推進・制動と胸腰脚の連動を経て、雲のpitch／bankと傾斜面の足裏IKを追加しました。「上昇→左右旋回→下降→停止を試す」で約14秒の連続コースを動かせます。通常は頭の入力世界向きを保ち、胸腰と左右脚が傾斜へ追従。傾斜ON/OFFで手元VRM2体・計96枚を確認しました。[傾斜実験の結果と操作方法](docs/experiments/n02-tilted-ride-2026-10-25.md)を参照してください。宙返り・背面飛行は次段階です。

## 入っているもの

- 明示的なhumanoidの役割→Bone対応表、または既存の名前推定による骨格準備。
- 頭・追跡手を保つ直立と伏せ姿勢、軽い身体追従、頭基準の水平方向。
- 描画中だけ適用し、最も外側の描画が終わってから元へ戻すトランザクション。ミラーの入れ子・一人称／三人称の関連スキン・二重適用を考慮。
- 脚折れ、衣服の反転、欠けた親ボーン、四本脚、頭・手・指・顔の保持、復元の回帰テスト。
- XRiftの所有者を解決する補助アダプター。

## 使用例

```js
import { prepareHumanoidRig, attachPoseDriver } from './src/index.mjs'
const rig = prepareHumanoidRig({ mesh, bones: humanoidBoneMap })
const driver = attachPoseDriver({
  scene, rig, relatedSkeletons,
  getOptions: () => ({
    enabled: isRiding, preset: 'hover',
    heading: bodyHeading, preserveHands: isInVR
  })
})
// driver.lastは直近の計測、driver.errorは適用エラー。
// ride解除／アンマウントで元の姿勢と描画フックへ戻す。
driver.dispose()
```

明示マップは選んだSkinnedMeshのpaletteに必要な人型骨があることを検査します。メッシュ外のnormalized骨を無条件に渡さず、VRMローダーからraw骨を取得してください。独自骨名でもマップが正しければ名前推定を避けられます。選んだpaletteに必須骨がない場合は追加対応が必要です。

`./xrift`のselectRiderRigは元実験のホスト慣習を使います。アバター実体の公開取得APIがあると仮定しません。VRMローダー等から対象を明示できる場合は、その経路を優先します。

## 境界

ここで扱うのは描画姿勢です。Vehicle移動・入力・衝突・着地・カメラ・アイテムの所有権や同期は利用側が担当します。N02は足首の目標、U02は腰とすねの目標までを試作しています。実メッシュの足裏・肩の接触、コックピットへの腰合わせ、追跡手と腰の同時拘束、自然な乗降アニメーションは今後の実験対象です。

元の低レベルモジュールも残っていますが、既存standing／proneの別々の描画フックを同じ身体へ混ぜず、新しいattachPoseDriverを入口にしてください。src/reproの旧版は意図的に不具合を残した比較用で、公開APIからはexportしません。

`npm run verify`で単体151件・型の利用例・デモビルドを確認します。`npm run replay:n02`は採用profileで1740フレームと16checkpointを検査します。傾斜14条件と、傾斜OFFで従来の上下14・走行10・旧頭優先22条件を確認。実VRM2体×8状態×3視点をON/OFFで96枚比較しました。低／負荷重のZMP・足荷重比はnullと理由を返すため、利用側は有効性を確認してください。力・近似バランスとIKの連動実験であり、全身の剛体接触や回転点の加速度を解いたものではありません。前段階の実験記録も残し、小型×大型の肩車や太い衣服の干渉は未完です。

- [乗り物・姿勢・VRMの実験指針](docs/EXPERIMENTS.md)
- [N02の走行・胸腰足・重心feedback](docs/experiments/n02-ride-loop-2026-10-25.md)
- [選定したN02/U02の実験・修正前後・確認範囲](docs/experiments/selected-poses-2026-10-25.md)
- [持込VRM3体での確認と制限](docs/experiments/real-vrm-2026-10-25.md)
- [N02の腕の構えの再調整](docs/experiments/n02-arm-refinement-2026-10-25.md)
- [乗る姿勢の空想帳：画像24例と追加48候補](docs/POSE_IDEATION.md)（仕様化前の案。筋斗雲・ユーザーライドを含む）
- [次のスレッドへ渡す文](docs/NEXT_THREAD.md)
- [現状と確認範囲](docs/STATUS.md)
- [来歴・ライセンス](docs/PROVENANCE.md)
