const IMPLICIT_SUB_TITLE = null;

export const sampleSheetTemplate = `Step 1 — Arrays
1.1 — Fundamentals
1. Two Sum (LC 1)
2. Best Time to Buy and Sell Stock (LC 121)
3. Contains Duplicate (LC 217)

1.2 — Two Pointers
4. Valid Palindrome (LC 125)
5. 3Sum (LC 15) (Skip)

Step 2 — Dynamic Programming
2.1 — Basic Problems
6. Climbing Stairs (LC 70)
7. House Robber (LC 198)
`;

export function parseSheet(raw) {
  const content = raw
    .replace(/\r\n/g, '\n')
    .replace(/(\S)(Step\s+\d+\s+[—–-]\s+)/g, '$1\n$2')
    .replace(/([^\s\d])(\d+\.\d+\s+[—–-]\s+)/g, '$1\n$2');
  const steps = [];
  let currentStep = null;
  let currentSubsection = null;
  let currentStepNum = null;
  let currentSubId = null;
  let lastProblemNum = 0;

  const extractLC = text => {
    const match = text.match(/\(LC\s+(\d+)\)/);
    return match ? Number.parseInt(match[1], 10) : null;
  };
  const cleanTitle = text => text
    .replace(/\s*\(LC\s+\d+\)\s*/g, '')
    .replace(/\s*\(Skip\)\s*/gi, '')
    .trim();

  function splitProblems(text) {
    const first = text.match(/^(\d+)\.\s+/);
    if (!first) return [];
    const parts = [];
    let number = Number.parseInt(first[1], 10);
    let start = 0;
    let searchFrom = first[0].length;
    for (;;) {
      const nextProblem = new RegExp(`${number + 1}\\.\\s+`, 'g');
      nextProblem.lastIndex = searchFrom;
      const match = nextProblem.exec(text);
      if (!match) break;
      parts.push(text.slice(start, match.index).trim());
      start = match.index;
      number++;
      searchFrom = match.index + match[0].length;
    }
    parts.push(text.slice(start).trim());
    return parts;
  }

  function peelMergedProblems(title) {
    const match = new RegExp(`${lastProblemNum + 1}\\.\\s+`).exec(title);
    if (!match || match.index === 0) return { title: title.trim(), problemParts: [] };
    return {
      title: title.slice(0, match.index).trim(),
      problemParts: splitProblems(title.slice(match.index)),
    };
  }

  function ensureSubsection() {
    if (currentSubsection) return currentSubsection;
    if (!currentStep) return null;
    currentSubId = '0';
    currentSubsection = {
      id: `s${currentStepNum}-${currentSubId}`,
      title: IMPLICIT_SUB_TITLE,
      implicit: true,
      problems: [],
    };
    currentStep.subsections.push(currentSubsection);
    return currentSubsection;
  }

  function addProblem(part) {
    const match = part.match(/^(\d+)\.\s+(.+)$/);
    if (!match) return;
    const subsection = ensureSubsection();
    if (!subsection) return;
    subsection.problems.push({
      id: `s${currentStepNum}-${currentSubId}-p${match[1]}`,
      title: cleanTitle(match[2]),
      lc: extractLC(match[2]),
      defaultSkip: /\(Skip\)/i.test(match[2]),
    });
    lastProblemNum = Number.parseInt(match[1], 10);
  }

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;

    const stepMatch = line.match(/^Step\s+(\d+)\s+[—–-]\s+(.+)$/);
    if (stepMatch) {
      const peeled = peelMergedProblems(stepMatch[2]);
      currentStepNum = stepMatch[1];
      const id = `s${currentStepNum}`;
      currentStep = steps.find(step => step.id === id);
      if (!currentStep) {
        currentStep = { id, title: peeled.title, subsections: [] };
        steps.push(currentStep);
      }
      const subsections = currentStep.subsections;
      currentSubsection = subsections.length ? subsections[subsections.length - 1] : null;
      currentSubId = currentSubsection ? currentSubsection.id.split('-').slice(1).join('-') : null;
      peeled.problemParts.forEach(addProblem);
      continue;
    }

    const subsectionMatch = line.match(/^(\d+)\.(\d+)\s+[—–-]\s+(.+)$/);
    if (subsectionMatch && currentStep) {
      currentSubId = `${subsectionMatch[1]}.${subsectionMatch[2]}`;
      const peeled = peelMergedProblems(subsectionMatch[3]);
      currentSubsection = {
        id: `s${currentStepNum}-${currentSubId}`,
        title: peeled.title,
        problems: [],
      };
      currentStep.subsections.push(currentSubsection);
      peeled.problemParts.forEach(addProblem);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) splitProblems(line).forEach(addProblem);
  }

  const problems = steps.flatMap(step => step.subsections.flatMap(subsection => subsection.problems));
  if (!steps.length || !problems.length) {
    throw new Error('No steps or problems found. Use “Step 1 — Title” headings and numbered problems.');
  }
  const ids = new Set();
  for (const problem of problems) {
    if (!problem.title || ids.has(problem.id)) {
      throw new Error('The sheet contains an empty problem title or duplicate problem number.');
    }
    ids.add(problem.id);
  }
  return { steps };
}

export function countSheetProblems(sheet) {
  return sheet.steps.reduce(
    (total, step) => total + step.subsections.reduce((subTotal, subsection) => subTotal + subsection.problems.length, 0),
    0,
  );
}
