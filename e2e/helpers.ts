import { expect, type Page } from '@playwright/test';
import path from 'node:path';

export const EXAMPLE_CSV = path.resolve('examples/import-exemple.csv');

/** Ouvre l’application et attend la fin de l’initialisation d’IndexedDB. */
export async function openApp(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByRole('main')).toContainText('Bienvenue dans votre budget');
}

/** Importe le fichier d’exemple et vérifie que les 7 opérations sont créées. */
export async function importExampleCsv(page: Page): Promise<void> {
  await page.goto('/#/donnees');
  await page.setInputFiles('#import-file', EXAMPLE_CSV);
  await expect(page.getByText('import-exemple.csv')).toBeVisible();
  await page.getByRole('button', { name: 'Contrôler les lignes' }).click();
  const importButton = page.getByRole('button', { name: /Importer 7 ligne/ });
  await expect(importButton).toBeEnabled();
  await importButton.click();
  await expect(page.getByRole('main')).toContainText(/Import terminé\s*:\s*7/);
}

/** Sélectionne janvier 2026 dans le sélecteur de période indiqué. */
export async function selectJanuary2026(
  page: Page,
  groupName = 'Sélection de la période',
): Promise<void> {
  const picker = page.getByRole('group', { name: groupName });
  await picker.getByLabel('Année').selectOption('2026');
  await picker.getByLabel('Mois').selectOption('1');
  await expect(page.getByRole('main')).toContainText('01/01/2026');
}
