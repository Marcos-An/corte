#!/bin/bash
# Windows x64 GPL-only FFmpeg/FFprobe. Run from an MSYS2 MINGW64 shell.
# Build in a separate directory; never modifies system packages or the editor.
set -euo pipefail
ROOT="$(pwd)"
WORK="${CORTE_FFMPEG_WORK:-/tmp/corte-gpl-windows-build}"
PREFIX="$WORK/prefix"
JOBS="${CORTE_BUILD_JOBS:-8}"
mkdir -p "$WORK/archives" "$WORK/src" "$PREFIX"
export PATH="$PREFIX/bin:$PATH"
export PKG_CONFIG_PATH="$PREFIX/lib/pkgconfig"
export PKG_CONFIG_LIBDIR="$PREFIX/lib/pkgconfig"
export PKG_CONFIG_ALLOW_SYSTEM_LIBS=1
export PKG_CONFIG_ALLOW_SYSTEM_CFLAGS=1
export CC=x86_64-w64-mingw32-gcc
export CXX=x86_64-w64-mingw32-g++
export LDFLAGS="-L$PREFIX/lib -static -static-libgcc -static-libstdc++"
fetch() { local name="$1" url="$2"; if [ ! -s "$WORK/archives/$name" ]; then curl --fail --location --retry 3 --retry-all-errors --connect-timeout 30 --max-time 180 "$url" -o "$WORK/archives/$name.tmp"; mv "$WORK/archives/$name.tmp" "$WORK/archives/$name"; fi; }
fetch pkgconf-2.1.1.tar.xz https://distfiles.ariadne.space/pkgconf/pkgconf-2.1.1.tar.xz
fetch x264-31e19f9.tar.gz https://github.com/mirror/x264/archive/31e19f92f00c7003fa115047ce50978bc98c3a0d.tar.gz
fetch freetype-2.13.2.tar.xz https://downloads.sourceforge.net/freetype/freetype-2.13.2.tar.xz
fetch fribidi-1.0.13.tar.xz https://github.com/fribidi/fribidi/releases/download/v1.0.13/fribidi-1.0.13.tar.xz
fetch harfbuzz-8.3.0.tar.xz https://github.com/harfbuzz/harfbuzz/releases/download/8.3.0/harfbuzz-8.3.0.tar.xz
fetch libass-0.17.1.tar.gz https://github.com/libass/libass/releases/download/0.17.1/libass-0.17.1.tar.gz
fetch zlib-1.3.1.tar.gz https://zlib.net/fossils/zlib-1.3.1.tar.gz
fetch ffmpeg-6.1.1.tar.xz https://ffmpeg.org/releases/ffmpeg-6.1.1.tar.xz
cd "$WORK/src"
for name in pkgconf-2.1.1.tar.xz x264-31e19f9.tar.gz freetype-2.13.2.tar.xz fribidi-1.0.13.tar.xz harfbuzz-8.3.0.tar.xz libass-0.17.1.tar.gz ffmpeg-6.1.1.tar.xz zlib-1.3.1.tar.gz; do
  (cd "$WORK/archives" && grep -F "  $name" "$ROOT/vendor/distribution/source-checksums.sha256" | sha256sum -c -)
  tar -xf "$WORK/archives/$name"
done
cd "$WORK/src/pkgconf-2.1.1"
CPPFLAGS=-DPKGCONFIG_IS_STATIC ./configure --host=x86_64-w64-mingw32 --prefix="$PREFIX" --disable-shared --enable-static
# Keep quoted -D string paths intact: MSYS conversion can turn /c/Users into invalid C escapes (\U).
MSYS2_ARG_CONV_EXCL='-D' make -j"$JOBS"
make install
ln -sf pkgconf.exe "$PREFIX/bin/pkg-config.exe"
cd "$WORK/src/zlib-1.3.1"
make -f win32/Makefile.gcc -j"$JOBS" PREFIX=x86_64-w64-mingw32- AR=ar libz.a
cp libz.a "$PREFIX/lib/"
cp zlib.h zconf.h "$PREFIX/include/"
cat > "$PREFIX/lib/pkgconfig/zlib.pc" <<PC
Name: zlib
Description: zlib
Version: 1.3.1
Libs: -L$PREFIX/lib -lz
Cflags: -I$PREFIX/include
PC
cd "$WORK/src/x264-31e19f92f00c7003fa115047ce50978bc98c3a0d"
./configure --host=x86_64-w64-mingw32 --prefix="$PREFIX" --enable-static --disable-shared --disable-cli --enable-pic
make -j"$JOBS"
make install
cd "$WORK/src/freetype-2.13.2"
./configure --host=x86_64-w64-mingw32 --prefix="$PREFIX" --disable-shared --enable-static --with-harfbuzz=no --with-bzip2=no --with-png=no --with-brotli=no
make -j"$JOBS"
make install
cd "$WORK/src/fribidi-1.0.13"
./configure --host=x86_64-w64-mingw32 --prefix="$PREFIX" --disable-shared --enable-static --disable-docs
make -j"$JOBS"
make install
cd "$WORK/src/harfbuzz-8.3.0"
./configure --host=x86_64-w64-mingw32 --prefix="$PREFIX" --disable-shared --enable-static --with-glib=no --with-gobject=no --with-cairo=no --with-icu=no --with-graphite2=no --with-freetype=yes --with-coretext=no
make -j"$JOBS"
make install
cd "$WORK/src/libass-0.17.1"
./configure --host=x86_64-w64-mingw32 --prefix="$PREFIX" --disable-shared --enable-static --disable-fontconfig --enable-directwrite
make -j"$JOBS"
make install
cd "$WORK/src/ffmpeg-6.1.1"
./configure --prefix="$PREFIX" --pkg-config-flags=--static --extra-cflags="-I$PREFIX/include" --extra-ldflags="-L$PREFIX/lib" --target-os=mingw32 --arch=x86_64 --cc=$CC --cxx=$CXX --extra-libs='-lstdc++ -static -static-libgcc -static-libstdc++' --disable-shared --enable-static --enable-gpl --enable-version3 --disable-nonfree --disable-autodetect --enable-libx264 --enable-libass --enable-zlib --enable-x86asm --enable-d3d11va --enable-dxva2 --enable-schannel --disable-ffplay --disable-doc
make -j"$JOBS"
./ffmpeg.exe -L 2>&1 | grep -q 'GNU General Public License'
if ./ffmpeg.exe -L 2>&1 | grep -qi 'not legally redistributable'; then echo 'Unsafe FFmpeg license' >&2; exit 1; fi
mkdir -p "$ROOT/vendor/windows"
cp ffmpeg.exe ffprobe.exe "$ROOT/vendor/windows/"
cp COPYING.GPLv3 "$ROOT/vendor/windows/ffmpeg.LICENSE"
cp COPYING.GPLv3 "$ROOT/vendor/windows/ffprobe.LICENSE"
cd "$WORK"
cp "$ROOT/vendor/distribution/source-checksums.sha256" archives/
cp "$ROOT/vendor/distribution/build-windows.sh" archives/
(cd archives && sha256sum *.tar.* build-windows.sh > SHA256SUMS)
tar -czf "$ROOT/vendor/distribution/ffmpeg-windows-sources.tar.gz" archives
