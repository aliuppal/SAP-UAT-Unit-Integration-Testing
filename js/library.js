/* SAP test knowledge base.
 * Every executable step references a TX key, so the same scenario renders as a
 * SAP GUI transaction code or an S/4HANA Public Cloud Fiori app depending on the
 * selected target environment. Fiori app names follow Fiori Apps Library naming;
 * availability depends on release and activated scope items. */

const MODULES = {
  FI: 'Financial Accounting',
  CO: 'Controlling',
  MM: 'Materials Management',
  SD: 'Sales & Distribution',
  PP: 'Production Planning',
  QM: 'Quality Management',
  PM: 'Plant Maintenance',
};

const TX = {
  PR_CREATE:    { gui: 'ME51N',        cloud: 'Manage Purchase Requisitions' },
  PO_CREATE:    { gui: 'ME21N',        cloud: 'Manage Purchase Orders' },
  PO_RELEASE:   { gui: 'ME29N',        cloud: 'My Inbox – Approve Purchase Orders' },
  GR:           { gui: 'MIGO (101)',   cloud: 'Post Goods Receipt for Purchasing Document' },
  IV:           { gui: 'MIRO',         cloud: 'Create Supplier Invoice' },
  IV_RELEASE:   { gui: 'MRBR',         cloud: 'Manage Supplier Invoices' },
  AP_INV:       { gui: 'FB60',         cloud: 'Create Supplier Invoice' },
  PAY_RUN:      { gui: 'F110',         cloud: 'Manage Automatic Payments' },
  VENDOR_ITEMS: { gui: 'FBL1N',        cloud: 'Manage Supplier Line Items' },
  BP:           { gui: 'BP',           cloud: 'Manage Business Partner Master Data' },
  SO_CREATE:    { gui: 'VA01',         cloud: 'Manage Sales Orders' },
  RETURNS:      { gui: 'VA01 (RE)',    cloud: 'Manage Customer Returns' },
  CREDIT:       { gui: 'VKM1',         cloud: 'Manage Documented Credit Decisions' },
  DLV_CREATE:   { gui: 'VL01N',        cloud: 'Create Outbound Deliveries' },
  PICK_PGI:     { gui: 'VL02N',        cloud: 'Manage Outbound Deliveries' },
  BILL:         { gui: 'VF01',         cloud: 'Create Billing Documents' },
  INCOMING_PAY: { gui: 'F-28',         cloud: 'Post Incoming Payments' },
  CUST_ITEMS:   { gui: 'FBL5N',        cloud: 'Manage Customer Line Items' },
  JE_POST:      { gui: 'FB50',         cloud: 'Post General Journal Entries' },
  JE_MANAGE:    { gui: 'FB03 / FB08',  cloud: 'Manage Journal Entries' },
  GL_ITEMS:     { gui: 'FAGLL03',      cloud: 'Display Line Items in General Ledger' },
  TRIAL_BAL:    { gui: 'FAGLB03',      cloud: 'Trial Balance' },
  PERIOD:       { gui: 'OB52',         cloud: 'Manage Posting Periods' },
  ASSET:        { gui: 'AS01',         cloud: 'Manage Fixed Assets' },
  DEPREC:       { gui: 'AFAB',         cloud: 'Schedule Depreciation Posting' },
  COST_CENTER:  { gui: 'KSB1',         cloud: 'Cost Centers – Actuals' },
  INT_ORDER:    { gui: 'KO01 / KO22',  cloud: 'Manage Internal Orders' },
  ALLOC:        { gui: 'KSU5',         cloud: 'Manage Allocations' },
  MRP:          { gui: 'MD01N',        cloud: 'Schedule MRP Runs' },
  PROD_ORDER:   { gui: 'CO01 / CO02',  cloud: 'Manage Production Orders' },
  GOODS_MVT:    { gui: 'MIGO (261)',   cloud: 'Post Goods Movement' },
  GR_ORDER:     { gui: 'MIGO (101)',   cloud: 'Post Goods Movement' },
  CONFIRM:      { gui: 'CO11N',        cloud: 'Confirm Production Operation' },
  INSP_RESULTS: { gui: 'QE51N',        cloud: 'Record Inspection Results' },
  USAGE_DEC:    { gui: 'QA11',         cloud: 'Record Usage Decision' },
  Q_NOTIF:      { gui: 'QM01',         cloud: 'Manage Quality Notifications' },
  SETTLE:       { gui: 'CO88 / KO88',  cloud: 'Run Settlement – Actual' },
  STOCK:        { gui: 'MMBE',         cloud: 'Stock – Single Material' },
  TRANSFER:     { gui: 'MIGO (311)',   cloud: 'Transfer Stock – In-Plant' },
  PI_CREATE:    { gui: 'MI01',         cloud: 'Create Physical Inventory Documents' },
  PI_COUNT:     { gui: 'MI04',         cloud: 'Enter Inventory Count' },
  PI_POST:      { gui: 'MI07',         cloud: 'Post Inventory Differences' },
  PM_NOTIF:     { gui: 'IW21',         cloud: 'Create Maintenance Request' },
  PM_ORDER:     { gui: 'IW31 / IW32',  cloud: 'Manage Maintenance Orders' },
  PM_CONFIRM:   { gui: 'IW41',         cloud: 'Confirm Maintenance Order' },
  PM_PLAN:      { gui: 'IP10',         cloud: 'Schedule Maintenance Plans' },
  LAUNCHPAD:    { gui: 'SU53',         cloud: 'Fiori Launchpad' },
  UNIT_RUN:     { gui: 'SE80 / SE24 – ABAP Unit', cloud: 'ADT – ABAP Unit (ABAP Cloud)' },
  ATC:          { gui: 'ATC / SCI',    cloud: 'ADT – ATC (Cloud readiness)' },
};

/* Integration flows. step = [txKey, module, role, action, expected] */
const FLOWS = {
  P2P: {
    name: 'Procure-to-Pay', span: ['MM', 'FI'],
    steps: [
      ['PR_CREATE', 'MM', 'Requester', 'Create purchase requisition for {material}, qty 100 PC, plant {plant}.', 'Requisition saved; valuation price and account assignment defaulted.'],
      ['PO_CREATE', 'MM', 'Buyer', 'Convert requisition into purchase order for supplier {supplier}, purchasing org {porg}.', 'PO saved; price taken from info record/contract; delivery date copied from requisition.'],
      ['PO_RELEASE', 'MM', 'Purchasing manager', 'Approve the purchase order per release strategy.', 'PO status Released; output to supplier triggered.'],
      ['GR', 'MM', 'Warehouse clerk', 'Post goods receipt (movement type 101) for the full PO quantity.', 'Material document created; stock increased; accounting doc Dr Inventory / Cr GR/IR.'],
      ['IV', 'FI', 'AP accountant', 'Enter supplier invoice referencing the PO; amount = PO price x GR qty, tax code {taxcode}.', '3-way match passes; invoice posted Dr GR/IR / Cr Supplier with tax line.'],
      ['PAY_RUN', 'FI', 'AP accountant', 'Execute automatic payment run for {supplier} due items.', 'Payment document clears the open item; payment medium generated.'],
      ['VENDOR_ITEMS', 'FI', 'AP accountant', 'Display supplier line items and GR/IR account for the PO.', 'Invoice and payment shown as cleared; GR/IR balance for PO is zero.'],
    ],
    variants: [
      { tag: 'boundary', title: 'Invoice price variance above tolerance', at: 4, action: 'Enter invoice with unit price 12% above PO price.', expected: 'Price variance message; invoice posted with payment block (R) and excluded from payment run until released.' },
      { tag: 'boundary', title: 'Invoice price exactly at tolerance limit', at: 4, action: 'Enter invoice with unit price equal to the configured upper tolerance limit.', expected: 'Invoice posts without payment block; variance posted to price difference account.' },
      { tag: 'negative', title: 'Invoice quantity exceeds received quantity', at: 4, action: 'Enter invoice for 120 PC where only 100 PC were received.', expected: 'Quantity variance detected; invoice blocked for payment (Q).' },
      { tag: 'negative', title: 'Goods receipt over-delivery without tolerance', at: 3, action: 'Post goods receipt for 110 PC against a 100 PC PO with no over-delivery tolerance.', expected: 'Error: over-delivery not allowed; no material document created.' },
      { tag: 'negative', title: 'Purchase order for blocked supplier', at: 1, action: 'Create PO for a supplier with purchasing block set.', expected: 'Error: supplier blocked; PO cannot be saved.' },
      { tag: 'approval', title: 'Goods receipt before PO release', at: 3, action: 'Attempt goods receipt on a PO still awaiting release.', expected: 'Error: PO not yet released; goods receipt rejected.' },
      { tag: 'tax', title: 'Invoice with incorrect tax amount', at: 4, action: 'Enter invoice with tax amount deviating from calculated tax.', expected: 'Tax deviation message; posting prevented or difference posted per tolerance settings.' },
      { tag: 'currency', title: 'Foreign-currency PO with exchange-rate difference', at: 4, action: 'PO in {fxcurrency}; post invoice after exchange rate change.', expected: 'GR valuated at GR-date rate; exchange-rate difference posted at invoice.' },
    ],
  },
  O2C: {
    name: 'Order-to-Cash', span: ['SD', 'FI'],
    steps: [
      ['SO_CREATE', 'SD', 'Sales representative', 'Create standard sales order for customer {customer}, sales org {sorg}, material {material}, qty 10.', 'Order saved; pricing and output tax determined; ATP confirms schedule line.'],
      ['DLV_CREATE', 'SD', 'Shipping specialist', 'Create outbound delivery for the sales order.', 'Delivery created with reference to order; picking due date set.'],
      ['PICK_PGI', 'SD', 'Warehouse clerk', 'Complete picking and post goods issue.', 'Material document (601) created; Dr COGS / Cr Inventory posted.'],
      ['BILL', 'SD', 'Billing clerk', 'Create billing document for the delivery.', 'Invoice posted to FI: Dr Customer / Cr Revenue / Cr Output tax.'],
      ['INCOMING_PAY', 'FI', 'AR accountant', 'Post incoming payment and clear the customer invoice.', 'Open item cleared; bank clearing account debited.'],
      ['CUST_ITEMS', 'FI', 'AR accountant', 'Display customer line items.', 'Invoice and payment shown as cleared; balance zero.'],
    ],
    variants: [
      { tag: 'negative', title: 'Credit limit exceeded blocks delivery', at: 0, action: 'Create order whose value exceeds the customer credit limit.', expected: 'Order saved with credit block; delivery cannot be created until credit decision is released.' },
      { tag: 'negative', title: 'Billing block prevents invoicing', at: 3, action: 'Bill a delivery whose order carries a billing block.', expected: 'Billing document not created; entry appears in billing due list log.' },
      { tag: 'negative', title: 'Incomplete pricing on sales order', at: 0, action: 'Create order for material without a price condition record.', expected: 'Order flagged incomplete; delivery/billing blocked by incompletion log.' },
      { tag: 'boundary', title: 'Partial confirmation from ATP', at: 0, action: 'Order quantity exceeds available stock.', expected: 'ATP confirms available quantity; remainder rescheduled to later date.' },
      { tag: 'boundary', title: 'Underpayment within tolerance', at: 4, action: 'Post payment 0.5% below invoice amount (within customer tolerance).', expected: 'Invoice cleared; difference written off automatically to cash discount/difference account.' },
      { tag: 'boundary', title: 'Underpayment outside tolerance', at: 4, action: 'Post payment 10% below invoice amount.', expected: 'Partial/residual item created; invoice not fully cleared.' },
      { tag: 'intercompany', title: 'Intercompany sale and billing', at: 3, action: 'Delivering plant belongs to company code {cocode2}; run intercompany billing.', expected: 'Customer invoice plus intercompany invoice (IV) created; intercompany payable/receivable posted.' },
      { tag: 'tax', title: 'Tax-exempt customer', at: 0, action: 'Create order for customer with tax exemption classification.', expected: 'Output tax determined as zero; exemption reason printed on invoice.' },
      { tag: 'currency', title: 'Sales order in foreign currency', at: 0, action: 'Create order in {fxcurrency}.', expected: 'Revenue converted at billing-date rate; FX difference posted on payment.' },
    ],
  },
  MFG: {
    name: 'Plan-to-Produce', span: ['PP', 'MM', 'QM', 'CO'],
    steps: [
      ['MRP', 'PP', 'Production planner', 'Run MRP for finished good {material}, plant {plant}.', 'Planned orders and purchase requisitions created for net requirements.'],
      ['PROD_ORDER', 'PP', 'Production planner', 'Convert planned order to production order and release it.', 'Order released; components reserved; planned costs calculated.'],
      ['GOODS_MVT', 'MM', 'Warehouse clerk', 'Post goods issue (261) of components to the order.', 'Component stock reduced; order debited with actual material cost.'],
      ['CONFIRM', 'PP', 'Shop-floor supervisor', 'Confirm operations with yield and activity times.', 'Activities posted to order; order status partially/finally confirmed.'],
      ['GR_ORDER', 'MM', 'Warehouse clerk', 'Post goods receipt (101) of finished goods from the order.', 'Stock posted to quality inspection; inspection lot (origin 04) created.'],
      ['INSP_RESULTS', 'QM', 'Quality inspector', 'Record inspection results for all characteristics.', 'Characteristics valuated Accepted; lot ready for usage decision.'],
      ['USAGE_DEC', 'QM', 'Quality manager', 'Record usage decision Accept.', 'Stock transferred from quality inspection to unrestricted use.'],
      ['SETTLE', 'CO', 'Cost accountant', 'Run actual settlement for the production order.', 'Variance settled to price difference; order balance zero.'],
    ],
    variants: [
      { tag: 'negative', title: 'Usage decision Reject', at: 6, action: 'Record usage decision Reject for the inspection lot.', expected: 'Stock posted to blocked stock; quality notification can be created.' },
      { tag: 'negative', title: 'Component shortage at goods issue', at: 2, action: 'Post goods issue when component stock is insufficient.', expected: 'Error: deficit of unrestricted stock; goods issue rejected.' },
      { tag: 'boundary', title: 'Over-confirmation beyond tolerance', at: 3, action: 'Confirm yield 15% above order quantity.', expected: 'Warning/error per over-delivery tolerance; confirmation rejected outside tolerance.' },
      { tag: 'boundary', title: 'Scrap reported at confirmation', at: 3, action: 'Confirm with 5 PC scrap.', expected: 'Scrap recorded; variance shown at settlement.' },
      { tag: 'negative', title: 'Release order with missing master data', at: 1, action: 'Release order for material without valid routing/BOM.', expected: 'Release blocked; missing master data logged.' },
    ],
  },
  INV: {
    name: 'Inventory Management', span: ['MM', 'FI'],
    steps: [
      ['STOCK', 'MM', 'Inventory controller', 'Display stock overview for {material}, plant {plant}.', 'Stock per storage location and stock type displayed.'],
      ['TRANSFER', 'MM', 'Warehouse clerk', 'Post transfer between storage locations (311).', 'Stock moved; no accounting document (same valuation area).'],
      ['PI_CREATE', 'MM', 'Inventory controller', 'Create physical inventory document for the storage location.', 'PI document created; posting block set if configured.'],
      ['PI_COUNT', 'MM', 'Warehouse clerk', 'Enter counted quantity (2 PC less than book).', 'Count recorded; difference calculated.'],
      ['PI_POST', 'MM', 'Inventory controller', 'Post inventory difference.', 'Material document (701/702) and accounting doc to inventory difference account.'],
      ['GL_ITEMS', 'FI', 'GL accountant', 'Display inventory and inventory-difference GL line items.', 'Postings reconcile with material document value.'],
    ],
    variants: [
      { tag: 'boundary', title: 'Difference above posting tolerance', at: 4, action: 'Post difference exceeding the user tolerance group value.', expected: 'Posting rejected; requires user with higher tolerance or recount.' },
      { tag: 'negative', title: 'Transfer creates negative stock', at: 1, action: 'Transfer more than available unrestricted stock.', expected: 'Error: deficit of stock; transfer rejected.' },
      { tag: 'negative', title: 'Posting into closed period', at: 4, action: 'Post difference with posting date in a closed MM/FI period.', expected: 'Error: posting period not open; nothing posted.' },
    ],
  },
  R2R: {
    name: 'Record-to-Report', span: ['FI', 'CO'],
    steps: [
      ['PERIOD', 'FI', 'GL accountant', 'Verify posting period is open for company code {cocode}.', 'Current period open for the required account types.'],
      ['JE_POST', 'FI', 'GL accountant', 'Post accrual journal entry to expense account with cost center {costcenter}.', 'Journal entry posted; CO line item on cost center created.'],
      ['COST_CENTER', 'CO', 'Cost accountant', 'Review cost center actuals.', 'Accrual visible on cost center with correct cost element.'],
      ['ALLOC', 'CO', 'Cost accountant', 'Run assessment/distribution cycle for the period.', 'Costs allocated to receivers per rule; sender credited.'],
      ['DEPREC', 'FI', 'Asset accountant', 'Run depreciation posting for the period.', 'Depreciation posted per asset class; no errors in log.'],
      ['TRIAL_BAL', 'FI', 'Controller', 'Run trial balance for the period.', 'Debits equal credits; balances match expected values.'],
    ],
    variants: [
      { tag: 'negative', title: 'Posting into closed period', at: 1, action: 'Post journal entry with posting date in a closed period.', expected: 'Error: posting period not open.' },
      { tag: 'negative', title: 'P&L posting without cost object', at: 1, action: 'Post to expense account without cost center.', expected: 'Error: account requires an assignment to a CO object.' },
      { tag: 'approval', title: 'Journal entry above approval threshold', at: 1, action: 'Post journal entry above the verification threshold.', expected: 'Entry parked/submitted for verification; posts only after approval.' },
      { tag: 'currency', title: 'Foreign-currency revaluation', at: 5, action: 'Run FX revaluation of open items in {fxcurrency}.', expected: 'Unrealized gains/losses posted and reversed next period.' },
      { tag: 'intercompany', title: 'Cross-company journal entry', at: 1, action: 'Post entry between company codes {cocode} and {cocode2}.', expected: 'Intercompany clearing lines generated automatically in both company codes.' },
    ],
  },
  MAINT: {
    name: 'Maintenance Execution', span: ['PM', 'MM', 'CO'],
    steps: [
      ['PM_NOTIF', 'PM', 'Maintenance requester', 'Create maintenance notification for equipment {equipment}.', 'Notification created with malfunction data.'],
      ['PM_ORDER', 'PM', 'Maintenance planner', 'Create order from notification; plan operations and spare parts; release.', 'Order released; reservations created; planned costs calculated.'],
      ['GOODS_MVT', 'MM', 'Warehouse clerk', 'Issue spare parts to the order (261).', 'Stock reduced; order debited with material cost.'],
      ['PM_CONFIRM', 'PM', 'Technician', 'Confirm labor time for operations.', 'Actual activity costs posted to order.'],
      ['PM_ORDER', 'PM', 'Maintenance planner', 'Set order to technically complete.', 'Status TECO; open reservations closed.'],
      ['SETTLE', 'CO', 'Cost accountant', 'Settle order to cost center {costcenter}.', 'Order balance zero; cost center debited.'],
    ],
    variants: [
      { tag: 'negative', title: 'Confirmation on unreleased order', at: 3, action: 'Confirm time on an order that is not released.', expected: 'Error: order not released; confirmation rejected.' },
      { tag: 'boundary', title: 'Order exceeds budget', at: 1, action: 'Plan costs above the order budget.', expected: 'Availability control warning/error per tolerance.' },
      { tag: 'negative', title: 'Spare part out of stock', at: 2, action: 'Issue a spare part with zero stock.', expected: 'Goods issue rejected; purchase requisition exists for non-stock demand.' },
    ],
  },
};

/* Cross-flow authorization (SoD) variant, generated when guidance asks for it. */
const GENERIC_VARIANTS = [
  { tag: 'auth', expected: { gui: 'Authorization error; SU53 shows the missing authorization object; no document created.', cloud: 'App not visible in the launchpad or action rejected; business role/catalog not assigned; no document created.' } },
];

/* UAT catalog per module. steps: [txKey, action, expected] */
const UAT = {
  FI: [
    { title: 'Post supplier invoice without PO', role: 'AP accountant', steps: [['AP_INV', 'Enter non-PO invoice for {supplier}, expense account and cost center {costcenter}, tax code {taxcode}.', 'Invoice posted; tax calculated; due date per payment terms.'], ['VENDOR_ITEMS', 'Display supplier open items.', 'Invoice listed as open with correct due date.']], acceptance: 'Invoice posted with correct tax and due date.' },
    { title: 'Post and reverse manual journal entry', role: 'GL accountant', steps: [['JE_POST', 'Post journal entry with attachment.', 'Entry posted; attachment stored.'], ['JE_MANAGE', 'Reverse the entry with reason 01.', 'Reversal document posted and linked.']], acceptance: 'Original and reversal net to zero; audit trail shows both.' },
    { title: 'Customer partial payment', role: 'AR accountant', steps: [['INCOMING_PAY', 'Post partial payment against customer invoice.', 'Residual item created for remaining amount.'], ['CUST_ITEMS', 'Display customer items.', 'Residual open; original cleared.']], acceptance: 'Customer balance equals unpaid amount.' },
    { title: 'Asset acquisition and depreciation', role: 'Asset accountant', steps: [['ASSET', 'Create asset and post acquisition.', 'Asset capitalized with capitalization date.'], ['DEPREC', 'Run depreciation for the period.', 'Depreciation posted for the new asset.']], acceptance: 'Net book value matches depreciation schedule.' },
    { title: 'Posting into closed period is rejected', role: 'GL accountant', tag: 'negative', steps: [['JE_POST', 'Post entry dated in a closed period.', 'Error: posting period not open.']], acceptance: 'No document created.' },
  ],
  CO: [
    { title: 'Cost center actuals review', role: 'Cost center manager', steps: [['COST_CENTER', 'Run actuals for cost center {costcenter}, current period.', 'All period postings listed with cost elements.']], acceptance: 'Totals reconcile with GL expense postings.' },
    { title: 'Internal order budget control', role: 'Controller', steps: [['INT_ORDER', 'Create internal order and assign budget.', 'Budget active; availability control on.'], ['JE_POST', 'Post cost to the order within budget.', 'Posting accepted.']], acceptance: 'Consumed budget updates correctly.' },
    { title: 'Posting exceeds internal order budget', role: 'Controller', tag: 'boundary', steps: [['JE_POST', 'Post cost exceeding remaining budget.', 'Availability control error; posting blocked.']], acceptance: 'Budget not exceeded.' },
  ],
  MM: [
    { title: 'Create and approve purchase order', role: 'Buyer', steps: [['PO_CREATE', 'Create PO for {supplier}, material {material}, plant {plant}.', 'PO saved with correct price and delivery date.'], ['PO_RELEASE', 'Approve PO.', 'Status released; output sent.']], acceptance: 'Released PO with correct supplier, price and quantity.' },
    { title: 'Partial goods receipt', role: 'Warehouse clerk', steps: [['GR', 'Receive 60 of 100 PC.', 'Material document created; PO history shows partial receipt.'], ['STOCK', 'Check stock.', 'Stock increased by 60 PC.']], acceptance: 'Open PO quantity is 40 PC.' },
    { title: 'Storage location transfer', role: 'Warehouse clerk', steps: [['TRANSFER', 'Transfer 10 PC between storage locations.', 'Material document created.'], ['STOCK', 'Check stock per storage location.', 'Quantities reflect transfer.']], acceptance: 'Total plant stock unchanged.' },
    { title: 'Goods receipt over-delivery rejected', role: 'Warehouse clerk', tag: 'negative', steps: [['GR', 'Receive 120 PC against 100 PC PO without tolerance.', 'Error: over-delivery not allowed.']], acceptance: 'No material document created.' },
  ],
  SD: [
    { title: 'Create sales order with pricing', role: 'Sales representative', steps: [['SO_CREATE', 'Create order for {customer}, material {material}, qty 10.', 'Price, discount and tax determined; schedule line confirmed.']], acceptance: 'Net value and tax match the price list.' },
    { title: 'Release credit-blocked order', role: 'Credit controller', steps: [['SO_CREATE', 'Create order exceeding credit limit.', 'Order saved with credit block.'], ['CREDIT', 'Release the credit block.', 'Order released; delivery possible.']], acceptance: 'Delivery can be created after release.' },
    { title: 'Customer return with credit memo', role: 'Customer service', steps: [['RETURNS', 'Create return order referencing invoice.', 'Return order created with reference.'], ['BILL', 'Create credit memo.', 'Credit memo posted to customer account.']], acceptance: 'Customer balance reduced by returned value.' },
    { title: 'Order for blocked customer', role: 'Sales representative', tag: 'negative', steps: [['SO_CREATE', 'Create order for customer with order block.', 'Error/warning: customer blocked for sales.']], acceptance: 'No order saved.' },
  ],
  PP: [
    { title: 'Production order lifecycle', role: 'Production planner', steps: [['PROD_ORDER', 'Create and release production order.', 'Order released.'], ['CONFIRM', 'Final confirmation.', 'Status CNF.'], ['GR_ORDER', 'Receive finished goods.', 'Stock posted.']], acceptance: 'Order delivered and confirmed.' },
    { title: 'MRP run for single material', role: 'Production planner', steps: [['MRP', 'Run MRP for {material}.', 'Planned orders created for shortages.']], acceptance: 'Coverage meets demand dates.' },
    { title: 'Release with missing component', role: 'Production planner', tag: 'negative', steps: [['PROD_ORDER', 'Release order with missing component availability.', 'Missing parts warning/log shown.']], acceptance: 'Planner informed before release.' },
  ],
  QM: [
    { title: 'Inspection results and usage decision', role: 'Quality inspector', steps: [['INSP_RESULTS', 'Record results for inspection lot.', 'Characteristics valuated.'], ['USAGE_DEC', 'Accept the lot.', 'Stock moved to unrestricted.']], acceptance: 'Stock usable after acceptance.' },
    { title: 'Quality notification for defect', role: 'Quality manager', steps: [['Q_NOTIF', 'Create quality notification for supplier defect.', 'Notification created with defect codes.']], acceptance: 'Notification linked to material and supplier.' },
    { title: 'Rejected inspection lot', role: 'Quality manager', tag: 'negative', steps: [['USAGE_DEC', 'Reject the lot.', 'Stock posted to blocked.']], acceptance: 'Rejected stock cannot be issued.' },
  ],
  PM: [
    { title: 'Breakdown maintenance', role: 'Technician', steps: [['PM_NOTIF', 'Report breakdown for {equipment}.', 'Notification created.'], ['PM_ORDER', 'Create and release order.', 'Order released.'], ['PM_CONFIRM', 'Confirm work.', 'Hours recorded.']], acceptance: 'Order costs reflect labor and parts.' },
    { title: 'Preventive maintenance plan scheduling', role: 'Maintenance planner', steps: [['PM_PLAN', 'Schedule maintenance plan.', 'Call objects (orders) generated per cycle.']], acceptance: 'Orders created on planned dates.' },
  ],
};

/* Unit test catalog per module. object = {gui, cloud} test target. */
const UNIT = {
  FI: [
    { title: 'Journal entry validation requires cost center on P&L accounts', object: { gui: 'Validation exit / BAdI implementation ZCL_FI_JE_VALIDATION', cloud: 'Custom logic for journal entry validation (key-user extensibility)' }, given: 'Journal entry line on expense account without cost center', when: 'Validation method executed', then: 'Error message returned; posting prevented' },
    { title: 'Tax amount calculation rounding', object: { gui: 'ZCL_FI_TAX_CALC=>CALCULATE', cloud: 'ZCL_FI_TAX_CALC (ABAP Cloud class)' }, given: 'Net 100.005 at 19% rate', when: 'calculate( ) called', then: 'Tax = 19.00 with commercial rounding', tag: 'boundary' },
    { title: 'Due date derivation from payment terms', object: { gui: 'ZCL_FI_DUE_DATE', cloud: 'ZCL_FI_DUE_DATE (ABAP Cloud class)' }, given: 'Baseline date 2026-01-31, terms Net 30', when: 'derive_due_date( )', then: 'Due date 2026-03-02' },
    { title: 'Rejects posting with zero amount', object: { gui: 'ZCL_FI_JE_VALIDATION', cloud: 'Custom logic for journal entry validation' }, given: 'Line item with amount 0', when: 'Validation executed', then: 'Error raised', tag: 'negative' },
  ],
  CO: [
    { title: 'Allocation percentage split', object: { gui: 'ZCL_CO_ALLOC_RULE', cloud: 'ZCL_CO_ALLOC_RULE (ABAP Cloud class)' }, given: '1000.00 split 33/33/34', when: 'distribute( )', then: 'Receivers 330/330/340, total 1000.00' },
    { title: 'Rounding remainder assigned to last receiver', object: { gui: 'ZCL_CO_ALLOC_RULE', cloud: 'ZCL_CO_ALLOC_RULE' }, given: '100.00 split three ways equally', when: 'distribute( )', then: '33.33/33.33/33.34', tag: 'boundary' },
  ],
  MM: [
    { title: 'PO custom check blocks missing account assignment', object: { gui: 'BAdI ME_PROCESS_PO_CUST – CHECK', cloud: 'Custom logic: purchase order check' }, given: 'PO item with account assignment K but no cost center', when: 'Check executed', then: 'Error message; PO not saved', tag: 'negative' },
    { title: 'Price tolerance calculation', object: { gui: 'ZCL_MM_TOLERANCE', cloud: 'ZCL_MM_TOLERANCE (ABAP Cloud class)' }, given: 'PO price 10.00, invoice 10.50, tolerance 5%', when: 'is_within_tolerance( )', then: 'Returns true (exactly at limit)', tag: 'boundary' },
    { title: 'CDS view returns open PO quantity', object: { gui: 'ZI_OPEN_PO_QTY with CL_CDS_TEST_ENVIRONMENT', cloud: 'ZI_OPEN_PO_QTY with CL_CDS_TEST_ENVIRONMENT' }, given: 'Test double: PO 100 PC, GR 60 PC', when: 'SELECT from view', then: 'Open quantity 40 PC' },
  ],
  SD: [
    { title: 'Sales order save check for customer reference', object: { gui: 'User exit MV45AFZZ USEREXIT_SAVE_DOCUMENT_PREPARE', cloud: 'Custom logic: sales document check before save' }, given: 'Order without customer reference', when: 'Save check executed', then: 'Error message; order not saved', tag: 'negative' },
    { title: 'Credit exposure calculation', object: { gui: 'ZCL_SD_CREDIT_EXPOSURE', cloud: 'ZCL_SD_CREDIT_EXPOSURE (ABAP Cloud class)' }, given: 'Open orders 5,000 + open items 3,000', when: 'get_exposure( )', then: 'Exposure 8,000' },
    { title: 'Custom pricing derivation', object: { gui: 'Pricing routine / ZCL_SD_PRICE_DERIV', cloud: 'Custom field derivation (custom logic)' }, given: 'Customer group 02', when: 'derive( )', then: 'Discount condition 5% applied' },
  ],
  PP: [
    { title: 'Scrap quantity calculation', object: { gui: 'ZCL_PP_SCRAP', cloud: 'ZCL_PP_SCRAP (ABAP Cloud class)' }, given: 'Order qty 100, assembly scrap 2%', when: 'calc_gross_qty( )', then: 'Gross 102 PC' },
    { title: 'Lot size rounding', object: { gui: 'ZCL_PP_LOTSIZE', cloud: 'ZCL_PP_LOTSIZE' }, given: 'Requirement 101, rounding value 50', when: 'round( )', then: 'Lot size 150', tag: 'boundary' },
  ],
  QM: [
    { title: 'Characteristic valuation at upper limit', object: { gui: 'ZCL_QM_VALUATION', cloud: 'ZCL_QM_VALUATION (ABAP Cloud class)' }, given: 'Value 10.0, limits 9.5–10.0', when: 'valuate( )', then: 'Accepted (upper limit inclusive)', tag: 'boundary' },
    { title: 'Reject value outside limit', object: { gui: 'ZCL_QM_VALUATION', cloud: 'ZCL_QM_VALUATION' }, given: 'Value 10.01, limits 9.5–10.0', when: 'valuate( )', then: 'Rejected', tag: 'negative' },
  ],
  PM: [
    { title: 'Next maintenance date calculation', object: { gui: 'ZCL_PM_SCHEDULE', cloud: 'ZCL_PM_SCHEDULE (ABAP Cloud class)' }, given: 'Last 2026-01-15, cycle 90 days', when: 'next_date( )', then: '2026-04-15' },
  ],
};

/* Cloud-only clean-core check added to every unit-test batch for Public Cloud. */
const CLOUD_UNIT_EXTRA = { title: 'Clean-core compliance: only released APIs used', object: { cloud: 'ATC check variant ABAP_CLOUD_DEVELOPMENT_DEFAULT' }, given: 'Custom package with extensions', when: 'ATC run', then: 'No findings for unreleased objects' };

const DEFAULT_DATA = {
  cloud: { cocode: '1010', cocode2: '1710', plant: '1010', porg: '1010', sorg: '1010' },
  gui:   { cocode: '1000', cocode2: '2000', plant: '1000', porg: '1000', sorg: '1000' },
};
