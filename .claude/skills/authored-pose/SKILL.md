---
name: authored-pose
description: このリポジトリ（xrift-avatar-pose-control）で、新しい全身の動作（構える→溜める→放つ のようなキー＋タイムライン）を作る・直す・XRiftアイテムへ渡すときの手順。最初に公式（@xrift/world-components の掴む・乗り物・カメラ）の今の仕様を確かめる手順、参考画像づくり、specs/<id>.v1.json のキーの書き方、Pose Studio での確認、組の向きのフィット、全タイムライン検査、いろいろな骨格での互換確認、手元VRMでの確認、記録、アイテムへの写し方までを含む。新しいポーズを作る依頼、charge-wave の見た目や品質を直す依頼、「このアバターで構えが出ない」という報告のときに使う。
---

# 全身の動作を作る（authored actions）

charge-wave（両手で溜めて放つ）を作ったときの流れを、次の動作でもそのまま使える形にしたもの。仕組みの説明は [docs/specs/AUTHORED_ACTIONS_V1.md](../../../docs/specs/AUTHORED_ACTIONS_V1.md)、実例は [specs/charge-wave.v1.json](../../../specs/charge-wave.v1.json) と [docs/experiments/charge-wave-2026-11-05.md](../../../docs/experiments/charge-wave-2026-11-05.md)。

守ること（AGENTS.md と同じ）：私有VRM・その撮影画像はコミットしない（`vrm/` と `local-assets/` は無視される）。既存の作品名・キャラクター名を動作名やファイル名に使わない（「〜らしい構え」は形の特徴で書く）。数値の合格を見た目や実機の合格と書かない。

## 最初に：公式の今の仕様を確かめる

XRift の上で動かす動作は、絵やキーに入る前にここを済ませる。対象は、アイテムへ渡す新しい動作、渡し済みの動作の直し、掴む物・乗り物・カメラに関わる動作。Pose Studio の中だけで終わる作業は飛ばしてよい。

理由：このエンジンは公式が約束した API ではなく、本体のふるまい（ホストの慣習）に乗っている。そのうえ `@xrift/world-components` は本体から貸し出されるので、アップロード済みのアイテムも作り直さずに本体の新しい版で動く。公式が変わると、ビルドは通ったまま実機で壊れる。実例：0.64.0（2026-11-11）で、掴んだ物は本体ごと手元へ動くようになり `renderGhost` は無視された。持ち物を自分で描いていたアイテムは、持つ本人の画面で物が消えた。

1. **版を比べる。** 最新（`npm view @xrift/world-components version`）、渡し先のアイテムに入っている版、そのアイテムの README に残した「前回確かめた版」。最新が本番で動いている版だと考える（実機で違うと分かったときを除く）。
2. **変更を読む。** 公式の公開リポジトリ（WebXR-JP の `xrift-world-components`・`xrift-skills`・`xrift-docs`）を最新にして、前回の版からの変更を読む。変更履歴のファイルもリリースも無いので、`git log --format="%h %cs %s"` を使う（件名に版が入る）。見る所は次のとおり。説明は遅れることがあるので実装も読む。
   - `xrift-world-components/src/components/` の `Grabbable`・`Seat`・`Vehicle`・`DevEnvironment`、`src/hooks/useViewpoint.ts`
   - `xrift-skills/skills/xrift-world/references/api-reference.md` の Grabbable / Seat / Vehicle / useViewpoint / useUsers
3. **頼っている前提を書き出して確かめる。** 下の表から今回の動作に関わる行を選び、動作に固有の前提を足す。確かめる場所は一番小さい所にする（アイテムの dev ページ、ラボの代役、古い版に差し替えた dev）。本体は非公開なので、本体だけが決めることは「実機で確かめる項目」として残し、確かめたとは書かない。
4. **記録する。** 確かめた版・日付・前提・実機に残した項目を、実験記録（7章）の入力条件と、渡し先のアイテムの README に書く。

前提が崩れていたら、キーを書く前に設計を決め直す。同じ前提に頼っている渡し済みのアイテムがあれば、どれかを報告する（直すのは別の依頼）。

| 頼っている前提 | 公式の約束か | 確かめる所 |
|---|---|---|
| 他人のアバターは、`userData.id` が `remote-player-<id>` で `onInteract` を持つ印（本体が他人に付ける Interactable）の下にある。自分はどの印にも入っていない骨格 | いいえ（慣習） | 実機だけ。読めないときは当てずに `diagnosis` を出す（8章） |
| アバターのボーン名と骨格の形 | いいえ | 名前の表→骨格の形の推定。怪しいときは当てない（5章・6章） |
| 本体が先にアバターの姿勢を書き、描画の直前に当てて直後に戻せる（`scene.onBeforeRender`／`onAfterRender`、鏡などの入れ子の描画も） | いいえ | 実機（鏡・カメラモード・他者視点） |
| 頭は本体が持つ（`headMode:'host'`）。一人称で自分の頭をどう隠すか、本体のカメラがどの層を描くか | いいえ | 実機 |
| 掴んでいる間、`children` の本体が持つ人の手元にある（全員の画面で） | はい（0.64.0〜） | `Grabbable/index.tsx`、API reference の “Picked up / released” |
| 本体が持ち物を置く位置と向き（PC は視点の前に浮かせ、掴んだ時の回転のまま。VR は手元） | いいえ | PC は `DevEnvironment/components/GrabSystem`。本番と VR は実機 |
| `onUseStart`／`onUseEnd` は持つ人の画面だけ、`onGrab`／`onRelease` は全員の画面 | はい（0.62.0／0.64.0） | API reference の “Using a held object” |
| 座っている人は `Seat` のワールド行列に毎フレーム従う。`Vehicle` が姿勢を持ち、1台につき1つの姿勢を同期する | はい（0.50.0／0.52.0） | `Seat/index.tsx`・`Vehicle/index.tsx` |
| 座っている間に本体が作る座り姿勢と、毎フレーム書く骨 | いいえ | 実機 |
| `useViewpoint`：VR とカメラモード中は `'first-person'`。`DevEnvironment` は常に `'first-person'` | はい（0.58.0〜） | `hooks/useViewpoint.ts`、API reference |
| VR の人には当てない（手は追跡される）。VR の持ち方 | いいえ | 実機（Quest） |

公式の資料を最後に読んだ版：2026-11-12、`@xrift/world-components` 0.64.0（この日は資料と変更一覧を読んだだけで、表の前提を試し直してはいない）。読み直したらこの行を更新する。

## 0. 動作を言葉と絵で決める

1. 相（phase）ごとに「体の意図」を書き出す：重心はどこか、腰と胸はどちらへねじれるか、手はどの高さで何をしているか、手首は曲がるか反るか、足はどこに置きどちらへ体重を乗せるか、頭はどこを見るか（XRiftでは頭はホストが持つ）。
2. 参考画像が要るなら Codex の画像生成で、オリジナルの人物（木製マネキン等）で各相の絵を作り `docs/concepts/<日付>/` へ置く。作品の絵を写さない。
3. 速さの設計：入り・溜め・放ち・余韻・戻りの秒数。アイテムに渡すなら、アイテムの時間定数（溜め始め・押し出し・余韻・戻り）とクリップの `release[].duration` を一致させる。

## 1. キーを書く（specs/<id>.v1.json）

- 単位は基準体（身長1.65m・腰0.95m）のメートル、角度は度、軸は体の向き基準（+X左・+Y上・+Z前）。
- `rot` は **[ヨー, ピッチ, ロール]**（ヨー正＝左へ向く、ピッチ正＝前へ倒す、ロール正＝右肩が下がる）。
- 両手の組 `hands.pair`：`clam`（玉を上下の手で挟む）、`push`（手のひらを前・指を上、親指側の付け根を合わせる）、`flower`（手首を横に並べ、上の手の指は上・下の手の指は下、手のひらを前へ口のように開く。`open`・`gap`・`spread`・`upper`）。
- **`center` は「腕の長さで拡縮した体のメートル」で、腕の長さの倍数ではない**（`unit:"arm"`）。胸の前0.55mがほぼ腕を伸ばした位置。遠すぎると組全体が後ろへ引き戻されて腕が曲がる（`pairShiftMm` が大きく出る）。
- 足：`pos`（足首の真下の地面）、`toeOut`、`heel`（かかとを上げる角度）。かかとを上げた後ろ足は母趾球を軸に腰の方へ回る（`pivot`、既定1）。足の `pos` が2cm以上変わると踏み替え（片足ずつ・浮かす前に体重移動）になる。
- `elbows` は好み（重み付き）、`fingers` は指ごとの曲げ・開き（`wrap:true` で玉に沿う）。
- `action`：`enter`（`via` で中間キー、`weightIn`＝ホスト姿勢から混ぜ入れる秒数）、`hold`（溜め、`breath`）、`release`（放つ→`hold:"beam"`（反動・震え）→余韻→戻り）。戻りの `weightOut` は **数値（例0.4）にして後半だけでホストへ戻す**。
- 新しいキーを足したら、`action` の流れ（入り→溜め→放ち→戻り）に沿って並べる。関節空間の計画はこの順に前のキーを引き継いで解く。

## 2. Pose Studio で形を見る

```sh
npm run dev   # http://127.0.0.1:5228/studio.html
```

- 4画面（正面・右側面・上・斜め）、キーの残像、手の目標と玉、重心と支持多角形。「このキーで止める」で1キーずつ見る。キーのJSONはその場で編集できる（保存はspecs側へ手で反映）。
- 骨の読み取りは既定で「XRiftと同じ（ボーン名→骨格の形）」。手元VRMを読み込むと、XRiftで読めるか・どう読んだか（名前／名前＋形／形）・VRM定義との違いが出る。読めないと赤字で理由が出る。

## 3. 組の向きをフィットする

```sh
npm run fit:<id>     # node scripts/fit-clip.mjs specs/<id>.v1.json
```

両手の組の向き（`axes`）だけを、手首と前腕が楽で作者の指定に近い向きへ探す。作者の値は `authoredAxes` に残る。探索範囲は `fit.range`・`fit.step`。コストが数十〜数百のまま下がらないときは、組の中心が遠い・手の向きの指定が前腕と逆、を疑う。

## 4. 全タイムラインを検査する

```sh
npm run review:<id>  # 自作骨格3体格＋短押し、60fps、18項目
```

合格の目安は全体格で 18/18（警告は理由を説明できるものだけ）。ほかに：

- **1コマの跳び（pop）は60fpsの検査で平均されて見えないことがある。** 240Hzで関節の角速度を見る：`local-assets/` に一時スクリプトを置き、`sampleAction`→`applyAuthoredPose` を dt=1/240 で回して、相の境目の単発の突出を探す。
- 速さの閾値を上げて通さない。意図して速い相だけ `quality.fastPhases` に入れる。

よく出る原因と直し方（charge-wave で実際に出たもの）：

| 症状 | 原因 | 直し方 |
|---|---|---|
| 手首が大きく折れる | 手の向きの指定が前腕の向きと合わない | 組の向きのフィット。手は「前腕の延長＋手首の曲げ」で考える |
| 肘が反転（8,000°/s） | 手の向きを空間で最短補間すると腕には逆ひねり | 関節空間の計画（自動）。キーを visit 順に並べる |
| 構えの入り・戻りで上腕が速い | ホスト姿勢との混ぜがキーの移動と重なる／混ぜる回転が180°近い | `weightIn` を長めに、`weightOut` を数値にして後半だけ混ぜる、戻りの ease を sine に |
| 戻り途中で手首が5cm跳ぶ | キー間で手の基準点（付け根→手のひら中心）が切り替わる | `pointMix`（自動、混ぜて移る） |
| ビームの出始めに脚が跳ぶ | 反動が1コマで入る | 反動は25msで立ち上がる（自動） |
| 腕を伸ばしたキーで肘が曲がる | `center` が遠すぎて組が引き戻された | `pairShiftMm` を見て `center` を手前へ |
| 後ろ足の足首が横に倒れる（22°超） | 外を向いた後ろ足の上で脚が斜めに伸びる | かかとを上げて母趾球で回す（`heel`＋`pivot`）、足の置き場所 |
| 片足立ちで重心が外れる | 踏み替え中 | 片足立ちの重心は別記録。体重移動の量・踏み替えの順 |
| 戻りで腕がねじれて跳ぶ（実VRMだけ） | 腕がほぼ伸びたキーは肘の回り込みとねじれが入れ替え可能 | 計画はvisit順に前のキーを引き継いで解く（自動）。それでも出たら Studio の `__studio.plan()` で各キーの回り込み・ねじれを見る |
| 「手首がねじれている」「右手で左手のポーズ」に見える | 手首ではなく肩：肘が体の内側・上を向いている（肩の回旋±180°）。手の向きが人の腕で作れない | まず `scripts/arm-anatomy.mjs` で骨から実測（手首のねじれ・前腕・上腕・手首角）。肩の回旋は自動で罰する（外旋90・内旋75）。手の向きを作れる形へ（例：`flower` の下の手は `lowerOpen` で前下へ開く） |
| 腕を下ろしたキーで腕ごとねじれる（実VRMだけ） | 肘が服を含む胴の当たりに触れるのを避けて回り込みを変えた | 2cmまでの接触は軽い罰・深い分は上限付き（自動）。`__studio.traceKey(key, side, false)` で肘の向きごとのコストと当たり（`clearMm`）を見る |

## 5. いろいろな骨格で確かめる

```sh
npm run review:compat   # node scripts/review-compat.mjs specs/<id>.v1.json
```

自作骨格を、Blender/Rigify・Mixamo・Unreal・VRChat(Cats)・MMD・名前なしの命名、指・首・上胸・鎖骨・つま先の欠け、ねじれ骨、-Z向き、骨軸の回転で作り直し、アイテムと同じ `selectActorRig`（名前→名前の流派＋骨格の形）で見つけて全タイムラインを解く。**同じ骨格の変種は基準と0.01mm以内で同じ姿勢**、構造の違う変種は未達1mm未満が条件。21/21 にする。

## 6. 手元の実VRMで確かめる

```sh
node scripts/studio-capture.mjs --vrm vrm/<file>.vrm [--vrm ...] --read host --keys charge,thrust --evaluate --tag <name> --out local-assets/<dir>
```

- `--read host` で XRift と同じ読み方。`read ready/<方法>` が出ること、VRM定義との違いが無いことを見る。
- 撮影は `local-assets/` へ（コミットしない）。体格の違う複数体で、数値と見た目を分けて記録する。
- 手足にスキンの重みが無いアバターは皮膚の当たりを比率で推定するので、その警告は見た目で判断する。
- 腕は解き方の報告値だけで判断しない。`node scripts/arm-anatomy.mjs --vrm <file> ...`（骨から実測）と `node scripts/hand-closeup.mjs --vrm <file> --keys <key,...>`（両手の拡大、`local-assets/hands/`）で見る。

## 7. 記録する

- `docs/experiments/<id>-<日付>.md`：入力条件、前後の数値（自作骨格・互換・実VRMを分ける）、判断、未確認（実XRift・Quest・他者視点）。
- `CHANGELOG.md`・`docs/STATUS.md`・`docs/NEXT_THREAD.md`、仕組みを足したら `docs/specs/AUTHORED_ACTIONS_V1.md`。
- 変更後は `npm run verify`（テスト・型・build）。N02 を触っていなくても `npm run replay:n02` の一致を見る。

## 8. XRiftアイテムへ渡す

- 渡す前に、冒頭の「公式の今の仕様を確かめる」が済んでいること。日が空いたら版だけでも見直す。確かめた版と日付は渡し先のアイテムの README に書く。
- アイテムはこのリポジトリを直接 import しない。写す（例：items/ki-charge-orb の `scripts/sync-pose-lib.mjs`。写したファイルのハッシュを `SOURCE.json` に残し、`--check` で照合）。写すもの：`src/world*`（ワールド行列の読み取り。2026-11-11 以降の版では必須）・`src/vendor/render-pose*`・`torso-support*`・`src/authoring/*`・`src/adapters/xrift*`・`src/humanoid-inference*`・`src/role-inference*`・`specs/<id>.v1.json`。
- アバターは `selectActorRig({scene,userId,isLocal,feet})`：他人は `remote-player-<id>` 印（ホストの慣習で、SDKの約束ではない）、自分はどの印にも入っていない骨格。読めないときは当てずに `diagnosis` をコンソールへ（ユーザーがコピーして送れる形）。
- 描画のたびに当てて戻す（`scene.onBeforeRender`／`onAfterRender`、入れ子の描画は深さで数える）。頭はホスト（`headMode:'host'`）。VRの人には当てない（手は追跡される）。
- アイテムの時計とクリップの時計：入りと溜めはアイテムの時間に伸び縮みさせてよいが、放ってから先（押し出し・余韻・戻り）の秒数は一致させ、テストで固定する。

## 9. 持ち物を持つ動作（歩きながら両手で持つ物）

全身で構える動作と違い、下半身はホストの歩行のまま・手の行き先は持ち物の上。仕組みは [AUTHORED_ACTIONS_V1.md の7章](../../../docs/specs/AUTHORED_ACTIONS_V1.md)、実例は [specs/pump-gun.v1.json](../../../specs/pump-gun.v1.json) と [docs/experiments/pump-gun-2026-11-10.md](../../../docs/experiments/pump-gun-2026-11-10.md)。

1. 持ち物の模型から **ソケット** を測る（握り・支える所・もう一つ触る所）。座標は X=左・Y=上・Z=先端、実寸のメートル。指の向き（手首→指の付け根）と手のひらの向きを書く。
2. 構えのキーは胸の向き・鎖骨・肘の好みと `hold`（握る手のソケットを肩からどこに置くか）。**持つ位置は先に `npm run fit:<id>` の格子探索で関節の余裕を見てから決める**。胸の高さで握ると手首が伸展か尺屈で折れやすい。腹〜腰の高さで前腕が前を向く持ち方が楽。
3. 相ごとの曲線（`phases`）を書き、利用側の機構と同じ秒数を `timeline` に並べる。繰り返しの速い相（連射など）は `cycle.follow` で手の追従を小さくする。
4. `npm run review:<id>`（`scripts/review-held.mjs --poses`）で3体格の点数と静止姿勢の腕の数値を見る。よく出た原因：

| 症状 | 原因 | 直し方 |
|---|---|---|
| 小さい体で支える手が届かない・肘が伸び切る | 持ち物は実寸 | `holdFit`（自動）。とても小さい体には `prop.fit.scaleBelow` で持ち物を縮める |
| 握る手の手首が大きく伸展 | 肘を外へ出すと前腕が内向きになり、前向きの手との差が伸展になる | 持つ位置を下げる・前へ出す、肘の好みを下へ |
| 下を見ると手が腹に入る | 握る手が肩を中心に振れる | `hold.lookDown` で持つ位置を前上へ逃がす。振りを減らす（`pitchSwing`）のは手首が折れるので不可 |
| 下を見ると尺屈が増える | 持ち物だけ先が下がり、前腕がついて来ない | ソケットの `slip`（握りの上で手が滑る）、胸の倒し（`torsoPitchShare`） |
| 別のソケットへ移る途中で肘が反転 | 行き先の手の向きが前腕に無理（手のひら下で上からつかむ等） | 行き先のソケットの向きを、前腕の延長で作れる向きに（横からつかむ） |
| 開いた手が宙に浮いて見える | 指が伸びたまま | そのソケットの `fingers` の曲げを増やす |

5. `npm run review:compat:<id>` で21/21。持ち物のクリップはホストの下半身の上に当てるので、検査の向き（heading）はホストの向きに合わせる。
6. 見た目は利用側の検証ページで（例：items/shio-machinegun の `node scripts/pose-look.mjs [--vrm <手元VRM>]`）。Pose Studio は持ち物のクリップを表示できない。
7. アイテムへ渡すもの：8章の一覧に `src/authoring/prop*` と `specs/<id>.v1.json` を足す。描画トランザクションの中で `applyHeld` のあとすぐ持ち物のワールド姿勢を書く（手と持ち物が1コマずれない）。機構の秒数とクリップの `timeline` はテストで固定する。

## 終わりの条件

- [ ] XRift で動かす動作は、公式の今の仕様を確かめた（版・日付・頼っている前提・実機に残した項目を記録した）
- [ ] 自作骨格3体格＋短押しで18/18（警告は説明つき）、240Hzで単発の跳びなし
- [ ] `review:compat` 21/21
- [ ] 手元VRMで XRift と同じ読み方で読める・見た目を確認（撮影はローカルのみ）
- [ ] `npm run verify` 通過、`replay:n02` 一致
- [ ] 実験記録・CHANGELOG・STATUS・NEXT_THREAD を更新、未確認を書いた
