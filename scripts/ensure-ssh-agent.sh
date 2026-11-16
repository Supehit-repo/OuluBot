#!/usr/bin/env bash
set -euo pipefail

socket='/home/samikoski/.ssh/oamk-agent.sock'
key='/home/samikoski/.ssh/oamk_tki_ed25519'

if [[ ! -f "$key" ]]; then
    echo "SSH private key not found: $key" >&2
    exit 1
fi

export SSH_AUTH_SOCK="$socket"

if ssh-add -l >/dev/null 2>&1; then
    echo "Existing SSH agent and identity are available."
    exit 0
else
    ssh_add_status=$?
fi

if [[ "$ssh_add_status" -eq 1 ]]; then
    echo "Existing SSH agent has no identity. Add the key now: $key"
    ssh-add "$key"
    exit 0
fi

if [[ "$ssh_add_status" -ne 2 ]]; then
    echo "Unable to determine SSH agent status (ssh-add exit code: $ssh_add_status)." >&2
    exit "$ssh_add_status"
fi

if [[ -e "$socket" || -L "$socket" ]]; then
    echo "Removing stale SSH agent socket: $socket"
    rm -f -- "$socket"
fi

echo "Starting a new SSH agent with an 8-hour lifetime."
eval "$(ssh-agent -a "$socket" -t 8h)"
export SSH_AUTH_SOCK="$socket"

echo "Add the key now: $key"
ssh-add "$key"
