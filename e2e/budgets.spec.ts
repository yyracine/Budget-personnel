import { expect, test } from '@playwright/test';
import { importExampleCsv, openApp, selectJanuary2026 } from './helpers';

test('calcule un budget dépassé et alerte sur le tableau de bord', async ({ page }) => {
  await openApp(page);
  await importExampleCsv(page);

  await page.goto('/#/budgets');
  await selectJanuary2026(page, 'Mois du budget');

  const foodRow = page.getByRole('row').filter({ hasText: 'Alimentation' });
  await foodRow.getByRole('button', { name: 'Définir' }).click();

  const dialog = page.getByRole('dialog', { name: 'Définir un budget' });
  await dialog.locator('#budget-amount').fill('80000');
  await dialog.getByRole('button', { name: 'Enregistrer le budget' }).click();

  const main = page.getByRole('main');
  await expect(main).toContainText(/1 budget dépassé/);
  await expect(main).toContainText(/85\s*000\s*FCFA/);
  await expect(main).toContainText(/106,25\s*%/);
  await expect(main).toContainText(/-5\s*000\s*FCFA/);

  await page.goto('/#/');
  await selectJanuary2026(page);
  await expect(main).toContainText(/1 budget dépassé sur la période/);
  await expect(main).toContainText(/85\s*000\s*FCFA/);
  await expect(main).toContainText(/106,25\s*% de 80\s*000\s*FCFA/);

  // Le budget de janvier ne doit pas fuiter sur février.
  const picker = page.getByRole('group', { name: 'Sélection de la période' });
  await picker.getByLabel('Mois').selectOption('2');
  await expect(main).toContainText('Aucun budget défini sur la période');
  await expect(main).not.toContainText('budget dépassé sur la période');
});
