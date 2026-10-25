# ブラウザでデモを確認する

先にnpm run devでlocalhostを起動します。Playwright CLIが使える環境で、リポジトリを作業ディレクトリとして実行します。

```sh
npx --yes --package @playwright/cli playwright-cli -s=pose-lab open http://127.0.0.1:5228/
npx --yes --package @playwright/cli playwright-cli -s=pose-lab run-code --filename=scripts/check-demo.js
```

既定の自作骨格だけを検証します。ブラウザやChromeが未導入ならPlaywright CLIの公式手順で導入してください。私有VRMの読込はファイル選択から手動で行い、ファイル名・画像の公開範囲を確認します。スクリーンショットはdocs/screenshotsへ出力します。
