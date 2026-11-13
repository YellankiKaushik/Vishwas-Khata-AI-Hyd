#!/usr/bin/env bash
set -euo pipefail

# Run before application code and npm lifecycle scripts on a disposable Actions VM.
[[ ${GITHUB_ACTIONS:-} == true && ${RUNNER_ENVIRONMENT:-} == github-hosted && $(uname -s) == Linux ]]
[[ $(dpkg --print-architecture) == amd64 ]]
. /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]]

work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
chmod 0755 "$work"
mkdir -p "$work/lists/partial" "$work/packages"
for key in microsoft microsoft-2025; do
  curl --fail --silent --show-error --proto '=https' "https://packages.microsoft.com/keys/$key.asc" -o "$work/$key.asc"
  fingerprint=$(gpg --batch --show-keys --with-colons "$work/$key.asc" | awk -F: '$1=="pub" {primary=1} $1=="fpr" && primary {print $10; primary=0}')
  case "$key:$fingerprint" in
    microsoft:BC528686B50D79E339D3721CEB3E94ADBE1229CF|microsoft-2025:AA86F75E427A19DD33346403EE4D7792F748182B) ;;
    *) echo 'Unexpected Microsoft repository key fingerprint' >&2; exit 1 ;;
  esac
  gpg --batch --dearmor --output "$work/$key.gpg" "$work/$key.asc"
done
printf 'deb [arch=amd64 signed-by=%s,%s] https://packages.microsoft.com/repos/edge stable main\n' \
  "$work/microsoft.gpg" "$work/microsoft-2025.gpg" > "$work/edge.list"

apt_opts=(-o "Dir::Etc::sourcelist=$work/edge.list" -o Dir::Etc::sourceparts=- -o "Dir::State::lists=$work/lists")
apt-get "${apt_opts[@]}" update
(cd "$work/packages" && apt-get "${apt_opts[@]}" download microsoft-edge-stable)
shopt -s nullglob
packages=("$work"/packages/microsoft-edge-stable_*.deb)
[[ ${#packages[@]} == 1 ]]
package=${packages[0]}
[[ $(dpkg-deb --field "$package" Package) == microsoft-edge-stable ]]
version=$(dpkg-deb --field "$package" Version)
echo "Microsoft-signed Edge package: $version"
dpkg-deb --extract "$package" "$work/payload"
sudo dpkg --install -- "$package"
[[ $(dpkg-query -W -f='${Version}' microsoft-edge-stable) == "$version" ]]

helper=/opt/microsoft/msedge/msedge-sandbox
browser=/opt/microsoft/msedge/msedge
[[ $(dpkg-query -S "$helper") == "microsoft-edge-stable: $helper" ]]
[[ $(readlink -f "$helper") == "$helper" && $(readlink -f "$browser") == "$browser" ]]
[[ -f $helper && ! -L $helper && -f $browser && ! -L $browser ]]
for path in / /opt /opt/microsoft /opt/microsoft/msedge "$helper" "$browser"; do
  [[ $(stat -c '%u:%g' "$path") == 0:0 ]]
  mode=$(stat -c '%a' "$path")
  (( (8#$mode & 0022) == 0 ))
done
cmp "$work/payload$helper" "$helper"
cmp "$work/payload$browser" "$browser"
sudo chmod 4755 "$helper"
[[ $(stat -c '%u:%g:%a' "$helper") == 0:0:4755 ]]
microsoft-edge --version
