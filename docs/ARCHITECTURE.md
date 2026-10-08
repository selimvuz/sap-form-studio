# Architecture

Form Studio is a browser-only React/TypeScript application built with Vite. It maintains a visual editing model alongside the original XDP source. React controls the model; dedicated adapters interpret and modify XML. No backend or SAP runtime integration is present.

The starter XDP, sample XSD, and preview dataset are bundled at build time. The application does not fetch them from a server. `npm run build` creates the normal `dist/` output and then inlines its JavaScript and CSS into `FormStudio.html`. This self-contained edition has no external asset dependencies; both editions use the same application code. `npm run test:standalone` executes the produced bundle in jsdom and checks the initial document and sample-data preview.

```text
XDP file ── UTF-8 check ── DOM validation + source index ── supported visual model
                              │                                  │
                              └──── original XML retained ───────┤
                                                                 │
XSD file ── schema parser ── data tree ── field/table bindings ─────┤
                                                                 │
JSON/XML sample ── preview resolver ── HTML/CSS preview            │
                                                                 │
                                   validation + source patches ──┘
                                                │
                                            XDP download
                                                │
                              manual SFP upload/activation → ADS
```

## Model and responsibilities

`src/model.ts` defines `FormDocument`, the discriminated `TextElement`, `FieldElement`, and `TableElement` types, `TableColumn`, schema nodes, and validation issues. Geometry uses millimetres; font size uses points. The document has one page descriptor and a list of visual objects. Multi-page layout can be added later, but is not represented as implemented functionality now.

Imported objects have stable IDs tied to source positions during the current editing session. Their `SourceRef` records the original span, parent offsets, and any deletion protection. New objects receive UUID-based IDs. A fresh XDP reimport rebuilds source-derived IDs; these are not intended as globally persistent identities across arbitrary external rewrites.

`App.tsx` owns document/schema/sample state, selection, preview mode, file actions, validation dialogs, and keyboard shortcuts. `Canvas.tsx`, `DataPanel.tsx`, and `Properties.tsx` render and update typed model objects. They do not write XFA XML. The canvas uses CSS millimetres and adjusts pointer deltas for zoom.

## XDP read path

The public API in `src/xdp/index.ts` exposes document creation, parsing, serialization, validation, and file reading. `readXmlFile` performs fatal UTF-8 decoding, checks the declared encoding, and applies the file-size limit.

`xml.ts` first validates XML with the browser's namespace-aware `DOMParser`. It rejects DTD/entity declarations. A separate lexical index maps DOM elements to source spans without serializing them. The index distinguishes quoted attributes, processing instructions, comments, and CDATA, allowing later patches to leave untouched text intact.

`reader.ts` verifies the XDP wrapper and finds the template packet by namespace, rather than assuming a particular namespace prefix. It traverses supported XFA objects and builds a visual approximation. Positioned parent offsets and the content-area origin are accounted for; inherited font/paragraph values are read where possible.

The reader excludes unsafe or unrepresentable objects and reports notices. Examples include direct children of flowed subforms, prototype/opaque descendants, hidden/rotated/referenced objects, unsupported draws/widgets, and repeating structures outside the supported table shape. Complex or flowed tables remain in source. Non-A4 and multi-page sources retain their original XML settings while the editor warns about its single A4 guide.

## XDP write path

`writer.ts` reparses the retained source to establish a trustworthy baseline and compares it with the current model. It changes only affected properties using `XmlPatcher`:

1. Attribute changes patch their start tags while retaining unrelated attributes.
2. Plain-text changes replace text spans with escaped XML text, retaining surrounding comments and processing instructions.
3. Missing supported properties are appended with the template namespace.
4. New objects are appended into a suitable positioned body subform using local coordinates derived from the visual page position.
5. Deletions remove only supported objects; imported objects containing protected content cannot be deleted.

Patches are applied to the original string in source order. Overlapping edits are rejected. The generated result is reparsed and the template packet checked before it is returned. Unchanged exports return the same source string. The writer never regenerates unknown packets from the model and never overwrites the user's source file.

Compatibility Mode is on initially. Both switch states retain the same conservative preservation safeguards. Disabling the switch does not permit unsafe rewrites or deletion of unknown content.

For plain text, the supported XFA shape is `draw/value/text`; text fields use `field/ui/textEdit` with optional explicit `bind`. Simple tables use `subform layout="table"`, `columnWidths`, and header/detail `layout="row"` subforms. The detail row has an `occur` rule and a repeating binding. Imported table structure is kept fixed; existing column count changes are rejected.

`bindings.ts` adds narrow `$record.` or `$.` prefixes when needed and adds an array selector for newly managed repetition. Existing expressions stay unchanged unless edited. It is not a full SOM evaluator or a SAP context compiler.

## Validation

`validation.ts` checks source well-formedness, the XDP/template namespaces, duplicate XML and model IDs, numeric layout values, supported component kinds, and table configuration. It compares simple field/column binding paths with the loaded schema and reports unresolved or complex paths as warnings. It also warns about repeated names, renamed imported objects, out-of-page geometry, synthetic templates, and pagination assumptions.

A dry serialization detects protected deletion, missing insertion targets, unsupported imported table restructuring, and overlapping or otherwise unsafe changes. The export dialog permits warnings but blocks errors. These are application checks, not full XFA schema validation or ADS certification.

## Schema and preview adapters

`src/xsd/index.ts` resolves self-contained schemas into a tree. It handles nested element/type definitions, occurrence constraints, local references and groups, sequences, and basic extensions. Choices are displayed with warnings rather than enforced; wildcard/attribute/identity-constraint features are not fully modeled. Imports/includes are reported without network fetching. Expansion and depth limits prevent runaway recursive schemas.

Tree paths are relative to each global root. New fields and tables use those paths; the user must still verify the target SAP binding scope. Multiple roots produce a notice instead of an implicit schema rewrite.

`src/preview/index.ts` accepts JSON objects and simple XML records/datasets. Repeated XML siblings become arrays, and identifiers remain strings. It resolves dotted paths with a limited set of record prefixes and selectors. `Canvas.tsx` shows scalar values and table rows through that resolver. Full SOM, XFA scripts, formatting pictures, font metrics, flow, and pagination are not reproduced.

Sample data stays separate from XDP source. Loading preview data does not alter the source `datasets` packet or the runtime data passed by SAP.

## Project persistence

Project saving downloads `.sapform.json` with format `sap-form-studio`, version `1`. It includes the original XDP, edited visual model, schema source/tree, and preview sample. The project is optional; XDP export does not depend on it.

`src/components/project.ts` validates incoming JSON and reconstructs source references from the original XML. It also reparses schema source rather than trusting a saved tree. Forged deletion protection, invalid dimensions, duplicate IDs, incompatible imported types, and protected-object removals are rejected. Page margin values restore only the visual guide.

State otherwise lives in React memory. There is no localStorage, automatic save, undo stack, background file write, or server persistence. File import replaces the relevant in-memory state; users should save before refreshing or switching documents.

## Tests and extension points

Vitest with jsdom supplies browser XML APIs for automated tests. Bundled fixtures exercise no-op source equality, narrow mutations, unrelated packets, namespace prefixes, processing instructions, comments, CDATA, escaping, nested coordinates, protected deletion, invalid XML, schema branches, preview paths, and project validation. No network or SAP connection is required for `npm test`.

An additional actual public SAP XDP check is documented in [XDP_NOTES.md](XDP_NOTES.md#additional-check-against-the-public-sap-sample). Its research download and temporary verification script are outside the delivered project's runtime/test dependencies.

Future additions should extend the typed model and the reader/writer together, with preservation fixtures that demonstrate the exact mutation boundary. Pagination requires an explicit page/flow model and ADS evidence. Fragment, script, or widget editing requires dedicated handling; it must not be implemented by replacing opaque XML wholesale. Replace or supplement the synthetic starter only with an appropriately obtained template and record the runtime on which it is verified.

The final compatibility check remains [manual SAP validation](SAP_TEST.md): upload, activate, execute the existing test, and inspect the PDF generated by ADS.
