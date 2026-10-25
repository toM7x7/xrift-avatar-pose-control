# 雲のpitch・bankと支持面上の荷重

2026-10-25。`ride-dynamics`の並進を維持したまま、雲の支持姿勢を連続計算する実験。demoとアバター姿勢コアはこの担当では変更していない。

## 契約

`createRideDynamics({attitudeEnabled:true})`で有効化。既定はfalseで、従来の水平支持・上下運動の数値を維持する。

```text
前方 +Z / 右 +X / 上 +Y
public pitch > 0 : nose-up
public roll > 0  : 右bank
qSupport = QyawY(heading) × Qx(-pitch) × Qz(-roll)
```

stateへ次を追加した。

- `supportQuaternion: [x,y,z,w]`。headingを含む**world姿勢**。
- `supportFrame: {quaternion,normal,right,forward}`。すべてworld方向の配列。
- `attitude: {pitch,roll,pitchRate,rollRate,targetPitch,targetRoll,pathAngle,angularSpeed,angularSpeedLimit}`。

poseにもsupportQuaternion / supportFrame / supportAngularSpeed / attitudeEnabledを返す。supportQuaternionを親へ適用した後、同じ階層へさらにheadingを加算しない。

## 傾斜の目標と応答

pitch目標は上下速度による進路角と世界Y加速度、bank目標は実際の旋回横加速度から作る。

```text
pathAngle = atan2(vY, max(horizontalSpeed, pathSpeedFloor))
targetPitch = clamp(pathAngle × pitchPathGain
                    + atan2(aY,g) × pitchAccelerationGain, ±pitchLimit)
targetRoll = clamp(atan2(yawSideAcceleration,g) × rollAccelerationGain,
                   ±rollLimit)
angle'' = omega² × (targetAngle-angle) - 2 × zeta × omega × angle'
```

進路角からyawを作り直さないため、真上・真下・速度0でも水平方位を保持する。停止後は進路角も加速度も0へ近づき、pitchとbankが減衰して水平へ戻る。時間のsinで揺らさない。

既定値:

| config | 値 |
|---|---:|
| pitchLimitRadians | 20度相当 |
| rollLimitRadians | 25度相当 |
| attitudeMaxRate | pitch/roll各0.7rad/s |
| attitudeNaturalFrequency | 6rad/s |
| attitudeDampingRatio | 1 |
| attitudePathSpeedFloor | 0.6m/s |
| pitchPathGain | 0.35 |
| pitchAccelerationGain | 0.25 |
| rollAccelerationGain | 1 |

demoではpitch12度・bank18度などを明示設定して比較できる。これらは表現・数値安定の仮設定で、人体の確定した許容角ではない。

各角速度をrate limitし、角度も制限する。合成supportQuaternionの実角速度を隣接substepの最短角度差/dtで計測する。保守的な上限は`maxTurnRate + 2×attitudeMaxRate`。初期yaw速度もmaxTurnRateへ制限する。quaternionは毎回正規化する。

## 支持面へ荷重を射影する

```text
requiredAccelerationWorld = aWorld - gravityWorld
                          = [aX, aY+g, aZ]
effectiveGravityMps2 = dot(requiredAccelerationWorld, support.normal)
tangentForwardAcceleration = dot(requiredAccelerationWorld, support.forward)
tangentLateralAcceleration = dot(requiredAccelerationWorld, support.right)
normalLoadRatio = effectiveGravityMps2 / g
```

法線荷重・支持状態・verticalCompressionは、このnormal射影で統一する。正荷重のCOM spring目標・ZMPにも同じnormalと接線成分を使う。

```text
COMtarget = COMheight / effectiveGravity × tangentAcceleration
ZMP = COMoffset - COMheight / effectiveGravity × tangentAcceleration
```

COMoffsetは支持面の前・右方向、COMheightはnormal方向の高さ。`observedComHeightM`を戻す場合も`dot(COMworld-supportOrigin, support.normal)`を使う。worldY差のままだと傾斜で座標が一致しない。

互換のため、既存`pose.forwardAcceleration` / `lateralAcceleration`はyaw水平軸への実加速度の射影を維持した。**傾斜対応した姿勢コアへは新しいtangentForwardAcceleration / tangentLateralAccelerationを渡す。** 世界Y加速度verticalAccelerationも維持する。

傾いた足場では、world加速度0でも重力の接線成分が生じる。この接線成分を無視してCOM/ZMPを中央と扱わない。支持面の法線荷重が低い・負の場合のZMP無効化、hysteresis、復帰保持は上下モデルと同じ方針で継続する。

## 変更前後と受入

変更前: 支持面はyawのみで、法線はworld+Y。上下荷重はg+aYだけを使っていた。

変更後: opt-inでpitch/bankを減衰・rate limit付きで計算し、同じsupportQuaternionと支持面軸から法線・接線需要を算出する。並進モデルは引き続きyawに基づき、傾斜から別の速度・位置を発生させない。同一入力のattitude true/falseでworld位置・速度・headingが完全一致することを確認した。

等速上昇2m/s、上下抵抗0、attitude有効で3秒: pitchは約20度へ、aY=0。world前後加速度は0でも支持面前方の重力接線成分は約3.35m/s²、法線は約9.22m/s²となる。水平支持時の「等速ならnormal荷重1g」は、傾斜時には「合成重力は1gだが法線・接線へ分解される」と読み替える。

## テスト

`node --test tests/ride-dynamics.test.mjs tests/vertical-dynamics.test.mjs tests/ride-attitude.test.mjs`: 水平13＋上下10＋傾斜9、計32件成功。

傾斜テスト:

1. 既定falseのyaw-only、既存水平数値。
2. 上下pitchの符号、真上/真下のyaw保持。
3. 左右旋回のbank鏡対称、公開quaternion積の順序。
4. true/falseの位置・速度・heading不変と入力非変更。
5. 同じ支持面からのnormal/tangent需要、COM/ZMP、圧縮。
6. 角度・角速度上限、quaternion正規化、支持軸の直交性。
7. 制動停止後のpitch/bank・COM・角速度の回復。
8. 傾斜していても低/負荷重時はZMP類null、理由を返し復帰。
9. 明示した3Dコースで30/60/120fpsの比較。

## 限界

pitch/bank目標は飛行状態から作る表現上の制御則で、航空機の揚力や回転剛体の運動方程式を解いていない。筋斗雲の並進は全方向推力の縮約モデルで、支持面傾斜へ移動権限を二重に持たせない。

足場の角速度・角加速度による乗り手位置の向心/接線加速度は未計算。`pose.rotationalPointAccelerationIncluded=false`を明示する。現在の荷重代理は**足場原点の並進加速度**を傾いた支持面へ射影した値であり、足やCOM位置の全加速度ではない。

通常範囲のpitch/bankまでが対象。宙返り・背面・足の離着・吸着力の実計算・接触摩擦・実XRift同期は追加していない。数値テストの成功は、実VRMの衣服・膝・足裏・首の見え方や、VRの快適性の受入を代替しない。
