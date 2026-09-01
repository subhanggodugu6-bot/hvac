import { test, expect } from '@playwright/test';

test.describe('Studio shell smoke', () => {
  test('overview loads building operations hub', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.locator('h1, [class*="PageHeader"]').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('body')).toContainText(/Building operations|Opportunities/i);
    await expect(page.getByRole('link', { name: /Skip to main content/i })).toBeAttached();
  });

  test('systems intelligence loads pipeline and chapters', async ({ page }) => {
    await page.goto('/agents');
    await expect(page.locator('body')).toContainText('Systems Intelligence');
    await expect(page.locator('body')).toContainText(/Chapters|Module cards/i);
  });

  test('scheduling hub lists O1-O4', async ({ page }) => {
    await page.goto('/agents/scheduling');
    await expect(page.locator('body')).toContainText(/Scheduling|O1|O2/i);
  });

  test('skip link focuses main content', async ({ page }) => {
    await page.goto('/overview');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: /Skip to main content/i });
    await expect(skip).toBeFocused();
    await skip.click();
    await expect(page.locator('#main-content')).toBeFocused();
  });
});
