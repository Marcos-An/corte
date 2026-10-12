# Bundled media tools

The application invokes FFmpeg/FFprobe as separate programs. Their licenses are independent of the application's authorial license.

## macOS Apple Silicon

FFmpeg/FFprobe 6.1.1 are built locally with GPL components, without `--enable-nonfree`, using `build-macos.sh`. The compiler must be Apple's Command Line Tools; all other build dependencies are compiled in an isolated directory, not installed into the system. Only macOS system dynamic libraries may be linked.

Features retained for the editor: H.264 (x264), AAC, image/audio/video decoding, ASS subtitles (libass), CoreText fonts, image filters, audio envelopes and timing. This is not a promise to include every codec in unrelated third-party builds.

`ffmpeg-macos-sources.tar.gz` contains the original source archives for FFmpeg 6.1.1, x264 commit 31e19f92f00c7003fa115047ce50978bc98c3a0d, FreeType 2.13.2, FriBidi 1.0.13, HarfBuzz 8.3.0, libass 0.17.1 and pkgconf 2.1.1, plus the build recipe and SHA256SUMS. Notices/licenses are preserved in those sources. This archive is bundled and distributed as a Release asset, not in Git history.

## Windows x64

The release uses FFmpeg/FFprobe 6.1.1 compiled by `build-windows.sh` in a native MSYS2 MINGW64 environment. The recipe uses GPL components, disables nonfree components and links dependency libraries statically. DirectWrite supplies system fonts for ASS subtitles.

`ffmpeg-windows-sources.tar.gz` contains the same pinned dependency sources listed for macOS, plus zlib 1.3.1, the Windows recipe and checksums. It is bundled and distributed alongside the installers. The manual GitHub workflow verifies H.264/AAC encoding, probing, actual ASS subtitle pixels and absence of non-system GNU runtime DLL imports. This does not replace Windows application installation/GUI QA.

## Distribution controls

`manifest.json` records hashes of the controlled executables. npm fallback FFmpeg/FFprobe executables are excluded from both app bundles, including wrong-platform executables that are never used. Runtime JavaScript wrappers remain, and packaged resources take precedence.

Do not reuse the old macOS binaries compiled with `--enable-nonfree`. Packaging success alone is not a redistributability, signing or runtime test. Unsigned prerelease packages require platform-specific installation QA.
