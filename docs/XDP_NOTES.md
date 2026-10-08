# XDP implementation notes

This is an experimental authoring tool. XML validity, preservation checks, and browser rendering do **not** prove SAP ADS compatibility. The bundled `src/templates/minimal-sap-form.xdp` is a synthetic development fixture, not a layout certified or tested with ADS. For the real proof, import a known-good XDP downloaded from your own SAP system and follow [SAP_TEST.md](SAP_TEST.md).

On **8 October 2026**, the user reported successful initial layout export/import tests through SAP SFP and positive feedback from developer colleagues. Activation, ADS PDF rendering, runtime versions, and the exact field/table cases were not confirmed. See [the recorded report](TEST_RESULTS.md#user-reported-sfp-tests--8-october-2026). This report supplements the local preservation checks below; it does not change their scope or the synthetic template's validation status.

## Research performed before XML writing

The implementation was informed by Adobe's XFA specification and actual XML from SAP's public examples, inspected on 7 October 2026. The SAP sample was inspected as a reference; the bundled demonstration form is separately authored and does not reproduce that sample's source, artwork, or business logic.

- [Adobe XML Forms Architecture 3.3 specification, hosted by the PDF Association](https://pdfa.org/norm-refs/XFA-3_3.pdf): chapters 4 (bindings), 8 (layout/tables), 9 (dynamic forms), 17 (template reference), and 23 (XDP).
- [SAP-samples Music Festival XDP](https://github.com/SAP-samples/abap-partner-reference-application/blob/main/Tutorials/assets/ZPRA_MF_MUSICFESTIVAL.xdp), with [raw XML](https://raw.githubusercontent.com/SAP-samples/abap-partner-reference-application/main/Tutorials/assets/ZPRA_MF_MUSICFESTIVAL.xdp): actual Adobe LiveCycle Designer for SAP output, including tables and mixed packets. The `main` reference can change over time.
- [SAP Help: Example—Simple Adobe Form](https://help.sap.com/docs/SAP_NETWEAVER_701/6f34c06b6c4b101492ccb6f300848f65/4382538c0c4458bbe10000000a422035-94.html?locale=de-DE&state=PRODUCTION&version=7.01.24): older example with template namespace 2.1, an A4 master page, a flowed outer subform, and positioned content.
- [Adobe Designer 11 Help](https://help.adobe.com/en_US/livecycle/11.0/DesignerHelp/designer_11_help.pdf): includes an `originalXFAVersion` processing instruction example. Processing instructions can have product meaning and must not be treated as disposable formatting.

## Packets and namespaces observed

The Music Festival sample uses these packet/namespace pairs. Version suffixes belong to individual packets; they need not match each other.

| Packet / wrapper | Namespace |
| --- | --- |
| `xdp:xdp` | `http://ns.adobe.com/xdp/` |
| `template` | `http://www.xfa.org/schema/xfa-template/3.3/` |
| `config` | `http://www.xfa.org/schema/xci/3.0/` |
| `connectionSet` | `http://www.xfa.org/schema/xfa-connection-set/2.8/` |
| `xfa:datasets` | `http://www.xfa.org/schema/xfa-data/1.0/` |
| `localeSet` | `http://www.xfa.org/schema/xfa-locale-set/2.7/` |
| `x:xmpmeta` | `adobe:ns:meta/` |
| Data description inside datasets | `http://ns.adobe.com/data-description/` |

The sample also contains XLIFF attributes and `xfa`, `formServer`, `templateDesigner`, `acrobat`, and `renderCache.subset` processing instructions. These observations are specific to [that sample](https://raw.githubusercontent.com/SAP-samples/abap-partner-reference-application/main/Tutorials/assets/ZPRA_MF_MUSICFESTIVAL.xdp), not a mandatory packet checklist.

XDP is an extensible container. A packet is a child of the XDP wrapper; application-specific packets are possible. The wrapper's namespace must not leak into otherwise unqualified data. New XML must use the loaded template namespace and preserve its prefix/default-namespace context. A prefixed wrapper is the Adobe convention. [XFA 3.3, chapter 23](https://pdfa.org/norm-refs/XFA-3_3.pdf)

## Representation and binding assumptions

- Plain static text uses `draw/value/text`. A simple bound field uses `field`, `ui/textEdit`, and `bind`; font and paragraph properties are separate children. The SAP examples contain other field widgets and rich content which are outside this editor's visual subset.
- Subforms group content and affect coordinate and binding scope. A positioned child can exist inside a flowed parent. The older [SAP simple-form example](https://help.sap.com/docs/SAP_NETWEAVER_701/6f34c06b6c4b101492ccb6f300848f65/4382538c0c4458bbe10000000a422035-94.html?locale=de-DE&state=PRODUCTION&version=7.01.24) illustrates that structure, with `pageSet/pageArea/contentArea` and A4 `medium` dimensions of 210 × 297 mm.
- Explicit data bindings use `bind match="dataRef"` with a SOM expression in `ref`. `match="none"` disables data binding. A reference's meaning depends on its containing scope: a dotted browser data path is not universally interchangeable with an XFA SOM expression.
- XFA tables use a table subform (`layout="table"`), `columnWidths`, and row subforms (`layout="row"`). An `occur` child controls repetition; `max="-1"` means unbounded. The PoC uses simple header/detail rows, with the detail row bound to the repeating data group and cells bound relative to that row. These semantics come from [XFA 3.3 chapters 4, 8, and 9](https://pdfa.org/norm-refs/XFA-3_3.pdf).

Preserve an existing binding unless the user edits it. For newly created bindings, check the actual exported schema, surrounding subform bindings, and an existing working field in the same scope. Browser sample-data lookup is a convenience and does not implement XFA's full merge algorithm.

## Preservation contract

The source XML and the visual document model are separate. Compatibility Mode is enabled by default. Export applies narrow text patches to the original source instead of regenerating all packets from the visual model. Unknown content outside a changed span retains its source spelling, whitespace, attribute order, entity spelling, and processing instructions. An unchanged document is returned as the original decoded XML string.

This contract is deliberately about XML **source text**, not a promise to round-trip arbitrary file encodings or transport metadata. File import accepts UTF-8 only, rejects conflicting XML encoding declarations and invalid UTF-8, and limits files to 25 MB. Convert a separate copy if your SAP export uses another encoding. DTD/entity declarations are rejected rather than resolved. A browser download is a new file; the application does not overwrite the imported disk file.

Only supported objects are editable. Unsupported XML remains part of the source even if absent from the canvas. Editing a supported property's value may necessarily change that value's escaping or local formatting. Deletion is blocked for imported components containing unknown descendants, metadata, comments, or processing instructions. Complex objects are outside the safe visual-editing subset.

Preserved but not interpreted by the visual model include other packets, metadata, locale and connection definitions, scripts/events, prototypes, fragment references, images, numeric/date widgets, rich text, calculation and validation rules, accessibility details, and advanced pagination. Their presence is not evidence that the preview has evaluated them.

## Current boundary and compatibility risks

The editable target is A4 portrait with simple positioned text/text fields and simple table subforms. Imported tables require one plain-text header row and one repeating text-field detail row; table-level binding scopes and other complex tables remain opaque. Changing the number of columns on an imported table is blocked. Adding components requires a suitable positioned body subform. The model is a single-page approximation; it is not an XFA layout engine.

1. **ADS acceptance remains unconfirmed.** Initial SFP export/import success was reported by the user, but activation and PDF rendering were not confirmed. In each target environment, run the unmodified round-trip test before any mutation, then test one change at a time. Local tests establish preservation and XML structure, not renderer acceptance.
2. **Scope and flow matter.** Nested offsets, content areas, margins, inherited properties, and flowed containers can make imported objects appear differently in the browser. A field under a different binding scope can render blank despite valid XML.
3. **Tables need real data.** A positioned page does not automatically acquire sophisticated overflow/pagination behavior. Test zero, one, several, and page-overflow item counts in ADS. Browser row repetition is not proof of dynamic XFA pagination.
4. **Unsupported content is invisible or approximate.** Existing scripts, captions, formatting pictures, rich text, images, fragment dependencies, master pages, and calculated fields may affect the final PDF. The editor preserves them without rendering or executing them.
5. **Fonts and measurements differ.** Browser font metrics and available fonts can differ from ADS. Clipping, wrapping, line heights, borders, and page breaks can vary.
6. **XML validation has a limited claim.** Well-formedness and application checks do not validate every XFA schema rule, SOM expression, runtime setting, or SAP release requirement. Warnings do not certify compatibility; errors must be fixed before export.
7. **Use the system's original template.** Keep its packet versions, data connections, metadata, and processing instructions. Replacing them with the synthetic template can lose system-specific configuration.

Passing the procedure in [SAP_TEST.md](SAP_TEST.md), with the actual SAP/ADS versions and evidence recorded, is the acceptance criterion for that tested form and change.

## Additional check against the public SAP sample

An independent local check used the downloaded [Music Festival XDP](https://raw.githubusercontent.com/SAP-samples/abap-partner-reference-application/main/Tutorials/assets/ZPRA_MF_MUSICFESTIVAL.xdp) on 7 October 2026. The checked file was **63,167 bytes**, with SHA-256 `49bab68c00b78715247317914180fe90f7338446486fc5871446313898fa364a`.

- Parse → unchanged export returned the exact original decoded source string.
- The reader exposed one supported bound text field, `Title`. Its font size was changed from **14 pt to 15 pt**, then exported and reparsed successfully.
- All five non-template packet slices—`config`, `connectionSet`, `datasets`, `localeSet`, and `xmpmeta`—survived that change exactly. The XML declaration and all 31 processing instructions were unchanged.
- The source string retained in the document model was unchanged by export.

No supported static-text object was available in this particular real sample; its other visual content includes flowed structures, a complex table, and an image. A static-text mutation was therefore tested with the bundled synthetic preservation fixture, not claimed for this public sample. The imported form also uses Letter paper, so the app warned that its A4 guide is approximate while preserving the original page settings.

The public sample and temporary verification script are research material outside the delivered project. The normal automated test suite uses bundled synthetic fixtures and needs no network or external sample file. **This check proves local source preservation and XML reparsing for the described edit. No upload, activation, or SAP ADS rendering was performed.**
