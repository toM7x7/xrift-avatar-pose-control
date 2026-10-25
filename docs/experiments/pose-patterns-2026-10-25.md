# 乗り姿勢18候補の比較と大量SIM

2026-10-25。N02の採用結果を保ちながら、椅子座り・またがり・横座り・腹ばい・肩車へ実験を広げた。18候補を同じ条件で見比べる画面、候補catalog、固定dtのスクリーニング、失敗と復元の記録を追加した。

18候補はすべて**未採用の比較対象**。この記録の「SIM」は支持目標・骨格・IKを繰り返し解く運動学的な実験であり、車両の力積分、全身の剛体接触、衣服や衝突を解くものではない。乗り物・動物の完成3Dモデルは制作していない。

最終版は実VRM3体でunique1,620条件をscreenし、代表108条件を24フレーム再確認した。数値的不成立・復元失敗は0。最終画像144枚のうち独立目視44枚では、衣服や手の交差が残る条件も確認した。[匿名集計](pose-patterns-summary-2026-10-25.json)を数値結果の正本とし、初回の失敗と修正後の結果を以下で分ける。

## N02の採用基準との関係

[N02通常飛行1.0.0](../specs/N02_NORMAL_FLIGHT_V1.md)と[設定正本](../../specs/n02-normal-flight.v1.json)は変更していない。新しいcatalogにある筋斗雲2候補は、比較画面用の姿勢条件であり、採用済みの飛行設定や14秒コースを書き換えない。

統合担当は、採用時の1740フレーム再現結果と現行結果について、`calibration` / `checks` / `extrema` / `limits` / `final`のdeepEqualを確認した。生成日時や新しい実験のsource hashが変わったことと、採用動作の数値変更を区別している。

本文作成前の`npm run verify`は151テスト・型チェック・デモbuildが成功。これは実VRM最終batchの目視合格を意味しない。

## 入力と追加したもの

| 対象 | 内容と確認範囲 |
|---|---|
| 自作骨格 | 別々に生成した0.65／1.00／1.35倍の3体。拡縮はこのfixtureだけに適用 |
| 手元の実VRM | ファイル選択から3体を読み込み、元モデルを拡縮・編集せず比較 |
| catalog | [pose-patterns.mjs](../../src/pose-patterns.mjs)。deepFreezeされた18候補と、独立したcaseを生成 |
| 新しい座りコア | [supported-seat.mjs](../../src/supported-seat.mjs)。chair／straddle／side-sitの腰支持と手足目標 |
| 共通bench | [pattern-engine.mjs](../../demo/pattern-engine.mjs)。同じ骨格入力からfamily別に解き、姿勢・skin・復元を観測 |
| 画面 | `http://127.0.0.1:5228/patterns.html`。候補・条件・観察方向を選び、数値結果と見た目を比較 |
| 判定 | [pattern-assessment.mjs](../../demo/pattern-assessment.mjs)。pass／limited／unsupported／failを理由付きで返す |

匿名IDはそのrun内の選択順を表す。以前のA01／A02／A03と同じ実体とは仮定しない。撮影時は匿名IDだけでなく、モデル世代・頂点数・mesh数・可視足の診断とcase IDを照合する。

## 18候補とfamily

| 候補ID | family | 比較する姿勢 |
|---|---|---|
| nimbus-surf | nimbus | 筋斗雲の基本サーフ姿勢 |
| nimbus-low | nimbus | 低く構える筋斗雲 |
| standing-hover | standing | 膝を軽く緩めた浮遊足場の立ち乗り |
| standing-braced | standing | 動く足場へ立って構える |
| prone-glider | prone | グライダーの腹ばい飛行 |
| prone-manta | prone | 巨大マンタの広い背へ伏せる |
| prone-streamlined | prone | 長い飛行体へ脚をまとめて伏せる |
| chair-car | chair | 自動車の前方グリップへ座る |
| chair-edge | chair | 乗り物の縁へ上体を起こして座る |
| chair-reclined | chair | カートのように背を倒して座る |
| straddle-horse | straddle | 馬へ上体を起こしてまたがる |
| straddle-motorcycle | straddle | バイクへ前傾してまたがる |
| straddle-wide-beast | straddle | 幅広の幻獣へ大きくまたがる |
| straddle-dragon | straddle | ドラゴンへ低く前傾して構える |
| side-broom | side-sit | ほうきへ両脚を左に出して横座り |
| side-edge | side-sit | 浮遊する縁へ両脚を右に出して横座り |
| shoulder-upright | shoulder | 基本の肩支持による肩車 |
| shoulder-back-offset | shoulder | 腰を後ろへ離した肩車 |

座り3familyでは、支持高・足幅を脚長比、グリップ到達を腕長比で指定する。上体の前後傾、左右どちらへ脚を出すか、手を緩める／グリップへ向ける／模擬追跡を保つ、を比較できる。腰・足・手の全目標へ同時に届くとは仮定せず、残差を返す。

肩車の運ぶ側はfixture。実ユーザー同士の搭乗許可・入力・移動権限・同期を実装したものではない。

## 条件の組み方と件数

standardは18候補×18条件＝**1モデルあたり324条件**。stressはstandardを含み、候補ごとに12の境界・複合条件を追加して**540条件**。standardとstressを足して864のunique条件と数えない。

各caseの`options`はbaseと変種のdeep merge。`condition`の支持pitch／roll、見回し、carrierScaleはhost側が支持面や入力へ適用する。単にoptionsへ未知のキーを渡して実験したことにはしない。

- 共通条件：支持面の上下・左右傾斜、左右の見回し、見上げ・見下げ、模擬追跡手、少数の複合条件。
- family固有：N02の足幅・しゃがみ、standingの膝と胴、proneの膝・脚の開き・足首、seatの支持高・幅・グリップ、shoulderの腰位置・開脚・運ぶfixtureの体格。
- 実VRMへfixtureScale／riderScaleを加えない。体格差は別の実モデルと、独立したfixture3体格で比較する。
- 全組合せの直積ではない。入力の重複を避けた選択的coverageで、stressも成立保証を意味しない。

通常は1/60秒、caseごと24フレームを解く。支持面へ振幅0.025radの明示的な小さい周期摂動を加え、同じ拘束を繰り返し解いた時の最大値を見る。これはbenchの入力条件であり、採用N02へ自動のsin揺れを戻したものではない。

実VRMは処理量を分ける。

1. stress540条件を各1sampleでscreenする。
2. 各候補の基本＋screenで厳しかった条件を最大36件選び、各24フレームで再確認する。
3. 基本の正面・側面と、代表条件の追加方向を撮影する。

screenとcontinuousには同じcase IDが含まれる。unique条件数、連続確認件数、solve sample数、撮影数、目視確認数は別々に記録する。

## 数値の意味と受入

| 指標 | 扱い |
|---|---|
| boneLengthErrorMm | 実際のbone.parent→boneの距離。移動するhipsの親offsetは除外。0.01mm超を不成立 |
| mappedSpanErrorMm | マップされた役割間の点距離。間に別ボーンがある場合、直接骨長とは異なる診断量 |
| 頭の入力回転誤差 | 0.001度超を不成立。頭・髪が描画されるかは別に目視する |
| 頭–首／頭–胸角 | 別々の解剖学的Qから算出。実験閾値55度／110度超を理由別のlimitedとする |
| 足・腰目標 | 2mm超を到達制約として記録 |
| 手／carrierの手 | 20mm超をそれぞれ到達制約として記録 |
| 可視靴底 | 最終sampleだけ、足weight>0.5のskin頂点を支持法線へ射影。10mm超のgapをlimited |
| proneの胴支持 | sampled-skinのfit・板内判定と胸腹gapを観測。板外／fit未達をlimited |
| 復元・非finite | rider、carrier、carrier rootの復元を確認。非finiteな姿勢・metricを成功値へ置き換えない |

閾値は実験用のscreeningであり、人体の普遍的な可動限界や快適性を認定するものではない。可視靴底gapは最終sampleの計測で、骨・目標の最大値は24フレームを通した観測。時間範囲の違いを残す。

`pass`は「この数値screenに違反がなかった」。`limited`には、到達不能だけでなく未計測の接触、指を握る動作の未実装、体積proxyの近接も含む。可視足のない入力は`unsupported`として、足裏を検証できない理由を示す。見た目の採用はどのstatusでも別途判断する。

## 確定したfixture結果

[公開可能な集計JSON](pose-pattern-fixtures-2026-10-25.json)に、成功artifactのSHA256、実行sourceとlockfileのhash、全体・体格別集計を保存した。私有VRM・私有画像・source変更監査に失敗したrunは含まない。

3体格×324条件×24フレーム＝**972条件・23,328フレーム**。各体格39pass／285limited、全体117pass／855limited／unsupported0／fail0。solver・case・restoreの例外と復元不一致は0。source hashの実行前後一致を確認した。

| family | 条件数 | pass | limited | fail |
|---|---:|---:|---:|---:|
| nimbus | 108 | 0 | 108 | 0 |
| standing | 108 | 0 | 108 | 0 |
| prone | 162 | 117 | 45 | 0 |
| chair | 162 | 0 | 162 | 0 |
| straddle | 216 | 0 | 216 | 0 |
| side-sit | 108 | 0 | 108 | 0 |
| shoulder | 108 | 0 | 108 | 0 |

実親子骨長・mapped spanの最大誤差はfixtureではともに約8.9e-13mm、頭入力Q差は約3e-6度。prone最終162samplesは全てsampled-skin、板外0・fit失敗0。

limitedの主因は、seatと衣服の接触未計測486件、N02の固定足と希望膝角の差108件、standingの支持非拘束108件、頭–首角45件、手の到達33件、足の到達9件など。肩車のcarrier手未達2件も乗る側の手とは分けて検出した。

横座りの広い足幅や高い支持では、足残差が最大約626mmになった。骨を伸ばして隠さず、到達限界の例として残している。N02のlimitedは、このbenchで固定した足と希望する膝曲げの残差によるもので、採用済みの飛行profileの回帰結果とは別である。

## 実VRMで見つかった問題と修正前後

初回の実VRM batchは3体でunique1620条件、選択したcontinuous108条件、画像144枚を記録した。これは**修正前の観測**。初回・限定probe・最終runは別の出力と画像で保持している。

独立観察では75枚を確認し、匿名ID・case・モデル世代・頂点診断を照合した。全144枚や全数値caseを目視したわけではない。私的な観察記録はignored領域へ残し、本書は匿名の所見だけをまとめる。

### A03の腹ばい破綻：描画と骨格を別に修正

初回A03のprone90条件で、旧mapped span指標に約319mmの変化が現れた。画像でも脚が肩側へ折り返し、胴・衣服が不自然に伸びていた。一方、別の座り姿勢では、頭の回転誤差が小さいのに顔・髪のskinが消える描画問題があった。

| 問題 | 根因の切り分け | 反映した修正・確認 |
|---|---|---|
| proneの脚・胴の変形 | skin paletteにない非変形親がある時、bindのworld変換をlocal変換として扱う経路があった | 人型関節をworld-safeに復元・回転し、欠落親のpivotを維持。実親子骨長を別に測る |
| 頭・髪の消失 | 姿勢で変形したskinと描画bounds/cullingの問題。入力に頭がない場合とは異なる | lab内のSkinnedMesh cullingを無効にして描画を比較。元VRMは編集しない |
| 首の角度の過大表示 | 頭–胸角を首単独角として扱うfallbackがあった | 頭–首角と頭–胸角を分離し、別々にscreen |
| 肩車の支持・握り | carrierを解き直すと、採取済み肩anchorが変わり得た | uprightを先に安定化してanchor取得、両手を解いた後に支持を再計測 |

欠落親を含む自作fixtureの回帰では、実親子骨長誤差約70.744mmを再現し、修正後は数値上ほぼ0へ改善した。[prone互換テスト](../../tests/prone-compatibility.test.mjs)では、欠落親、衣服・顔・指のlocal所有権、追跡手、支持fitと復元を確認する。

修正後の限定probe2枚では、A03のモデル診断90,152頂点／21meshを照合し、実親子骨長誤差約0.000059mm、proneの膝約8度を確認。顔・髪が戻り、脚は後方へ伸びた。その後、末尾の最終batchで全条件を再計算した。labのculling対策はローカル描画adapterの方針であり、実XRift側のbounds更新まで確認したものではない。

実験テンプレートの前方表記も旧`-Z`から`+Z`へ統一した。[ride-spec-template.json](../ride-spec-template.json)は+Y上／+Z前／+X右を明示する。既存standing APIのpitch/roll符号はbench境界で変換し、supportQuaternionにyawを二重適用しない。ホスト側の座標は接続境界で一度だけ変換する。

## 匿名の目視所見と、まだ残ること

| 対象 | 確認できた形 | 次に観察・調整する点 |
|---|---|---|
| N02 | 頭・胸腰・左右脚の分担、低い構えの差 | 靴の端が有限の仮板から張り出す。法線gapだけで足裏全面の支持を判定しない |
| standing | 直立と軽い膝曲げの差 | 支持物・足固定がない条件では接地や荷重を合格にしない |
| prone | 腹ばいの胴と後ろへ伸びる脚。脚の候補差は側面が有効 | 前腕・手・頭装飾と仮板の近接、実グリップ・布の接触 |
| chair | 基本・縁座り・後傾の差が側面で読める | 両手の中央近接、握り指、座板と尻・腿の衣服の交差 |
| straddle | 馬の起きた上体、バイク／ドラゴンの前傾、幅広の開脚 | 左右グリップの独立、腿の内側と支持体、見回し時の首・装飾品 |
| side-sit | 左右へ両脚をそろえる輪郭と到達限界 | 手が衣服へ隠れる、座面の交差、遠い足目標への未達 |
| shoulder | 頭どうしを分離し、腿が首の左右を通る形 | 手が太い衣服へ隠れる／突き出す。骨target一致を皮膚接触としない |

可視脚のないモデルでは、足目標やcarrierのすねtargetが存在しても、可視の足裏・すね保持を検証できない。頭・胴・手の比較は残せるが、脚が突然消えたsolver障害と同じ扱いにはしない。

強い見回しでは首の皮膚や装飾品に違和感が残る。頭入力Qの保持、自然な見回し、衣服や手の接触は別々に受け入れる。修正後の顔・髪が見えることも、cullingの数値だけでなく複数方向から確認する。

次に選ぶなら、chair-carとchair-reclined、straddle-horseとstraddle-motorcycle、side-broomとside-edgeのように、狙いが見分けやすい2候補を一組にする。基本の1組を実VRMで整えてから、幅広幻獣・遠いグリップ・強い見回しへ広げる。proneは今回の修正後baseを側面・斜めで先に再受入し、肩車は頭・腿・carrier手を同時に観察する。

## 再現方法

Node.js22以上。リポジトリで実行する。

```sh
npm run verify
npm run replay:n02
npm run replay:patterns
npm run dev
```

`replay:patterns`は実VRM不要。3fixture体格の324条件×24フレームを回し、ignoredの`artifacts/pose-pattern-fixtures.json`へ入力hash、source hash、caseごとの最大値・最終値、復元、理由を保存する。case不成立があっても全数を続け、runner自身の失敗と区別する。sourceが実行途中に変わったrunは最終根拠から除外して再実行する。

実VRMは`/patterns.html`のファイル選択から読み込む。候補・変種・正面／側面／斜めを比較できる。自動batchはPlaywright CLIの`run-code --filename=scripts/simulate-pose-patterns.js`を使用する。具体的な起動手順は[scripts/README.md](../../scripts/README.md)を参照。

[summarize-pose-patterns.mjs](../../scripts/summarize-pose-patterns.mjs)は全数JSON・fixture・独立観察記録から公開可能な匿名集計を作る。VRM本体、元ファイル名、作者、私有画像、各アバターの関節座標は公開集計へ含めない。JSONや撮影が存在することと、全画像の目視受入は分ける。

## 確認範囲

実装したのは比較catalog、3種の座りコア、kinematic bench、数値screen、CPUとブラウザの再現・観察経路。本人のVR追跡、実XRiftへの接続、Quest、他者アバターの表示・同期、複数人ライドは未検証。

全身の剛体接触・転倒、衣服と髪の物理、握り指の完成、実座面や動物との体積接触も未完。見た目の採用前に、選んだ候補の複数方向・体格差・解除を確認する。

## 最終実VRM結果

採用する実行記録は`pattern-sim-refined.json`。元名や画像を含むローカル詳細はignored領域へ保持し、公開するのは[匿名集計JSON](pose-patterns-summary-2026-10-25.json)。途中でsourceが変わったrunと、重複計算を削減するため中断したrunは最終根拠に含めない。

| 最終screen | unique条件 | pass | limited | unsupported | fail |
|---|---:|---:|---:|---:|---:|
| A01 | 540 | 12 | 528 | 0 | 0 |
| A02 | 540 | 0 | 0 | 540 | 0 |
| A03 | 540 | 14 | 526 | 0 | 0 |
| 合計 | 1,620 | 26 | 1,054 | 540 | 0 |

さらに各モデル36条件、計108条件を固定dtで24フレーム再確認した。continuousはlimited72／unsupported36／fail0。一次screenとの反復を含めて1,728評価・4,212 solve samplesであり、unique条件数へ加算しない。可視足のないA02も頭・胴・手の数値を保持している。

最終画像は144枚。例外・非finite・復元不一致・ページエラー・非GETリクエストは0。実親子骨長の最大誤差は約0.0000593mm。旧A03のprone90条件は修正後12pass／78limited／fail0となり、骨長破綻は解消した。残るlimitedは首角や支持・手の条件によるもので、完成扱いにはしない。

独立目視は初回75枚、修正probe2枚、最終44枚（A01:12／A02:10／A03:22）、計121の異なる画像。初回で明示した頭消失・prone破綻の8枚は、最終の対応8枚で改善を確認した。一方、最終の`chair-car__family-boundary-a`斜め画像では手が胴内に入る見た目不合格を1枚記録している。残り100枚や全数値条件の見た目を合格にしたものではない。

匿名集計の`observedPatternFits`には、未計測接触などの保留を残しながら、目標未達・角度・体積proxyの制限が出なかった観測case IDを候補ごとに掲載する。連続した安全範囲や目視採用を保証するものではなく、次に比較する入力を選ぶための索引である。

撮影後、`renderCase`の支持計測flag／assessmentを計測済みskinへ揃えた。poseやrunSweepの計算は変更していない。[表示確認](pose-patterns-post-display-check-2026-10-25.json)では実VRMを再読込し、3条件72フレームの分類が最終batchと同一、数値の最大差は浮動小数点の約4.55e-13（照合許容1e-8）だった。実行source hashと現在sourceのこの差を集計へ明記した。

[描画待ち／タスク待ちの比較](pose-patterns-yield-equivalence-2026-10-25.json)は、同じ入力3条件×24フレームの全case結果が完全一致。[最終verify記録](pose-patterns-verify-2026-10-25.txt)は151テスト・型・build成功。N02の採用replayは`calibration/checks/extrema/limits/final`が採用時JSONとdeepEqualであり、既存の基準を維持している。
