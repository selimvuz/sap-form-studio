# Verification results

Local verification completed on **7 October 2026**. The automated, browser, and public-sample checks below concern the editor and XML preservation; they did not use a SAP environment. A separate user report dated **8 October 2026** records successful initial layout export/import tests through SFP. Activation and ADS PDF rendering remain unconfirmed in this record.

## User-reported SFP tests — 8 October 2026

The user reported that the first layout export/import tests through SAP SFP worked very successfully. Developer colleagues also gave positive feedback.

| Area | Recorded status |
| --- | --- |
| Initial layout export/import through SAP SFP | Successful, as reported by the user |
| Developer feedback | Positive, as reported by the user |
| Form activation | Not confirmed in the report |
| ADS-generated PDF and rendered content | Not confirmed in the report |
| Specific field/table/pagination cases | Not documented in the report |
| SAP/ADS versions and exact tested layout revisions | Not provided |

This is early user-reported SFP round-trip evidence. It is separate from the reproducible local checks below and does not establish comprehensive runtime acceptance. The developer feedback is qualitative and is not an additional compatibility test result.

## Automated checks

| Check | Result |
| --- | --- |
| `npm test` | 63 tests passed across 6 files |
| `npm run build` | TypeScript checking and Vite production build passed; `dist/` and `FormStudio.html` generated |
| `npm run test:standalone` | Produced bundle starts in jsdom with 14 objects, bundled schema, and sample-data preview; no external script/style assets |

Test groups:

| File | Tests | Main coverage |
| --- | ---: | --- |
| `tests/xdp.test.ts` | 20 | Source-identical no-op export, narrow mutations, new objects, packets, namespaces, processing instructions, escaping, nested coordinates, and export validation |
| `tests/edge-cases.test.ts` | 21 | Conservative handling of opaque/protected structures, malformed inputs, namespace boundaries, tables, geometry, and binding edge cases |
| `tests/xsd.test.ts` | 6 | Flat/nested structures, named types, optional/repeating elements, references, and unsupported constructs |
| `tests/preview.test.ts` | 5 | JSON/XML sample data, scalar and repeating bindings, and invalid input |
| `tests/ui-model.test.ts` | 7 | Working-project restoration, validation, protected source references, and unsafe project edits |
| `tests/app.test.ts` | 4 | App-level file import, authoring, preview, export, guarded failures, and resize persistence |

The App tests exercise actual controls and file inputs. The import/edit/add/export flow reparses the generated XDP Blob and checks edited text, a schema-bound field, a repeating table, and unrelated source preservation. The resize test sends pointer events to the actual resize handle at 80% zoom, verifies a 65 × 9 mm text object becomes 75 × 14 mm in both the canvas and property controls, and reparses the exported XDP to confirm the new dimensions and unchanged position.

The standalone check evaluates the exact compiled bundle against a DOM. It is not a substitute for a real-browser `file://` check; that protocol is unavailable in the Codex browser automation surface used here.

## Browser interaction checks

The development application was run and visually inspected in the Codex browser during this task, including a wide desktop viewport. The following interactions were exercised:

- Starter document selection, static-text and font-size editing.
- Browser Preview with three item rows and sample values.
- XDP export validation dialog and download action.
- Import of the preservation XDP fixture, with supported objects and unsupported-content notices.
- Protected-object deletion disabled, and text containing XML-sensitive characters edited.
- Adding a bound field from the schema tree.
- Dragging a canvas field and checking changed coordinates.
- Dragging a schema field to the canvas and checking the new field binding and position.

Native browser resizing was not separately completed; pointer-resize behavior and the resulting exported XML are covered by the App test described above. The browser download action was invoked, but its destination file on the host filesystem was not independently confirmed. Automated App tests verify the download Blob and `.xdp` filename.

A later browser rerun after the interrupted session could not reconnect to the local preview server in the tool environment. Final automated tests, the production build, and the generated standalone bundle smoke check passed. This limitation is not recorded as a successful final browser rerun.

## Public SAP XDP preservation check

A separate local check used the public SAP Music Festival XDP. Its no-change export matched the original decoded source exactly. Changing the supported `Title` field font from 14 pt to 15 pt produced well-formed XML while preserving all five unrelated packets and all 31 processing instructions. The original source retained by the model was unchanged.

That sample did not contain a supported plain static-text object. Static-text mutation is covered by the bundled synthetic fixture. The sample source URL, file hash, size, and scope are recorded in [XDP_NOTES.md](XDP_NOTES.md#additional-check-against-the-public-sap-sample).

## Required SAP acceptance test

Follow [SAP_TEST.md](SAP_TEST.md) to complete and record the runtime checks. For a new environment, start with a disposable copy of a known-good SAP form and an unchanged XDP round-trip. Then test one static-text edit, one bound field, and a simple repeating table in separate steps. Record activation and the resulting ADS PDF for each case. The reported initial SFP success and the local preservation checks do not yet establish ADS acceptance, data-binding correctness, or pagination accuracy.
