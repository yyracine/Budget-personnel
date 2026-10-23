import { expect, test } from '@playwright/test';
import { importExampleCsv, openApp, selectJanuary2026 } from './helpers';

test('affiche un rapport mensuel cohérent sans pourcentage trompeur', async ({ page }) => {
  await openApp(page);
  await importExampleCsv(page);

  await page.goto('/#/rapports');
  await selectJanuary2026(page);

  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Rapport — Janvier 2026' })).toBeVisible();
  await expect(main).toContainText(/350\s*000\s*FCFA/);
  await expect(main).toContainText(/245\s*000\s*FCFA/);
  await expect(main).toContainText(/105\s*000\s*FCFA/);
  await expect(main).toContainText('01/01/2026');
  await expect(main).toContainText('7 opérations');

  const comparison = page.getByRole('table', {
    name: 'Comparaison des revenus, dépenses et soldes avec la période précédente',
  });
  const incomeRow = comparison.getByRole('row').filter({ hasText: 'Revenus' });
  await expect(incomeRow).toContainText('Nouvelle valeur');
  await expect(incomeRow).not.toContainText('%');

  await expect(main).toContainText(/Si la base est nulle, aucun pourcentage trompeur n’est affiché/);
});
