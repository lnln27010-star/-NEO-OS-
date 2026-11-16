# NVIDIA AIF / SimReady reference asset

This folder contains the small `Generic_CDU` reference asset copied from the
MIT-licensed [NVIDIA Omniverse AIF Pipeline Samples](https://github.com/NVIDIA-Omniverse/aif-pipeline-samples).

It is included as a production asset-structure reference, not as a browser
renderable replacement for the site's future GLB/USD loader. The important
parts are deliberately preserved:

- `Generic_CDU.usda` main interface layer
- `layers/Generic_CDU_Properties.usda` AIF metadata layer
- `layers/Generic_CDU_ConnectionPoints.usd` hidden connection-point geometry
- `payloads/external.usd` and `payloads/internal.usd` selective payloads

Copyright (c) 2024-2026 NVIDIA CORPORATION & AFFILIATES. Used under the MIT
License. See the upstream repository for the complete license and source.
