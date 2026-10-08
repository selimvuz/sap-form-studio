This project is a proof-of-concept visual editor for SAP Adobe Forms XDP layouts. It does not replace SAP ADS. It replaces only the layout-authoring step.

# Form Studio

[![CI](https://github.com/selimvuz/sap-form-studio/actions/workflows/ci.yml/badge.svg)](https://github.com/selimvuz/sap-form-studio/actions/workflows/ci.yml) · [MIT license](LICENSE) · [Contributing](CONTRIBUTING.md)

A local React + TypeScript form editor for opening an SAP-exported XDP, making conservative layout changes, and exporting it for manual upload to SFP. The original XML remains in memory alongside a separate visual model. Export patches supported objects and preserves unrelated source text.

The workflow is: **SAP SFP → export XSD/XDP → edit locally → export XDP → upload through SFP → validate with the existing SAP runtime.** The project focuses on supported layout changes while keeping the SAP form interface and ADS runtime in place.

**Early SAP feedback — 8 October 2026:** the user reports that the first layout export/import tests through SAP SFP worked successfully, with positive feedback from developer colleagues. Activation and ADS PDF rendering have not yet been confirmed in the project record. See [the reported test scope](docs/TEST_RESULTS.md#user-reported-sfp-tests--8-october-2026).

The bundled New Form layout is synthetic. Start your compatibility test with a known-good XDP from your SAP system. Browser Preview is approximate HTML/CSS, not an XFA renderer.

## Run locally

For the quickest start, open **`FormStudio.html`** in a desktop browser. This self-contained build includes the editor and sample data and needs no server or installation. All editing stays in that browser. Use a wide window for the three-panel editor. Rebuild this file after source changes with `npm run build`.

For development:

Install Node.js **22 or 24**, including npm. In this project directory:

```sh
npm install
npm run dev
```

Open the local URL printed by Vite, normally `http://127.0.0.1:5173`. Keep the terminal running while using the app. No backend, SAP credentials, or Adobe installation is required for local editing.

```sh
npm test          # Run the automated suite once
npm run build     # Type-check and create dist/ and FormStudio.html
npm run preview   # Serve the production build locally
npm run test:standalone # Verify the self-contained build after npm run build
```

`npm run test:watch` runs tests while developing. The development and preview servers bind to the local loopback address.

The project uses the official esbuild WebAssembly package and disables unnecessary symlink resolution so it can also build in restricted Windows workspaces.

## Try the editor

The app starts with a synthetic invoice layout, the sample XSD, and sample JSON data.

1. Use **Open XSD** for your schema and **Open XDP** for your layout. Import works on an in-memory copy; it does not overwrite the original file.
2. Select a supported object on the page or in the object list. Drag it, resize from the bottom-right handle, or change values in **Properties**.
3. Use **Text**, **Field**, or **Table** to add a component. Dragging a scalar from the data tree creates a field; dragging a repeating structure creates a table. Check bindings against your actual SAP context.
4. Use the header/footer icons for simple positioned text presets. The **Margin guide** changes the visual guide only; it does not rewrite imported page or content-area margins.
5. Open **Browser Preview** to show sample values. **Project options → Load sample data** accepts JSON or simple XML. Sample data is used for preview and is not injected into the exported XDP.
6. Choose **Export XDP**. Review validation results. Warnings permit export; errors must be resolved first. The output retains the `.xdp` extension.

**Compatibility Mode** is on by default. Unknown content is preserved even when the switch is turned off; there is no destructive regeneration mode.

### Save and reopen work

Use the three-dot **Project options** menu for **Save project**, **Open project**, and **View original XML**. A `.sapform.json` file contains the original XDP, current layout edits, schema, and preview data. Opening it restores the editing session. **View original XML** shows the source, not a generated export preview.

Working state lives in browser memory. There is no automatic disk save, browser-storage persistence, or undo history. Save a project before refreshing or replacing the current document. The project format is optional: exported XDP is the SAP interchange file and has no dependency on the project JSON.

| Shortcut | Action |
| --- | --- |
| Ctrl/Cmd + S | Download the working `.sapform.json` project |
| Delete / Backspace | Remove the selected supported object when not typing |
| Escape | Close a dialog/menu and clear selection |

Deletion is blocked for imported objects containing protected metadata or unsupported XML.

## Implemented scope

- **XSD tree:** elements, nested inline/named complex types, sequences, primitive types, optional/repeating occurrence information, local element/group references, and basic extensions. Unsupported constructs produce notices; external schemas are not fetched.
- **Conservative XDP import/export:** namespaces, unknown packets, metadata, comments, processing instructions, and unrelated XML remain in the original source. No-op export preserves the decoded source string exactly.
- **A4 visual editor:** single selection, dragging, resizing, zoom, plain static text, text fields, positioning in millimetres, font size, bold, and alignment.
- **Simple repeating tables:** header/detail rows, data binding, column labels/widths/alignment, row height, borders, and basic typography. Newly created tables can add/remove columns. Imported table column counts are preserved.
- **Preview:** JSON/simple XML data, scalar values, and repeated table rows. XFA scripts are never executed.
- **Validation:** XML/template/namespace checks, duplicate IDs, dimensions, unsupported structures, unresolved bindings, table configuration, and unsafe export operations.
- **Optional project files:** validated JSON import/export without requiring a backend.

## Limits that matter for SAP

- Only simple positioned text objects/text fields and simple positioned two-row tables are editable. Direct children of flowed subforms, complex table bindings, rich text, images, non-text widgets, fragments, and other unsupported content remain preserved but cannot be edited visually.
- New objects require a suitable positioned body subform. An imported document may load successfully while offering no safe insertion target.
- One A4 portrait guide is shown. Existing paper settings are preserved. Multiple pages, automatic flow, row growth, overflow, repeated master-page headers/footers, and advanced pagination are not implemented by the browser editor. Header/footer shortcuts add ordinary positioned text.
- The browser does not reproduce XFA font metrics, captions, scripts, formatting pictures, inherited layout rules, or full SOM binding resolution. A correct-looking preview does not establish a correct ADS result.
- XDP/XSD file import requires UTF-8, rejects conflicting encoding declarations and DTD/entity declarations, and is limited to 25 MB. The schema parser limits expanded trees to 5,000 nodes and 40 levels. Preview datasets are limited to 10 MB; project files to 40 MB.
- No SAP connection, interface changes, ADS replacement, PDF renderer, script editor, transport integration, signatures, or barcode authoring is included.

See [XDP implementation notes](docs/XDP_NOTES.md) for the supported representations, source references, preservation contract, and compatibility risks.

## Verification and testing in SAP

The automated suite covers XDP no-op and mutation preservation, namespaces, protected deletion, nested coordinates, escaping, invalid input, schema parsing, preview bindings, and project validation. Run `npm test` for the current result.

The final local run passed **63 tests across 6 files**, the production build, and the standalone bundle smoke check. See [TEST_RESULTS.md](docs/TEST_RESULTS.md) for the verified interactions and the boundaries of these checks.

An additional local check used an actual public SAP-samples XDP: unchanged export matched its source text, and a bound field's font change preserved all unrelated packets and processing instructions. The file had no supported plain static-text object, so static-text edits were verified using the bundled synthetic fixture. Exact evidence is recorded in [XDP_NOTES.md](docs/XDP_NOTES.md#additional-check-against-the-public-sap-sample). These checks did not involve SAP activation or ADS rendering.

The user-reported SFP export/import success on 8 October is an additional early result. It does not establish activation, ADS rendering, or acceptance across SAP versions and layout types. Those checks remain open.

**First test in your SAP environment:** use a disposable copy of a simple known-good form. Export its XDP/XSD, perform a no-change round-trip, upload the exported layout, activate, and run the existing test with the same data. Then repeat with one short static-text change. Only after those pass, test one bound field and a small repeating table. Follow [the complete SAP validation procedure](docs/SAP_TEST.md), including release-specific menu cautions and evidence recording.

When reporting a compatibility issue, include the exact operation, import/export notices, relevant SAP/ADS versions, and a minimal anonymized fixture when sharing it is permitted. Keep production data and proprietary form content out of public issues.

## Project layout

```text
src/
  App.tsx                         Application state and file actions
  model.ts                        Visual document/data types
  components/
    Canvas.tsx                    A4 editing canvas and HTML preview
    DataPanel.tsx                 Schema tree and object selection
    Properties.tsx                Layout, bindings, and table controls
    project.ts                    Validated working-project import
  xdp/
    xml.ts                        XML validation, lexical index, source patches
    reader.ts                     Supported XFA → visual model
    writer.ts                     Narrow edits and new XFA objects
    bindings.ts                   Conservative binding helpers
    validation.ts                 Export checks
    index.ts                      Public adapter API and UTF-8 file reading
  xsd/                            Schema parsing and XML helpers
  preview/                        Sample-data parsing and path resolution
  templates/minimal-sap-form.xdp   Isolated synthetic starter
public/samples/
  invoice.xsd
  invoice-data.json
  invoice-data.xml
tests/
  fixtures/preservation.xdp        Synthetic multi-packet XDP fixture
  *.test.ts                       Automated checks
docs/
  ARCHITECTURE.md
  XDP_NOTES.md
  SAP_TEST.md
  TEST_RESULTS.md
scripts/                          Standalone build and smoke verification
FormStudio.html                   Self-contained local application
```

[Architecture details](docs/ARCHITECTURE.md) explain the source-preserving adapter and where future work belongs.

## License

MIT © 2026 Yavuz Selim Doğdu. See [LICENSE](LICENSE) and [third-party notices](THIRD_PARTY_NOTICES.md). The standalone HTML includes these notices. This is an independent community project, not affiliated with or endorsed by SAP or Adobe.
