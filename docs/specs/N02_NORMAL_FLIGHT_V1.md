# N02 通常飛行プロファイル 1.0.0

2026-10-25、ユーザーが傾斜飛行の実験結果を採用。本書はこのプロジェクトで再現・統合するための採用基準。一般のVRM/XRift規格として認定されたものではない。

## 正本と版の固定

- 設定の正本：[n02-normal-flight.v1.json](../../specs/n02-normal-flight.v1.json)。ID `n02-normal-flight`、version `1.0.0`。
- プログラム入口：`N02_NORMAL_FLIGHT_PROFILE`、`createN02RideOptions`、`sampleN02FlightSequence`。デモも同じJSONを読む。
- Git基準：タグ `n02-normal-flight-v1.0.0`。利用側はタグまたはそのcommit SHAを固定し、mainの変更を無条件で追わない。
- packageの`0.1.0`と、この採用profileの`1.0.0`は別の番号。npm公開・ライセンス変更を意味しない。
- 座標・拘束・設定・再現コース・判定条件を変える時はprofile版を上げ、同条件の前後結果を残す。

## 採用する動作

N02の斜めサーフ姿勢。上下・前進・旋回と制動に応じて雲がpitch/bankし、足裏・左右脚・腰・胸が追従する。頭は利用側から受けた世界回転を保つ。本人のlook入力を許し、通常飛行から強制的な反転を入れない。

支持優先では頭の**位置**が動く。頭位置固定・VR追跡手・足支持の全同時達成を保証しない。PC三人称での今回の採用と、VR一人称の受入を区別する。

## 座標と入力

| 項目 | 契約 |
|---|---|
| 単位 | 長さm、時間s、角度rad。表示だけ度へ変換 |
| 世界軸 | 右手系、+Y上、+Z前、+X右 |
| quaternion | `[x,y,z,w]`、正規化、ゼロ・非finiteは不可 |
| heading | 0が+Z、正方向は右へ旋回 |
| pitch / roll | pitch正は鼻上げ、roll正は右bank |
| 足場姿勢 | `QyawY × Qx(-pitch) × Qz(-roll)`、yawを含む世界回転 |
| 足場原点 | 雲の接触面中心。腰や頭、モデルのbounding box中心とは別に定義 |
| throttle / lift / steer | 各[-1,1]。前後推力／上下推力／旋回意図 |
| brake | [0,1]。推進を弱め、水平と上下の速度を制動 |

ホストやモデルの軸・単位が異なる場合は境界で一度だけ変換する。quaternionへheadingを二重に加えない。観察カメラを操縦基準として自動採用しない。

## 初期校正

1. 対象のVRMからraw humanoid骨を明示取得し、必須骨が同じskin paletteにあることを検査する。関連する描画skinもdriverへ渡す。
2. 支持面が水平の初期N02を描画し、左右の脚長を測る。`rideScale = 左右平均脚長 / 0.79`。モデル全体の縮尺ではなく骨長を使う。
3. まずJSONの初期COM高・支持半幅へrideScaleを掛ける。質量・推力・重力を体格で勝手に倍率変更しない。
4. 足weightが過半数の描画頂点から、法線方向の靴底厚み候補を測る。左右の最大値を共通soleOffsetとして保持する。可視足形状がなければ足裏受入は対象外と明示する。
5. 校正時の左右足首目標を、初期yawを戻した座標で保存する。平均から上方向へsoleOffsetを引いた点を`supportOriginLocal`とする。
6. `supportOriginWorldBase = QinitialYaw * supportOriginLocal`として保存し、以後固定。身体の解や毎フレームの足の結果で再校正しない。
7. 初期姿勢のCOMから接触面までの法線高を校正し、支持半幅を次式で更新する。以後は解いたCOMの法線高を時定数0.25秒でfeedbackする。

```text
supportHalfLength = max(0.10, abs(left.z - right.z)/2 + 0.070*rideScale)
supportHalfWidth  = max(0.08, abs(left.x - right.x)/2 + 0.045*rideScale)
```

骨長・COM高・靴底・支持域の計測は代理。私有VRMの実名や本体を規格へ埋め込まない。

## 毎フレームの接続

採用デモは運動をこのライブラリで計算し、描画姿勢をdriverで一時適用する。実アイテムでは、移動・入力・同期を所有する側を一つに決め、同じVehicleを二重に積分しない。

```text
state = stepRideDynamics(state, controls + observedComHeightM, dt)
q = state.supportQuaternion
originWorld = supportOriginWorldBase + state.position
footTargetWorld[i] = q * (anchorLocal[i] - supportOriginLocal) + originWorld
```

`state.position`は移動量を世界座標で表す。利用側の乗り物の実位置へ適用する際、placement原点をさらに二重加算しない。ホストが既に世界位置を返す場合は上の原点計算をその契約へ合わせる。

`attachPoseDriver`の`getOptions`へ次を渡す。詳細な実行順は[CPU再現runner](../../scripts/replay-n02-profile.mjs)と[デモ](../../demo/main.mjs)を参照。

```js
{
  enabled: isRiding,
  ...N02_NORMAL_FLIGHT_PROFILE.pose,
  preserveHands: hasTrackedHands,
  supportFrame: { position: originWorld, quaternion: state.supportQuaternion },
  footTargetsWorld,
  supportSoleOffsetM: calibratedSoleOffsetM,
  balance: {
    leanForward: p.balanceLeanForward, leanSide: p.balanceLeanSide,
    crouch: p.crouch,
    verticalCompression: p.verticalCompression,
    centerOfMassOffset: p.centerOfMassOffset, loadRatio: p.loadRatio,
    forwardAcceleration: p.tangentForwardAcceleration,
    lateralAcceleration: p.tangentLateralAcceleration,
    verticalAcceleration: p.verticalAcceleration,
    effectiveGravityMps2: p.effectiveGravityMps2,
    normalLoadRatio: p.normalLoadRatio, supportState: p.supportState,
    zmpValid: p.zmpValid, zmpInvalidReason: p.zmpInvalidReason
  }
}
```

`p`は`state.pose`。頭入力へ雲のpitch/bankを掛けてから「頭の回転誤差0」と判定しない。avatar rootへの雲回転の一括適用も避け、支持面入力から姿勢を解く。

靴底厚みは法線方向。COM高は `dot(COM-originWorld, normal)`。世界Y差や世界minYは傾斜面の高さ判定に使わない。描画終端・降車・対象変更・例外・unmountで元の骨へ戻す。driverの`error`と到達残差を監視する。

## 荷重と姿勢の方針

`required = aWorld - gravityWorld`、法線需要`dot(required, normal)`、接線需要`dot(required, forward/right)`。同じ面へ射影した値でCOM・ZMP・圧縮を計算する。旧`forwardAcceleration/lateralAcceleration`はyaw水平の実加速度なので、傾斜時の姿勢入力には`tangent*`を使う。

上昇加速／下降制動で圧縮、上昇制動／下降加速で解放する。一定速度の上下移動は速度だけで荷重を増やさない。傾いた面では重力の接線成分があるため、世界Y加速度0でも面内の需要は0とは限らない。

膝上限100度は表現方針。足・骨長を優先し、COM残差や関節方針の未達は隠さない。胸・腰・首の補正、腕の基本構え、足の斜め配置はN02の実装を採用する。一般の人体可動域や全身剛体の規格にはしない。

法線荷重倍率が0.15未満で低荷重、0.25超を0.08秒保持して支持復帰。負値は直ちに魔法の足拘束へ。無効なZMP・足荷重比・支持余裕は`null`と理由を返す。負の荷重を普通の足圧へ変換しない。

## 決定論的な再現

```sh
git clone https://github.com/toM7x7/xrift-avatar-pose-control.git
cd xrift-avatar-pose-control
git checkout n02-normal-flight-v1.0.0
npm ci
npm run verify
npm run replay:n02
npm run dev
```

`replay:n02`は私有VRMとブラウザを必要としない。固定dt=1/120秒で、自作骨格の校正・14秒コース・0.5秒の復帰観測を実行し、`artifacts/n02-normal-flight-v1.json`へ入力・設定・校正・checkpoint・未対応事項を保存する。

コースはJSONの累積`until`。制御を各stepの終端時刻で選び、`t < until`の区間を使う。省略したcontrolは0。14秒ちょうどは制動を保持し、14秒を超えると`done=true`で同じ制動を継続する。デモも同じサンプラーを使う。実ブラウザの可変dt画像と固定dtの数値を完全同一時刻の計測とは扱わない。

## 判定と証拠

数値閾値の正本はJSONの`acceptance`。足目標1mm、骨長0.01mm、頭入力Q差0.001度、膝100度＋0.1度、停止速度0.01m/s、停止傾斜0.01radを上限として自作loopを検査する。自作neutral頭upは0.9999以上。実VRMはflat静止基準との頭up差0.00001以内を比較し、本人のlookは別入力として記録する。

実メッシュの足裏は法線方向の最小頂点gapを2mm以内で観測し、正面・側面・斜めから人が見る。数値合格だけで、衣服・首・靴底全面の接触・格好よさを合格にしない。

CPU replayでは固定足を優先した結果として`fixed-support-changes-crouch`が記録される。希望した膝角と、固定した両足・骨長から実現した膝角の差を示す限界で、接触の完全解決を意味しない。基準判定と`limits`の両方を読む。

採用時の証拠は[傾斜実験](../experiments/n02-tilted-ride-2026-10-25.md)、[独立観察](../experiments/n02-tilt-observer-2026-10-25.md)。単体114件、傾斜ブラウザ14条件、OFFで旧上下14／水平10／姿勢22を確認。実VRM2体×8状態×3方向×ON/OFF＝96枚はモデル診断を照合して私有領域へ保存。以後のprofile共有化の検証は引継ぎ資料の結果欄を参照。

## 統合側で残る確認

完成した筋斗雲モデルは、視覚部分を置き換え、接触面中心・前方・法線・単位をadapterで対応させる。身体の解からモデルを移動させず、同じ支持frameをモデルと足へ渡す。

XRiftのavatar取得・pose適用・他者表示の公開APIがあると仮定しない。明示的に正しいraw rigを取得できる経路を確認する。`selectRiderRig`のホスト慣習を採用する場合も、曖昧な対象は適用しない。Seat位置の調整をN02姿勢の実現と同一視しない。

確認順序は、搭乗→N02→上昇／旋回／下降→制動→降車復元、PCの本人／他者→Quest追跡→再搭乗／複数item。移動の同期、骨姿勢の他者反映、カメラ、衝突は個別に受け入れる。

今回の荷重は支持原点の並進加速度の代理。回転点加速度、全身接触力・摩擦・転倒、宙返り・背面、実XRift／Quest／他者同期は未対応または未確認。仕様の採用はこれらの検証完了を意味しない。ライセンスはUNLICENSED、私有VRMは非同梱を維持する。
