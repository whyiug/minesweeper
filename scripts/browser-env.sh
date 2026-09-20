#!/usr/bin/env bash
# Project-local Playwright WebKit headless launcher for Ubuntu 22.04 x86_64.
# No system installation, shared browser-cache modification or services required.
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
browser_executable="$(cd -- "$project_dir" && node --input-type=module -e 'import { webkit } from "playwright"; process.stdout.write(webkit.executablePath());')"
browser_bundle="$(dirname -- "$browser_executable")/minibrowser-wpe"
dependency_root="$project_dir/.cache/browser-libs/root"

if [[ ! -x "$browser_bundle/bin/MiniBrowser" || ! -d "$dependency_root" ]]; then
  echo 'Missing local WebKit browser or extracted libraries; see docs/BROWSER_ENV.md.' >&2
  exit 1
fi
headless=false
for argument in "$@"; do
  if [[ "$argument" == '--headless' ]]; then headless=true; fi
done
if [[ "$headless" != true ]]; then
  echo 'This local library wrapper supports headless WebKit only.' >&2
  exit 1
fi

export WEBKIT_EXEC_PATH="$browser_bundle/bin"
export WEBKIT_INJECTED_BUNDLE_PATH="$browser_bundle/lib"
export WEBKIT_INSPECTOR_RESOURCES_PATH="$browser_bundle/share"
export WEBKIT_FORCE_COMPLEX_TEXT=1
export LIBGL_ALWAYS_SOFTWARE=1
export LD_LIBRARY_PATH="$browser_bundle/lib:$browser_bundle/sys/lib:$dependency_root/usr/lib/x86_64-linux-gnu:$dependency_root/lib/x86_64-linux-gnu${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
exec "$browser_bundle/bin/MiniBrowser" "$@"
