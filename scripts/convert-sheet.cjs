const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, '../source');
const OUTPUT_DIR = path.join(__dirname, '../src/data');

// Title used for problems that sit directly under a Step (no "N.M — Title" header).
// Set to null so the UI can simply skip rendering a subsection heading.
const IMPLICIT_SUB_TITLE = null;

function parseSheet(sourceFile) {
  const raw = fs.readFileSync(sourceFile, 'utf8').replace(/\r\n/g, '\n');

  // Pre-process: if a Step header or "N.M — Title" header got glued onto the end
  // of the previous line (e.g. "...(LC 127)Step 15 — Graphs"), break it onto its own line.
  const content = raw
    .replace(/(\S)(Step\s+\d+\s+[—–-]\s+)/g, '$1\n$2')
    .replace(/([^\s\d])(\d+\.\d+\s+[—–-]\s+)/g, '$1\n$2');

  const lines = content.split('\n');

  const steps = [];
  let currentStep = null;
  let currentSubsection = null;
  let currentStepNum = null;
  let currentSubId = null;
  let lastProblemNum = 0; // problem numbers are global and sequential

  function extractLC(text) {
    const match = text.match(/\(LC\s+(\d+)\)/);
    return match ? parseInt(match[1], 10) : null;
  }

  function isSkip(text) {
    return /\(Skip\)/i.test(text);
  }

  function cleanTitle(text) {
    return text
      .replace(/\s*\(LC\s+\d+\)\s*/g, '')
      .replace(/\s*\(Skip\)\s*/g, '')
      .trim();
  }

  // Split several problems glued onto one line, e.g.
  //   "62. Left Rotate by One Place63. Left Rotate by D Places (LC 189)"
  //   "54. ... — Video 1655. Production-grade Configuration — Video 17"
  // Instead of splitting on any "digits. " (which would misread "Video 1655." as
  // problem 1655), we only split where the *next expected* number appears.
  function splitProblems(text) {
    const first = text.match(/^(\d+)\.\s+/);
    if (!first) return [];

    const parts = [];
    let num = parseInt(first[1], 10);
    let curStart = 0;
    let searchFrom = first[0].length;

    for (;;) {
      const re = new RegExp(`${num + 1}\\.\\s+`, 'g');
      re.lastIndex = searchFrom;
      const m = re.exec(text);
      if (!m) break;
      parts.push(text.slice(curStart, m.index).trim());
      curStart = m.index;
      num += 1;
      searchFrom = m.index + m[0].length;
    }
    parts.push(text.slice(curStart).trim());
    return parts;
  }

  // A header title may have the next problem glued to it, e.g.
  //   "Get a Strong Hold203. Recursive Implementation of Atoi"
  // Returns { title, problemParts }.
  function peelMergedProblems(title) {
    const re = new RegExp(`${lastProblemNum + 1}\\.\\s+`);
    const m = re.exec(title);
    if (m && m.index > 0) {
      return {
        title: title.slice(0, m.index).trim(),
        problemParts: splitProblems(title.slice(m.index))
      };
    }
    return { title: title.trim(), problemParts: [] };
  }

  // Returns the active subsection, creating an implicit one if the current
  // step has no "N.M — Title" header (yet).
  function ensureSubsection() {
    if (currentSubsection) return currentSubsection;
    if (!currentStep) return null;
    currentSubId = '0';
    currentSubsection = {
      id: `s${currentStepNum}-${currentSubId}`,
      title: IMPLICIT_SUB_TITLE,
      implicit: true,
      problems: []
    };
    currentStep.subsections.push(currentSubsection);
    return currentSubsection;
  }

  function addProblem(part) {
    const pm = part.match(/^(\d+)\.\s+(.+)$/);
    if (!pm) return;
    const sub = ensureSubsection();
    if (!sub) return;
    sub.problems.push({
      id: `s${currentStepNum}-${currentSubId}-p${pm[1]}`,
      title: cleanTitle(pm[2]),
      lc: extractLC(pm[2]),
      defaultSkip: isSkip(pm[2])
    });
    lastProblemNum = parseInt(pm[1], 10);
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Step header: "Step N — Title"
    const stepMatch = line.match(/^Step\s+(\d+)\s+[—–-]\s+(.+)$/);
    if (stepMatch) {
      const peeled = peelMergedProblems(stepMatch[2]);
      currentStepNum = stepMatch[1];

      const id = `s${currentStepNum}`;
      let step = steps.find(s => s.id === id);
      if (!step) {
        step = { id, title: peeled.title, subsections: [] };
        steps.push(step);
      }
      currentStep = step;

      // New step => forget the previous step's subsection.
      // If we are re-entering an existing step, resume its last subsection.
      const subs = currentStep.subsections;
      currentSubsection = subs.length ? subs[subs.length - 1] : null;
      currentSubId = currentSubsection ? currentSubsection.id.split('-').slice(1).join('-') : null;

      peeled.problemParts.forEach(addProblem);
      continue;
    }

    // Sub-section header: "N.M — Title"
    const subMatch = line.match(/^(\d+)\.(\d+)\s+[—–-]\s+(.+)$/);
    if (subMatch && currentStep) {
      currentSubId = `${subMatch[1]}.${subMatch[2]}`;
      const peeled = peelMergedProblems(subMatch[3]);

      currentSubsection = {
        id: `s${currentStepNum}-${currentSubId}`,
        title: peeled.title,
        problems: []
      };
      currentStep.subsections.push(currentSubsection);

      peeled.problemParts.forEach(addProblem);
      continue;
    }

    // Problem line(s): "N. Title" (possibly several glued together)
    if (/^\d+\.\s+/.test(line)) {
      splitProblems(line).forEach(addProblem);
      continue;
    }
  }

  return { steps };
}

function listSourceFiles() {
  return fs.readdirSync(SOURCE_DIR)
    .filter(file => file.toLowerCase().endsWith('.txt'))
    .sort((a, b) => a.localeCompare(b));
}

async function chooseSourceFile() {
  const files = listSourceFiles();
  if (files.length === 0) throw new Error(`No .txt source files found in ${SOURCE_DIR}`);

  console.log('Available source sheets:');
  files.forEach((file, index) => console.log(`  ${index + 1}. ${file}`));

  const readline = require('readline/promises');
  const { stdin, stdout } = require('process');
  const prompt = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = (await prompt.question('Enter a source filename or number: ')).trim();
    const selected = /^\d+$/.test(answer)
      ? files[Number(answer) - 1]
      : files.find(file => file.toLowerCase() === answer.toLowerCase() || file.toLowerCase() === `${answer}.txt`.toLowerCase());
    if (!selected) throw new Error(`Source file "${answer}" was not found in ${SOURCE_DIR}`);
    return selected;
  } finally {
    prompt.close();
  }
}

async function main(sourceName = process.argv[2]) {
  const selectedName = sourceName || await chooseSourceFile();
  const filename = selectedName.toLowerCase().endsWith('.txt') ? selectedName : `${selectedName}.txt`;
  if (path.basename(filename) !== filename || !listSourceFiles().includes(filename)) {
    throw new Error(`Choose a .txt file from ${SOURCE_DIR}`);
  }

  const sourceFile = path.join(SOURCE_DIR, filename);
  const outputName = filename.replace(/\.txt$/i, '');
  const outputFile = path.join(OUTPUT_DIR, `${outputName}.json`);
  console.log(`Parsing ${filename}...`);
  const data = parseSheet(sourceFile);
  if (data.steps.length === 0 || data.steps.every(step => step.subsections.every(subsection => subsection.problems.length === 0))) {
    throw new Error(`No steps or problems were found in ${filename}; check the source format.`);
  }
  let problemsCount = 0;
  let skipCount = 0;
  let implicitCount = 0;

  for (const step of data.steps) {
    for (const sub of step.subsections) {
      problemsCount += sub.problems.length;
      skipCount += sub.problems.filter(p => p.defaultSkip).length;
      if (sub.implicit) implicitCount++;
    }
  }

  console.log(`Steps: ${data.steps.length}`);
  console.log(`Problems: ${problemsCount}`);
  console.log(`Default Skip: ${skipCount}`);
  console.log(`Implicit subsections (steps with no N.M header): ${implicitCount}`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(outputFile, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\nWritten to ${outputFile}`);

  return { stepsCount: data.steps.length, problemsCount, skipCount, outputFile };
}

if (require.main === module) {
  main().catch(error => {
    console.error(`\nConversion failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { parseSheet, main };