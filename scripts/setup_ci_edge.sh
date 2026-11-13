#!/usr/bin/env bash
set -Eeuo pipefail
# Log a fixed stage label, never shell expansions or the environment.
stage='validate runner'
trap 'rc=$?; printf "Edge setup: %s failed at line %s (exit %s)\n" "$stage" "$LINENO" "$rc" >&2' ERR

fail() {
  printf 'Edge setup: %s failed at line %s: %s\n' "$stage" "${BASH_LINENO[0]}" "$1" >&2
  exit 1
}

# Run before application code and npm lifecycle scripts on a disposable Actions VM.
[[ ${GITHUB_ACTIONS:-} == true && ${RUNNER_ENVIRONMENT:-} == github-hosted &&
   ${RUNNER_OS:-} == Linux && ${RUNNER_ARCH:-} == X64 && $(uname -s) == Linux ]] ||
  fail "requires a GitHub-hosted Linux x64 runner"
[[ $(id -u) != 0 && $(uname -m) == x86_64 && $(dpkg --print-architecture) == amd64 ]] ||
  fail "requires a non-root user on amd64"
. /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || fail "requires Ubuntu 24.04"

edge_directories=(/opt /opt/microsoft /opt/microsoft/msedge)

check_directory() {
  local path=$1 phase=$2 metadata uid gid mode
  stage="$phase directory $path"
  [[ -d $path && ! -L $path && $(realpath -e -- "$path") == "$path" ]] ||
    fail 'expected a real directory at the canonical path'
  metadata=$(stat -c '%u %g %a' -- "$path")
  read -r uid gid mode <<< "$metadata"
  printf 'Edge setup: %s uid=%s gid=%s mode=%s\n' "$path" "$uid" "$gid" "$mode"
  [[ $uid == 0 ]] || fail 'expected root ownership'
  if (( (8#$mode & 0022) != 0 )); then
    [[ $phase == prepare && $path != / ]] ||
      fail 'group or other users can write to the package path'
    stage="secure directory $path on the disposable runner"
    sudo chmod 0755 -- "$path"
    check_directory "$path" verify
  fi
}

# Secure each parent before inspecting its children. dpkg creates any missing
# package directories. A dangling symlink is present and must be rejected.
check_directory / verify
for path in "${edge_directories[@]}"; do
  if [[ -e $path || -L $path ]]; then
    check_directory "$path" prepare
  fi
done

stage='create package workspace'
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
chmod 0755 "$work"
mkdir -p "$work/lists/partial" "$work/packages"
for key in microsoft microsoft-2025; do
  stage="download Microsoft signing key $key"
  curl --fail --silent --show-error --proto '=https' "https://packages.microsoft.com/keys/$key.asc" -o "$work/$key.asc"
  stage="verify Microsoft signing key $key"
  fingerprint=$(gpg --batch --show-keys --with-colons "$work/$key.asc" | awk -F: '$1=="pub" {primary=1} $1=="fpr" && primary {print $10; primary=0}')
  case "$key:$fingerprint" in
    microsoft:BC528686B50D79E339D3721CEB3E94ADBE1229CF|microsoft-2025:AA86F75E427A19DD33346403EE4D7792F748182B) ;;
    *) fail 'unexpected Microsoft repository key fingerprint' ;;
  esac
  gpg --batch --dearmor --output "$work/$key.gpg" "$work/$key.asc"
done
printf 'deb [arch=amd64 signed-by=%s,%s] https://packages.microsoft.com/repos/edge stable main\n' \
  "$work/microsoft.gpg" "$work/microsoft-2025.gpg" > "$work/edge.list"

apt_opts=(-o "Dir::Etc::sourcelist=$work/edge.list" -o Dir::Etc::sourceparts=- -o "Dir::State::lists=$work/lists")
stage='update signed Microsoft Edge APT index'
apt-get "${apt_opts[@]}" update
stage='download Microsoft Edge package from APT'
(cd "$work/packages" && apt-get "${apt_opts[@]}" download microsoft-edge-stable)
shopt -s nullglob
packages=("$work"/packages/microsoft-edge-stable_*.deb)
[[ ${#packages[@]} == 1 ]] || fail "expected exactly one Edge package"
package=${packages[0]}
stage='verify downloaded package identity'
package_name=$(dpkg-deb --field "$package" Package)
package_arch=$(dpkg-deb --field "$package" Architecture)
[[ $package_name == microsoft-edge-stable && $package_arch == amd64 ]] || fail "unexpected Edge package name or architecture"
version=$(dpkg-deb --field "$package" Version)
echo "Microsoft-signed Edge package: $version"
stage='extract verified Edge package'
dpkg-deb --extract "$package" "$work/payload"
stage='install verified Edge package with dpkg'
sudo dpkg --install -- "$package"
printf 'Edge setup: dpkg install completed\n'

for path in / "${edge_directories[@]}"; do
  check_directory "$path" verify
done

stage='verify installed version, architecture, and status with dpkg-query'
installed=$(dpkg-query -W -f='${Version}|${Architecture}|${db:Status-Status}' "$package_name:$package_arch")
[[ $installed == "$version|$package_arch|installed" ]] ||
  fail "installed package does not match downloaded Edge $version ($package_arch)"

helper=/opt/microsoft/msedge/msedge-sandbox
browser=/opt/microsoft/msedge/msedge
for file in "$helper" "$browser"; do
  stage="verify package owner with dpkg-query for $file"
  owner=$(LC_ALL=C dpkg-query -S -- "$file")
  case "$owner" in
    "$package_name: $file"|"$package_name:$package_arch: $file") ;;
    *) fail "expected an exact single owner ($package_name or $package_name:$package_arch)" ;;
  esac
  stage="verify regular installed and signed-payload files for $file"
  [[ -f $file && ! -L $file && -f $work/payload$file && ! -L $work/payload$file ]] ||
    fail "expected regular files without symlinks"
  resolved=$(readlink -f -- "$file")
  [[ $resolved == "$file" ]] || fail "installed path resolves outside its package location"
done

for path in "$helper" "$browser"; do
  stage="verify root owner and write permissions with stat for $path"
  metadata=$(stat -c '%u %g %a' -- "$path")
  read -r uid gid mode <<< "$metadata"
  printf 'Edge setup: %s uid=%s gid=%s mode=%s\n' "$path" "$uid" "$gid" "$mode"
  [[ $uid == 0 ]] || fail "expected root ownership"
  (( (8#$mode & 0022) == 0 )) || fail "group or other users can write to the package path"
done
stage='verify root group on the setuid helper'
[[ $(stat -c '%g' -- "$helper") == 0 ]] || fail "expected the setuid helper to belong to root group"

for file in "$helper" "$browser"; do
  stage="compare installed binary with signed package payload for $file"
  cmp -s -- "$work/payload$file" "$file" || fail "installed bytes differ from the signed package"
done
stage='apply sandbox helper mode with chmod'
sudo chmod 4755 -- "$helper"
stage='verify sandbox helper owner and mode with stat'
[[ $(stat -c '%u:%g:%a' -- "$helper") == 0:0:4755 ]] || fail "expected root:root mode 4755"
stage='read version using the verified Edge binary'
"$browser" --version
stage='launch sandboxed Edge with a fresh profile'
timeout 45s "$browser" --headless --no-first-run --user-data-dir="$work/browser-profile" \
  --dump-dom about:blank > "$work/browser-smoke.html"
grep -Fq '<body>' "$work/browser-smoke.html" || fail 'headless Edge did not render the blank page'
printf 'Edge setup: sandboxed startup and page render passed\n'
