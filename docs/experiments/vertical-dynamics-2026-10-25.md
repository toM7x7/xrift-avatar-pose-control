# 上下の運動・荷重・圧縮の数値実験

2026-10-25。企画`docs/plans/nimbus-3d-flight-posture-plan-v1.md`のうち、回転しない足場の鉛直1軸を移動モデルへ追加した。既存の水平推力・抵抗・yawとCOM高さfeedbackを維持する。demo・nimbus姿勢コアはこの担当では変更していない。

## 入力と出力

```js
let state = createRideDynamics({
  mass: 70,
  liftForceUp: 210,
  liftForceDown: 210,
  verticalDrag: 0,
  verticalQuadraticDrag: 0,
  initialPosition: [0, 5, 0],
  initialVelocity: [0, 2, 0]
})
state = stepRideDynamics(state, { lift: 1 }, 1 / 60)
```

`lift`は-1〜1。正が世界+Y方向、負が世界-Y方向。初期velocityのYを保持し、positionのYも積分する。無入力時は惰性と抵抗、brakeで能動的に上下を停止する。高度の自動クランプや地面衝突は追加していない。

| 出力 | 意味 |
|---|---|
| verticalSpeed | 世界Y速度m/s。上昇正・下降負 |
| verticalAcceleration | 実速度差/dtからの世界Y加速度m/s² |
| speed / totalSpeed | 互換性を保った水平速度 / 新しい3D速度m/s |
| effectiveGravityMps2 | `g + verticalAcceleration`、符号付き |
| normalLoadRatio | `(g + verticalAcceleration) / g`、符号付きraw値 |
| supportState | supported / low-load / adhesion |
| zmpValid / zmpInvalidReason | 通常の圧縮支持として計算可能か、その理由 |
| verticalCompression | 荷重差へ連続応答する圧縮・緩み量。crouchへ加えるための別量 |

既存`pose.crouch`は平面反応のまま維持する。verticalCompressionをそこへ加算済みとは扱わず、利用側で一度だけ合成する。

## 力のモデル

```text
hoverForce = mass × g
gravityForce = -mass × g
commandForce = lift × liftForceUp/Down × (1 - brake)
netForce = hoverForce + gravityForce + commandForce - resistance
```

ホバー力と重力は常に補償し合う。その上に入力による上下力と抵抗・制動を加える。既定mass80kg、上下力各240Nなので、抵抗なしでは±3m/s²。mass70kgなら各210Nで同じ条件になる。

上下抵抗は水平抵抗と独立。既定verticalDrag=20N/(m/s)、verticalQuadraticDrag=1N/(m/s)²。brakeの上下力は既定520N。抵抗と制動はそのsubstepで速度0になる量を超えず、brakeだけで逆走しない。force・mass・抵抗等のconfigは初期化時に固定し、stepで書き換えない。

上昇中でも下向き加速なら軽く、下降中でも上向き加速なら重くなる。速度の正負や高度の頂点だけから荷重を決めない。真上の移動だけでyaw方位を作り直さず、水平方位を保持する。

## 通常支持と無効なZMP

水平・無回転の足場を仮定し、有効法線加速度`gEffective=g+aY`を使う。

通常支持では、XZのCOM spring目標と近似ZMPも同じgEffectiveへ変更する。

```text
COMtargetXZ = COMheight / gEffective × accelerationXZ
ZMPxz = COMoffsetXZ - COMheight / gEffective × accelerationXZ
```

支持状態はstateに保持する。

- n<0: 即座にadhesion。押す接触だけでは維持できない、魔法による引き留めが必要な状態。
- supportedからn<0.15: low-load。
- low-load/adhesionからn>0.25: 0.08秒連続してからsupportedへ復帰。
- その復帰待ち中はsupport-recovery-pendingとし、途中でn<=0.25なら保持時間をリセット。

閾値と保持時間は数値安定・表現のための設定であり、人体の生理的基準ではない。configの`lowLoadEnterRatio` / `lowLoadExitRatio` / `supportRecoverySeconds`で変更できる。

通常支持以外では`zeroMomentPoint`、`loadRatio`、`unclampedLoadRatio`、`supportMarginM`、`supportExceeded`をすべてnullとする。0・中央荷重・NaNで成立したようには見せない。無効理由はlow-normal-load / negative-normal-load / support-recovery-pending。XZの新しい平衡COM目標は0へ戻し、残るspring状態は減衰させる。吸着力や全身の浮遊運動を解いたわけではない。

## 圧縮の連続応答

```text
targetCompression = clamp(0.28 × (normalLoadRatio - 1), -0.12, 0.22)
compression += (targetCompression - compression)
               × (1 - exp(-dt / 0.18))
```

正は脚で受ける圧縮、負は圧縮を緩める量。大きな負荷重を正の大きなしゃがみへ反転しない。等速になってaY=0へ戻れば荷重は1g、圧縮量も0へ戻る。上下速度が大きいだけでは圧縮しない。

係数は姿勢制御へ渡すための経験則で、筋力・膝ばねの測定値ではない。`verticalCompressionResponseSeconds` / `verticalCompressionGain` / `verticalCompressionMax` / `verticalReleaseMax`として調整可能。

## 数値実験と前後

変更前はvelocityYを初期化時に0へ戻し、Y位置を積分せず、ZMPの分母は常にgだった。

変更後は、Y速度・Y位置を積分し、実aYの荷重代理と支持状態を返す。鉛直入力0では既存水平数値を維持する。

mass70kg・上下力210N・上下抵抗0、dt=0.1秒:

| 初期Y速度 | lift | 適用後Y速度 | aY | n |
|---:|---:|---:|---:|---:|
| +2m/s | +1 | +2.3m/s | +3m/s² | 約1.306 |
| +2m/s | -1 | +1.7m/s | -3m/s² | 約0.694 |
| -2m/s | +1 | -1.7m/s | +3m/s² | 約1.306 |
| -2m/s | -1 | -2.3m/s | -3m/s² | 約0.694 |

同じ±2m/sでも、加速度0の等速なら両方n=1、圧縮0となる。初期高度5mで2秒等速上昇/下降すると、高度は9m/1mとなった。

低荷重ストレス条件は下向き力70×9.81×0.9Nでn約0.1となりlow-load、ZMP類null。下向き1400NではaY=-20m/s²、n約-1.039となり即adhesion。どちらも入力0で0.5秒進めると、復帰保持時間を経てsupportedへ戻る。raw荷重はclampせず、負値を観測できる。

## 検証

`node --test tests/ride-dynamics.test.mjs tests/vertical-dynamics.test.mjs`: 既存13件＋上下10件、計23件成功。

上下テストでは、ホバー、初期上下速度、4符号ケース、質量比、入力非変更、上下制動と停止回復、有効gによるXZ COM/ZMP、近ゼロ・負荷重、hysteresisと復帰保持、抵抗と制動の差、非finite lift、30/60/120fps比較、水平回帰、crouchと上下圧縮の分離を確認した。

水平回帰条件はthrottle=1を2秒。位置Z=4.387222252048112m、水平速度3.5663427684140787m/s、Y位置0を従来値として維持した。

## 未確認と次の統合

今回は純数値モデルの確認。雲の3D支持面への足固定、姿勢コアの圧縮表現、実VRMの膝・衣服・頭の見え方は別の統合記録が必要。

bank、宙返り、角速度による接地点加速度、足の離着、衝突、吸着力の実計算、VR追跡、実XRift・Quest・他者同期は対象外。verticalCompressionの符号が正しくても、実際の膝や衣服が自然に見えることまでは保証しない。
