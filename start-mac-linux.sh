#!/bin/sh
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then echo 'Install Node.js 20+ from https://nodejs.org'; exit 1; fi
if [ -z "$OPENAI_API_KEY" ]; then
  echo 'Get an OpenAI API key from https://platform.openai.com/api-keys'
  printf 'Paste API key (hidden): '
  stty -echo
  read -r OPENAI_API_KEY
  stty echo
  printf '\n'
  export OPENAI_API_KEY
fi
exec node server.mjs

