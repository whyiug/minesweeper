#!/usr/bin/env bash
# Isolated virtual audio output for Linux browser tests. No hardware or global daemon.
set -euo pipefail

if [[ $# -eq 0 ]]; then
  printf 'Usage: bash scripts/with-test-audio.sh <command> [args...]\n' >&2
  exit 2
fi
command -v pulseaudio >/dev/null || { printf 'PulseAudio is required for this optional test wrapper.\n' >&2; exit 1; }
command -v pactl >/dev/null || { printf 'pactl is required for this optional test wrapper.\n' >&2; exit 1; }

task_project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
task_audio_dir="$(mktemp -d "${TMPDIR:-/tmp}/light-mines-audio.XXXXXX")"
task_audio_log="${LIGHT_MINES_AUDIO_LOG:-$task_project_root/evidence/environment/pulseaudio.log}"
task_audio_pid=''
cleanup() {
  if [[ -n "$task_audio_pid" ]]; then
    kill "$task_audio_pid" 2>/dev/null || true
    wait "$task_audio_pid" 2>/dev/null || true
  fi
  if [[ -f "$task_audio_dir/pulse.log" ]]; then
    mkdir -p "$(dirname "$task_audio_log")"
    cp "$task_audio_dir/pulse.log" "$task_audio_log"
  fi
  rm -rf -- "$task_audio_dir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

mkdir -m 700 "$task_audio_dir/runtime" "$task_audio_dir/state"
head -c 256 /dev/urandom > "$task_audio_dir/cookie"
chmod 600 "$task_audio_dir/cookie"
cat > "$task_audio_dir/default.pa" <<EOF
load-module module-native-protocol-unix socket=$task_audio_dir/native auth-cookie=$task_audio_dir/cookie
load-module module-null-sink sink_name=light_mines_test channels=2 rate=44100
set-default-sink light_mines_test
EOF
cat > "$task_audio_dir/client.conf" <<EOF
autospawn = no
default-server = unix:$task_audio_dir/native
cookie-file = $task_audio_dir/cookie
EOF
export PULSE_RUNTIME_PATH="$task_audio_dir/runtime"
export PULSE_STATE_PATH="$task_audio_dir/state"
export PULSE_CLIENTCONFIG="$task_audio_dir/client.conf"
export PULSE_COOKIE="$task_audio_dir/cookie"
export PULSE_SERVER="unix:$task_audio_dir/native"

# Only the process created below is stopped. The 10-minute limit also bounds orphan risk.
timeout --signal=TERM 600s pulseaudio --daemonize=no --use-pid-file=no \
  --exit-idle-time=-1 --high-priority=no --realtime=no --disable-shm=yes \
  --log-target="file:$task_audio_dir/pulse.log" -nF "$task_audio_dir/default.pa" &
task_audio_pid=$!
task_audio_ready=false
for ((attempt = 0; attempt < 50; attempt++)); do
  if pactl info >/dev/null 2>&1; then task_audio_ready=true; break; fi
  if ! kill -0 "$task_audio_pid" 2>/dev/null; then break; fi
  sleep 0.1
done
if [[ "$task_audio_ready" != true ]]; then
  printf 'Isolated test audio failed to start; see %s\n' "$task_audio_log" >&2
  exit 1
fi
printf 'Using an isolated PulseAudio null sink (no audible-device validation).\n' >&2
"$@"
