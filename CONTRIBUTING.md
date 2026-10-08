# Contributing to Form Studio

Form Studio is a proof of concept for editing supported SAP Adobe Forms layout objects while preserving the original XDP. Small, reviewable fixes and sanitized compatibility examples are useful contributions. Read the [README](README.md) and [XDP implementation notes](docs/XDP_NOTES.md) before changing the adapter.

## Set up and verify

Use Node.js 22 and npm to match CI. From the repository root:

```sh
npm ci
npm run dev
```

Run the checks before submitting a pull request:

```sh
npm test
npm run build
npm run test:standalone
```

The build type-checks the project, creates `dist/`, and rebuilds `FormStudio.html`. The standalone check must run after the build. `npm run test:watch` is available while developing, and `npm run preview` serves the production build locally. Update the tracked `FormStudio.html` when application source changes; do not commit `node_modules/`, `dist/`, or temporary test output. If dependencies change, include the updated `package-lock.json`.

CI runs the same installation, test, build, and standalone checks on pushes and pull requests using Node.js 22.

## Preserve the XDP contract

- Keep the original decoded XML alongside the visual model. A no-change export must return the source string exactly, including whitespace, comments, processing instructions, namespaces, and unknown packets.
- Patch only the supported properties the user changed. Do not reserialize an entire imported document or regenerate opaque XML to make an edit easier.
- Preserve unknown attributes and nested metadata. Keep protected deletion checks, and never choose prototype content, vendor metadata, or other unsupported subtrees as insertion targets.
- Keep existing namespace and coordinate scopes intact. Imported table row changes must preserve unrelated XML and the existing outer container height; preserve imported column counts.
- Distinguish record bindings from row-relative bindings. Unsupported expressions should produce a clear notice without silently rewriting them.
- Reject malformed XML, DTD/entity declarations, invalid dimensions, and conflicting encodings. Do not execute imported XFA scripts or fetch external schema resources.

The browser preview is an approximation. Passing local tests does not establish SAP activation or ADS rendering compatibility. Document any new support boundary or limitation in the relevant project documentation.

## Add focused regression coverage

For parser or writer changes, add a small fixture and a regression test that fails without the fix. Check both the intended change and preservation of unrelated source. Relevant tests cover no-change round trips, targeted edits, namespaces, protected deletion, insertion targets, nested geometry, table rows, bindings, UTF-8 handling, and invalid input. Preview and UI behavior have separate tests under `tests/`.

For visual changes, also inspect the editor and Browser Preview at a desktop window size. Rebuild and open `FormStudio.html` to check the local-file workflow. Explain which checks passed in the pull request, along with any checks that could not be performed.

SAP results should state exactly what was exercised: layout import, activation, or ADS rendering, with the relevant environment details. Follow [the SAP test procedure](docs/SAP_TEST.md) when evaluating a real form. Do not infer runtime compatibility from the HTML preview.

## Share examples responsibly

Use the bundled synthetic samples or create a minimal synthetic fixture whenever possible. Attach only sanitized XDP/XSD files and preview data that you are permitted to publish. Remove business secrets, personal data, credentials, internal system addresses, and proprietary form content from examples, screenshots, and logs. Working `.sapform.json` projects contain original XML and preview data, so inspect and sanitize them before sharing.

For a bug, include reproduction steps, expected and actual results, app version or commit, browser/OS, and relevant validation messages. For a feature, describe the authoring task and a concrete successful result. Keep each pull request focused on one coherent change.

The project is distributed under the [MIT license](LICENSE). Contribute only code and fixtures that you have permission to share under that license.
