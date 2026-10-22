# CAD Viewer 0.2.0 — bilingual public beta

The viewer now supports English and Simplified Chinese. Choose 中文 / English in the top-right corner. It initially follows the browser language (Chinese for zh variants, English otherwise) and remembers a manual choice when the host permits local storage. Switching languages updates controls, accessible labels, model statistics, dimensions, measurement prompts and results, and common errors while preserving the current view, section settings, selected parts and measurement points. CAD filenames and part names are preserved. English installation and measurement documentation is included in README.en.md.

This release also includes the compact layout and measurement cleanup from 0.1.3: model information and hints share footer rows, and turning measurement off clears point spheres and lines. Clipped or hidden endpoints are hidden with their parts.

Validation: eleven automated tests cover CAD conversion, units, measurements, MCP protocol and localization. Manual browser checks cover a 20.00 mm measurement across language changes, display units, retained section settings, localized errors, language persistence and both compact layouts. Native MCP demo calls have succeeded; native file-entry UI rendering remains a separate verification item.

The package contains only generic sample models and screenshots. Third-party libraries are unchanged from 0.1.0; the source archive covers the same pinned revisions. Language preference is the only UI value saved to local storage.

Measurements remain display-mesh approximations. Section views still use open clipping surfaces without cap filling. This is a community beta, not an approved OpenAI directory listing.
