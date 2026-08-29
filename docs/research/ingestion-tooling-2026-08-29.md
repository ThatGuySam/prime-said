# Ingestion tooling research

> **Tease:** Bun is the right project runtime, but using it for yt-dlp's current YouTube challenge solver would reduce durability.  
> **Lede:** Keep a pinned Deno exception for bundled yt-dlp EJS, and use Parakeet TDT 0.6B v3 through MLX for Apple Silicon transcription.  
> **Why it matters:** Extraction and ASR are the two fragile/expensive pipeline stages; explicit pins and resumable segments isolate both.  
> **Go deeper:** Cache one ~2.5 GB production ASR model by exact revision; GitHub's default repository cache is 10 GB and evicts entries unused for seven days.

**Date:** 2026-08-29  
**Question:** What is the cheapest durable source-discovery/transcription stack without YouTube APIs?

## Findings

- yt-dlp's EJS documentation currently recommends Deno and enables it by default. It marks Bun support deprecated and says releases after 1.3.14 are unsupported. Deno also provides narrower permissions; Bun EJS runs with broad filesystem/network access.
- yt-dlp recommends its nightly channel for regular users. Reproducibility still favors a verified pin with a controlled latest-nightly/master fallback on recognized extraction errors.
- Installing yt-dlp default extras bundles the matching `yt-dlp-ejs` package, reducing reliance on remotely fetched challenge scripts.
- NVIDIA Parakeet TDT 0.6B v3 provides punctuation/capitalization, timestamp output, multilingual European-language support, and long-audio handling. The MLX community conversion makes Apple Silicon the practical primary lane.
- The MLX model is roughly 2.5 GB. GitHub Actions' default cache is 10 GB/repository; excessive model/version/OS keys will thrash.
- GitHub-hosted CPU transcription is unlikely to make full long videos reliably fit a five-minute daily compute target. Discovery is cheap; initial transcription belongs on a Mac or self-hosted Mac runner unless benchmarks prove otherwise.

## Recommendation

- Bun everywhere except a pinned, isolated Deno yt-dlp subprocess.
- Use the last verified official yt-dlp nightly. Retry latest nightly then official master only after classifying failure and validate before repinning.
- Start ASR with `mlx-community/parakeet-tdt-0.6b-v3`; pin exact revision and runtime after the first fixture.
- Segment long audio into 20–30 minute pieces with overlap, so retries and timestamp alignment remain bounded.
- Daily Actions job: newest-ID discovery, source health, and small validation. Mac: initial and heavy transcription. Add a self-hosted runner only if hands-off incremental transcription becomes worth maintaining.
- Cache only trusted executable/model inputs by exact revision; never cache media, cookies, or unreviewed output.

## Source quality

Runtime and model claims come from primary yt-dlp, NVIDIA/Hugging Face, and GitHub documentation. The estimate that five CPU minutes is insufficient is an inference to validate with the implementation benchmark.

## Sources

- [yt-dlp EJS wiki](https://github.com/yt-dlp/yt-dlp/wiki/EJS)
- [yt-dlp README and update channels](https://github.com/yt-dlp/yt-dlp/blob/master/README.md)
- [NVIDIA Parakeet TDT 0.6B v3 model card](https://huggingface.co/nvidia/parakeet-tdt-0.6b-v3)
- [MLX Parakeet TDT 0.6B v3](https://huggingface.co/mlx-community/parakeet-tdt-0.6b-v3)
- [parakeet-mlx repository](https://github.com/senstella/parakeet-mlx)
- [GitHub Actions dependency caching](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)
- [GitHub Actions billing/cache allowance](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
