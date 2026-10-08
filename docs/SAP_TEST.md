# Manual SAP validation

The application has no SAP connection. This procedure must be run in your SAP environment. On 8 October 2026, the project owner reported successful initial layout export/import through SFP. That report does not establish completion of the detailed acceptance cases below; activation and ADS PDF rendering remain unconfirmed. Start with a known-good form from your environment, not the synthetic New Form template.

The first acceptance test is an unchanged XDP round-trip, followed by one static-text change. Do not combine the field and table experiments with that first change: separate files make any regression attributable.

## Preparation

1. Use a development or test client and a disposable copy of an existing simple Adobe Form. Keep its existing interface and context. Choose an A4 portrait form with a positioned body, a plain static text, and a known working test invocation.
2. Open transaction `SFP`, select that form, and run its existing test or business test harness **before editing**. Save the resulting PDF and the exact input data. If the baseline fails, resolve that problem first.
3. Record the form name, SAP release, available ADS version, test client, language/locale, test harness, and input identifier. Preserve the original layout and record a version or backup from which you can restore it.
4. Use your system's **layout download** action to save the form's `.xdp` as `baseline.xdp`. It is commonly exposed from the SFP Utilities menu within upload/download operations; exact menu labels, nesting, and availability vary by release and GUI language. Confirm that the downloaded file is an XDP layout whose root is an XDP wrapper, not a whole-form object export.
5. Use the corresponding **schema/data-schema download** action, if offered, to save the `.xsd` for this exact form/context. Obtain the schema through your existing supported form-maintenance workflow if that action is unavailable. Do not substitute an unrelated sample schema.
6. Start the local app using the README instructions. Use UTF-8 files: the app rejects other encoding declarations and invalid UTF-8. If conversion is necessary, keep the untouched original, convert a separate copy, and establish that converted copy as the comparison baseline. Keep `baseline.xdp` and the schema outside the download destination used for edited copies.

SAP distinguishes XDP layouts from XSD data schemas. For example, the official [Editing Forms documentation for ADT](https://help.sap.com/docs/abap-cloud/abap-development-tools-user-guide/editing-forms?locale=en-U) documents separate schema download and layout upload/download actions, followed by save and activation. That page describes ADT, so its exact menu labels are **not** asserted to be SFP labels. SAP's [SFP example for setting up PDF forms](https://help.sap.com/docs/SAP_ERP/f6ba5e8930d44ae4b18790c72e11a8ae/7785d44b0c984d428a2890141fc13191.html) instead demonstrates a whole-form XML object upload; that is a different artifact from the XDP layout being tested here.

## Test 0: unchanged round-trip

1. In the app, use **Open XDP** to import `baseline.xdp`.
2. Leave Compatibility Mode enabled. Read any import warnings. Unsupported visual elements may be absent from the canvas while their XML remains preserved.
3. Make no edits. Choose **Export XDP** and save as `roundtrip-unchanged.xdp`.
4. Compare the XML text against `baseline.xdp` using your diff tool. No XML content changes are expected for the no-op export. Account separately for any input byte-order mark/encoding difference; this PoC expects UTF-8 source files.
5. In SFP, open the disposable form in change mode and use the **layout upload** action for `roundtrip-unchanged.xdp`. Choose the action that accepts an XDP, not whole-form or interface import. Save and activate the form.
6. Execute the same test with the same data, locale, and output settings. Save the resulting PDF.
7. Pass only if activation succeeds, ADS produces a PDF, the values and layout match the baseline, and no new rendering error is reported. Binary equality of PDFs is not required because timestamps or document metadata may differ.

If this fails, stop the mutation tests. Restore the baseline layout, retain the files and diagnostic message, and compare the XML before proceeding.

## Test 1: change one plain static text

1. Reopen `baseline.xdp` in the app. Open its schema with **Open XSD**.
2. Select a supported static text object. Choose a short text in a free area and change it to a unique marker such as `External editor test 01`. Keep its dimensions and all other properties unchanged.
3. Export as `test-01-text.xdp`. Review warnings. Compare it with the baseline: the intended text change should be the only meaningful change; unrelated packets and processing instructions must still exist.
4. Upload that XDP as the layout of the disposable SFP form, save, and activate.
5. Execute the same baseline test and save the PDF as evidence.
6. Pass only if ADS generates the PDF, the marker appears at the expected location, and all baseline fields and other content still render correctly.

Record any warning even if PDF generation succeeds. This is the first substantive proof that your known-good SAP layout survives an external modification.

## Test 2: add one bound text field

1. Reopen `baseline.xdp` and the matching `.xsd` in the app.
2. Choose a simple scalar that exists in the SAP form context and has a known nonempty value in your baseline test data. Prefer a field already bound successfully elsewhere in the form.
3. Drag that scalar from the data tree onto unused canvas space, or click the toolbar's **Field** button (tooltip: Add bound field) and select its binding. Give the field a distinct valid name. Set readable dimensions and keep it within the page.
4. Inspect the binding in Properties. Compare the path with a working field in the same subform scope. Do not assume `HEADER.VBELN` matches every SAP context; the actual root and structure names come from your export.
5. Optionally choose **Load sample data** from Project options (the three-dot menu), import matching JSON/simple XML, and open **Browser Preview**. This checks convenience rendering only; it does not test ADS or change SAP runtime data.
6. Export as `test-02-field.xdp`, upload as the disposable form's layout, save, and activate.
7. Execute with the baseline data and save the PDF.
8. Pass only if the new field displays the expected runtime value and all existing content remains correct. A visible but blank field is a failed binding test, even if activation and PDF creation succeed.

## Test 3: simple repeating item table

1. Reopen `baseline.xdp` and its matching schema. Select a repeating structure present in the actual form context; confirm the item fields and parent wrappers in the schema.
2. Drag the repeating node onto an unused area, or use the toolbar's **Table** button (tooltip: Add repeating table) and choose the binding in Properties. Use a small number of scalar columns first. Choose short headers, set column widths that fit the available area, and set alignment/borders as needed.
3. Inspect the table's repeating binding and each column binding. Confirm that detail-cell paths are relative to the intended repeated item and that wrapper structures have not been omitted.
4. Export as `test-03-table.xdp`. Upload the layout into the disposable SFP form, save, and activate.
5. Run controlled test data with **zero**, **one**, and **three** items. Confirm the header, detail-row count, order, values, widths, and borders in each ADS PDF. Reuse the existing interface and test harness; do not modify them to mask a binding failure.
6. Run enough items to cross a page boundary. Inspect clipping, overlaps, missing rows, repeated headers, and footer placement. Advanced overflow and header repetition are outside this PoC's guarantees, so record the actual result as a limitation even if the short table succeeds.
7. Pass the simple-table test only when the intended small item counts render correctly without disturbing existing content. Record the separate long-table result rather than calling all pagination supported.

## Evidence and failure diagnosis

Keep a result row for each test:

| Test | Exported XDP | Activation | ADS PDF created | Content verified | Notes / trace |
| --- | --- | --- | --- | --- | --- |
| Baseline | `baseline.xdp` | Not run | Not run | Not run | |
| No-op | `roundtrip-unchanged.xdp` | Not run | Not run | Not run | |
| Static text | `test-01-text.xdp` | Not run | Not run | Not run | |
| Bound field | `test-02-field.xdp` | Not run | Not run | Not run | |
| Table, 0/1/3 items | `test-03-table.xdp` | Not run | Not run | Not run | |
| Table, overflow | `test-03-table.xdp` | Not run | Not run | Not run | |

On failure, save the baseline/export pair, screenshot or exact SAP message, and the test input. First restore and rerun the baseline to distinguish an edit problem from an environment problem. Check source-diff scope, namespace validity, binding scope, retained packets, fonts, and the supported layout boundary.

Use your system's existing ADS diagnostic workflow. SAP documents that a rendering-error PDF can include artifacts such as `Error.pdf`, `Data.xml`, the form XDP, and `trace.txt`; available diagnostics depend on the system and configuration. See [SAP: Adobe Rendering Error](https://help.sap.com/docs/SAP_NETWEAVER_750/d2e18615eb27460d9c0b6533aa01d8a0/a64fbf6c5f644561a080e29070db9e97.html?locale=en-US&state=PRODUCTION&version=7.5.29). Keep business data private when sharing an issue; a minimal reproduction is usually more useful.

When finished, restore or discard the disposable test form according to your normal development workflow. A successful run establishes compatibility for the tested layout, edits, data, and runtime versions; it is not a certification of arbitrary XDPs.
