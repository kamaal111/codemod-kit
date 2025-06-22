PN := "pnpm"
PNR := PN + " run"
PNX := PN + " exec"

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
quality: lint format-check type-check

# Install dependencies
install-modules:
    #!/bin/zsh

    . ~/.zshrc || true

    echo "Y" | pnpm i

# Bootstrap project
bootstrap: install-node enable-corepack install-modules

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
