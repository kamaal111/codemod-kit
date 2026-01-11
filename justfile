PN := "pnpm"
PNR := PN + " run"
PNX := PN + " exec"
TSX := PNX + " tsx"

# List available commands
default:
    just --list --unsorted

# Build project
build:
    {{ PNR }} build

# Clean and build project
build-clean:
    {{ PNR }} build:clean

# Test project
test:
    {{ PNR }} test

# Test package with coverage
test-cov:
    {{ PNR }} test:cov

# Lint project
lint:
    {{ PNR }} lint

# Type check
type-check:
    {{ PNR }} type-check

# Format code
format:
    {{ PNR }} format

# Check code formatting
format-check:
    {{ PNR }} format:check

# Run quality checks
[parallel]
quality: lint format-check type-check

# Install dependencies
install-modules:
    #!/bin/zsh

    . ~/.zshrc || true

    echo "Y" | pnpm i

# Publish package to NPM
publish: install-modules build-clean
    #!/bin/zsh

    {{ TSX }} scripts/publish-package-json.ts "${VERSION:-null}"

    pnpm publish --access public --no-git-checks

# Bootstrap project
bootstrap: install-node enable-corepack install-modules

# Bootstrap for CI
[linux]
bootstrap-ci: install-zsh enable-corepack install-modules

[private]
[linux]
install-zsh:
    sudo apt-get update
    sudo apt-get install -y zsh

[private]
install-node:
    #!/bin/zsh

    curl -fsSL https://fnm.vercel.app/install | bash

    . ~/.zshrc || true

    fnm completions --shell zsh
    fnm install

[private]
enable-corepack:
    #!/bin/zsh

    . ~/.zshrc || true

    corepack enable
