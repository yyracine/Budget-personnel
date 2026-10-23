import { expect, test } from '@playwright/test';
import { importExampleCsv, openApp, EXAMPLE_CSV } from './helpers';

test('importe un CSV et met à jour immédiatement les totaux', async ({ page }) => {
  await openApp(page);
  await importExampleCsv(page);

  await page.getByRole('link', { name: 'Voir les opérations' }).click();
  await expect(page.getByRole('heading', { name: '7 opérations' })).toBeVisible();

  const main = page.getByRole('main');
  await expect(main).toContainText(/350\s*000\s*FCFA/);
  await expect(main).toContainText(/245\s*000\s*FCFA/);
  await expect(main).toContainText(/\+105\s*000\s*FCFA/);
});

test('signale les doublons et empêche un double import', async ({ page }) => {
  await openApp(page);
  await importExampleCsv(page);
  await page.getByRole('button', { name: 'Nouvel import' }).click();

  await page.setInputFiles('#import-file', EXAMPLE_CSV);
  await page.getByRole('button', { name: 'Contrôler les lignes' }).click();

  await expect(page.getByText(/7 ligne\(s\) ressemblent à une opération déjà présente/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importer 0 ligne(s)' })).toBeDisabled();

  await page.goto('/#/operations');
  await expect(page.getByRole('heading', { name: '7 opérations' })).toBeVisible();
});
