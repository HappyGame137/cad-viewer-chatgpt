---
name: view-cad
description: Open local STEP and STL files in an interactive CAD viewer, inspect assemblies, and measure distances or bounding dimensions in ChatGPT desktop.
---

Use `open_cad` for a user-selected absolute STEP/STL path, or `cad_demo` for a generic example. Use the UI returned by the tool. The plugin reads the selected file and converts it locally to a display mesh; tool output and UI data are passed through the host.

For STL, confirm its original units if unknown and dimensional accuracy matters. STL has no intrinsic units. STEP is converted to millimetres. The viewer can display mm, cm, or inches.

For dimensions, distinguish axis-aligned overall bounds from point-to-point distance. The UI supports picking two points with optional nearest mesh-vertex snapping, XYZ differences, assembly explosion, part isolation, and clipping. Measure in assembled coordinates even when the exploded display is active. These are display-mesh measurements, not exact B-rep or certified inspection results. Do not report hole diameters, curve radii, thicknesses, angles, or minimum clearances as verified unless separately established.

If no MCP tools are available yet, explain that the installed plugin needs a new local conversation or app restart. For immediate local preview, run `node <plugin-root>/dist/server.mjs --preview --model <absolute-file-path>` from the plugin root. The server prints a loopback URL; open it in the app's browser when supported. Use an available port and reuse this plugin's existing preview process. The preview is a browser fallback and does not verify native MCP Apps integration.

File access defaults to the user's home and the launch working directory. If a selected model is outside those roots, configure `CAD_VIEWER_ALLOWED_ROOTS` with the platform path separator. Do not broaden roots beyond the user's requested source directories.
