# N02：上下荷重による胸・腰・脚の連動

2026-10-25。上下飛行のN02姿勢実験。足場は水平でyawのみ回し、既存の雲ローカル足首目標を上下位置とともに運ぶ。フル3Dのbank、宙返り、背面姿勢は扱わない。

## 入力と責務

上下の速度・加速度・力、荷重状態のヒステリシス、圧縮応答の平滑化はride-dynamics側の担当。この姿勢コアは次をbalanceから受け取る。

| 入力 | 意味 |
|---|---|
| verticalAcceleration | 上が正の上下加速度 m/s² |
| normalLoadRatio | 符号付きの生の押し付け荷重比。負を0へ丸めない |
| effectiveGravityMps2 | g＋上下加速度。通常支持のZMP計算の分母 |
| supportState | supported / low-load / adhesion |
| zmpValid / zmpInvalidReason | 支持近似を使えるかと使えない理由 |
| verticalCompression | 平滑化済みの圧縮量。基準crouchへ一度だけ加算 |

上下入力がなければ加速度0・荷重比1・有効重力9.81・圧縮0となり、従来の平面姿勢と計算を保つ。基準crouchは従来の平面値、verticalCompressionは別量として受け取り、二重加算しない。

## 姿勢の変更

上向き加速や下降を止めるときの重い荷重では、両膝を少し曲げ、腰を下げる。胸はわずかに前屈、骨盤はわずかに後傾させ、膝だけが縮む表示にしない。下向き加速や上昇を止める軽い荷重では逆へ伸び戻る。速度の上下符号だけで重い・軽いを決めない。

圧縮量は-0.20〜+0.25の範囲で受け、合成crouchを0〜1へ収める。胸・骨盤の屈伸は圧縮量に対する小さい表現上の分配であり、人体の剛性や医学的可動域を推定したものではない。頭の世界回転と首のyaw分散は保ち、腕は胸へ追従する改善済みの構えを使う。

固定足目標・骨長維持・既存の膝100度方針を引き継ぐ。目標圧縮やCOMと両立しなければ足を滑らせず、従来どおり到達誤差・膝方針・COM残差を表示する。頭位置を保つheadモードでは、その契約が支持より優先する。

## 接触面・高度・無効な支持計算

足首目標のYを雲と同じだけ動かす。contactPlaneYは足首平面から実測足裏オフセットを引いた値、COM高は`COM世界Y - contactPlaneY`とする。世界の高度そのものをCOM高へ入れない。

通常支持のZMP proxyは水平成分について`COM水平位置 - COM高 / effectiveGravityMps2 * 水平加速度`へ更新した。足場は水平という今回の前提に限る。

low-load / adhesion、呼び出し側のzmpValid=false、または有効重力・荷重が正でない場合は割り算を行わない。以下をnullにし、zmpValid=falseと理由を返す。

- zeroMomentPointWorld
- loadRatio / requestedLoadRatio / unclampedFrontLoadRatio
- loadRatioError
- supportMarginM / supportExceeded

足を固定した姿勢表示を続ける場合でも、それを通常支持の力学計算が成立した結果と見せない。verticalBody.footConstraintModeはordinary-support-proxy / low-load-anchored-proxy / magical-adhesionを区別する。特にadhesionでの足拘束は魔法的な拘束であり、普通の接触力ではない。低荷重での弾道的な足離れ・浮遊シミュレーションは未実装。

## 観測値

- verticalBody：生の荷重比、有効重力、上下加速度、支持状態、基準crouch、圧縮量、合成crouch、制限されたか、足拘束の扱い。
- bodyBalance：pelvisPitchDegrees / chestPitchDegrees / hipChestPitchDegreesを追加。膝とともに胸・腰の相対姿勢を確認できる。
- balanceProxy：comHeightM、有効重力、荷重比、支持状態、zmpValid / zmpInvalidReasonを追加。

## 自作骨格の結果

標準骨格・基準crouch0.45・同じ足目標を使った圧縮入力の比較。上下運動モデル自体の評価ではなく、このコアの応答比較。

| 圧縮入力 | 合成crouch | 左右の膝曲がり | 腰Y | 胸と骨盤のpitch差 |
|---|---:|---|---:|---:|
| -0.10（軽い） | 0.35 | 59.71度／62.29度 | 0.9273m | -3.95度 |
| 0（従来） | 0.45 | 66.30度／67.70度 | 0.8989m | 0度 |
| +0.12（重い） | 0.57 | 74.13度／74.27度 | 0.8607m | +4.74度 |

この比較の足首誤差・脚長差は浮動小数点誤差。頭の世界回転を保持し、首の残りyawは約8度のまま。足場高度を+8m・+100m・-5mへ変えても、同じ姿勢のCOM高・膝角・水平ZMPは変わらず、接触面と身体世界Yだけが移動することを確認した。

## 検証と未確認

`node --test tests/nimbus-vertical.test.mjs`：7件成功。

1. 小型・標準・大型で、重い／軽い圧縮を胸腰脚へ一度だけ分配。
2. 足場高度の変更でCOM高・姿勢が変わらない。
3. 通常支持のZMPが有効重力を使う。
4. 低荷重／符号付き負荷重でZMP・荷重比・支持余裕をnullにする。
5. ゼロ・非有限・無効指定で割り算や成功値を捏造しない。
6. 強い合成crouchでも膝方針・骨長・頭・追跡手の所有権を保つ。
7. 連続した圧縮入力で、足を動かさず腰を連続的に変える。

既存N02・身体バランスの18件も成功し、型チェックも成功。実VRMの上下中のシルエット、衣服・靴底、統合した上下運動・支持状態の遷移はrootと独立観察担当が別に確認する。実XRift・Quest・他者同期への適用を確認した記録ではない。
