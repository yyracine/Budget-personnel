import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../state/AppContext';
import { analyzeImport, detectMapping, type ColumnMapping, type ImportAnalysis } from '../domain/importer';
import type { BackupData } from '../data/backup';
import { backupFileName, parseBackupJson, serializeBackup } from '../data/backup';
import { exportBackup, importCandidates, restoreBackup } from '../data/repository';
import {
  ImportFileError,
  parseImportFile,
  type ParsedImportFile,
} from '../services/importFiles';
import {
  buildFullWorkbook,
  downloadBlob,
  downloadWorkbook,
  fullExportFileName,
} from '../exports/excel';
import {
  Badge,
  Button,
  Card,
  Field,
  InlineAlert,
  Modal,
  PageHeader,
} from '../components/ui';
import { Icon } from '../components/Icon';
import { formatDateTime, formatCount } from '../domain/format';
import { formatMoney } from '../domain/money';

type ImportStep = 'file' | 'mapping' | 'preview' | 'done';

const MAPPING_FIELDS: { key: keyof ColumnMapping; label: string; required: boolean }[] = [
  { key: 'date', label: 'Date', required: true },
  { key: 'amount', label: 'Montant', required: true },
  { key: 'category', label: 'Catégorie', required: true },
  { key: 'type', label: 'Type (revenu / dépense)', required: false },
  { key: 'label', label: 'Libellé', required: false },
  { key: 'note', label: 'Note', required: false },
  { key: 'sourceId', label: 'Identifiant source', required: false },
];

function formatBytes(value: number): string {
  if (value < 1024) return `${value} o`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} Ko`;
  return `${(value / 1024 / 1024).toFixed(1)} Mo`;
}

export default function DataToolsPage() {
  const { transactions, categories, budgets, recurrences, settings, notify, run } = useApp();
  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [parsed, setParsed] = useState<ParsedImportFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [roundDecimals, setRoundDecimals] = useState(false);
  const [strategy, setStrategy] = useState<'skip' | 'all'>('skip');
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);
  const [step, setStep] = useState<ImportStep>('file');
  const [importError, setImportError] = useState<string | null>(null);
  const [fileWarnings, setFileWarnings] = useState<string[]>([]);
  const [loadingFile, setLoadingFile] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{
    inserted: number;
    skippedDuplicates: number;
    batchId: string;
    invalid: number;
    duplicates: number;
    rounded: number;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [backupPending, setBackupPending] = useState<BackupData | null>(null);
  const [backupErrors, setBackupErrors] = useState<string[]>([]);
  const [restoreInputKey, setRestoreInputKey] = useState(0);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (navigator.storage?.estimate) {
      navigator.storage
        .estimate()
        .then((estimate) => {
          if (!cancelled) {
            setStorage({
              usage: estimate.usage ?? 0,
              quota: estimate.quota ?? 0,
            });
          }
        })
        .catch(() => setStorage(null));
    }
    return () => {
      cancelled = true;
    };
  }, [transactions.length]);

  const mappingErrors = useMemo(() => {
    if (!mapping) return [];
    const errors: string[] = [];
    if (mapping.date === null) errors.push('Associez la colonne « Date ».');
    if (mapping.amount === null) errors.push('Associez la colonne « Montant ».');
    if (mapping.category === null) errors.push('Associez la colonne « Catégorie ».');
    return errors;
  }, [mapping]);

  const duplicateLines = useMemo(
    () => new Set(analysis?.duplicates.map((duplicate) => duplicate.line) ?? []),
    [analysis],
  );

  const loadFile = async (nextFile: File, header: boolean) => {
    setLoadingFile(true);
    setImportError(null);
    setFileWarnings([]);
    setAnalysis(null);
    setImportResult(null);
    if (importInputRef.current) importInputRef.current.value = '';
    try {
      const result = await parseImportFile(nextFile, header);
      setFile(nextFile);
      setParsed(result);
      setFileWarnings(result.warnings);
      setMapping(detectMapping(result.headers));
      setStep('mapping');
    } catch (error) {
      setFile(null);
      setParsed(null);
      setMapping(null);
      setStep('file');
      setImportError(
        error instanceof ImportFileError
          ? error.message
          : 'Impossible de lire ce fichier. Vérifiez son format.',
      );
    } finally {
      setLoadingFile(false);
    }
  };

  const handleFileChange = async (nextFile: File | null) => {
    if (!nextFile) return;
    await loadFile(nextFile, hasHeader);
  };

  const changeHeaderMode = async (checked: boolean) => {
    setHasHeader(checked);
    if (file) await loadFile(file, checked);
  };

  const runAnalysis = () => {
    if (!parsed || !mapping) return;
    const result = analyzeImport(parsed.rows, mapping, categories, transactions, {
      roundDecimals,
    });
    setAnalysis(result);
    setStep('preview');
    setImportError(null);
  };

  const reanalyze = (round: boolean) => {
    if (!parsed || !mapping) return;
    setRoundDecimals(round);
    const result = analyzeImport(parsed.rows, mapping, categories, transactions, {
      roundDecimals: round,
    });
    setAnalysis(result);
  };

  const executeImport = async () => {
    if (!analysis || !parsed) return;
    setImporting(true);
    setImportError(null);
    try {
      const outcome = await run(() =>
        importCandidates(analysis.candidates, {
          strategy,
          source: parsed.fileName.toLowerCase().endsWith('.csv') ? 'CSV' : 'Excel',
        }),
      );
      if (!outcome.ok) {
        setImportError(outcome.error);
        return;
      }
      setImportResult({
        inserted: outcome.value.inserted,
        skippedDuplicates: outcome.value.skippedDuplicates,
        batchId: outcome.value.batchId,
        invalid: analysis.stats.invalidRows,
        duplicates: analysis.stats.duplicateRows,
        rounded: analysis.roundedLines.length,
      });
      setStep('done');
      notify(
        `${outcome.value.inserted} opération(s) importée(s).`,
        'success',
      );
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : 'L’import a échoué et a été annulé.',
      );
    } finally {
      setImporting(false);
    }
  };

  const resetImport = () => {
    setFile(null);
    setParsed(null);
    setMapping(null);
    setAnalysis(null);
    setStep('file');
    setImportError(null);
    setFileWarnings([]);
    setImportResult(null);
    setRoundDecimals(false);
    setStrategy('skip');
    if (importInputRef.current) importInputRef.current.value = '';
  };

  const handleBackupDownload = async () => {
    try {
      const backup = await exportBackup();
      downloadBlob(
        new Blob([serializeBackup(backup)], { type: 'application/json' }),
        backupFileName(),
      );
      notify('Sauvegarde JSON téléchargée.', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Impossible de générer la sauvegarde.',
        'error',
      );
    }
  };

  const handleFullExcel = async () => {
    try {
      const sheets = buildFullWorkbook({
        transactions,
        categories,
        budgets,
        recurrences,
        settings,
      });
      await downloadWorkbook(sheets, fullExportFileName());
      notify('Export Excel complet généré.', 'success');
    } catch (error) {
      notify(
        error instanceof Error ? error.message : 'Impossible de générer l’export Excel.',
        'error',
      );
    }
  };

  const handleRestoreFile = async (restoreFile: File | null) => {
    if (!restoreFile) return;
    setBackupErrors([]);
    if (restoreFile.size > 20 * 1024 * 1024) {
      setBackupErrors(['Fichier de sauvegarde trop volumineux (limite : 20 Mo).']);
      setRestoreInputKey((key) => key + 1);
      return;
    }
    try {
      const text = await restoreFile.text();
      const validation = parseBackupJson(text);
      if (!validation.ok || !validation.data) {
        setBackupErrors(validation.errors);
        setRestoreInputKey((key) => key + 1);
        return;
      }
      setBackupPending(validation.data);
    } catch {
      setBackupErrors(['Impossible de lire le fichier de sauvegarde.']);
      setRestoreInputKey((key) => key + 1);
    }
  };

  const confirmRestore = async () => {
    if (!backupPending) return;
    setRestoring(true);
    const result = await run(
      () => restoreBackup(backupPending),
      'Sauvegarde restaurée. Toutes les données ont été remplacées.',
    );
    setRestoring(false);
    if (result.ok) {
      setBackupPending(null);
      setRestoreInputKey((key) => key + 1);
    }
  };


  const previewRows = analysis?.candidates.slice(0, 25) ?? [];
  const importableCount = analysis
    ? strategy === 'skip'
      ? Math.max(0, analysis.candidates.length - analysis.duplicates.length)
      : analysis.candidates.length
    : 0;

  const closeRestore = () => {
    setBackupPending(null);
    setRestoreInputKey((key) => key + 1);
  };

  return (
    <>
      <PageHeader
        title="Import & export"
        subtitle="Importez un historique CSV ou XLSX, exportez vos données et protégez votre budget par une sauvegarde locale."
      />

      <div className="grid-2">
        <Card
          title="Importer des opérations"
          subtitle="CSV ou XLSX · 10 Mo maximum · première feuille du classeur"
        >
          <div className="steps" aria-label="Étapes de l’import">
            <span className={`step${step === 'file' ? ' active' : ' done'}`}>1. Fichier</span>
            <Icon name="chevron-right" size={12} />
            <span className={`step${step === 'mapping' ? ' active' : step === 'preview' || step === 'done' ? ' done' : ''}`}>
              2. Colonnes
            </span>
            <Icon name="chevron-right" size={12} />
            <span className={`step${step === 'preview' ? ' active' : step === 'done' ? ' done' : ''}`}>
              3. Contrôle
            </span>
            <Icon name="chevron-right" size={12} />
            <span className={`step${step === 'done' ? ' active' : ''}`}>4. Résultat</span>
          </div>

          {importError && (
            <div className="mb-2">
              <InlineAlert tone="danger">{importError}</InlineAlert>
            </div>
          )}
          {fileWarnings.map((warning) => (
            <div className="mb-2" key={warning}>
              <InlineAlert tone="warning">{warning}</InlineAlert>
            </div>
          ))}

          {step === 'file' && (
            <div className="stack">
              <div className="dropzone">
                <Icon name="upload" size={26} />
                <strong>Choisissez un fichier à importer</strong>
                <p className="small muted">
                  Colonnes attendues : date, montant, catégorie. Type, libellé, note et identifiant
                  source sont facultatifs.
                </p>
                <label className="btn btn-primary" htmlFor="import-file">
                  Parcourir…
                </label>
                <input
                  id="import-file"
                  ref={importInputRef}
                  type="file"
                  accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="visually-hidden"
                  onChange={(event) => handleFileChange(event.target.files?.[0] ?? null)}
                />
                <span className="hint">CSV et XLSX uniquement. Le format XLS ancien n’est pas pris en charge.</span>
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={hasHeader}
                  onChange={(event) => changeHeaderMode(event.target.checked)}
                />
                La première ligne contient les noms de colonnes
              </label>
              {loadingFile && <p className="small muted">Lecture du fichier…</p>}
            </div>
          )}

          {step !== 'file' && parsed && mapping && (
            <div className="stack">
              <div className="row-between">
                <div>
                  <div className="cell-title">{parsed.fileName}</div>
                  <div className="cell-sub">
                    {formatCount(parsed.rows.length)} ligne(s) de données
                    {parsed.sheetName ? ` · feuille « ${parsed.sheetName} »` : ''}
                    {` · ${parsed.headers.length} colonne(s)`}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={resetImport}>
                  Changer de fichier
                </Button>
              </div>

              {step === 'mapping' && (
                <>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={hasHeader}
                      onChange={(event) => changeHeaderMode(event.target.checked)}
                    />
                    La première ligne contient les noms de colonnes
                  </label>
                  <div className="mapping-grid">
                    {MAPPING_FIELDS.map((field) => (
                      <Field
                        key={field.key}
                        label={field.label}
                        htmlFor={`mapping-${field.key}`}
                        required={field.required}
                      >
                        <select
                          id={`mapping-${field.key}`}
                          className="select"
                          value={mapping[field.key] ?? ''}
                          onChange={(event) => {
                            const value = event.target.value;
                            setMapping({
                              ...mapping,
                              [field.key]: value === '' ? null : Number(value),
                            });
                          }}
                        >
                          <option value="">Ignorer</option>
                          {parsed.headers.map((header, index) => (
                            <option key={`${header}-${index}`} value={index}>
                              {header || `Colonne ${index + 1}`}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ))}
                  </div>
                  {mappingErrors.length > 0 && (
                    <InlineAlert tone="warning">
                      {mappingErrors.join(' ')} Les colonnes date, montant et catégorie sont
                      indispensables pour contrôler les lignes.
                    </InlineAlert>
                  )}
                  <InlineAlert tone="info">
                    Les catégories doivent déjà exister (la comparaison ignore les accents et la
                    casse). Créez les catégories manquantes avant l’import.
                  </InlineAlert>
                  <div className="row" style={{ justifyContent: 'flex-end' }}>
                    <Button
                      variant="primary"
                      onClick={runAnalysis}
                      disabled={mappingErrors.length > 0}
                      icon="search"
                    >
                      Contrôler les lignes
                    </Button>
                  </div>
                </>
              )}

              {step === 'preview' && analysis && (
                <>
                  <div className="import-stats">
                    <div className="mini-stat">
                      <span className="label">Lignes</span>
                      <strong>{formatCount(analysis.stats.totalRows)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span className="label">Valides</span>
                      <strong className="text-income">{formatCount(analysis.stats.validRows)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span className="label">Invalides</span>
                      <strong className={analysis.stats.invalidRows > 0 ? 'text-danger' : ''}>
                        {formatCount(analysis.stats.invalidRows)}
                      </strong>
                    </div>
                    <div className="mini-stat">
                      <span className="label">Doublons</span>
                      <strong className={analysis.stats.duplicateRows > 0 ? 'text-warning' : ''}>
                        {formatCount(analysis.stats.duplicateRows)}
                      </strong>
                    </div>
                    <div className="mini-stat">
                      <span className="label">Lignes vides</span>
                      <strong>{formatCount(analysis.skippedEmpty)}</strong>
                    </div>
                  </div>

                  {analysis.truncated && (
                    <InlineAlert tone="warning">
                      Le fichier dépasse la limite de 20 000 lignes : seules les premières lignes
                      ont été analysées. Scindez le fichier en plusieurs imports.
                    </InlineAlert>
                  )}

                  {analysis.duplicates.length > 0 && (
                    <div className="stack-sm">
                      <span className="label">Doublons potentiels</span>
                      <p className="hint">
                        {analysis.duplicates.length} ligne(s) ressemblent à une opération déjà
                        présente, sur la base de la date, du type, du montant, de la catégorie et
                        du libellé. Un même montant seul ne suffit jamais à conclure à un doublon.
                      </p>
                      <div className="checkbox-stack">
                        <label className="checkbox">
                          <input
                            type="radio"
                            name="duplicate-strategy"
                            checked={strategy === 'skip'}
                            onChange={() => setStrategy('skip')}
                          />
                          Ignorer les doublons identifiés (recommandé)
                        </label>
                        <label className="checkbox">
                          <input
                            type="radio"
                            name="duplicate-strategy"
                            checked={strategy === 'all'}
                            onChange={() => setStrategy('all')}
                          />
                          Importer toutes les lignes valides, doublons compris
                        </label>
                      </div>
                    </div>
                  )}

                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={roundDecimals}
                      onChange={(event) => reanalyze(event.target.checked)}
                    />
                    Arrondir explicitement à l’unité les montants décimaux (XOF sans décimales)
                  </label>
                  {roundDecimals && analysis.roundedLines.length > 0 && (
                    <InlineAlert tone="warning">
                      {analysis.roundedLines.length} montant(s) décimal(aux) seront arrondis. Lignes :{' '}
                      {analysis.roundedLines.slice(0, 10).join(', ')}
                      {analysis.roundedLines.length > 10 ? '…' : ''}.
                    </InlineAlert>
                  )}

                  {analysis.issues.length > 0 && (
                    <div className="stack-sm">
                      <span className="label">Anomalies détectées ({analysis.issues.length})</span>
                      <div className="issue-list">
                        {analysis.issues.slice(0, 80).map((issue, index) => (
                          <div
                            className={`issue-row ${issue.severity}`}
                            key={`${issue.line}-${issue.field}-${index}`}
                          >
                            <span className="issue-line">Ligne {issue.line}</span>
                            <span>
                              {issue.message}
                              {issue.severity === 'warning' ? ' (ligne importée)' : ' (ligne ignorée)'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="preview-table">
                    <table className="data-table">
                      <caption className="visually-hidden">
                        Aperçu des 25 premières lignes valides
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Ligne</th>
                          <th scope="col">Date</th>
                          <th scope="col">Type</th>
                          <th scope="col">Catégorie</th>
                          <th scope="col">Libellé</th>
                          <th scope="col" className="num">Montant</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((candidate) => (
                          <tr key={candidate.line}>
                            <td className="num" style={{ textAlign: 'left' }}>
                              {candidate.line}
                              {duplicateLines.has(candidate.line) && (
                                <Badge tone="warning">doublon</Badge>
                              )}
                            </td>
                            <td>{candidate.date}</td>
                            <td>{candidate.type === 'income' ? 'Revenu' : 'Dépense'}</td>
                            <td>{candidate.categoryName}</td>
                            <td>{candidate.label}</td>
                            <td className="num">{formatMoney(candidate.amount)}</td>
                          </tr>
                        ))}
                        {previewRows.length === 0 && (
                          <tr>
                            <td colSpan={6} className="table-empty">
                              Aucune ligne valide à prévisualiser.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {analysis.candidates.length > 25 && (
                    <p className="hint">
                      Aperçu limité aux 25 premières lignes valides sur{' '}
                      {analysis.candidates.length}.
                    </p>
                  )}

                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <Button variant="ghost" onClick={() => setStep('mapping')}>
                      Retour aux colonnes
                    </Button>
                    <Button
                      variant="primary"
                      icon="upload"
                      onClick={executeImport}
                      disabled={importing || importableCount === 0}
                    >
                      {importing ? 'Import en cours…' : `Importer ${importableCount} ligne(s)`}
                    </Button>
                  </div>
                </>
              )}

              {step === 'done' && importResult && (
                <div className="stack">
                  <InlineAlert tone="success">
                    Import terminé : <strong>{importResult.inserted}</strong> opération(s)
                    enregistrée(s).
                    {importResult.skippedDuplicates > 0
                      ? ` ${importResult.skippedDuplicates} doublon(s) ignoré(s).`
                      : ''}
                  </InlineAlert>
                  <div className="import-stats">
                    <div className="mini-stat">
                      <span className="label">Importées</span>
                      <strong>{formatCount(importResult.inserted)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span className="label">Doublons ignorés</span>
                      <strong>{formatCount(importResult.skippedDuplicates)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span className="label">Lignes invalides</span>
                      <strong>{formatCount(importResult.invalid)}</strong>
                    </div>
                    <div className="mini-stat">
                      <span className="label">Arrondis</span>
                      <strong>{formatCount(importResult.rounded)}</strong>
                    </div>
                  </div>
                  <p className="hint">
                    Lot d’import : {importResult.batchId}. Les totaux, budgets et rapports ont été
                    recalculés.
                  </p>
                  <div className="row">
                    <Button variant="primary" onClick={resetImport} icon="upload">
                      Nouvel import
                    </Button>
                    <Link className="btn btn-secondary" to="/operations">
                      Voir les opérations
                    </Link>
                  </div>
                  {analysis && analysis.stats.invalidRows > 0 && (
                    <p className="small muted">
                      {analysis.stats.invalidRows} ligne(s) invalide(s) n’ont pas été importées.
                      Corrigez le fichier puis relancez un import pour les récupérer.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>

        <div className="stack">
          <Card title="Exporter" subtitle="Excel et rapports">
            <div className="stack">
              <p className="small muted">
                Les exports utilisent les mêmes fonctions de calcul que l’écran. Les montants sont
                numériques et les dates correctement typées.
              </p>
              <Button icon="file-spreadsheet" onClick={handleFullExcel}>
                Export Excel complet (opérations, catégories, budgets, récurrences)
              </Button>
              <Button icon="download" onClick={handleBackupDownload}>
                Sauvegarde complète JSON
              </Button>
              <div className="row">
                <Link className="btn btn-secondary" to="/rapports">
                  <Icon name="file-text" size={16} /> Rapports Excel et PDF
                </Link>
                <Link className="btn btn-secondary" to="/operations">
                  <Icon name="list" size={16} /> Exporter les opérations filtrées
                </Link>
              </div>
              <p className="hint">
                {transactions.length} opération(s), {categories.length} catégorie(s),{' '}
                {budgets.length} budget(s), {recurrences.length} récurrence(s).
              </p>
            </div>
          </Card>

          <Card title="Sauvegarde et restauration" subtitle="Fichier JSON versionné">
            <div className="stack">
              <p className="small muted">
                La sauvegarde contient toutes vos données (opérations, catégories, budgets,
                récurrences et paramètres). Conservez-la en lieu sûr : elle n’est pas chiffrée.
              </p>
              <label className="btn btn-secondary" htmlFor="restore-file">
                <Icon name="upload" size={16} /> Restaurer une sauvegarde…
              </label>
              <input
                key={restoreInputKey}
                id="restore-file"
                type="file"
                accept="application/json,.json"
                className="visually-hidden"
                onChange={(event) => handleRestoreFile(event.target.files?.[0] ?? null)}
              />
              {backupErrors.length > 0 && (
                <InlineAlert tone="danger">
                  <strong>Sauvegarde refusée.</strong> Aucune donnée n’a été modifiée.
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {backupErrors.slice(0, 8).map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </InlineAlert>
              )}
              <InlineAlert tone="warning">
                La restauration remplace intégralement les données actuelles. Une confirmation
                détaillée est demandée avant toute modification.
              </InlineAlert>
            </div>
          </Card>

          <Card title="Stockage local" subtitle="IndexedDB dans ce navigateur">
            <div className="stack-sm">
              <div className="row-between">
                <span className="small muted">Type de stockage</span>
                <strong className="small">IndexedDB (local)</strong>
              </div>
              <div className="row-between">
                <span className="small muted">Espace utilisé</span>
                <strong className="small">
                  {storage ? `${formatBytes(storage.usage)}${storage.quota ? ` / ${formatBytes(storage.quota)}` : ''}` : 'Non disponible'}
                </strong>
              </div>
              <div className="row-between">
                <span className="small muted">Chiffrement</span>
                <strong className="small">Non chiffré</strong>
              </div>
              <p className="hint">
                Les données restent sur cet ordinateur et ne sont jamais envoyées automatiquement.
                Toute personne utilisant ce profil de navigateur peut y accéder : protégez votre
                session Windows et vos fichiers de sauvegarde.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(backupPending)}
        title="Restaurer cette sauvegarde ?"
        subtitle="Cette opération remplace toutes les données actuelles."
        onClose={closeRestore}
        size="small"
        footer={
          <>
            <Button onClick={closeRestore} disabled={restoring}>
              Annuler
            </Button>
            <Button variant="danger-solid" onClick={confirmRestore} disabled={restoring}>
              {restoring ? 'Restauration…' : 'Remplacer les données'}
            </Button>
          </>
        }
      >
        {backupPending && (
          <div className="stack">
            <InlineAlert tone="warning">
              Créez une sauvegarde de vos données actuelles avant de continuer si vous pourriez en
              avoir besoin.
            </InlineAlert>
            <div className="mini-stat">
              <span className="label">Sauvegarde du</span>
              <strong style={{ fontSize: 14 }}>{formatDateTime(backupPending.exportedAt)}</strong>
            </div>
            <ul style={{ margin: 0, paddingLeft: 18 }} className="small muted">
              <li>{backupPending.transactions.length} opération(s)</li>
              <li>{backupPending.categories.length} catégorie(s)</li>
              <li>{backupPending.budgets.length} budget(s)</li>
              <li>{backupPending.recurrences.length} récurrence(s)</li>
              <li>Solde initial : {formatMoney(backupPending.settings.initialBalance)}</li>
            </ul>
          </div>
        )}
      </Modal>
    </>
  );
}
