# TestOrbit for SAP

Generate SAP test scenarios and hand them to business testers as Excel workbooks.

- **Test types:** User Acceptance (UAT), cross-module Integration, and ABAP Unit tests.
- **Target environment toggle:** *SAP S/4HANA Public Cloud* steps use Fiori app names, clean-core and ABAP Cloud. *SAP GUI* steps use transaction codes (ECC / S/4HANA on-premise).
- **Guidance text box:** describe business rules, org units, master data, T-codes and edge cases. The app picks up the following and applies them to the scenarios:
  - negative cases
  - tolerance/boundary checks
  - tax
  - foreign currency
  - intercompany
  - authorization/SoD
  - approval
  - company code, plant, supplier, customer, material, cost center, tax code and currency values
- **Integration flows:** Procure-to-Pay (MM→FI), Order-to-Cash (SD→FI), Plan-to-Produce (PP→MM→QM→CO), Inventory (MM→FI), Record-to-Report (FI→CO), Maintenance (PM→MM→CO). Each flow comes with positive end-to-end and deviation cases.
- **Excel:** a styled `.xlsx` workbook with four sheets: Cover with sign-off, Scenarios, Test Steps with Actual Result / Pass-Fail columns, and Defects. There's also a blank UAT template. Importing a filled workbook merges statuses, step results, testers and defect IDs by Scenario ID.
- **AI mode (optional):** generates scenarios with OpenRouter **free** models only (`:free` ids). The API key is stored in the browser.
- **Storage:** scenarios are saved to Postgres (e.g. Neon) through the bundled server. When no database is configured, they stay in the browser.

## Run

```bash
npm install
cp .env.example .env   # set DATABASE_URL
npm start              # http://localhost:5180
```

Tables are created automatically on first start.

You can also open `index.html` directly from disk. That works without a server, and data is then stored in the browser only.

## Notes

- Fiori app names follow the SAP Fiori Apps Library. Confirm availability against your release and activated scope items.
- The API has no authentication. Run it locally or behind your own access control before exposing it publicly.
