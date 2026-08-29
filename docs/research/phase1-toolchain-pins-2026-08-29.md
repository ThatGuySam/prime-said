# Phase 1 toolchain candidates

**Date:** 2026-08-29
**Status:** Immutable candidates found. No extraction or Apple Silicon transcription run has promoted them to production pins.

## Candidate set

| Tool | Candidate | Immutable evidence |
| --- | --- | --- |
| yt-dlp nightly | `2026.08.27.231323`, source `8377aa9555c308ca95630a28c1f91decd6c2235a` | [release](https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/tag/2026.08.27.231323), [source commit](https://github.com/yt-dlp/yt-dlp/commit/8377aa9555c308ca95630a28c1f91decd6c2235a) |
| yt-dlp EJS | `yt-dlp-ejs 0.8.0`, bundled with the selected nightly | [pinned dependency](https://github.com/yt-dlp/yt-dlp/blob/8377aa9555c308ca95630a28c1f91decd6c2235a/pyproject.toml), [package](https://pypi.org/project/yt-dlp-ejs/0.8.0/) |
| Deno | `2.9.5`, commit `17fadf33a8df3af9488b9f42efd1f2290d6dc7a3` | [release](https://github.com/denoland/deno/releases/tag/v2.9.5). The yt-dlp pin group selects this version even though Deno 2.9.6 is newer. |
| FFmpeg source | `9.0.1`, tag `n9.0.1`, commit `bf1b838f2ab88b4f8fd83443325c782ea0e0f7fa` | [download](https://ffmpeg.org/download.html), [tag](https://github.com/FFmpeg/FFmpeg/releases/tag/n9.0.1) |
| parakeet-mlx | `0.5.2` | [PyPI artifact](https://pypi.org/project/parakeet-mlx/0.5.2/), [source repository](https://github.com/senstella/parakeet-mlx) |
| Parakeet model | `mlx-community/parakeet-tdt-0.6b-v3` at `ed2b7e8c15f9aaa0b5772e2efb986255eaef7e15` | [immutable model tree](https://huggingface.co/mlx-community/parakeet-tdt-0.6b-v3/tree/ed2b7e8c15f9aaa0b5772e2efb986255eaef7e15) |

The macOS yt-dlp artifact SHA-256 is `282d67228a418b4f0c56ce0ca82d0f6b12dc31bb5d3f7b85c1d5944974e1fbe8`. The Apple Silicon Deno archive SHA-256 is `b796aadd131f6930560c1ee040cf0d6f53933fbb987464e9ff46bd7ea4830615`. The model weight SHA-256 is `05e01c7f396c298cf7d23f61da7b504adeab698f0aaeafd9c82d198625464592`.

## Process boundary

The yt-dlp wrapper should pass absolute paths and an argv array. Its fixed safety arguments are:

```text
--ignore-config
--no-plugin-dirs
--no-js-runtimes
--js-runtimes deno:/absolute/path/to/deno
--no-remote-components
--no-update
```

Run it inside a new temporary directory. Public-source mode supplies no cookies or browser profile and records `authMode: none`. Metadata discovery adds `--flat-playlist --playlist-end 24 --dump-single-json`.

Use `ffmpeg` and `ffprobe` from the same build. Normalize audio to mono, 16 kHz, signed 16-bit PCM with metadata removed. Download the model at the exact revision, verify its files, then pass the local directory to parakeet-mlx with Hugging Face offline mode enabled. The package has no model-revision CLI argument, so a local verified snapshot is the reproducible boundary.

## What the M2 Max run must lock

The candidate set is incomplete until the native fixture records:

- Python and every package in `uv.lock`, including MLX and platform-wheel hashes;
- the FFmpeg and ffprobe binary origin, hashes, version output, and configure string;
- model/package compatibility, decoding mode, dtype, segment length, and overlap;
- memory use, runtime, timestamp drift, and the idempotent rerun result.

`parakeet-mlx 0.5.2` declares lower dependency bounds instead of a complete environment. FFmpeg publishes source rather than an official Apple Silicon binary. Those facts make the native lock and run manifest part of the Phase 1 evidence, not cleanup for later.

## Licensing notes

The official yt-dlp macOS executable is GPLv3+ as a combined PyInstaller work. Deno and MLX are MIT. parakeet-mlx is Apache-2.0. The model weights are CC-BY-4.0 and require attribution to their NVIDIA lineage. FFmpeg's license depends on its build flags, so record the configure string and reject `--enable-nonfree` for a distributable tool bundle.

## Smallest next slice

Implement typed command builders, binary/hash preflight, temporary-directory isolation, and a run-manifest schema with fake-process tests. The first native run should process one manually timed seed span end to end, then rerun it to prove the skip path. Do not promote the candidates until that succeeds.
