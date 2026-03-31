# agentOS

Run coding agents inside isolated VMs.

[Website](https://rivet.dev) | [Documentation](https://rivet.dev/docs/agent-os) | [Discord](https://rivet.dev/discord)

## Packages

<!-- BEGIN PACKAGE TABLE -->
### WASM Command Packages

| Package | apt Equivalent | Description | Source | Combined Size | Gzipped |
|---------|---------------|-------------|--------|---------------|---------|
| `@rivet-dev/agent-os-codex` | codex | OpenAI Codex integration (codex, codex-exec) | rust | - | - |
| `@rivet-dev/agent-os-coreutils` | coreutils | GNU coreutils: sh, cat, ls, cp, sort, and 80+ commands | rust | - | - |
| `@rivet-dev/agent-os-curl` | curl | curl HTTP client | c | - | - |
| `@rivet-dev/agent-os-diffutils` | diffutils | GNU diffutils (diff) | rust | - | - |
| `@rivet-dev/agent-os-fd` | fd-find | fd fast file finder | rust | - | - |
| `@rivet-dev/agent-os-file` | file | file type detection | rust | - | - |
| `@rivet-dev/agent-os-findutils` | findutils | GNU findutils (find, xargs) | rust | - | - |
| `@rivet-dev/agent-os-gawk` | gawk | GNU awk text processing | rust | - | - |
| `@rivet-dev/agent-os-git` | git | git version control (planned) *(planned)* | rust | - | - |
| `@rivet-dev/agent-os-grep` | grep | GNU grep pattern matching (grep, egrep, fgrep) | rust | - | - |
| `@rivet-dev/agent-os-gzip` | gzip | GNU gzip compression (gzip, gunzip, zcat) | rust | - | - |
| `@rivet-dev/agent-os-jq` | jq | jq JSON processor | rust | - | - |
| `@rivet-dev/agent-os-make` | make | GNU make build tool (planned) *(planned)* | rust | - | - |
| `@rivet-dev/agent-os-ripgrep` | ripgrep | ripgrep fast recursive search | rust | - | - |
| `@rivet-dev/agent-os-sed` | sed | GNU sed stream editor | rust | - | - |
| `@rivet-dev/agent-os-sqlite3` | sqlite3 | SQLite3 command-line interface | c | - | - |
| `@rivet-dev/agent-os-tar` | tar | GNU tar archiver | rust | - | - |
| `@rivet-dev/agent-os-tree` | tree | tree directory listing | rust | - | - |
| `@rivet-dev/agent-os-unzip` | unzip | unzip archive extraction | c | - | - |
| `@rivet-dev/agent-os-wget` | wget | GNU wget HTTP client | c | - | - |
| `@rivet-dev/agent-os-yq` | yq | yq YAML/JSON processor | rust | - | - |
| `@rivet-dev/agent-os-zip` | zip | zip archive creation | c | - | - |

### Meta-Packages

| Package | Description | Includes |
|---------|-------------|----------|
| `@rivet-dev/agent-os-build-essential` | Build-essential WASM command set (standard + make + git + curl) | standard, make, git, curl |
| `@rivet-dev/agent-os-common` | Common WASM command set (coreutils + sed + grep + gawk + findutils + diffutils + tar + gzip) | coreutils, sed, grep, gawk, findutils, diffutils, tar, gzip |
<!-- END PACKAGE TABLE -->

## License

Apache-2.0
