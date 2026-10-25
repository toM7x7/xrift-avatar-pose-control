# 腰支持の座り姿勢：実験契約 v1

2026-10-25。`chair`・`straddle`・`side-sit`の候補探索用。N02通常飛行1.0.0の採用範囲を広げたものではなく、座面接触・衣服・実XRiftの採用判定は別に行う。

## 座標と支持

- 支持座標は右手系、+Y上・+Z前・+X右。長さm、角度rad、Quaternionは`[x,y,z,w]`。
- `supportFrame.position`は腰の目標点。実メッシュの尻の接触点ではない。
- frame指定時はQuaternionを一度だけ適用する。headingを重ねて掛けない。
- frame省略時は元の腰の水平位置と、脚長×`seatHeightRatio`から腰の目標を作る。
- 足の目標は足首。靴底接触は別に、可視foot-weight頂点と法線方向の距離で観測する。

## 身体の方針

腰支持を優先し、頭の入力世界Quaternionと骨長を保つ。頭の位置は変わる。これをカメラ移動の許可と解釈しない。胸・腰で前傾を分担し、頭と首／頭と胸の角度を別々に計測する。

| family | 形の違い |
|---|---|
| chair | 両脚を前へ出す |
| straddle | 左右へ脚を開き、胴をまたぐ |
| side-sit | 両脚を同じ側へ出す |

`handMode`は`relaxed`・`grip`・`tracked`。gripは手首の目標までで、指を閉じる動作を含まない。trackedは入力手の位置・向きを目標にし、届かない場合は骨を伸ばさず誤差を返す。

## API

```js
applyPose(rig, {
  preset: 'straddle', family: 'straddle',
  seatHeightRatio: .65, widthRatio: .32,
  leanRadians: .05, handMode: 'relaxed',
  supportFrame: {position: [0, .52, 0], quaternion: [0, 0, 0, 1]}
})
```

ホストへの接続では既存`attachPoseDriver`で描画時に適用・復元する。比較画面の直接適用ループはローカル実験専用であり、ホストの所有権や描画フックを置き換える実装例ではない。

## 観測と限界

腰・足・手の目標誤差、骨長誤差、頭Q誤差、膝、肘・手首、頭首角を返す。到達不能・深い膝・大きい頭首角・指閉じ未実装を別の警告にする。

足の可視形状がないVRMでは、見える足の支持判定を`unsupported`とする。骨格計算全体の失敗を意味しない。座面の厚み、太い胴、服・髪・相手の身体との干渉は未解決であり、数値だけで採用しない。

再現入口は`/patterns.html`、候補正本は`src/pose-patterns.mjs`。実験全体の記録は[姿勢パターン実験](../experiments/pose-patterns-2026-10-25.md)を参照。
