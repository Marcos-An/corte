#!/bin/bash
# Apple Silicon GPL-only FFmpeg/FFprobe. Run from the repository root.
# Build in a separate directory; never modifies system packages or the editor.
set -euo pipefail
ROOT="$(pwd)"
WORK="${CORTE_FFMPEG_WORK:-/tmp/corte-gpl-build}"
PREFIX="$WORK/prefix"
JOBS="${CORTE_BUILD_JOBS:-8}"
mkdir -p "$WORK/archives" "$WORK/src" "$PREFIX"
export PATH="$PREFIX/bin:$PATH"
export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig"
export PKG_CONFIG_LIBDIR="$PREFIX/lib/pkgconfig"
export PKG_CONFIG_ALLOW_SYSTEM_LIBS=1
export PKG_CONFIG_ALLOW_SYSTEM_CFLAGS=1
export MACOSX_DEPLOYMENT_TARGET=11.0
fetch() { local name="$1" url="$2"; if [ ! -s "$WORK/archives/$name" ]; then curl --fail --location --retry 3 --retry-all-errors --connect-timeout 30 --max-time 180 "$url" -o "$WORK/archives/$name.tmp"; mv "$WORK/archives/$name.tmp" "$WORK/archives/$name"; fi; }
fetch pkgconf-2.1.1.tar.xz https://distfiles.ariadne.space/pkgconf/pkgconf-2.1.1.tar.xz
fetch x264-31e19f9.tar.gz https://github.com/mirror/x264/archive/31e19f92f00c7003fa115047ce50978bc98c3a0d.tar.gz
fetch freetype-2.13.2.tar.xz https://downloads.sourceforge.net/freetype/freetype-2.13.2.tar.xz
fetch fribidi-1.0.13.tar.xz https://github.com/fribidi/fribidi/releases/download/v1.0.13/fribidi-1.0.13.tar.xz
fetch harfbuzz-8.3.0.tar.xz https://github.com/harfbuzz/harfbuzz/releases/download/8.3.0/harfbuzz-8.3.0.tar.xz
fetch libass-0.17.1.tar.gz https://github.com/libass/libass/releases/download/0.17.1/libass-0.17.1.tar.gz
fetch ffmpeg-6.1.1.tar.xz https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz
cd "$WORK/src"
for name in pkgconf-2.1.1.tar.xz x264-31e19f9.tar.gz freetype-2.13.2.tar.xz fribidi-1.0.13.tar.xz harfbuzz-8.3.0.tar.xz libass-0.17.1.tar.gz ffmpeg-6.1.1.tar.xz; do
  (cd "$WORK/archives" && grep -F "  $name" "$ROOT/vendor/distribution/source-checksums.sha256" | shasum -a 256 -c -)
  tar -xf "$WORK/archives/$name"
done
cd "$WORK/src/pkgconf-2.1.1"
./configure --prefix="$PREFIX" --disable-shared --enable-static
make -j"$JOBS"
make install
ln -sf pkgconf "$PREFIX/bin/pkg-config"
cd "$WORK/src/x264-31e19f92f00c7003fa115047ce50978bc98c3a0d"
./configure --prefix="$PREFIX" --enable-static --disable-shared --disable-cli --enable-pic
make -j"$JOBS"
make install
cd "$WORK/src/freetype-2.13.2"
./configure --prefix="$PREFIX" --disable-shared --enable-static --with-harfbuzz=no --with-bzip2=no --with-png=no --with-brotli=no
make -j"$JOBS"
make install
cd "$WORK/src/fribidi-1.0.13"
./configure --prefix="$PREFIX" --disable-shared --enable-static --disable-docs
make -j"$JOBS"
make install
cd "$WORK/src/harfbuzz-8.3.0"
./configure --prefix="$PREFIX" --disable-shared --enable-static --with-glib=no --with-gobject=no --with-cairo=no --with-icu=no --with-graphite2=no --with-freetype=yes --with-coretext=yes
make -j"$JOBS"
make install
cd "$WORK/src/libass-0.17.1"
./configure --prefix="$PREFIX" --disable-shared --enable-static --disable-fontconfig --enable-coretext
make -j"$JOBS"
make install
cd "$WORK/src/ffmpeg-6.1.1"
./configure --prefix="$PREFIX" --pkg-config-flags=--static --extra-cflags="-I$PREFIX/include" --extra-ldflags="-L$PREFIX/lib" --extra-libs='-lc++' --disable-shared --enable-static --enable-gpl --enable-version3 --disable-nonfree --disable-autodetect --enable-libx264 --enable-libass --enable-zlib --enable-securetransport --enable-videotoolbox --disable-ffplay --disable-doc
make -j"$JOBS"
./ffmpeg -L 2>&1 | grep -q 'GNU General Public License'
if ./ffmpeg -L 2>&1 | grep -qi 'not legally redistributable'; then echo 'Unsafe FFmpeg license' >&2; exit 1; fi
mkdir -p "$ROOT/vendor/darwin-arm64"
cp ffmpeg ffprobe "$ROOT/vendor/darwin-arm64/"
cp COPYING.GPLv3 "$ROOT/vendor/darwin-arm64/ffmpeg.LICENSE"
cp COPYING.GPLv3 "$ROOT/vendor/darwin-arm64/ffprobe.LICENSE"
cd "$WORK"
cp "$ROOT/vendor/distribution/source-checksums.sha256" archives/
cp "$ROOT/vendor/distribution/build-macos.sh" archives/
(cd archives && shasum -a 256 *.tar.* build-macos.sh > SHA256SUMS)
tar -czf "$ROOT/vendor/distribution/ffmpeg-macos-sources.tar.gz" archives
