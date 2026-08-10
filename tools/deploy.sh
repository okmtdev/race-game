#!/usr/bin/env bash
# Google Cloud Storage に dist/ をアップロードする
#
#   使い方:
#     BUCKET=my-race-game npm run deploy            # ビルドしてアップロード
#     BUCKET=my-race-game npm run deploy -- --setup # はじめての1回（バケット作成＋公開設定）
#
# 必要なもの: gcloud CLI（gcloud auth login / gcloud config set project ... 済み）
set -euo pipefail

BUCKET="${BUCKET:-}"
REGION="${REGION:-asia-northeast1}"
SETUP=0
for arg in "$@"; do
  [ "$arg" = "--setup" ] && SETUP=1
done

if [ -z "$BUCKET" ]; then
  echo "エラー: バケット名を BUCKET で指定してください。" >&2
  echo "  例) BUCKET=my-kids-race npm run deploy" >&2
  exit 1
fi

if ! command -v gcloud >/dev/null 2>&1; then
  echo "エラー: gcloud コマンドが見つかりません。" >&2
  echo "  https://cloud.google.com/sdk/docs/install を見てインストールしてください。" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ "$SETUP" = "1" ]; then
  echo "▶ バケットを作ります: gs://$BUCKET ($REGION)"
  gcloud storage buckets create "gs://$BUCKET" \
    --location="$REGION" \
    --uniform-bucket-level-access || echo "  （すでにある場合はそのまま進みます）"

  echo "▶ だれでも読めるようにします（公開サイトにするため）"
  gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" \
    --member=allUsers --role=roles/storage.objectViewer

  echo "▶ 静的サイトの設定（index.html / 404.html）"
  gcloud storage buckets update "gs://$BUCKET" \
    --web-main-page-suffix=index.html --web-error-page=404.html
fi

echo "▶ ビルド"
node tools/build.js

echo "▶ アップロード: gs://$BUCKET"
gcloud storage rsync dist "gs://$BUCKET" --recursive --delete-unmatched-destination-objects

echo "▶ キャッシュの設定（HTML は毎回読み直し、JS/CSS は5分）"
gcloud storage objects update "gs://$BUCKET/**.html" --cache-control="no-cache, max-age=0" >/dev/null
gcloud storage objects update "gs://$BUCKET/**.js" --cache-control="public, max-age=300" >/dev/null
gcloud storage objects update "gs://$BUCKET/**.css" --cache-control="public, max-age=300" >/dev/null

echo ""
echo "✅ 公開しました:"
echo "   https://storage.googleapis.com/$BUCKET/index.html"
echo ""
echo "※ この公開ページは「ひとりであそぶ」用です。"
echo "   4人であそぶときは MacBook で npm start をして、"
echo "   スマホから http://（MacBook の IP）:8080/ をひらいてください。"
echo "   （https のページからは おうちの http サーバに つなげないため）"
