import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import { importExampleCsv, openApp } from './helpers';

test('exporte une sauvegarde puis restaure les données supprimées', async ({ page }, testInfo) => {
  await openApp(page);
  await importExampleCsv(page);

  await page.goto('/#/donnees');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Sauvegarde complète JSON' }).click();
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath('sauvegarde.json');
  await download.saveAs(backupPath);

  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8')) as {
    app: string;
    formatVersion: number;
    transactions: unknown[];
  };
  expect(backup.app).toBe('budget-personnel');
  expect(backup.formatVersion).toBe(1);
  expect(backup.transactions).toHaveLength(7);

  // Supprime une opération : les totaux doivent baisser.
  await page.goto('/#/operations');
  const carburantRow = page.getByRole('row').filter({ hasText: 'Carburant' });
  await carburantRow.getByRole('button', { name: /Supprimer Carburant/ }).click();
  const deleteDialog = page.getByRole('dialog', { name: 'Supprimer cette opération ?' });
  await deleteDialog.getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.getByRole('heading', { name: '6 opérations' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(/230\s*000\s*FCFA/);

  // Restaure la sauvegarde : les 7 opérations et leurs totaux reviennent.
  await page.goto('/#/donnees');
  await page.setInputFiles('#restore-file', backupPath);
  const restoreDialog = page.getByRole('dialog', { name: 'Restaurer cette sauvegarde ?' });
  await expect(restoreDialog).toBeVisible();
  await expect(restoreDialog).toContainText('7 opération(s)');
  await restoreDialog.getByRole('button', { name: 'Remplacer les données' }).click();

  await expect(page.getByText('Sauvegarde restaurée. Toutes les données ont été remplacées.')).toBeVisible();
  await page.goto('/#/operations');
  await expect(page.getByRole('heading', { name: '7 opérations' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(/245\s*000\s*FCFA/);
});

test('refuse une sauvegarde invalide sans modifier les données', async ({ page }) => {
  await openApp(page);
  await importExampleCsv(page);

  await page.goto('/#/donnees');
  await page.setInputFiles('#restore-file', {
    name: 'sauvegarde-invalide.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ app: 'autre-application', formatVersion: 1 })),
  });

  const main = page.getByRole('main');
  await expect(main).toContainText('Sauvegarde refusée');
  await expect(main).toContainText('Ce fichier n’est pas une sauvegarde de Budget personnel.');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/#/operations');
  await expect(page.getByRole('heading', { name: '7 opérations' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(/245\s*000\s*FCFA/);
});
