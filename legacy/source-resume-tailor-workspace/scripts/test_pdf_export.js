
const { chromium } = require('playwright');
(async() => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<html><body><h1>test</h1><p>Hello PDF</p></body></html>');
  await page.pdf({ path: '/Users/clawbot/.openclaw/workspace-resume-tailor/exports/pdf/test-playwright.pdf', format: 'Letter', printBackground: true });
  await browser.close();
})().catch(err => { console.error(err); process.exit(1); });
