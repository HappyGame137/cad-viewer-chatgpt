# CAD Viewer 0.3.1 — filled section faces

Section mode previously hid the removed half of the mesh without closing the cut, which made solid components appear hollow. It now creates warm-tinted section faces from the mesh/plane intersections. Nested contours preserve bores, cavities and solid islands. The caps follow the section slider, part selection and exploded positions and disappear when section mode is turned off. Point picking includes the visible cut face, avoiding measurements on hidden surfaces behind it. Source CAD files are unchanged.

Open or branching contours are left uncapped with a localized message, so missing mesh boundaries are not silently filled as solid material. Section faces remain display-mesh approximations. The generic section-tube-20mm.stl sample and screenshot demonstrate a 20 mm body with a 10 mm through hole.

Validation: sixteen automated tests cover conversion, units, measurements, MCP protocol, localization and sections. Section checks cover solid area, exact vertex/edge intersections, holes, disconnected solids, nested islands, cap picking, open contours and tangent/outside planes. Browser checks verify visible filling, preserved holes, cap point coordinates, section slider updates, switching section mode off, and English/Chinese messages. Native file-entry UI rendering remains a separate verification item.

The package contains only generic sample models and screenshots. User project drawings and assembly screenshots are excluded. Third-party versions are unchanged; Earcut's ISC notice is explicitly included for the triangulator distributed inside Three.js. The source archive covers the same pinned OCCT/importer revisions. Language preference is the only UI value saved to local storage.

The bilingual compact UI and measurement cancellation cleanup from 0.2.0 are retained. This is a community beta, not an approved OpenAI directory listing.
