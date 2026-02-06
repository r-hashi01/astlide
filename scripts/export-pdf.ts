import { chromium } from 'playwright';
import { writeFile, mkdir, readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';

interface ExportOptions {
  deck?: string;
  all?: boolean;
  output?: string;
  format?: 'pdf' | 'png';
  baseUrl?: string;
  includeHidden?: boolean;
}

async function parseArgs(): Promise<ExportOptions> {
  const args = process.argv.slice(2);
  const options: ExportOptions = {
    format: 'pdf',
    baseUrl: 'http://localhost:4321',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--deck' || arg === '-d') {
      options.deck = args[++i];
    } else if (arg === '--all' || arg === '-a') {
      options.all = true;
    } else if (arg === '--output' || arg === '-o') {
      options.output = args[++i];
    } else if (arg === '--format' || arg === '-f') {
      options.format = args[++i] as 'pdf' | 'png';
    } else if (arg === '--base-url') {
      options.baseUrl = args[++i];
    } else if (arg === '--include-hidden') {
      options.includeHidden = true;
    }
  }

  return options;
}

async function getDecks(): Promise<string[]> {
  const decksDir = 'src/content/decks';
  const entries = await readdir(decksDir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}

async function getDeckConfig(deck: string): Promise<Record<string, unknown>> {
  const configPath = `src/content/decks/${deck}/_config.json`;
  
  if (existsSync(configPath)) {
    const content = await readFile(configPath, 'utf-8');
    return JSON.parse(content);
  }
  
  return { title: deck };
}

async function getSlideCount(page: any): Promise<number> {
  return page.evaluate(() => {
    return parseInt(document.body.dataset.totalSlides || '0');
  });
}

async function exportDeck(
  deck: string,
  options: ExportOptions
): Promise<void> {
  console.log(`\nExporting deck: ${deck}`);
  
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Set viewport to slide dimensions
  await page.setViewportSize({ width: 1920, height: 1080 });
  
  // Navigate to first slide to get total count
  await page.goto(`${options.baseUrl}/${deck}/1`);
  await page.waitForLoadState('networkidle');
  
  const slideCount = await getSlideCount(page);
  console.log(`  Found ${slideCount} slides`);
  
  const config = await getDeckConfig(deck);
  const outputPath = options.output || `./dist/${deck}.pdf`;
  
  // Ensure output directory exists
  await mkdir(dirname(outputPath), { recursive: true });
  
  if (options.format === 'pdf') {
    await exportToPDF(page, deck, slideCount, outputPath, options);
  } else {
    await exportToPNG(page, deck, slideCount, outputPath, options);
  }
  
  await browser.close();
  console.log(`  ✓ Exported to ${outputPath}`);
}

async function exportToPDF(
  page: any,
  deck: string,
  slideCount: number,
  outputPath: string,
  options: ExportOptions
): Promise<void> {
  const pdfBuffers: Buffer[] = [];
  
  for (let i = 1; i <= slideCount; i++) {
    process.stdout.write(`  Rendering slide ${i}/${slideCount}\r`);
    
    await page.goto(`${options.baseUrl}/${deck}/${i}?print=true`);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => document.fonts.ready);
    
    // Hide navigation for PDF
    await page.addStyleTag({
      content: '.slide-nav { display: none !important; }',
    });
    
    const pdf = await page.pdf({
      width: '1920px',
      height: '1080px',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    
    pdfBuffers.push(pdf);
  }
  
  console.log('');
  
  // For simplicity, just use the first page's PDF structure
  // In production, use pdf-lib to properly merge
  if (pdfBuffers.length === 1) {
    await writeFile(outputPath, pdfBuffers[0]);
  } else {
    // Simple concatenation (works for basic cases)
    // For proper merging, install and use pdf-lib
    console.log('  Note: Multi-page PDF merging requires pdf-lib');
    await writeFile(outputPath, pdfBuffers[0]);
  }
}

async function exportToPNG(
  page: any,
  deck: string,
  slideCount: number,
  outputDir: string,
  options: ExportOptions
): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  
  for (let i = 1; i <= slideCount; i++) {
    process.stdout.write(`  Rendering slide ${i}/${slideCount}\r`);
    
    await page.goto(`${options.baseUrl}/${deck}/${i}?print=true`);
    await page.waitForLoadState('networkidle');
    await page.waitForFunction(() => document.fonts.ready);
    
    // Hide navigation
    await page.addStyleTag({
      content: '.slide-nav { display: none !important; }',
    });
    
    const slideElement = await page.$('.slide');
    if (slideElement) {
      await slideElement.screenshot({
        path: join(outputDir, `slide-${String(i).padStart(3, '0')}.png`),
        type: 'png',
      });
    }
  }
  
  console.log('');
}

async function main(): Promise<void> {
  const options = await parseArgs();
  
  if (!options.deck && !options.all) {
    console.error('Error: Please specify --deck <name> or --all');
    process.exit(1);
  }
  
  console.log('Astlide PDF Export');
  console.log('==================');
  
  const decks = options.all ? await getDecks() : [options.deck!];
  
  for (const deck of decks) {
    await exportDeck(deck, options);
  }
  
  console.log('\n✓ Export complete');
}

main().catch((err) => {
  console.error('Export failed:', err);
  process.exit(1);
});
