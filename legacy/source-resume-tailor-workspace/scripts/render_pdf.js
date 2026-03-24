const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

async function main() {
  const [htmlPath, pdfPath] = process.argv.slice(2);
  if (!htmlPath || !pdfPath) {
    console.error('Usage: node render_pdf.js <htmlPath> <pdfPath>');
    process.exit(1);
  }
  const html = fs.readFileSync(htmlPath, 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'load' });
  await page.pdf({
    path: pdfPath,
    format: 'Letter',
    printBackground: true,
    margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' }
  });
  await browser.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
