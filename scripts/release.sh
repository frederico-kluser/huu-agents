#!/usr/bin/env bash
set -euo pipefail

BUMP="${1:-patch}"

if [[ "$BUMP" != "patch" && "$BUMP" != "minor" && "$BUMP" != "major" ]]; then
  echo "Uso: ./scripts/release.sh [patch|minor|major]"
  echo "  patch  0.1.1 -> 0.1.2  (default)"
  echo "  minor  0.1.1 -> 0.2.0"
  echo "  major  0.1.1 -> 1.0.0"
  exit 1
fi

# Verificar working tree limpa
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Erro: working tree tem mudancas nao commitadas."
  echo "Commite ou stash antes de fazer release."
  exit 1
fi

# Verificar login no npm
if ! npm whoami &>/dev/null; then
  echo "Erro: nao esta logado no npm. Execute: npm login"
  exit 1
fi

# Lint + typecheck
echo "=> Verificando codigo..."
npm run typecheck
npm run lint

# Build
echo "=> Building..."
npm run build

# Bump version (sem git tag automatico)
NEW_VERSION=$(npm version "$BUMP" --no-git-tag-version)
echo "=> Versao: $NEW_VERSION"

# Dry run para revisar conteudo
echo "=> Conteudo do pacote:"
npm pack --dry-run 2>&1 | tail -3

# Publicar
echo "=> Publicando no npm..."
npm publish --access public

# Commit e tag
git add package.json
git commit -m "chore: release $NEW_VERSION"
git tag "$NEW_VERSION"

echo ""
echo "Publicado $NEW_VERSION com sucesso!"
echo "Para enviar ao remote: git push && git push --tags"
