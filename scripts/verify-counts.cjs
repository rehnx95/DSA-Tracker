// Verification script for DSA Sheet counts
const fs = require('fs');
const path = require('path');

const SHEET_FILE = path.join(__dirname, '../src/data/sheet.json');

function verifyCounts() {
  console.log('Verifying DSA Sheet counts...');

  if (!fs.existsSync(SHEET_FILE)) {
    console.error(`Error: ${SHEET_FILE} not found. Run convert-sheet.js first.`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(SHEET_FILE, 'utf8'));
  const steps = data.steps || [];

  const stepsCount = steps.length;
  const problemsCount = steps.reduce((total, step) => {
    const subsections = step.subsections || [];
    return total + subsections.reduce((subTotal, sub) => {
      return subTotal + (sub.problems || []).length;
    }, 0);
  }, 0);



  console.log(`Steps: ${stepsCount}`);
  console.log(`Problems: ${problemsCount}`);


  // Expected counts
  const expectedSteps = 18;
  const expectedProblems = 518;


  const errors = [];
  if (stepsCount !== expectedSteps) {
    errors.push(`Expected ${expectedSteps} Steps, got ${stepsCount}`);
  }
  if (problemsCount !== expectedProblems) {
    errors.push(`Expected ${expectedProblems} Problems, got ${problemsCount}`);
  }


  if (errors.length > 0) {
    console.error('\nErrors found:');
    errors.forEach((err, i) => console.error(`${i + 1}. ${err}`));
    process.exit(1);
  } else {
    console.log('\n✓ All counts match expected values!');
  }
}

if (require.main === module) {
  verifyCounts();
}

module.exports = { verifyCounts };