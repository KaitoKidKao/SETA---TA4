import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

test('SmartRecruit End-to-End flow: JD creation -> Gate 1 -> Screening -> Gate 2 -> Outreach -> Scheduling', async ({
  page,
}) => {
  // Set test timeout to 120 seconds
  test.setTimeout(120000);
  // 1. Visit the SmartRecruit page
  await page.goto('/smartrecruit');

  // Verify the page loader is done and the main heading is visible
  await expect(page.getByRole('heading', { name: 'Recruitment Shortlist Agent' })).toBeVisible({
    timeout: 15000,
  });

  // Clean up any active, paused, or failed pipeline from previous runs
  // Wait for queries to load and page state to settle
  const jdInput = page.locator('input[placeholder*="Senior Backend Engineer"]');
  const declineBtn = page.getByRole('button', { name: /Decline Campaign|Cancel Pipeline/i });
  const freshBtn = page.getByRole('button', { name: /Start Fresh Campaign/i });

  console.log('Ensuring clean state...');
  for (let i = 0; i < 15; i++) {
    if (await jdInput.isVisible()) {
      console.log('Clean state reached (new campaign input is visible).');
      break;
    }
    if (await declineBtn.isVisible()) {
      console.log('Decline Campaign button found, clicking to cancel paused campaign...');
      await declineBtn.click();
      await page.waitForTimeout(2000);
    }
    if (await freshBtn.isVisible()) {
      console.log(
        'Start Fresh Campaign button found, clicking to reset failed/finished campaign...',
      );
      await freshBtn.click();
      await page.waitForTimeout(2000);
    }
    await page.waitForTimeout(1000);
  }

  // 2. Configure a new recruitment campaign
  await page.fill('input[placeholder*="Senior Backend Engineer"]', 'Senior AI Engineer E2E');
  await page.fill(
    'textarea[placeholder*="requirements here..."]',
    `We are looking for a Senior AI Engineer to join our team.
- At least 5 years of experience in Software Engineering and AI/ML.
- Strong knowledge of TypeScript, Node.js, Python, and Large Language Models.
- Excellent communication and prompt engineering skills.
- Nice to have: Vector Databases and experience with Mastra or LangChain.`,
  );

  // 3. Upload a sample CV PDF file
  const cvPath = resolve('../../docs/1619_TA04_Proposal.pdf');
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(cvPath);

  // 4. Wait for the CV extraction process to finish (the "Ready" badge or editable fields should appear)
  await expect(page.getByText('Ready').first()).toBeVisible({ timeout: 35000 });
  await expect(page.locator('input[value="Nguyễn Trí Cao"]')).toBeVisible({ timeout: 10000 });

  // 5. Launch the recruitment screening pipeline
  await page.getByRole('button', { name: /Launch Screening Pipeline/i }).click();

  // 6. Wait for the pipeline status to change and pause at Gate 1
  await expect(page.getByText('Pipeline Status: paused', { exact: false })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText('Gate 1: Confirm Screening Criteria')).toBeVisible({
    timeout: 10000,
  });

  // 7. Confirm the screening criteria parsed by the AI to proceed to the screening stage
  await page.getByRole('button', { name: /Confirm & Run Screener/i }).click();

  // 8. Wait for the screener to finish matching and pause at Gate 2 (outreach drafting)
  await expect(page.getByText('Gate 2: Shortlist Candidates', { exact: false })).toBeVisible({
    timeout: 45000,
  });

  // 9. Review outreach draft and approve bulk dispatch
  await page.getByRole('button', { name: /Approve & Send All/i }).click();

  // 10. Wait for the dispatch to finish successfully and render the completion page
  await expect(page.getByText('Campaign Dispatch Complete!')).toBeVisible({
    timeout: 30000,
  });

  // 11. Navigate to Enterprise Settings and check M365 scheduling card
  await page.getByRole('button', { name: 'Enterprise Settings' }).click();
  await expect(page.getByText('Interview Scheduling (M365 Outlook Calendar)')).toBeVisible({
    timeout: 5000,
  });

  // 12. Go back to New Campaign and reset the UI
  await page.getByRole('button', { name: 'New Campaign' }).click();
  await expect(page.getByRole('heading', { name: 'Recruitment Shortlist Agent' })).toBeVisible();
});
