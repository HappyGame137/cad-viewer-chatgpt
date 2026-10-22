# CAD Viewer 0.1.0 — public beta

Local STEP/STL viewing and approximate mesh measurement for ChatGPT desktop.

- Orbit, zoom, pan, select a part, explode assemblies and clip the view.
- Two-point measurement with optional mesh-vertex snapping, XYZ differences, and overall / selected-part bounding dimensions.
- Explicit STL source units and mm / cm / in display.
- Local MCP server, standard MCP Apps UI, and file entrypoint declarations.
- Bundled runtime dependencies and generic sample files; Node.js 22+ on PATH is required.

Validation: eight automated tests cover binary / ASCII STL, units, Unicode names, large-coordinate precision, MCP tool calls, STEP assemblies and known dimensions. Manual in-app browser checks include loading the project assembly, 20.00 mm vertex-to-vertex measurement, inch conversion, exploded view, clipping and part isolation. Native ChatGPT MCP Apps file-entry rendering still requires verification in a restarted local conversation.

Measurements are based on display triangles. This release does not provide exact B-rep metrology, automatic hole diameter, radius, angle or minimum-clearance inspection.

Install from this release or the repository marketplace. This is a community beta, not an approved OpenAI directory listing. Local MCP submissions to the official directory currently require approved-partner access.
