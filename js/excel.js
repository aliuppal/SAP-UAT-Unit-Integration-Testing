/* Excel workbook export / template / import (xlsx-js-style, global XLSX). */

const XL = {
  navy: '0F172A', border: 'CBD5E1', text: '0F172A', muted: '64748B',
  pass: 'DCFCE7', fail: 'FEE2E2', warn: 'FEF3C7', run: 'E0F2FE',
};

const SCEN_COLS = [
  ['Scenario ID', 16], ['Test Type', 12], ['Target Environment', 20], ['Modules', 12], ['Business Process', 22],
  ['Scenario Title', 40], ['Objective', 50], ['Polarity', 11], ['Priority', 10], ['Preconditions', 40],
  ['Test Data', 44], ['Expected Result', 50], ['Status', 14], ['Tester', 16], ['Execution Date', 14],
  ['Defect ID', 12], ['Comments', 36], ['Source', 16],
];
const STEP_COLS = [
  ['Scenario ID', 16], ['Step', 7], ['T-Code / Fiori App', 30], ['Module', 9], ['Role', 20],
  ['Action', 60], ['Expected Result', 55], ['Actual Result', 40], ['Step Result', 12], ['Tester', 16], ['Date', 12], ['Evidence / Screenshot Ref', 26],
];
const DEFECT_COLS = [
  ['Defect ID', 12], ['Scenario ID', 16], ['Step', 7], ['Severity', 11], ['Summary', 44], ['SAP Message / Error', 40],
  ['Status', 12], ['Owner', 16], ['Raised On', 12], ['Resolution', 36],
];

const ENV_NAME = { cloud: 'SAP S/4HANA Public Cloud', gui: 'SAP GUI' };
const xlBorder = { style: 'thin', color: { rgb: XL.border } };
const allBorders = { top: xlBorder, bottom: xlBorder, left: xlBorder, right: xlBorder };

function headerStyle() {
  return { font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10, name: 'Calibri' }, fill: { fgColor: { rgb: XL.navy } }, alignment: { vertical: 'center', wrapText: true }, border: allBorders };
}
function cellStyle(fillRgb) {
  const s = { font: { sz: 10, name: 'Calibri', color: { rgb: XL.text } }, alignment: { vertical: 'top', wrapText: true }, border: allBorders };
  if (fillRgb) s.fill = { fgColor: { rgb: fillRgb } };
  return s;
}
function statusFill(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'passed' || s === 'pass') return XL.pass;
  if (s === 'failed' || s === 'fail') return XL.fail;
  if (s === 'blocked') return XL.warn;
  if (s === 'in progress' || s === 'ready for uat') return XL.run;
  return null;
}

function buildSheet(cols, rows, statusColIdx) {
  const ws = {};
  cols.forEach((c, ci) => { ws[XLSX.utils.encode_cell({ r: 0, c: ci })] = { v: c[0], t: 's', s: headerStyle() }; });
  rows.forEach((row, ri) => {
    row.forEach((val, ci) => {
      const fillRgb = statusColIdx != null && ci === statusColIdx ? statusFill(val) : null;
      ws[XLSX.utils.encode_cell({ r: ri + 1, c: ci })] = { v: val == null ? '' : val, t: typeof val === 'number' ? 'n' : 's', s: cellStyle(fillRgb) };
    });
  });
  const ref = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(rows.length, 1), c: cols.length - 1 } });
  ws['!ref'] = ref;
  ws['!cols'] = cols.map(c => ({ wch: c[1] }));
  ws['!rows'] = [{ hpt: 28 }];
  ws['!autofilter'] = { ref };
  return ws;
}

function coverSheet(project, scenarios, guidance) {
  const count = t => scenarios.filter(s => s.type === t).length;
  const envs = [...new Set(scenarios.map(s => ENV_NAME[s.env]))].join(', ') || '—';
  const rows = [
    ['SAP Test Scenario Workbook'],
    [],
    ['Project', project.name || ''],
    ['Release / Wave', project.release || ''],
    ['Target environment(s)', envs],
    ['Generated on', new Date().toISOString().slice(0, 10)],
    ['UAT scenarios', count('UAT')],
    ['Integration scenarios', count('Integration')],
    ['Unit test cases', count('Unit')],
    ['Guidance used', guidance || '—'],
    [],
    ['How to use'],
    ['1. Execute each scenario on the "Test Steps" sheet and fill Actual Result, Step Result, Tester and Date.'],
    ['2. Allowed Step Result values: Not Run, Pass, Fail, Blocked.'],
    ['3. Scenario Status values on "Scenarios": Draft, Ready for UAT, In Progress, Passed, Failed, Blocked.'],
    ['4. Log failures on the "Defects" sheet and put the Defect ID on the scenario row.'],
    ['5. Re-import this file in TestOrbit (Excel Hub → Import results) to update the scenario matrix.'],
    [],
    ['Sign-off', 'Name', 'Role', 'Date', 'Signature'],
    ['Business process owner', '', '', '', ''],
    ['QA / Test lead', '', '', '', ''],
    ['Project manager', '', '', '', ''],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws.A1.s = { font: { bold: true, sz: 16, color: { rgb: XL.navy } } };
  for (let r = 3; r <= 10; r++) {
    if (ws['A' + r]) ws['A' + r].s = { font: { bold: true, color: { rgb: XL.muted } } };
    if (ws['B' + r]) ws['B' + r].s = { alignment: { wrapText: true, vertical: 'top' } };
  }
  ws.A12.s = { font: { bold: true, sz: 12, color: { rgb: XL.navy } } };
  ['A', 'B', 'C', 'D', 'E'].forEach(c => { ws[c + '19'].s = headerStyle(); });
  for (let r = 20; r <= 22; r++) ['A', 'B', 'C', 'D', 'E'].forEach(c => { ws[c + r].s = cellStyle(); });
  ws['!cols'] = [{ wch: 26 }, { wch: 60 }, { wch: 20 }, { wch: 14 }, { wch: 22 }];
  ws['!rows'] = Array.from({ length: 22 }, (_, i) => (i >= 19 ? { hpt: 26 } : i === 9 ? { hpt: 60 } : {}));
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 4 } }];
  return ws;
}

function scenarioRow(s) {
  return [s.id, s.type, ENV_NAME[s.env] || s.env, (s.modules || []).join(' → '), s.process, s.title, s.objective, s.polarity, s.priority,
    s.preconditions, s.testData, s.expected, s.status, s.tester, s.execDate || '', s.defect, [s.comments, s.notes].filter(Boolean).join(' | '), s.source];
}

function buildWorkbook(scenarios, project, guidance) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, coverSheet(project, scenarios, guidance), 'Cover');
  XLSX.utils.book_append_sheet(wb, buildSheet(SCEN_COLS, scenarios.map(scenarioRow), 12), 'Scenarios');
  const stepRows = [];
  scenarios.forEach(s => (s.steps || []).forEach(st => stepRows.push([s.id, st.seq, st.tcode, st.module, st.role, st.action, st.expected, st.actual || '', st.result || 'Not Run', st.tester || '', st.date || '', st.evidence || ''])));
  XLSX.utils.book_append_sheet(wb, buildSheet(STEP_COLS, stepRows, 8), 'Test Steps');
  const defectRows = scenarios.filter(s => s.status === 'Failed' || s.defect).map(s => {
    const failed = (s.steps || []).find(st => st.result === 'Fail');
    return [s.defect || '', s.id, failed ? failed.seq : '', 'Medium', s.title, failed ? failed.actual || '' : '', 'Open', '', '', ''];
  });
  XLSX.utils.book_append_sheet(wb, buildSheet(DEFECT_COLS, defectRows, null), 'Defects');
  return wb;
}

function exportWorkbook(scenarios, project, guidance) {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
  const name = `SAP_Test_Scenarios_${(project.release || 'export').replace(/\W+/g, '_')}_${stamp}.xlsx`;
  XLSX.writeFile(buildWorkbook(scenarios, project, guidance), name);
  return name;
}

function exportTemplate(project) {
  const name = 'SAP_UAT_Template.xlsx';
  XLSX.writeFile(buildWorkbook([], project, ''), name);
  return name;
}

/* Merge an exported/filled workbook back into the scenario list (mutates it).
 * Known IDs are updated; unknown IDs are added as new scenarios. */
function importWorkbook(arrayBuffer, scenarios) {
  const wb = XLSX.read(arrayBuffer, { type: 'array' });
  const scenSheet = wb.Sheets['Scenarios'];
  const stepSheet = wb.Sheets['Test Steps'];
  if (!scenSheet && !stepSheet) throw new Error('No "Scenarios" or "Test Steps" sheet found. Use a workbook exported from TestOrbit or the UAT template.');
  const byId = new Map(scenarios.map(s => [s.id, s]));
  const res = { updated: 0, created: 0, steps: 0 };
  const created = new Set();

  if (scenSheet) {
    for (const r of XLSX.utils.sheet_to_json(scenSheet, { defval: '' })) {
      const id = String(r['Scenario ID'] || '').trim();
      if (!id) continue;
      let s = byId.get(id);
      if (!s) {
        s = mkScenario({
          id, type: String(r['Test Type'] || 'UAT'), env: /cloud/i.test(r['Target Environment']) ? 'cloud' : 'gui',
          modules: String(r['Modules'] || '').split(/\s*(?:→|,|\/)\s*/).filter(Boolean),
          process: String(r['Business Process'] || ''), title: String(r['Scenario Title'] || id), objective: String(r['Objective'] || ''),
          polarity: String(r['Polarity'] || 'Positive'), priority: String(r['Priority'] || 'Medium'), preconditions: String(r['Preconditions'] || ''),
          testData: String(r['Test Data'] || ''), expected: String(r['Expected Result'] || ''), source: 'Excel import', steps: [],
        });
        scenarios.push(s); byId.set(id, s); created.add(id); res.created++;
      } else res.updated++;
      if (r['Status']) s.status = String(r['Status']);
      s.tester = String(r['Tester'] || s.tester || '');
      s.execDate = String(r['Execution Date'] || s.execDate || '');
      s.defect = String(r['Defect ID'] || s.defect || '');
      if (r['Comments']) s.comments = String(r['Comments']).split(' | Guidance applied')[0].replace(/^Guidance applied.*$/, '');
    }
  }
  if (stepSheet) {
    const touched = new Set();
    for (const r of XLSX.utils.sheet_to_json(stepSheet, { defval: '' })) {
      const s = byId.get(String(r['Scenario ID'] || '').trim());
      if (!s) continue;
      touched.add(s.id);
      const seq = Number(r['Step']) || (s.steps.length + 1) * 10;
      let st = s.steps.find(x => Number(x.seq) === seq);
      if (!st) {
        st = { seq, tcode: String(r['T-Code / Fiori App'] || ''), module: String(r['Module'] || ''), role: String(r['Role'] || ''), action: String(r['Action'] || ''), expected: String(r['Expected Result'] || '') };
        s.steps.push(st);
      }
      st.actual = String(r['Actual Result'] || '');
      st.result = String(r['Step Result'] || 'Not Run');
      st.tester = String(r['Tester'] || '');
      st.date = String(r['Date'] || '');
      st.evidence = String(r['Evidence / Screenshot Ref'] || '');
      res.steps++;
    }
    // Step results drive scenario status once execution has started.
    for (const id of touched) {
      const s = byId.get(id);
      const results = s.steps.map(x => x.result);
      if (results.includes('Fail')) s.status = 'Failed';
      else if (results.includes('Blocked')) s.status = 'Blocked';
      else if (results.length && results.every(x => x === 'Pass')) s.status = 'Passed';
      else if (results.includes('Pass')) s.status = 'In Progress';
    }
  }
  return res;
}
