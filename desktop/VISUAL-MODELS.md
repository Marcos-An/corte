# Optional local visual observer

The application downloads original upstream assets directly only when the user selects Install. Model weights are not included in Corte installers. The installer checks exact byte sizes and SHA256 digests before activation. See `visual-runtime.mjs` for the pinned manifest and platform-specific archive hashes.

- Qwen3-VL-8B-Instruct GGUF: https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/tree/f982a07559d4a2f6c8744d840bf6fccab30eea96
- Model card and license metadata: https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF/blob/f982a07559d4a2f6c8744d840bf6fccab30eea96/README.md
- llama.cpp original runtime release: https://github.com/ggml-org/llama.cpp/releases/tag/b12110
- Runtime source and notices: https://github.com/ggml-org/llama.cpp/tree/b12110

Downloaded archives and their included dependencies retain their upstream terms. Windows NVIDIA installations use the upstream CUDA 12.4 runtime archive. CPU Windows and Metal Apple Silicon use their corresponding upstream archives. Corte does not redistribute CUDA runtime files in its application installer.

The owned inference process binds to loopback with a random API key, runs offline, and is stopped after cancellation, app exit or a short idle period. Completed visual evidence is cached locally. Selected still images and observations are sent to the user's connected ChatGPT account for planning and review. Original video/audio files are not uploaded by this visual observer.
