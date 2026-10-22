# CAD Viewer 0.1.3 — public beta

Turning measurement off previously left point spheres and the distance line visible. It now clears both; turning measurement on starts with an empty point selection. Markers are also hidden when their part is isolated out or their position is clipped away.

File information, dimensions and interaction hints now share compact footer rows below the canvas. Top controls use smaller text and spacing. The 3D canvas fills the remaining height. At the verified 887 × 764 desktop viewport, canvas height increased from 458 to 625 pixels without page overflow.

Validation: eight automated tests pass. Manual in-app checks verified 20.00 mm measurement, hiding a clipped endpoint, clearing spheres and lines on cancellation, and starting a fresh measurement. A native plugin demo tool call also succeeded; native file-entry UI rendering remains a separate verification item.

This release changes the plugin UI and includes only generic sample models. User project drawings and assembly screenshots are not included. Third-party libraries are unchanged from 0.1.0; the accompanying source archive covers the same pinned library revisions.

Measurements remain display-mesh approximations. Section views still use open clipping surfaces without cap filling. This is a community beta, not an approved OpenAI directory listing.
