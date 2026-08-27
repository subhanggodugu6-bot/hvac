import { test, expect } from '@playwright/test';

test.describe('Official HVAC opportunity catalog', () => {
  test('O1–O4 studios remain on official routes', async ({ page }) => {
    await page.goto('/agents/scheduling/optimum-start-stop');
    await expect(page.locator('body')).toContainText('Optimum Start/Stop Programming');
    await page.goto('/agents/scheduling/space-temperature');
    await expect(page.locator('body')).toContainText('Space Temperature');
    await page.goto('/agents/scheduling/master-ahu-sat');
    await expect(page.locator('body')).toContainText('Master Air Handling Unit');
    await page.goto('/agents/scheduling/chiller-staging');
    await expect(page.locator('body')).toContainText('Chiller');
  });

  test('O5–O9 plant control routes', async ({ page }) => {
    await page.goto('/agents/plant-control/duct-static-pressure');
    await expect(page.locator('body')).toContainText(/Duct Static|O5/i);
    await page.goto('/agents/plant-control/temperature-reset');
    await expect(page.locator('body')).toContainText(/Temperature Reset|HHW|CHW|CW/i);
    await page.goto('/agents/plant-control/electronic-expansion-valve');
    await expect(page.locator('body')).toContainText(/Expansion Valve|O9/i);
  });

  test('O10–O13 ventilation numbering includes Economy Cycle', async ({ page }) => {
    await page.goto('/agents/ventilation-airflow/economy-cycle');
    await expect(page.locator('body')).toContainText(/Economy Cycle|O10/i);
    await page.goto('/agents/ventilation-airflow/night-purge');
    await expect(page.locator('body')).toContainText(/Night Purge/i);
    await page.goto('/agents/ventilation-airflow/demand-ventilation');
    await expect(page.locator('body')).toContainText(/CO/);
    await page.goto('/agents/ventilation-airflow/dcv-co');
    await expect(page.locator('body')).toContainText(/CO|O13|Demand/i);
  });

  test('O14–O16 variable speed official pages', async ({ page }) => {
    await page.goto('/agents/variable-speed/chilled-water-pump');
    await expect(page.locator('body')).toContainText(/Optimised Secondary Chilled Water Pumping|O14/i);
    await page.goto('/agents/variable-speed/air-cooled-head-pressure');
    await expect(page.locator('body')).toContainText(/Air-Cooled|O15|Head Pressure/i);
    await page.goto('/agents/variable-speed/water-cooled-head-pressure');
    await expect(page.locator('body')).toContainText(/Water-Cooled|O16|Head Pressure/i);
  });

  test('O17–O20 operations and maintenance', async ({ page }) => {
    await page.goto('/agents/operations-maintenance');
    await expect(page.locator('body')).toContainText(/Operations|Maintenance|Energy/i);
    await page.goto('/agents/operations-maintenance/energy-management-planning');
    await expect(page.locator('body')).toContainText(/Energy Management Planning|O17/i);
    await page.goto('/agents/operations-maintenance/training-awareness');
    await expect(page.locator('body')).toContainText(/Training|O18/i);
    await page.goto('/agents/operations-maintenance/equipment-maintenance');
    await expect(page.locator('body')).toContainText(/Energy Efficiency Maintenance|O19|Maintenance/i);
    await page.goto('/agents/operations-maintenance/control-software');
    await expect(page.locator('body')).toContainText(/Control Software|O20/i);
  });

  test('product modules Alerts Historian M&V Approval Commands Work Orders are not in the sidebar', async ({ page }) => {
    await page.goto('/overview');
    const nav = page.locator('aside');
    await expect(nav).not.toContainText('Alerts');
    await expect(nav).not.toContainText('Historian');
    await expect(nav).not.toContainText('M&V');
    await expect(nav).not.toContainText('Approval Queue');
    await expect(nav).not.toContainText('Commands');
    await expect(nav).not.toContainText('Work Orders');
  });

  test('OEH guide lives on opportunity pages, not Fleet Overview', async ({ page }) => {
    await page.goto('/overview');
    const nav = page.locator('aside');
    await expect(nav).not.toContainText('Guide Console');
    await expect(page.locator('body')).not.toContainText('Savings Calculator');
    await expect(page.locator('body')).not.toContainText('Control Principle');
    await page.goto('/agents/scheduling/optimum-start-stop');
    await expect(page.getByRole('tab', { name: 'Operations' })).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Savings Calculator');
    await page.getByRole('tab', { name: 'OEH guide' }).click();
    await expect(page.locator('body')).toContainText('Savings Calculator');
    await expect(page.locator('body')).toContainText('Control Principle');
    await expect(page.locator('body')).toContainText('Guide comparison (simulated)');
  });

  test('operations tab shows GUIDE REFERENCE and O10 Economy Cycle exists', async ({ page }) => {
    await page.goto('/agents/ventilation-airflow/economy-cycle');
    await expect(page.locator('body')).toContainText(/Economy Cycle/);
    await expect(page.getByRole('tab', { name: 'Operations' })).toBeVisible();
    await expect(page.locator('body')).toContainText('GUIDE REFERENCE');
    await expect(page.locator('body')).toContainText('OEH / AIRAH Guide');
    await expect(page.locator('aside')).toContainText('O10');
    await expect(page.locator('aside')).toContainText('Economy Cycle');
  });

  test('SAFE MODE is always visible in the header', async ({ page }) => {
    await page.goto('/agents/scheduling');
    await expect(page.locator('body')).toContainText(/SAFE MODE/i);
  });
});
