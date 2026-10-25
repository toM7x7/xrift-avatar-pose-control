# 雲の移動と身体バランス：縮約モデルの実験

2026-10-25。ユーザーの「胸・腰、足の踏ん張り、前進で物理演算を体現する」という指摘に対する、ローカル移動入力の実験。既存の姿勢コアやXRift本体はこの担当では変更していない。

## 入出力

`src/ride-dynamics.mjs`:

```js
let state = createRideDynamics({ initialHeading: 0 })
state = stepRideDynamics(state, { throttle: 1, steer: 0, brake: 0 }, dt)
// state.position / velocity / acceleration: world [x,y,z]
// state.heading / yawRate: radians / radians per second
// state.pose: COMの応答、傾斜、しゃがみ、ZMP、前後左右荷重比
```

`heading`は`initialHeading`の別名として初期化時だけ使える。前方はheading=0で+Z、上は+Y、正のsteerは+X側への旋回。正のforwardAccelerationは前方への実加速度、正のlateralAccelerationは進行方向に対する右向き加速度。いずれもm/s²。

姿勢コアから前描画の重心高さを取得できる場合は、同じinputへ`observedComHeightM`を渡す。初期高さはreadonlyの`config.comHeightM`、使用中の推定高さは別stateの`estimatedComHeightM`に分ける。

`stepRideDynamics`は入力state・配列・入力オブジェクトを変更せず、新しいstateを返す。純関数として同じ入力から同じ出力を再現できる。dtは秒。通常1/240秒以下のsubstepで積分する。既定では2秒を超えるcatch-upを行わず、切り捨て時間を`discardedDt`へ明示する。

## 移動モデル

- 質量80kg、前方推進力260N、制動力520Nが既定。
- 推進加速度はthrottle × driveForce / mass。brakeを踏むと推進力も減る。
- 速度と逆向きに線形抵抗48N/(m/s)と二次抵抗2N/(m/s)²を適用。
- 制動と抵抗はそのsubstepで停止する量を超えないため、ブレーキだけで逆走しない。
- 操舵は目標yaw速度へ時定数0.22秒で応答。最大0.8rad/sを速度に応じて近づける。
- 新しいheadingに対する横滑り速度へ、lateralGrip=800N/(m/s)の横力を適用。横滑り解消量はそのsubstepの速度を反転させない範囲に抑える。
- world速度と位置を積分し、実際の速度差/dtからworld加速度を得る。姿勢入力の加速度は、この実加速度を雲の前方・右向き軸へ射影した値。

時間に応じたsinで雲や身体を揺らしていない。コード内のsin/cosはheadingから方向ベクトルを作るための座標変換だけに使う。

## COMの応答と近似荷重

定常加速度+aへ追従するため、COMを+a側へ寄せる平衡目標を使う。単に加速度と逆方向へ身体を倒す演出とは区別する。

```text
COMtarget = COMheight / g × acceleration
COM'' = omega² × (COMtarget - COM) - 2 × zeta × omega × COM'
targetLean = atan2(acceleration, g)
balanceLean = atan2(currentCOMoffset, COMheight)
```

既定COM高は0.9m、omega=8rad/s、zeta=1。COM targetは最大傾斜0.45rad相当へ制限する。これは標準体格を仮定したメートル値で、VRMの実身長や人体重心を測定した値ではない。COM高や支持寸法は`createRideDynamics`で設定できる。

## 描画後の重心高さを戻すfeedback

統合時に、制動で姿勢側のCOM高が静止較正値から低下し、移動モデルの固定COM高と姿勢側の実COM proxy高を使ったZMPが乖離することを確認した。固定した大きな高さのまま大きい水平COM変位を要求し続けると、足を固定する姿勢コアへ過大な要求が残る。

そこで前描画の`balanceProxy.centerOfMassWorld.y - contactPlaneY`を`observedComHeightM`として戻せるようにした。

```text
estimatedHeight += (observedHeight - estimatedHeight)
                   × (1 - exp(-dt / responseSeconds))
```

responseSecondsは`config.comHeightResponseSeconds`（既定0.25秒）。実装では同じsubstepで推定高さを更新してから、COM spring target、最大offset、lean、ZMPへ反映する。`pose.comHeightM`はこの使用高さを返す。初期較正0.69mなどは維持でき、readonly configを毎フレーム書き換えない。

- 観測なし: 推定高さを保持し、従来の固定高さの動きと数値互換。
- finite観測: 0.2〜2mへclampして追従。初期高さも同範囲へ制限。
- NaN/Infinity: 観測を無視し、高さを保持。
- `heightObservationStatus`: `none` / `accepted` / `clamped` / `ignored-nonfinite`。
- `observedComHeightM`: 実際に使った観測値、無視・未入力ならnull。

初期0.75m→観測0.50mのステップでは、0.25秒後の推定高さは約0.59197m。一次応答どおりで瞬間的には飛ばない。

1フレーム遅れの合成結合条件`observedHeight=0.75-0.45×abs(COMoffset)`、一定加速度3.25m/s²を5秒入力し、30/60/120fpsで発散せず同じ平衡へ収束することを確認した。これは姿勢コア全体の閉ループ安定性の証明ではない。実際のIK、膝角制限、更新遅延、観測ノイズ、可動域の境界では別に確認が必要。

停止時の受入は、速度0だけでなく、COM offset・lean・ZMPが0へ、前後荷重が0.5へ戻り、観測高さが静止値へ収束すること。COM高を戻しても実際の足裏支持・全身体積が成立したと扱わない。

発進直後はCOMがまだ平衡位置へ届かず、その遅れが支持荷重へ現れる。制動時には加速度の向きが反転し、COM targetと荷重反応も反転する。加速度0なら新しい傾斜目標は0になり、残るCOM状態は減衰して直立へ戻る。速度だけを理由に身体を揺らさない。

近似ZMPと支持配分:

```text
ZMPforward = COMforward - COMheight / g × accelerationForward
ZMPside    = COMside    - COMheight / g × accelerationSide
frontRatio = clamp(0.5 + ZMPforward / (2 × supportHalfLength), 0, 1)
rightRatio = clamp(0.5 + ZMPside    / (2 × supportHalfWidth),  0, 1)
supportMargin = min(supportHalfLength - abs(ZMPforward),
                    supportHalfWidth - abs(ZMPside))
```

既定支持長は前後±0.45m、左右±0.18m。前後・左右は各軸で和が1となる独立した配分で、4つの値を足して1とはしない。比率のclamp前の値も返し、支持範囲を超えたかを`supportExceeded`と負の`supportMarginM`へ残す。雲と足の実接触形状や実測した床反力ではない。

## 数値実験

同一の既定条件から次の明示区間を入力した。周期揺れではない。

| 条件 | 速度m/s | 前後加速度m/s² | 横加速度m/s² | 前傾度 | 横傾度 |
|---|---:|---:|---:|---:|---:|
| throttle=1を2秒 | 3.566 | +0.784 | 0 | +5.575 | 0 |
| 続けてbrake=1を0.4秒 | 0.452 | -6.794 | 0 | -21.093 | 0 |
| 続けてbrake=1を3秒 | 0 | 0 | 0 | 約0 | 0 |
| 初速3、throttle=.6/steer=+.7を1秒 | 2.907 | -0.009 | +1.577 | -0.154 | +8.613 |
| 同じ初速、steer=-.7を1秒 | 2.907 | -0.009 | -1.577 | -0.154 | -8.613 |

発進2秒のCOM前方変位は+0.08785m、近似前荷重0.5177。制動0.4秒ではCOMは-0.34715mへ、前荷重は0.8068へ変わった。停止後はCOMと荷重が0/0.5へ収束した。

明示区間「発進2秒→旋回2秒→制動1.5秒」を1/30と1/60秒で比較。最終位置差は約1.72e-14m、heading差約2.78e-15rad、COM傾斜差約5.10e-18rad。両方を同じ1/240秒substepへ分割した結果であり、すべてのdtや実機遅延が同一になる保証ではない。

## 単体テスト

`node --test tests/ride-dynamics.test.mjs`: 高さfeedback追加後13件成功。

1. 質量を倍にすると同一力で加速度が半分。入力非変更。
2. 発進・制動で実加速度とCOM応答が反転。ブレーキで有限時間に停止。
3. 同じ初速の左右旋回で横加速度・傾斜・軌跡が鏡対称。
4. 抵抗なしの定速4m/sを8秒継続しても、加速度・傾斜・しゃがみが揺れない。
5. 無入力抵抗で速度が減り、停止後の傾斜も収束。
6. 1/30・1/60・1/120秒で明示区間の結果を比較。
7. spring COMと実加速度からZMPを求め、狭い支持条件の超過を隠さない。定常加速ではCOMが追いつき荷重配分が中央へ戻る。
8. 非finite入力・負dt・長すぎるcatch-upを処理し、有限値と切捨て時間を確認。
9. 初期headingの指定と極端なチューニング値の境界処理。
10. 観測高さへの時定数応答、config初期値不変、観測が止まった時の推定値保持。
11. 非finite観測の無視、極端な観測と初期高さのclamp、有限値維持。
12. 1フレーム遅れの合成高さfeedbackでの収束、30/60/120fps差。
13. 発進後の制動で観測高さが低下しても、停止後にCOM・lean・荷重と高さが収束。

## 変更前後と確認範囲

変更前: N02の足場はその場の姿勢へ追従する表示で、身体の揺れは時間関数によるpitch/rollの比較入力だった。

変更後: 推進・抵抗・制動・横力から速度と位置を積分し、そこで発生した実加速度をCOM応答と近似支持配分へ渡せる。移動しているだけで毎周期ポーズが動く方式ではない。

ただしこれは**平面移動と能動バランスの縮約モデル**。全身の剛体・関節慣性、筋力、実足裏摩擦、地形との接触・衝突、転倒、雲の上下動は計算していない。COM springは制御モデルであり、生体の測定値ではない。姿勢コア側の胸・腰・膝・足への割当は別の制御則・誤差観測として検証する。

今回は純数値の単体実験まで。実VRMの目視、local demoの動的撮影、実XRift、Quest、他者視点・多人数同期の確認は統合担当の別記録が必要。
