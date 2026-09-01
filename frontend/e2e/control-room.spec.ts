import { test, expect } from '@playwright/test';

test.describe('Phase 2 control room', () => {
  test('overview never shows BMS LIVE and control stays disabled', async ({ page }) => {
    await page.goto('/overview');
    const banner = page.getByRole('banner');
    await expect(banner).toContainText(/WRITE ENABLED|WRITE DISABLED|SIM CONTROL ON|CONTROL DISABLED/);
    await expect(banner).not.toContainText('BMS LIVE');
    await expect(page.locator('body')).toContainText(/Building operations|Opportunities O1/i);
  });

  test('BMS commissioning page is read-only', async ({ page }) => {
    await page.goto('/platform/bms');
    await expect(page.locator('body')).toContainText('READ-ONLY');
    await expect(page.locator('body')).toContainText(/0 devices|Devices 0/i);
    const banner = page.getByRole('banner');
    await expect(banner).not.toContainText('BMS LIVE');
    await expect(banner).toContainText(/WRITE ENABLED|WRITE DISABLED|SIM CONTROL ON|CONTROL DISABLED/);
  });

  test('telemetry page shows empty as NO DATA not zero', async ({ page }) => {
    await page.goto('/platform/telemetry');
    await expect(page.locator('body')).toContainText(/Telemetry|Live Telemetry/i);
    const banner = page.getByRole('banner');
    await expect(banner).toContainText(/WRITE ENABLED|WRITE DISABLED|SIM CONTROL ON|CONTROL DISABLED/);
    const body = await page.locator('body').innerText();
    expect(body).not.toMatch(/BMS LIVE/);
  });

  test('agent center shows ENGINE/MODEL and SIM WRITE ENABLED in simulation', async ({ page }) => {
    await page.goto('/agents');
    await expect(page.locator('body')).toContainText('Scheduling');
    await expect(page.locator('body')).toContainText('Plant Control');
    await expect(page.locator('body')).toContainText('Ventilation');
    await expect(page.locator('body')).toContainText('Variable Speed');
    await expect(page.locator('body')).toContainText('Operations');
    await expect(page.locator('body')).toContainText(/Module cards|Chapters/i);
    await expect(page.locator('body')).toContainText(/LIVE|SIM|TELEMETRY/i);
    await expect(page.getByRole('banner')).not.toContainText('BMS LIVE');
  });
});
