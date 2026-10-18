const fs = require('fs');
const path = require('path');

const SOURCE_FILE = path.join(__dirname, '../source/dsa.txt');
const OUTPUT_FILE = path.join(__dirname, '../src/data/sheet.json');

function parseSheet() {
  const content = fs.readFileSync(SOURCE_FILE, 'utf8');
  const lines = content.replace(/\r\n/g, '\n').split('\n');

  const steps = [];
  let currentStep = null;
  let currentSubsection = null;
  let currentStepNum = null;
  let currentSubId = null;

  // Extract LC number from text like "(LC 704)"
  function extractLC(text) {
    const match = text.match(/\(LC\s+(\d+)\)/);
    return match ? parseInt(match[1], 10) : null;
  }

  // Check for (Skip) marker
  function isSkip(text) {
    return /\(Skip\)/i.test(text);
  }

  // Clean a problem title: remove (LC xxx), (Skip), and trim
  function cleanTitle(text) {
    return text
      .replace(/\s*\(LC\s+\d+\)\s*/g, '')
      .replace(/\s*\(Skip\)\s*/g, '')
      .trim();
  }

  // Split merged problems on a single line
  // E.g. "62. Left Rotate an Array by One Place63. Left Rotate an Array by D Places (LC 189)"
  // Pattern: look for "NUMBER. " boundaries
  function splitProblems(text) {
    // Use regex to split on problem number boundaries
    // Match positions where a digit followed by ". " starts a new problem
    const parts = [];
    const regex = /(\d+)\.\s+/g;
    let match;
    const starts = [];

    while ((match = regex.exec(text)) !== null) {
      starts.push({ index: match.index, num: match[1], fullMatch: match[0] });
    }

    if (starts.length === 0) return [];
    if (starts.length === 1) {
      return [text];
    }

    // Multiple problems on one line
    for (let i = 0; i < starts.length; i++) {
      const start = starts[i].index;
      const end = i + 1 < starts.length ? starts[i + 1].index : text.length;
      parts.push(text.substring(start, end).trim());
    }

    return parts;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Check for Step header: "Step N — Title" or merged with problem
    let stepMatch = line.match(/^Step\s+(\d+)\s+[—–-]\s+(.+)$/);
    if (!stepMatch) {
      // Check for pattern like "SomeProblem)Step N — Title"
      stepMatch = line.match(/\)Step\s+(\d+)\s+[—–-]\s+(.+)$/);
      if (stepMatch) {
        // Extract title that might have been merged
        const tempTitle = stepMatch[2].trim();
        // If title has ". " after number, it might be a merged problem
        const titleMatch = tempTitle.match(/^(.+?)(\d+)\.\s+(.+)$/);
        if (titleMatch) {
          const possibleNum = parseInt(titleMatch[2], 10);
          // If this looks like a problem number (>= 334 probably), treat as merged
          if (possibleNum >= 334) {
            stepMatch[2] = titleMatch[1].trim();
          }
        }
      }
    }
    if (stepMatch) {
      currentStepNum = stepMatch[1];
      currentStep = {
        id: `s${currentStepNum}`,
        title: stepMatch[2].trim(),
        subsections: []
      };
      // Avoid duplicate steps (some lines repeat the Step header)
      const existing = steps.find(s => s.id === currentStep.id);
      if (!existing) {
        steps.push(currentStep);
      } else {
        currentStep = existing;
      }
      continue;
    }

    // Check for Sub-section: "N.M — Title"
    const subMatch = line.match(/^(\d+)\.(\d+)\s+[—–-]\s+(.+)$/);
    if (subMatch && currentStep) {
      const major = subMatch[1];
      const minor = subMatch[2];
      currentSubId = `${major}.${minor}`;

      // Check if the subsection title has a merged problem
      // e.g. "7.1 — Get a Strong Hold203. Recursive Implementation of Atoi"
      let subTitle = subMatch[3].trim();
      let mergedProblem = null;
      const mergedMatch = subTitle.match(/^(.+?)(\d+)\.\s+(.+)$/);
      if (mergedMatch) {
        // Check if this looks like a merged problem (number > some threshold)
        const possibleNum = parseInt(mergedMatch[2], 10);
        if (possibleNum > 50) {
          subTitle = mergedMatch[1].trim();
          mergedProblem = `${mergedMatch[2]}. ${mergedMatch[3]}`;
        }
      }

      currentSubsection = {
        id: `s${currentStepNum}-${currentSubId}`,
        title: subTitle,
        problems: []
      };
      currentStep.subsections.push(currentSubsection);

      // Process merged problem if found
      if (mergedProblem) {
        const lc = extractLC(mergedProblem);
        const skip = isSkip(mergedProblem);
        const probMatch = mergedProblem.match(/^(\d+)\.\s+(.+)$/);
        if (probMatch) {
          currentSubsection.problems.push({
            id: `s${currentStepNum}-${currentSubId}-p${probMatch[1]}`,
            title: cleanTitle(probMatch[2]),
            lc: lc,
            defaultSkip: skip
          });
        }
      }
      continue;
    }

    // Check for Problem: "N. Title" where N is a number
    const probMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (probMatch && currentSubsection) {
      const probNum = parseInt(probMatch[1], 10);
      const fullProbText = line;

      // Check for merged problems on same line
      const parts = splitProblems(fullProbText);

      for (const part of parts) {
        const pm = part.match(/^(\d+)\.\s+(.+)$/);
        if (pm) {
          const num = pm[1];
          const title = pm[2];
          const lc = extractLC(title);
          const skip = isSkip(title);

          currentSubsection.problems.push({
            id: `s${currentStepNum}-${currentSubId}-p${num}`,
            title: cleanTitle(title),
            lc: lc,
            defaultSkip: skip
          });
        }
      }
      continue;
    }
  }

  return { steps };
}

function main() {
  console.log('Parsing DSA sheet...');
  const data = parseSheet();

  // Calculate counts
  let stepsCount = data.steps.length;
  let problemsCount = 0;
  let skipCount = 0;

  for (const step of data.steps) {
    for (const sub of step.subsections) {
      problemsCount += sub.problems.length;
      skipCount += sub.problems.filter(p => p.defaultSkip).length;
    }
  }

  console.log(`Steps: ${stepsCount}`);
  console.log(`Problems: ${problemsCount}`);
  console.log(`Default Skip: ${skipCount}`);

  // Ensure output directory exists
  const outputDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Write output
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2), 'utf8');
  console.log(`\nWritten to ${OUTPUT_FILE}`);

  return { stepsCount, problemsCount, skipCount };
}

if (require.main === module) {
  main();
}

module.exports = { parseSheet, main };
